import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { PaymentsComponent } from './payments.component';

describe('PaymentsComponent', () => {
  it('reactively lists outstanding months only for the selected flat', async () => {
    TestBed.configureTestingModule({
      imports: [PaymentsComponent],
      providers: [provideRouter([])],
    });
    await TestBed.inject(AuthService).login('101', 'demo-password');
    const fixture = TestBed.createComponent(PaymentsComponent);
    const component = fixture.componentInstance;

    component.selectFlat('flat-102');
    expect(component.outstanding().map((charge) => charge.flatNumber)).toEqual(['102']);

    component.selectFlat('flat-201');
    expect(component.outstanding().map((charge) => charge.flatNumber)).toEqual(['201']);
    expect(component.form.controls.maintenanceChargeId.value).toBe('');
  });

  it('keeps a payment pending and submits only once while upload is running', async () => {
    TestBed.configureTestingModule({
      imports: [PaymentsComponent],
      providers: [provideRouter([])],
    });
    await TestBed.inject(AuthService).login('101', 'demo-password');
    const component = TestBed.createComponent(PaymentsComponent).componentInstance;
    component.openForm();
    component.form.setValue({
      flatId: 'flat-102',
      maintenanceChargeId: 'c2',
      paymentDate: '2099-07-01',
      amount: 500,
      paymentMode: 'UPI',
      transactionReference: 'PAYMENT-TEST',
      notes: '',
    });
    let finish!: (id: string) => void;
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const submit = vi.spyOn(component.data, 'submitPayment').mockReturnValue(pending);

    const first = component.save();
    await component.save();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(component.submitting()).toBe(true);
    finish('payment-id');
    await first;
    expect(component.notice()).toContain('verification');
  });

  it('keeps the payment dialog open for a genuine proof upload failure', async () => {
    TestBed.configureTestingModule({
      imports: [PaymentsComponent],
      providers: [provideRouter([])],
    });
    await TestBed.inject(AuthService).login('101', 'demo-password');
    const component = TestBed.createComponent(PaymentsComponent).componentInstance;
    component.openForm();
    component.form.setValue({
      flatId: 'flat-102',
      maintenanceChargeId: 'c2',
      paymentDate: '2099-07-01',
      amount: 500,
      paymentMode: 'UPI',
      transactionReference: 'PAYMENT-FAIL',
      notes: '',
    });
    vi.spyOn(component.data, 'submitPayment').mockRejectedValue(
      new Error('Document upload failed. No record was created.'),
    );

    await component.save();

    expect(component.showForm()).toBe(true);
    expect(component.failed()).toBe(true);
    expect(component.message()).toContain('Document upload failed');
  });
});
