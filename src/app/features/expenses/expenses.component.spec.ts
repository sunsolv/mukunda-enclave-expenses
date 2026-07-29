import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
});
