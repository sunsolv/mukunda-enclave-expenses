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

  it('reconciles billed and pending maintenance without counting carried balances twice', () => {
    expect(data.summary()).toMatchObject({
      billed: 10500,
      pending: 7000,
      paidFlats: 1,
      partialFlats: 1,
      pendingFlats: 0,
      overdueFlats: 2,
    });
  });

  it('preserves different maintenance amounts for different billing months', async () => {
    await data.generateCharges('2099-07', '2099-07-10', 3100);
    await data.generateCharges('2099-08', '2099-08-10', 3350);
    await data.generateCharges('2099-09', '2099-09-10', 3600);

    const july = data.charges().filter((charge) => charge.billingMonth === '2099-07');
    const august = data.charges().filter((charge) => charge.billingMonth === '2099-08');
    const september = data.charges().filter((charge) => charge.billingMonth === '2099-09');
    expect(july).toHaveLength(4);
    expect(august).toHaveLength(4);
    expect(september).toHaveLength(4);
    expect(july.every((charge) => charge.baseAmount === 3100)).toBe(true);
    expect(august.every((charge) => charge.baseAmount === 3350)).toBe(true);
    expect(september.every((charge) => charge.baseAmount === 3600)).toBe(true);
    for (const septemberCharge of september) {
      const augustCharge = august.find((charge) => charge.flatId === septemberCharge.flatId)!;
      expect(septemberCharge.previousBalance).toBe(augustCharge.balanceAmount);
    }
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

  it('edits an existing expense without changing its identity and recalculates totals', async () => {
    const beforeCount = data.expenses().length;
    const beforeClosing = data.summary().closingBalance;
    const expense = data.expenses().find((item) => item.id === 'e1')!;

    await data.updateExpense(
      expense.id,
      {
        ...expense,
        amount: expense.amount + 500,
        description: 'Corrected monthly security service',
      },
      [],
      crypto.randomUUID(),
    );

    expect(data.expenses()).toHaveLength(beforeCount);
    expect(data.expenses().find((item) => item.id === expense.id)).toMatchObject({
      id: expense.id,
      amount: 6700,
      status: 'approved',
    });
    expect(data.summary().closingBalance).toBe(beforeClosing - 500);
  });

  it('replaces an expense attachment only after the edit succeeds', async () => {
    const expense = data.expenses().find((item) => item.id === 'e1')!;
    await data.updateExpense(
      expense.id,
      expense,
      [new File(['replacement'], 'replacement.pdf', { type: 'application/pdf' })],
      crypto.randomUUID(),
    );

    const documents = data
      .documents()
      .filter((item) => item.entityType === 'expense' && item.entityId === expense.id);
    expect(documents).toHaveLength(1);
    expect(documents[0].originalFilename).toBe('replacement.pdf');
  });

  it('keeps new expense and payment submissions idempotent and payment pending', async () => {
    const expenseKey = crypto.randomUUID();
    const expenseInput = {
      expenseDate: '2099-07-01',
      category: 'Security',
      baseCategory: 'Security',
      vendorName: 'Vendor',
      description: 'Security correction',
      amount: 100,
      paymentMode: 'cash',
    };
    const expenseFile = new File(['expense-proof'], 'expense.pdf', { type: 'application/pdf' });
    const expenseId = await data.submitExpense(expenseInput, true, [expenseFile], expenseKey);
    const repeatedExpenseId = await data.submitExpense(
      expenseInput,
      true,
      [expenseFile],
      expenseKey,
    );
    expect(repeatedExpenseId).toBe(expenseId);
    expect(data.expenses().filter((item) => item.id === expenseId)).toHaveLength(1);
    expect(
      data
        .documents()
        .filter((item) => item.entityType === 'expense' && item.entityId === expenseId),
    ).toHaveLength(1);

    const paymentKey = crypto.randomUUID();
    const paymentInput = {
      flatId: 'flat-101',
      maintenanceChargeId: 'c1',
      paymentDate: '2099-07-01',
      amount: 100,
      paymentMode: 'UPI',
      transactionReference: 'IDEMPOTENT-DEMO',
    };
    const paymentFile = new File(['payment-proof'], 'payment.webp', { type: 'image/webp' });
    const paymentId = await data.submitPayment(paymentInput, paymentFile, paymentKey);
    const repeatedPaymentId = await data.submitPayment(paymentInput, paymentFile, paymentKey);
    expect(repeatedPaymentId).toBe(paymentId);
    expect(data.payments().filter((item) => item.id === paymentId)).toHaveLength(1);
    expect(data.payments().find((item) => item.id === paymentId)?.verificationStatus).toBe(
      'pending',
    );
    expect(
      data
        .documents()
        .filter((item) => item.entityType === 'payment' && item.entityId === paymentId),
    ).toHaveLength(1);
  });

  it('rejects invalid documents before creating a financial record', async () => {
    const before = data.expenses().length;
    await expect(
      data.submitExpense(
        {
          expenseDate: '2099-07-01',
          category: 'Security',
          vendorName: 'Vendor',
          description: 'Invalid upload test',
          amount: 100,
          paymentMode: 'cash',
        },
        true,
        [new File(['bad'], 'bad.exe', { type: 'application/octet-stream' })],
        crypto.randomUUID(),
      ),
    ).rejects.toThrow('Only JPG');
    expect(data.expenses()).toHaveLength(before);
  });

  it('allows only the Emergency Administrator to soft-delete an expense', async () => {
    const expense = data.expenses().find((item) => item.id === 'e1')!;
    await expect(data.deleteExpense(expense.id, 'Duplicate entry')).rejects.toThrow(
      'Emergency Administrator',
    );

    await auth.login('emergency-admin', 'demo-password');
    const beforeClosing = data.summary().closingBalance;
    await data.deleteExpense(expense.id, 'Duplicate entry');

    expect(data.expenses().some((item) => item.id === expense.id)).toBe(false);
    expect(data.summary().closingBalance).toBe(beforeClosing + expense.amount);
    expect(data.auditLogs()[0]).toMatchObject({
      action: 'expense.deleted',
      entityId: expense.id,
      reason: 'Duplicate entry',
    });
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
