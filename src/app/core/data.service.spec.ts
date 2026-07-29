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
    await expect(data.generateCharges(currentMonth, `${currentMonth}-10`, 3100)).rejects.toThrow(
      'already exist',
    );
  });

  it('preserves different maintenance amounts for different billing months', async () => {
    await data.generateCharges('2099-07', '2099-07-10', 3100);
    await data.generateCharges('2099-08', '2099-08-10', 3350);

    const july = data.charges().filter((charge) => charge.billingMonth === '2099-07');
    const august = data.charges().filter((charge) => charge.billingMonth === '2099-08');
    expect(july).toHaveLength(4);
    expect(august).toHaveLength(4);
    expect(july.every((charge) => charge.baseAmount === 3100)).toBe(true);
    expect(august.every((charge) => charge.baseAmount === 3350)).toBe(true);
  });

  it('allocates a verified full payment to its charge', async () => {
    const pending = data.payments().find((payment) => payment.verificationStatus === 'pending')!;
    const before = data.charges().find((item) => item.id === pending.maintenanceChargeId)!;
    expect(before.paidAmount).toBe(0);
    expect(before.balanceAmount).toBe(pending.amount);

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

  it('forbids ordinary owners from editing owner details', async () => {
    await expect(data.updateOwnerDetails('flat-101', 'Updated Owner')).rejects.toThrow(
      'Emergency Administrator',
    );
  });

  it('updates the flat and responsibility owner name as the Emergency Administrator', async () => {
    await auth.login('emergency-admin', 'demo-password');
    await data.updateOwnerDetails('flat-101', 'K V Reddy Prasad', '+91 90000 00000');

    expect(data.flats().find((flat) => flat.id === 'flat-101')).toMatchObject({
      ownerName: 'K V Reddy Prasad',
      mobile: '+91 90000 00000',
    });
    expect(
      data
        .responsibilities()
        .filter((item) => item.flatNumber === '101')
        .every((item) => item.ownerName === 'K V Reddy Prasad'),
    ).toBe(true);
  });
});
