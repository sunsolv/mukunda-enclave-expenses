import {
  buildCashFlow,
  buildFinancialPosition,
  loginIdentity,
  normalizeLoginUsername,
  outstandingCharges,
  resolvedExpenseCategory,
} from './workflow.utils';
import { Expense, MaintenanceCharge, Payment, Responsibility } from './models';

describe('workflow utilities', () => {
  it('resolves flat numbers and usernames to internal login identities', () => {
    expect(normalizeLoginUsername('101')).toBe('reddyprasadkv');
    expect(normalizeLoginUsername('Flat 101')).toBe('reddyprasadkv');
    expect(normalizeLoginUsername('reddyprasadkv')).toBe('reddyprasadkv');
    expect(normalizeLoginUsername('owner.one')).toBe('owner.one');
    expect(loginIdentity('101')).toBe('reddyprasadkv@owners.mukunda-enclave.invalid');
    expect(loginIdentity('101')).toBe(loginIdentity('reddyprasadkv'));
  });

  it('uses only verified collections and approved expenses in real cash-flow totals', () => {
    const payments = [
      {
        paymentDate: '2026-07-05',
        amount: 3000,
        verificationStatus: 'verified',
      },
      {
        paymentDate: '2026-07-06',
        amount: 2500,
        verificationStatus: 'pending',
      },
    ] as Payment[];
    const expenses = [
      { expenseDate: '2026-07-08', amount: 1200, status: 'approved' },
      { expenseDate: '2026-07-09', amount: 900, status: 'pending' },
    ] as Expense[];
    const result = buildCashFlow(payments, expenses, 'current_month', new Date(2026, 6, 15));
    expect(result.collectionTotal).toBe(3000);
    expect(result.expenseTotal).toBe(1200);
    expect(result.buckets.some((bucket) => bucket.collectionHeight > 0)).toBe(true);
  });

  it('carries prior verified activity into the selected period opening balance', () => {
    const responsibilities = [
      {
        startDate: '2026-07-01',
        endDate: '2027-06-30',
        openingBalance: 0,
        status: 'current',
      },
    ] as Responsibility[];
    const payments = [
      {
        paymentDate: '2026-07-10',
        amount: 22000,
        verificationStatus: 'verified',
      },
      {
        paymentDate: '2026-09-04',
        amount: 3000,
        verificationStatus: 'verified',
      },
      {
        paymentDate: '2026-08-15',
        amount: 900,
        verificationStatus: 'pending',
      },
    ] as Payment[];
    const expenses = [
      { expenseDate: '2026-08-20', amount: 19395, status: 'approved' },
      { expenseDate: '2026-09-05', amount: 500, status: 'approved' },
      { expenseDate: '2026-08-25', amount: 400, status: 'pending' },
    ] as Expense[];

    expect(
      buildFinancialPosition(payments, expenses, responsibilities, '2026-09-01', '2026-09-30'),
    ).toEqual({
      openingBalance: 2605,
      collections: 3000,
      expenses: 500,
      closingBalance: 5105,
    });
  });

  it('does not include transactions before the responsibility opening date', () => {
    const responsibilities = [
      {
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        openingBalance: 18420,
        status: 'current',
      },
    ] as Responsibility[];
    const payments = [
      {
        paymentDate: '2025-12-31',
        amount: 50000,
        verificationStatus: 'verified',
      },
      {
        paymentDate: '2026-01-10',
        amount: 2500,
        verificationStatus: 'verified',
      },
    ] as Payment[];

    expect(
      buildFinancialPosition(payments, [], responsibilities, '2026-02-01', '2026-02-28'),
    ).toEqual({
      openingBalance: 20920,
      collections: 0,
      expenses: 0,
      closingBalance: 20920,
    });
  });

  it('returns only outstanding months for the selected flat', () => {
    const charges = [
      { id: 'a', flatId: '101', billingMonth: '2026-07', balanceAmount: 3000, status: 'unpaid' },
      { id: 'b', flatId: '102', billingMonth: '2026-07', balanceAmount: 2500, status: 'unpaid' },
      { id: 'c', flatId: '101', billingMonth: '2026-06', balanceAmount: 0, status: 'paid' },
    ] as MaintenanceCharge[];
    expect(outstandingCharges(charges, '101').map((charge) => charge.id)).toEqual(['a']);
    expect(outstandingCharges(charges, '102').map((charge) => charge.id)).toEqual(['b']);
  });

  it('requires a distinct custom category only when Other is selected', () => {
    expect(resolvedExpenseCategory('Other', 'Generator fuel')).toEqual({
      category: 'Generator fuel',
      baseCategory: 'Other',
      customCategory: 'Generator fuel',
    });
    expect(resolvedExpenseCategory('Security', 'discard me')).toEqual({
      category: 'Security',
      baseCategory: 'Security',
      customCategory: undefined,
    });
  });
});
