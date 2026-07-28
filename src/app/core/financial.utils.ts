import { ChargeStatus } from './models';

export function formatInr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatApartmentDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00+05:30`) : value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
    .format(date)
    .replaceAll('/', '-');
}

export function calculateCharge(
  base: number,
  previousBalance = 0,
  lateFee = 0,
  discount = 0,
  adjustment = 0,
): number {
  return Math.max(0, base + previousBalance + lateFee - discount + adjustment);
}

export function calculateClosingBalance(
  opening: number,
  verifiedCollections: number,
  approvedExpenses: number,
): number {
  return opening + verifiedCollections - approvedExpenses;
}

export function calculatePaymentBalance(total: number, paid: number): number {
  return Math.max(0, Number((total - paid).toFixed(2)));
}

export function calculateChargeStatus(
  total: number,
  paid: number,
  dueDate: string,
  cancelled = false,
): ChargeStatus {
  if (cancelled) return 'cancelled';
  if (paid >= total) return 'paid';
  if (paid > 0) return 'partially_paid';
  if (new Date(`${dueDate}T23:59:59+05:30`).getTime() < Date.now()) return 'overdue';
  return 'unpaid';
}

export function validateHandover(
  notes: string,
  nextFlatId: string,
  confirmedBalance: number,
  calculatedBalance: number,
): string[] {
  const errors: string[] = [];
  if (notes.trim().length < 10) errors.push('Handover notes must contain at least 10 characters.');
  if (!nextFlatId) errors.push('Select the next responsible flat.');
  if (Math.abs(confirmedBalance - calculatedBalance) > 0.009)
    errors.push('Confirmed balance must match the calculated balance.');
  return errors;
}

export function fileValidationError(file: File): string | null {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const extensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!allowed.includes(file.type) || !extensions.includes(extension))
    return 'Only JPG, PNG, WebP and PDF files are allowed.';
  if (file.size > 5 * 1024 * 1024) return 'The file must be 5 MB or smaller.';
  return null;
}

export function amountInIndianWords(value: number): string {
  const number = Math.floor(Math.abs(value));
  if (number === 0) return 'Zero rupees only';
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];
  const belowThousand = (part: number): string => {
    const words: string[] = [];
    if (part >= 100) {
      words.push(ones[Math.floor(part / 100)], 'Hundred');
      part %= 100;
    }
    if (part >= 20) {
      words.push(tens[Math.floor(part / 10)]);
      part %= 10;
    }
    if (part > 0) words.push(ones[part]);
    return words.join(' ');
  };
  const groups: Array<[number, string]> = [
    [10000000, 'Crore'],
    [100000, 'Lakh'],
    [1000, 'Thousand'],
  ];
  let remaining = number;
  const words: string[] = [];
  for (const [size, label] of groups) {
    if (remaining >= size) {
      words.push(belowThousand(Math.floor(remaining / size)), label);
      remaining %= size;
    }
  }
  if (remaining) words.push(belowThousand(remaining));
  return `${words.join(' ')} rupees only`;
}
