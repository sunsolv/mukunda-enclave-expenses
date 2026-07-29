import {
  buildCashFlow,
  loginIdentity,
  normalizeLoginUsername,
  outstandingCharges,
  resolvedExpenseCategory,
} from './workflow.utils';
import { Expense, MaintenanceCharge, Payment } from './models';

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
