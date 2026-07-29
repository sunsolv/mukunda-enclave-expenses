import {
  amountInIndianWords,
  calculateCharge,
  calculateChargeStatus,
  calculateClosingBalance,
  calculatePaymentBalance,
  fileValidationError,
  formatApartmentDate,
  formatInr,
  validateHandover,
} from './financial.utils';

describe('financial utilities', () => {
  it('formats Indian currency and apartment dates', () => {
    expect(formatInr(125000)).toContain('1,25,000.00');
    expect(formatApartmentDate('2026-07-28')).toBe('28-07-2026');
    expect(amountInIndianWords(125000)).toBe('One Lakh Twenty Five Thousand rupees only');
  });

  it('calculates charges and reconciled closing balance', () => {
    expect(calculateCharge(3000, 500, 100, 50, -25)).toBe(3525);
    expect(calculateClosingBalance(0, 12000, 8649)).toBe(3351);
  });

  it('handles full, partial, overdue, and cancelled charges', () => {
    expect(calculatePaymentBalance(3000, 3000)).toBe(0);
    expect(calculateChargeStatus(3000, 3000, '2020-01-01')).toBe('paid');
    expect(calculateChargeStatus(3000, 1000, '2099-01-01')).toBe('partially_paid');
    expect(calculateChargeStatus(3000, 0, '2020-01-01')).toBe('overdue');
    expect(calculateChargeStatus(3000, 0, '2099-01-01', true)).toBe('cancelled');
  });

  it('validates handover reconciliation', () => {
    expect(validateHandover('Year-end books reconciled', 'flat-102', 3351, 3351)).toEqual([]);
    expect(validateHandover('', '', 3300, 3351)).toHaveLength(3);
  });

  it('validates supported private document uploads', () => {
    expect(
      fileValidationError(new File(['pdf'], 'receipt.pdf', { type: 'application/pdf' })),
    ).toBeNull();
    expect(
      fileValidationError(new File(['exe'], 'receipt.exe', { type: 'application/octet-stream' })),
    ).toContain('Only');
    expect(
      fileValidationError(new File(['not-pdf'], 'receipt.pdf', { type: 'image/jpeg' })),
    ).toContain('Only');
    expect(fileValidationError(new File([], 'empty.png', { type: 'image/png' }))).toContain(
      'empty',
    );
    expect(
      fileValidationError(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.webp', {
          type: 'image/webp',
        }),
      ),
    ).toContain('5 MB');
  });
});
