import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { ExpensesComponent } from './expenses.component';

describe('ExpensesComponent', () => {
  it('requires a custom category when Other is selected', async () => {
    TestBed.configureTestingModule({
      imports: [ExpensesComponent],
      providers: [provideRouter([])],
    });
    await TestBed.inject(AuthService).login('101', 'demo-password');
    const fixture = TestBed.createComponent(ExpensesComponent);
    const component = fixture.componentInstance;

    component.form.controls.category.setValue('Other');
    component.selectCategory('Other');
    expect(component.form.controls.customCategory.hasError('required')).toBe(true);

    component.form.controls.customCategory.setValue('Generator fuel');
    expect(component.form.controls.customCategory.valid).toBe(true);

    component.form.controls.category.setValue('Security');
    component.selectCategory('Security');
    expect(component.form.controls.customCategory.value).toBe('');
    expect(component.form.controls.customCategory.valid).toBe(true);
  });

  it('closes the dialog without creating an expense', async () => {
    TestBed.configureTestingModule({
      imports: [ExpensesComponent],
      providers: [provideRouter([])],
    });
    await TestBed.inject(AuthService).login('101', 'demo-password');
    const fixture = TestBed.createComponent(ExpensesComponent);
    const component = fixture.componentInstance;
    const before = component.data.expenses().length;

    component.showForm.set(true);
    component.close();

    expect(component.showForm()).toBe(false);
    expect(component.data.expenses()).toHaveLength(before);
  });

  it('loads an existing expense for editing and cancels without saving changes', async () => {
    TestBed.configureTestingModule({
      imports: [ExpensesComponent],
      providers: [provideRouter([])],
    });
    await TestBed.inject(AuthService).login('101', 'demo-password');
    const component = TestBed.createComponent(ExpensesComponent).componentInstance;
    const expense = component.data.expenses()[0];
    const before = { ...expense };

    component.edit(expense);
    expect(component.isEditing()).toBe(true);
    expect(component.form.getRawValue()).toMatchObject({
      expenseDate: expense.expenseDate,
      vendorName: expense.vendorName,
      amount: expense.amount,
    });
    component.form.controls.amount.setValue(expense.amount + 999);
    component.close();

    expect(component.data.expenses().find((item) => item.id === expense.id)).toEqual(before);
    expect(component.showForm()).toBe(false);
  });

  it('prevents double submission while an expense save is running', async () => {
    TestBed.configureTestingModule({
      imports: [ExpensesComponent],
      providers: [provideRouter([])],
    });
    await TestBed.inject(AuthService).login('101', 'demo-password');
    const component = TestBed.createComponent(ExpensesComponent).componentInstance;
    component.openCreate();
    component.form.patchValue({
      vendorName: 'Vendor',
      description: 'Valid expense',
      amount: 500,
    });
    let finish!: (id: string) => void;
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const submit = vi.spyOn(component.data, 'submitExpense').mockReturnValue(pending);

    const first = component.save(true);
    await component.save(true);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(component.saving()).toBe(true);
    finish('expense-id');
    await first;
    expect(component.saving()).toBe(false);
  });

  it('keeps the edit dialog open when an expense upload genuinely fails', async () => {
    TestBed.configureTestingModule({
      imports: [ExpensesComponent],
      providers: [provideRouter([])],
    });
    await TestBed.inject(AuthService).login('101', 'demo-password');
    const component = TestBed.createComponent(ExpensesComponent).componentInstance;
    component.openCreate();
    component.form.patchValue({
      vendorName: 'Vendor',
      description: 'Valid expense',
      amount: 500,
    });
    const operationKey = component.operationKey();
    const submit = vi
      .spyOn(component.data, 'submitExpense')
      .mockRejectedValueOnce(new Error('Document upload failed. No record was created.'))
      .mockResolvedValueOnce('expense-id');

    await component.save(true);

    expect(component.showForm()).toBe(true);
    expect(component.message()).toContain('Document upload failed');
    expect(component.saving()).toBe(false);
    expect(component.operationKey()).toBe(operationKey);

    await component.save(true);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[0][3]).toBe(operationKey);
    expect(submit.mock.calls[1][3]).toBe(operationKey);
    expect(component.showForm()).toBe(false);
  });
});
