import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.authenticated()) return router.createUrlTree(['/login']);
  if (auth.profile()?.mustChangePassword) return router.createUrlTree(['/change-password']);
  return true;
};

export const publicGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.authenticated() ? inject(Router).createUrlTree(['/dashboard']) : true;
};

export const managerGuard: CanActivateFn = () =>
  inject(AuthService).canManage() ? true : inject(Router).createUrlTree(['/access-denied']);

export const adminGuard: CanActivateFn = () =>
  inject(AuthService).profile()?.role === 'emergency_admin'
    ? true
    : inject(Router).createUrlTree(['/access-denied']);
