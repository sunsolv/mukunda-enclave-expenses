#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import * as XLSX from 'xlsx';
import { idempotencyKey, normalizeWorkbookRows, reconcile } from './excel-import-lib.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i].startsWith('--'))
    args.set(
      process.argv[i].slice(2),
      process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i],
    );
}
const file = args.get('file');
const mode = args.get('mode') ?? 'dry-run';
if (!file || !['dry-run', 'validate', 'final'].includes(mode)) {
  console.error(
    'Usage: npm run import:excel -- --file path/to/workbook.xlsx --mode dry-run|validate|final [--opening-balance 0] [--approved]',
  );
  process.exit(1);
}
if (mode === 'final' && args.get('approved') !== true) {
  console.error(
    'Final mode requires --approved after the dry-run reconciliation has been reviewed.',
  );
  process.exit(2);
}

const absoluteFile = path.resolve(String(file));
const mappingPath = path.resolve(String(args.get('mapping') ?? 'config/excel-import.mapping.json'));
const [source, mappingText] = await Promise.all([
  fs.readFile(absoluteFile),
  fs.readFile(mappingPath, 'utf8'),
]);
const mapping = JSON.parse(mappingText);
const checksum = crypto.createHash('sha256').update(source).digest('hex');
const workbook = XLSX.read(source, {
  type: 'buffer',
  cellDates: true,
  cellFormula: true,
  cellStyles: true,
});
const allRecords = [];
const sheetInspection = [];
const workbookWarnings = [];

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const normalized = normalizeWorkbookRows(sheetName, matrix, mapping);
  allRecords.push(...normalized.records);
  workbookWarnings.push(...normalized.warnings);
  sheetInspection.push({
    name: sheetName,
    range: sheet['!ref'] ?? null,
    rows: matrix.length,
    columns: Math.max(0, ...matrix.map((row) => row.length)),
    mergedRanges: (sheet['!merges'] ?? []).map((merge) => XLSX.utils.encode_range(merge)),
    hiddenRows: (sheet['!rows'] ?? [])
      .map((row, index) => (row?.hidden ? index + 1 : null))
      .filter(Boolean),
    hiddenColumns: (sheet['!cols'] ?? [])
      .map((column, index) => (column?.hidden ? XLSX.utils.encode_col(index) : null))
      .filter(Boolean),
    formulaCells: Object.values(sheet).filter((cell) => cell && typeof cell === 'object' && cell.f)
      .length,
    recognizedHeaderRow: normalized.header.rowIndex >= 0 ? normalized.header.rowIndex + 1 : null,
    mappedFields: Object.keys(normalized.header.mapping),
  });
}

const openingBalance = Number(args.get('opening-balance') ?? 0);
const reconciliation = reconcile(allRecords, Number.isFinite(openingBalance) ? openingBalance : 0);
const report = {
  generatedAt: new Date().toISOString(),
  mode,
  dryRun: mode !== 'final',
  source: { filename: path.basename(absoluteFile), checksum, sheets: sheetInspection },
  mappingVersion: mapping.version,
  importIdempotencyKey: idempotencyKey(allRecords),
  counts: {
    total: allRecords.length,
    ready: allRecords.filter((row) => row.kind !== 'ambiguous' && row.warnings.length === 0).length,
    warning: allRecords.filter((row) => row.warnings.length > 0).length,
    skipped: allRecords.filter((row) => row.kind === 'ambiguous').length,
    failed: 0,
  },
  reconciliation,
  baselineComparison: {
    baseline: mapping.knownBaseline,
    collectionsDifference: reconciliation.collections - mapping.knownBaseline.collections,
    expensesDifference: reconciliation.expenses - mapping.knownBaseline.expenses,
    closingBalanceDifference: reconciliation.closingBalance - mapping.knownBaseline.closingBalance,
    note: 'The known baseline is contextual only. The inspected workbook remains the source for review.',
  },
  workbookWarnings,
  records: allRecords,
};

const outputDir = path.resolve(String(args.get('output') ?? 'migration-output'));
await fs.mkdir(outputDir, { recursive: true });
const stem = path
  .basename(absoluteFile, path.extname(absoluteFile))
  .replace(/[^a-z0-9-]+/gi, '-')
  .toLowerCase();
const outputFile = path.join(outputDir, `${stem}-${mode}-report.json`);
await fs.writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, {
  flag: mode === 'final' ? 'wx' : 'w',
});
if (mode === 'final') {
  const backupFile = path.join(
    outputDir,
    `${stem}-normalized-backup-${checksum.slice(0, 12)}.json`,
  );
  await fs.writeFile(
    backupFile,
    `${JSON.stringify({ sourceChecksum: checksum, records: allRecords }, null, 2)}\n`,
    { flag: 'wx' },
  );
  console.log(`Final normalized backup created: ${backupFile}`);
  console.log(
    'No production database write was attempted. Apply the reviewed backup with an authenticated migration operator.',
  );
}
console.log(`Workbook inspected: ${absoluteFile}`);
console.log(
  `Mode: ${mode}; rows: ${report.counts.total}; ready: ${report.counts.ready}; warnings: ${report.counts.warning}; skipped: ${report.counts.skipped}`,
);
console.log(
  `Collections: ${reconciliation.collections}; expenses: ${reconciliation.expenses}; recalculated closing balance: ${reconciliation.closingBalance}`,
);
console.log(`Report: ${outputFile}`);
if (mode === 'validate' && (report.counts.warning > 0 || report.counts.skipped > 0))
  process.exitCode = 3;
