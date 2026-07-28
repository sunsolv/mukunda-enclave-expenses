import crypto from 'node:crypto';

export const normalizeHeader = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .replace(/[.:]+$/g, '');

export function excelDateToIso(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return localIso(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  let match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return validIso(year, Number(match[2]), Number(match[1]));
  }
  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return validIso(Number(match[1]), Number(match[2]), Number(match[3]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : localIso(parsed);
}

export function normalizeMoney(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return roundMoney(value);
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(
    String(value)
      .replace(/[₹,\s]/g, '')
      .replace(/^\((.+)\)$/, '-$1'),
  );
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

export function mapHeaders(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  const result = {};
  for (const [field, candidates] of Object.entries(aliases)) {
    const candidateSet = new Set(candidates.map(normalizeHeader));
    const index = normalized.findIndex((header) => candidateSet.has(header));
    if (index >= 0) result[field] = index;
  }
  return result;
}

export function findHeaderRow(matrix, aliases, maxRows = 30) {
  let best = { rowIndex: -1, score: 0, mapping: {} };
  matrix.slice(0, maxRows).forEach((row, rowIndex) => {
    const mapping = mapHeaders(row, aliases);
    const score = Object.keys(mapping).length;
    if (score > best.score) best = { rowIndex, score, mapping };
  });
  return best.score >= 3 ? best : { rowIndex: -1, score: best.score, mapping: best.mapping };
}

export function normalizeWorkbookRows(sheetName, matrix, mappingConfig) {
  const header = findHeaderRow(matrix, mappingConfig.aliases);
  if (header.rowIndex < 0) {
    return { records: [], warnings: [`${sheetName}: no recognizable header row`], header };
  }
  const records = [];
  const warnings = [];
  for (let index = header.rowIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    if (
      !row ||
      row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '')
    )
      continue;
    const value = (field) =>
      header.mapping[field] === undefined ? null : row[header.mapping[field]];
    const source = { sheet: sheetName, rowNumber: index + 1 };
    const expenseAmount = normalizeMoney(value('expenseAmount'));
    const maintenanceAmount = normalizeMoney(value('maintenanceAmount'));
    const expenseDescription = clean(value('expenseDescription'));
    const vendorName = clean(value('vendorName'));
    const flatNumber = clean(value('flatNumber'));
    const expenseDate = excelDateToIso(value('expenseDate'));
    const paymentDate = excelDateToIso(value('paymentDate'));
    const legacyDocumentUrl = validLegacyUrl(value('legacyDocumentUrl'));
    const rowWarnings = [];
    let record;

    if (expenseAmount !== null && expenseAmount > 0 && (expenseDescription || vendorName)) {
      if (!expenseDate) rowWarnings.push('Expense date is missing or invalid');
      if (!expenseDescription) rowWarnings.push('Expense description is missing');
      if (!vendorName) rowWarnings.push('Vendor/paid-to value is missing');
      record = {
        kind: 'expense',
        source,
        sourceHash: rowHash(sheetName, index + 1, row),
        expenseDate,
        category: mappingConfig.defaults.expenseCategory,
        vendorName,
        vendorPhone: phoneText(value('vendorPhone')),
        description: expenseDescription,
        amount: expenseAmount,
        paymentMode: normalizePaymentMode(value('paymentMode')),
        transactionReference: clean(value('transactionReference')),
        legacyDocumentUrl,
        originalRunningBalance: normalizeMoney(value('runningBalance')),
        warnings: rowWarnings,
      };
    } else if (maintenanceAmount !== null && maintenanceAmount > 0) {
      if (!flatNumber) rowWarnings.push('Flat number is missing');
      if (!paymentDate) rowWarnings.push('Individual payment date is missing or invalid');
      const billingMonth = normalizeBillingMonth(value('billingMonth'), paymentDate);
      if (!billingMonth) rowWarnings.push('Maintenance month is missing');
      record = {
        kind: 'payment',
        source,
        sourceHash: rowHash(sheetName, index + 1, row),
        flatNumber,
        ownerName: clean(value('ownerName')),
        billingMonth,
        paymentDate,
        amount: maintenanceAmount,
        paymentMode: normalizePaymentMode(value('paymentMode')),
        transactionReference: clean(value('transactionReference')),
        legacyDocumentUrl,
        warnings: rowWarnings,
      };
    } else {
      record = {
        kind: 'ambiguous',
        source,
        sourceHash: rowHash(sheetName, index + 1, row),
        raw: row.map((value) => value ?? null),
        warnings: ['Row could not be classified safely as a collection or expense'],
      };
    }
    records.push(record);
  }
  return { records, warnings, header };
}

export function reconcile(records, openingBalance = 0) {
  const validExpenses = records.filter((r) => r.kind === 'expense' && r.amount > 0);
  const validPayments = records.filter((r) => r.kind === 'payment' && r.amount > 0);
  const expenses = roundMoney(validExpenses.reduce((sum, r) => sum + r.amount, 0));
  const collections = roundMoney(validPayments.reduce((sum, r) => sum + r.amount, 0));
  const closingBalance = roundMoney(openingBalance + collections - expenses);
  const manualBalances = records.filter(
    (r) => r.originalRunningBalance !== null && r.originalRunningBalance !== undefined,
  );
  return {
    openingBalance,
    collections,
    expenses,
    closingBalance,
    sourceRows: records.length,
    paymentRows: validPayments.length,
    expenseRows: validExpenses.length,
    ambiguousRows: records.filter((r) => r.kind === 'ambiguous').length,
    warningRows: records.filter((r) => r.warnings?.length).length,
    lastManualRunningBalance: manualBalances.at(-1)?.originalRunningBalance ?? null,
  };
}

export function idempotencyKey(records) {
  return crypto
    .createHash('sha256')
    .update(
      records
        .map((r) => r.sourceHash)
        .sort()
        .join('|'),
    )
    .digest('hex');
}

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const clean = (value) =>
  value === null || value === undefined ? null : String(value).trim() || null;
const phoneText = (value) => {
  if (value === null || value === undefined || value === '') return null;
  return String(value).replace(/\.0$/, '').trim();
};
const validLegacyUrl = (value) => {
  const text = clean(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};
const normalizePaymentMode = (value) => {
  const normalized = normalizeHeader(value).replace(' ', '_');
  const allowed = new Set(['upi', 'bank_transfer', 'cash', 'cheque', 'card', 'other']);
  if (normalized === 'neft' || normalized === 'rtgs' || normalized === 'bank')
    return 'bank_transfer';
  return allowed.has(normalized) ? (normalized === 'upi' ? 'UPI' : normalized) : 'other';
};
const normalizeBillingMonth = (value, fallbackDate) => {
  const text = clean(value);
  if (text) {
    const iso = excelDateToIso(value);
    if (iso) return iso.slice(0, 7);
    const match = text.match(/^(\d{4})[-/](\d{1,2})$/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}`;
  }
  return fallbackDate?.slice(0, 7) ?? null;
};
const rowHash = (sheet, rowNumber, row) =>
  crypto.createHash('sha256').update(JSON.stringify({ sheet, rowNumber, row })).digest('hex');
const localIso = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const validIso = (year, month, day) => {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? localIso(date)
    : null;
};
