import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  template: `
    <main class="auth-page">
      <section class="auth-brand" aria-label="Mukunda Enclave introduction">
        <div class="brand-mark">ME</div>
        <p class="eyebrow">MUKUNDA ENCLAVE</p>
        <h1>Every rupee, clearly accounted for.</h1>
        <p>
          A private financial workspace for four homes—maintenance, expenses, receipts, and
          handovers in one calm place.
        </p>
        <div class="trust-row">
          <span>Private records</span><span>Audited changes</span><span>Clear handovers</span>
        </div>
      </section>

      <section class="auth-panel">
        <div class="auth-card">
          <p class="eyebrow">OWNER ACCESS</p>
          <h2>Welcome back</h2>
          <p class="muted">Use your flat number or assigned username.</p>

          <form [formGroup]="form" (ngSubmit)="submit()">
            <label for="username">Flat number or username</label>
            <input
              id="username"
              formControlName="username"
              autocomplete="username"
              placeholder="For example, 101"
            />
            @if (form.controls.username.touched && form.controls.username.invalid) {
              <small class="field-error">Enter your flat number or username.</small>
            }

            <label for="password">Password</label>
            <div class="password-field">
              <input
                id="password"
                formControlName="password"
                [type]="showPassword() ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="Enter your password"
              />
              <button type="button" class="text-button" (click)="showPassword.set(!showPassword())">
                {{ showPassword() ? 'Hide' : 'Show' }}
              </button>
            </div>
            @if (error()) {
              <div class="alert error" role="alert">{{ error() }}</div>
            }
            <button class="primary full" type="submit" [disabled]="loading()">
              {{ loading() ? 'Signing in…' : 'Sign in securely' }}
            </button>
          </form>

          <div class="demo-note">
            <strong>Local preview</strong>
            <span>Try <code>101</code> or <code>emergency-admin</code> with any password.</span>
          </div>
          <p class="support-note">
            Password help is handled by the Emergency Administrator. There is no public recovery or
            registration.
          </p>
        </div>
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);
  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(64)]],
    password: ['', [Validators.required, Validators.minLength(1)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const { username, password } = this.form.getRawValue();
      await this.auth.login(username, password);
      await this.router.navigateByUrl(
        this.auth.profile()?.mustChangePassword ? '/change-password' : '/dashboard',
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      this.loading.set(false);
    }
  }
}
