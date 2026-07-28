import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule],
  template: `
    <main class="center-page">
      <section class="form-card narrow">
        <div class="brand-mark">ME</div>
        <p class="eyebrow">ACCOUNT SECURITY</p>
        <h1>
          {{
            auth.profile()?.mustChangePassword ? 'Create your private password' : 'Change password'
          }}
        </h1>
        <p class="muted">
          Use at least 12 characters with uppercase, lowercase, a number, and a symbol.
        </p>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label for="currentPassword">Current password</label>
          <input id="currentPassword" type="password" formControlName="currentPassword" />
          <label for="newPassword">New password</label>
          <input id="newPassword" type="password" formControlName="newPassword" />
          <label for="confirmPassword">Confirm new password</label>
          <input id="confirmPassword" type="password" formControlName="confirmPassword" />
          @if (error()) {
            <div class="alert error" role="alert">{{ error() }}</div>
          }
          <button class="primary full" type="submit" [disabled]="loading()">
            {{ loading() ? 'Saving…' : 'Save password' }}
          </button>
        </form>
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordComponent {
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: [
      '',
      [
        Validators.required,
        Validators.minLength(12),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/),
      ],
    ],
    confirmPassword: ['', Validators.required],
  });

  async submit(): Promise<void> {
    const value = this.form.getRawValue();
    if (this.form.invalid || value.newPassword !== value.confirmPassword) {
      this.error.set(
        value.newPassword !== value.confirmPassword
          ? 'The new passwords do not match.'
          : 'Choose a stronger password that meets every requirement.',
      );
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.changePassword(value.currentPassword, value.newPassword);
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Password change failed.');
    } finally {
      this.loading.set(false);
    }
  }
}
