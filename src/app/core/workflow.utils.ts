import { Expense, MaintenanceCharge, Payment, Responsibility } from './models';

export type ReportingPeriod = 'current_month' | 'previous_month' | 'financial_year';

export interface ReportingRange {
  from: string;
  to: string;
  label: string;
}

export interface CashFlowBucket {
  label: string;
  collections: number;
  expenses: number;
  collectionHeight: number;
  expenseHeight: number;
}

export interface CashFlowResult {
  range: ReportingRange;
  buckets: CashFlowBucket[];
  collectionTotal: number;
  expenseTotal: number;
}

export interface FinancialPosition {
  openingBalance: number;
  collections: number;
  expenses: number;
  closingBalance: number;
}

export interface MaintenanceSummary {
  billed: number;
  pending: number;
  paidFlats: number;
  partialFlats: number;
  pendingFlats: number;
  overdueFlats: number;
}

const FLAT_LOGIN_ALIASES: Readonly<Record<string, string>> = {
  '101': 'reddyprasadkv',
  '201': 'sandeepg',
  '301': 'saidulu',
  '401': 'chokkareddy',
};

function isoDate(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function monthEnd(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

export function normalizeLoginUsername(value: string): string {
  const normalized = value.trim().toLowerCase();
  const flatMatch = normalized.match(/^flat[\s_-]*(\d+)$/) ?? normalized.match(/^(\d+)$/);
  return flatMatch ? (FLAT_LOGIN_ALIASES[flatMatch[1]] ?? `flat${flatMatch[1]}`) : normalized;
}

export function flatNumberFromLogin(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  const flatMatch = normalized.match(/^flat[\s_-]*(\d+)$/) ?? normalized.match(/^(\d+)$/);
  if (flatMatch) return flatMatch[1];
  return Object.entries(FLAT_LOGIN_ALIASES).find(([, username]) => username === normalized)?.[0];
}

export function loginIdentity(value: string): string {
  return `${normalizeLoginUsername(value)}@owners.mukunda-enclave.invalid`;
}

export function reportingRange(
  period: ReportingPeriod,
  referenceDate = new Date(),
): ReportingRange {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  let from: Date;
  let to: Date;
  if (period === 'previous_month') {
    from = new Date(year, month - 1, 1);
    to = monthEnd(from.getFullYear(), from.getMonth());
  } else if (period === 'financial_year') {
    const startYear = month >= 3 ? year : year - 1;
    from = new Date(startYear, 3, 1);
    to = new Date(startYear + 1, 2, 31);
  } else {
    from = new Date(year, month, 1);
    to = monthEnd(year, month);
  }
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
  });
  return {
    from: isoDate(from),
    to: isoDate(to),
    label:
      period === 'financial_year'
        ? `FY ${from.getFullYear()}–${String(to.getFullYear()).slice(-2)}`
        : monthLabel.format(from),
  };
}

export function buildCashFlow(
  payments: Payment[],
  expenses: Expense[],
  period: ReportingPeriod,
  referenceDate = new Date(),
): CashFlowResult {
  const range = reportingRange(period, referenceDate);
  const start = new Date(`${range.from}T00:00:00`);
  const end = new Date(`${range.to}T23:59:59`);
  const monthly = period === 'financial_year';
  const bucketCount = monthly ? 12 : Math.ceil(end.getDate() / 7);
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    label: monthly
      ? new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(
          new Date(start.getFullYear(), start.getMonth() + index, 1),
        )
      : `${index * 7 + 1}–${Math.min((index + 1) * 7, end.getDate())}`,
    collections: 0,
    expenses: 0,
    collectionHeight: 0,
    expenseHeight: 0,
  }));
  const bucketIndex = (dateValue: string): number => {
    const date = new Date(`${dateValue}T00:00:00`);
    if (date < start || date > end) return -1;
    return monthly
      ? (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth()
      : Math.floor((date.getDate() - 1) / 7);
  };

  payments
    .filter((payment) => payment.verificationStatus === 'verified' && !payment.cancelled)
    .forEach((payment) => {
      const index = bucketIndex(payment.paymentDate);
      if (index >= 0 && index < buckets.length) buckets[index].collections += payment.amount;
    });
  expenses
    .filter((expense) => expense.status === 'approved')
    .forEach((expense) => {
      const index = bucketIndex(expense.expenseDate);
      if (index >= 0 && index < buckets.length) buckets[index].expenses += expense.amount;
    });

  const maximum = Math.max(
    0,
    ...buckets.flatMap((bucket) => [bucket.collections, bucket.expenses]),
  );
  for (const bucket of buckets) {
    bucket.collectionHeight = maximum ? Math.round((bucket.collections / maximum) * 100) : 0;
    bucket.expenseHeight = maximum ? Math.round((bucket.expenses / maximum) * 100) : 0;
  }
  return {
    range,
    buckets,
    collectionTotal: buckets.reduce((sum, bucket) => sum + bucket.collections, 0),
    expenseTotal: buckets.reduce((sum, bucket) => sum + bucket.expenses, 0),
  };
}

