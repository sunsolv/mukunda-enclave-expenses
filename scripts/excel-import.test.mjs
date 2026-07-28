import test from 'node:test';
import assert from 'node:assert/strict';
import {
  excelDateToIso,
  idempotencyKey,
  normalizeMoney,
  normalizeWorkbookRows,
  reconcile,
} from './excel-import-lib.mjs';
import mapping from '../config/excel-import.mapping.json' with { type: 'json' };

test('normalizes Excel serial and Indian display dates without timezone drift', () => {
  assert.equal(excelDateToIso(45475), '2024-07-02');
  assert.equal(excelDateToIso('31-07-2024'), '2024-07-31');
  assert.equal(excelDateToIso('31-02-2024'), null);
});

test('normalizes INR currency values', () => {
  assert.equal(normalizeMoney('₹8,649.00'), 8649);
  assert.equal(normalizeMoney('(1,250.50)'), -1250.5);
});

test('classifies workbook rows and preserves source references', () => {
  const matrix = [
    [
      'Flat No',
      'Maintenance Amount',
      'Payment Date',
      'Expense Description',
      'Expense Date',
      'Paid To',
      'Amount Paid',
      'Phone Number',
      'Google Drive Receipt Link',
      'Running Balance',
    ],
    ['101', 3000, '02-07-2024', null, null, null, null, null, null, 3000],
    [
      null,
      null,
      null,
      'Security service',
      45506,
      'ABC Security',
      8649,
      9876543210,
      'https://drive.google.com/example',
      -5649,
    ],
  ];
  const { records } = normalizeWorkbookRows('July', matrix, mapping);
  assert.equal(records[0].kind, 'payment');
  assert.equal(records[0].source.rowNumber, 2);
  assert.equal(records[1].kind, 'expense');
  assert.equal(records[1].vendorPhone, '9876543210');
});

test('reconciliation is formula-driven and idempotency key is stable', () => {
  const records = [
    { kind: 'payment', amount: 12000, sourceHash: 'a', warnings: [] },
    { kind: 'expense', amount: 8649, sourceHash: 'b', warnings: [] },
  ];
  assert.deepEqual(reconcile(records), {
    openingBalance: 0,
    collections: 12000,
    expenses: 8649,
    closingBalance: 3351,
    sourceRows: 2,
    paymentRows: 1,
    expenseRows: 1,
    ambiguousRows: 0,
    warningRows: 0,
    lastManualRunningBalance: null,
  });
  assert.equal(idempotencyKey(records), idempotencyKey([...records].reverse()));
});
