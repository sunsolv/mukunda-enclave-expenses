#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { strFromU8, unzipSync } from 'fflate';
import readExcelFile from 'read-excel-file/node';
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
if (source.length > 50 * 1024 * 1024) throw new Error('Workbook must be 50 MB or smaller');
const workbook = await readExcelFile(source);
const workbookMetadata = inspectWorkbookMetadata(source);
const allRecords = [];
const sheetInspection = [];
const workbookWarnings = [];

for (const sheet of workbook) {
  const sheetName = sheet.sheet;
  const matrix = sheet.data;
  const normalized = normalizeWorkbookRows(sheetName, matrix, mapping);
  const metadata = workbookMetadata.get(sheetName);
  allRecords.push(...normalized.records);
  workbookWarnings.push(...normalized.warnings);
  sheetInspection.push({
    name: sheetName,
    range: metadata?.range ?? matrixRange(matrix),
    rows: matrix.length,
    columns: Math.max(0, ...matrix.map((row) => row.length)),
    mergedRanges: metadata?.mergedRanges ?? [],
    hiddenRows: metadata?.hiddenRows ?? [],
    hiddenColumns: metadata?.hiddenColumns ?? [],
    formulaCells: metadata?.formulaCells ?? 0,
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

function matrixRange(matrix) {
  const columns = Math.max(0, ...matrix.map((row) => row.length));
  return matrix.length && columns ? `A1:${columnName(columns)}${matrix.length}` : null;
}

function columnName(columnNumber) {
  let value = columnNumber;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function inspectWorkbookMetadata(source) {
  const files = unzipSync(new Uint8Array(source));
  const workbookXml = xmlFile(files, 'xl/workbook.xml');
  const relationshipsXml = xmlFile(files, 'xl/_rels/workbook.xml.rels');
  const relationships = new Map(
    [...relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map((match) => [
      xmlAttribute(match[1], 'Id'),
      xmlAttribute(match[1], 'Target'),
    ]),
  );
  const metadata = new Map();

  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/g)) {
    const sheetName = decodeXml(xmlAttribute(match[1], 'name'));
    const target = relationships.get(xmlAttribute(match[1], 'r:id'));
    if (!sheetName || !target) continue;
    const sheetPath = target.startsWith('/')
      ? target.slice(1)
      : path.posix.normalize(path.posix.join('xl', target));
    const sheetXml = xmlFile(files, sheetPath);
    const dimension = sheetXml.match(/<dimension\b[^>]*\bref="([^"]+)"/);
    const hiddenColumns = [];
    for (const column of sheetXml.matchAll(/<col\b([^>]*)\/?\s*>/g)) {
      if (!/\bhidden="(?:1|true)"/.test(column[1])) continue;
      const minimum = Number(xmlAttribute(column[1], 'min'));
      const maximum = Number(xmlAttribute(column[1], 'max'));
      if (!Number.isInteger(minimum) || !Number.isInteger(maximum)) continue;
      for (let index = Math.max(1, minimum); index <= Math.min(16384, maximum); index += 1) {
        hiddenColumns.push(columnName(index));
      }
    }
    metadata.set(sheetName, {
      range: dimension?.[1] ?? null,
      mergedRanges: [...sheetXml.matchAll(/<mergeCell\b[^>]*\bref="([^"]+)"/g)].map(
        (merge) => merge[1],
      ),
      hiddenRows: [...sheetXml.matchAll(/<row\b([^>]*)\/?\s*>/g)]
        .filter((row) => /\bhidden="(?:1|true)"/.test(row[1]))
        .map((row) => Number(xmlAttribute(row[1], 'r')))
        .filter(Number.isInteger),
      hiddenColumns,
      formulaCells: (sheetXml.match(/<f(?:\s|>)/g) ?? []).length,
    });
  }
  return metadata;
}

function xmlFile(files, filename) {
  const file = files[filename];
  if (!file) throw new Error(`Workbook is missing ${filename}`);
  return strFromU8(file);
}

function xmlAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match?.[1] ?? '';
}

function decodeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}