export function buildFinancialPosition(
  payments: Payment[],
  expenses: Expense[],
  responsibilities: Responsibility[],
  from: string,
  to: string,
): FinancialPosition {
  if (!from || !to || from > to) {
    return { openingBalance: 0, collections: 0, expenses: 0, closingBalance: 0 };
  }

  const responsibility = responsibilities
    .filter((item) => item.startDate <= from)
    .sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
  const ledgerStart = responsibility?.startDate ?? from;
  const verifiedPayments = payments.filter(
    (payment) => payment.verificationStatus === 'verified' && !payment.cancelled,
  );
  const approvedExpenses = expenses.filter((expense) => expense.status === 'approved');
  const sumPayments = (start: string, end: string, endInclusive: boolean): number =>
    verifiedPayments
      .filter(
        (payment) =>
          payment.paymentDate >= start &&
          (endInclusive ? payment.paymentDate <= end : payment.paymentDate < end),
      )
      .reduce((sum, payment) => sum + payment.amount, 0);
  const sumExpenses = (start: string, end: string, endInclusive: boolean): number =>
    approvedExpenses
      .filter(
        (expense) =>
          expense.expenseDate >= start &&
          (endInclusive ? expense.expenseDate <= end : expense.expenseDate < end),
      )
      .reduce((sum, expense) => sum + expense.amount, 0);

  const openingBalance =
    (responsibility?.openingBalance ?? 0) +
    sumPayments(ledgerStart, from, false) -
    sumExpenses(ledgerStart, from, false);
  const collections = sumPayments(from, to, true);
  const periodExpenses = sumExpenses(from, to, true);

  return {
    openingBalance,
    collections,
    expenses: periodExpenses,
    closingBalance: openingBalance + collections - periodExpenses,
  };
}

export function buildMaintenanceSummary(
  charges: MaintenanceCharge[],
  from: string,
  to: string,
): MaintenanceSummary {
  const empty = {
    billed: 0,
    pending: 0,
    paidFlats: 0,
    partialFlats: 0,
    pendingFlats: 0,
    overdueFlats: 0,
  };
  if (!from || !to || from > to) return empty;

  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const activeCharges = charges.filter(
    (charge) => charge.status !== 'cancelled' && charge.billingMonth <= toMonth,
  );
  const billed = activeCharges
    .filter((charge) => charge.billingMonth >= fromMonth)
    .reduce(
      (sum, charge) =>
        sum + Math.max(0, charge.baseAmount + charge.lateFee - charge.discount + charge.adjustment),
      0,
    );

  const latestByFlat = new Map<string, MaintenanceCharge>();
  for (const charge of activeCharges) {
    const latest = latestByFlat.get(charge.flatId);
    if (!latest || charge.billingMonth > latest.billingMonth) {
      latestByFlat.set(charge.flatId, charge);
    }
  }
  const latestCharges = [...latestByFlat.values()];

  return {
    billed,
    pending: latestCharges.reduce((sum, charge) => sum + charge.balanceAmount, 0),
    paidFlats: latestCharges.filter((charge) => charge.status === 'paid').length,
    partialFlats: latestCharges.filter((charge) => charge.status === 'partially_paid').length,
    pendingFlats: latestCharges.filter((charge) => charge.status === 'unpaid').length,
    overdueFlats: latestCharges.filter((charge) => charge.status === 'overdue').length,
  };
}

export function outstandingCharges(
  charges: MaintenanceCharge[],
  flatId: string,
): MaintenanceCharge[] {
  if (!flatId) return [];
  return charges
    .filter(
      (charge) =>
        charge.flatId === flatId && charge.balanceAmount > 0 && charge.status !== 'cancelled',
    )
    .sort((left, right) => left.billingMonth.localeCompare(right.billingMonth));
}

export function resolvedExpenseCategory(
  category: string,
  customCategory: string,
): { category: string; baseCategory: string; customCategory?: string } {
  const custom = customCategory.trim();
  return {
    category: category === 'Other' ? custom : category,
    baseCategory: category,
    customCategory: category === 'Other' ? custom : undefined,
  };
}
