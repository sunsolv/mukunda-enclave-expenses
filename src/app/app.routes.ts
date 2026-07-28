import { Routes } from '@angular/router';
import { adminGuard, authGuard, managerGuard, publicGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [publicGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'change-password',
    loadComponent: () =>
      import('./features/auth/change-password.component').then((m) => m.ChangePasswordComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'maintenance',
        loadComponent: () =>
          import('./features/maintenance/maintenance.component').then(
            (m) => m.MaintenanceComponent,
          ),
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('./features/payments/payments.component').then((m) => m.PaymentsComponent),
      },
      {
        path: 'payment-verification',
        canActivate: [managerGuard],
        loadComponent: () =>
          import('./features/payments/payments.component').then((m) => m.PaymentsComponent),
      },
      {
        path: 'expenses',
        loadComponent: () =>
          import('./features/expenses/expenses.component').then((m) => m.ExpensesComponent),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'responsibility',
        loadComponent: () =>
          import('./features/responsibility/responsibility.component').then(
            (m) => m.ResponsibilityComponent,
          ),
      },
      {
        path: 'handover',
        canActivate: [managerGuard],
        loadComponent: () =>
          import('./features/responsibility/responsibility.component').then(
            (m) => m.ResponsibilityComponent,
          ),
      },
      {
        path: 'flats',
        loadComponent: () =>
          import('./features/records/records.component').then((m) => m.RecordsComponent),
        data: { view: 'flats' },
      },
      {
        path: 'documents',
        loadComponent: () =>
          import('./features/records/records.component').then((m) => m.RecordsComponent),
        data: { view: 'documents' },
      },
      {
        path: 'audit',
        loadComponent: () =>
          import('./features/records/records.component').then((m) => m.RecordsComponent),
        data: { view: 'audit' },
      },
      {
        path: 'settings',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/records/records.component').then((m) => m.RecordsComponent),
        data: { view: 'settings' },
      },
      {
        path: 'accounts',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/records/records.component').then((m) => m.RecordsComponent),
        data: { view: 'accounts' },
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/records/records.component').then((m) => m.RecordsComponent),
        data: { view: 'profile' },
      },
    ],
  },
  {
    path: 'access-denied',
    loadComponent: () =>
      import('./features/status/status.component').then((m) => m.AccessDeniedComponent),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/status/status.component').then((m) => m.NotFoundComponent),
  },
];
