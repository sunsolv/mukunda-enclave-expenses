import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { DataService } from './data.service';

describe('DataService financial workflows', () => {
  let auth: AuthService;
  let data: DataService;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    auth = TestBed.inject(AuthService);
    data = TestBed.inject(DataService);
    await auth.login('101', 'demo-password');
  });

  it('prevents duplicate monthly charge generation', async () => {
    const currentMonth = data.charges()[0].billingMonth;
    await expect(data.generateCharges(currentMonth, `${currentMonth}-10`)).rejects.toThrow(
      'already exist',
    );
  });

  it('allocates a verified full payment to its charge', async () => {
    const pending = data.payments().find((payment) => payment.verificationStatus === 'pending')!;
    await data.verifyPayment(pending.id, true);
    const charge = data.charges().find((item) => item.id === pending.maintenanceChargeId)!;
    expect(charge.status).toBe('paid');
    expect(charge.balanceAmount).toBe(0);
    expect(data.summary().collected).toBe(6750);
  });

  it('rotates responsibility and removes the previous manager write access', async () => {
    const closing = data.summary().closingBalance;
    await data.completeHandover('flat-102', 'All records reviewed and handed over.', closing);
    expect(data.responsibilities().filter((item) => item.status === 'current')).toHaveLength(1);
    expect(data.responsibilities().find((item) => item.status === 'current')?.flatNumber).toBe(
      '102',
    );
    expect(auth.canManage()).toBe(false);
  });

  it('adds selected proof metadata in demo mode', async () => {
    const before = data.documents().length;
    await data.uploadDocument(
      new File(['proof'], 'proof.pdf', { type: 'application/pdf' }),
      'payment',
      'p1',
      'payment_proof',
    );
    expect(data.documents()).toHaveLength(before + 1);
  });
});
