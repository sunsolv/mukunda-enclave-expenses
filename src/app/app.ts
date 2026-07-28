import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'markActivity()',
    '(document:keydown)': 'markActivity()',
    '(document:touchstart)': 'markActivity()',
  },
})
export class App {
  private readonly auth = inject(AuthService);

  markActivity(): void {
    this.auth.resetInactivityTimer();
  }
}
