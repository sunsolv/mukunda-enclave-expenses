import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-access-denied',
  imports: [RouterLink],
  template: `<main class="center-page">
    <section class="empty-state panel">
      <span>🔒</span>
      <p class="eyebrow">PROTECTED AREA</p>
      <h1>View-only access</h1>
      <p>
        Your account does not have permission to perform this action. Financial writes belong only
        to the Current Maintenance Administrator or Emergency Administrator.
      </p>
      <a class="primary" routerLink="/dashboard">Return to dashboard</a>
    </section>
  </main>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessDeniedComponent {}

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `<main class="center-page">
    <section class="empty-state panel">
      <span>404</span>
      <p class="eyebrow">PAGE NOT FOUND</p>
      <h1>This page has moved</h1>
      <p>Use the dashboard to return to the financial workspace.</p>
      <a class="primary" routerLink="/dashboard">Open dashboard</a>
    </section>
  </main>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
