import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { DataService } from '../core/data.service';

interface NavigationItem {
  label: string;
  icon: string;
  path: string;
  manager?: boolean;
  admin?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-shell" [class.nav-open]="navOpen()">
      <aside class="sidebar">
        <a class="brand" routerLink="/dashboard" (click)="navOpen.set(false)">
          <span class="brand-mark small">ME</span>
          <span><strong>Mukunda Enclave</strong><small>Maintenance & expenses</small></span>
        </a>
        <nav aria-label="Primary navigation">
          <p class="nav-label">OVERVIEW</p>
          @for (item of visiblePrimary(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" (click)="navOpen.set(false)">
              <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span
              >{{ item.label }}
            </a>
          }
          <p class="nav-label">MANAGE</p>
          @for (item of visibleManage(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" (click)="navOpen.set(false)">
              <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span
              >{{ item.label }}
            </a>
          }
        </nav>
        <div class="admin-status">
          <span class="status-dot"></span>
          <div>
            <strong>{{ auth.canManage() ? 'Write access active' : 'View-only access' }}</strong>
            <small>{{
              auth.canManage() ? 'Current responsibility' : 'Protected financial records'
            }}</small>
          </div>
        </div>
      </aside>

      @if (navOpen()) {
        <button
          class="nav-backdrop"
          aria-label="Close navigation"
          (click)="navOpen.set(false)"
        ></button>
      }

      <div class="main-column">
        <header class="topbar">
          <button
            class="icon-button menu-button"
            aria-label="Open navigation"
            (click)="navOpen.set(true)"
          >
            ☰
          </button>
          <div class="topbar-title">
            <span class="status-pill"><i></i> Private workspace</span>
          </div>
          <div class="topbar-actions">
            <a class="icon-button" routerLink="/documents" aria-label="Documents">▤</a>
            <a class="profile-chip" routerLink="/profile">
              <span>{{ initials() }}</span>
              <span
                ><strong>{{ auth.profile()?.ownerName }}</strong
                ><small>Flat {{ auth.profile()?.flatNumber ?? '—' }}</small></span
              >
            </a>
            <button class="icon-button" (click)="auth.logout()" aria-label="Sign out">↪</button>
          </div>
        </header>
        <main class="content"><router-outlet /></main>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private readonly data = inject(DataService);
  readonly navOpen = signal(false);
  readonly initials = computed(() =>
    (this.auth.profile()?.ownerName ?? 'ME')
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  );
  private readonly primary: NavigationItem[] = [
    { label: 'Dashboard', icon: '⌂', path: '/dashboard' },
    { label: 'Monthly maintenance', icon: '▦', path: '/maintenance' },
    { label: 'Payments', icon: '₹', path: '/payments' },
    { label: 'Expenses', icon: '↗', path: '/expenses' },
    { label: 'Reports', icon: '▥', path: '/reports' },
  ];
  private readonly manage: NavigationItem[] = [
    { label: 'Flats & owners', icon: '◎', path: '/flats' },
    { label: 'Documents', icon: '▤', path: '/documents' },
    { label: 'Responsibility', icon: '⇄', path: '/responsibility' },
    { label: 'Audit logs', icon: '◷', path: '/audit' },
    { label: 'Owner accounts', icon: '♙', path: '/accounts', admin: true },
    { label: 'Settings', icon: '⚙', path: '/settings', admin: true },
  ];
  readonly visiblePrimary = computed(() => this.filter(this.primary));
  readonly visibleManage = computed(() => this.filter(this.manage));

  constructor() {
    void this.data.refresh();
  }

  private filter(items: NavigationItem[]): NavigationItem[] {
    const profile = this.auth.profile();
    return items.filter(
      (item) =>
        (!item.manager || this.auth.canManage()) &&
        (!item.admin || profile?.role === 'emergency_admin'),
    );
  }
}
