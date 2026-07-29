import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
});
