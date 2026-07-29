import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Profile } from './models';
import { flatNumberFromLogin, loginIdentity, normalizeLoginUsername } from './workflow.utils';

const DEMO_PROFILE: Profile = {
  id: 'demo-owner-101',
  username: 'flat101',
  flatId: 'flat-101',
  flatNumber: '101',
  ownerName: 'K V Reddy Prasad',
  role: 'owner',
  accountStatus: 'active',
  mustChangePassword: false,
  isCurrentAdmin: true,
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly profileState = signal<Profile | null>(null);
  private inactivityTimer?: ReturnType<typeof setTimeout>;
  readonly profile = this.profileState.asReadonly();
  readonly authenticated = computed(() => this.profileState() !== null);
  readonly canManage = computed(() => {
    const profile = this.profileState();
    return profile?.role === 'emergency_admin' || profile?.isCurrentAdmin === true;
  });
  readonly supabase: SupabaseClient | null =
    environment.supabaseUrl && environment.supabaseAnonKey
      ? createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        })
      : null;

  async initialize(): Promise<void> {
    if (!this.supabase) return;
    const { data } = await this.supabase.auth.getSession();
    if (data.session) await this.loadProfile(data.session.user.id);
    this.supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) this.profileState.set(null);
    });
    this.resetInactivityTimer();
  }

  async login(username: string, password: string): Promise<void> {
    if (environment.demoMode && !this.supabase) {
      if (!username.trim() || !password) throw new Error('Enter your flat number and password.');
      const normalized = normalizeLoginUsername(username);
      const emergency = normalized === 'emergency-admin' || normalized === 'admin';
      const flatNumber = flatNumberFromLogin(username) ?? normalized.replace(/^flat[-_ ]?/, '');
      this.profileState.set(
        emergency
          ? {
              ...DEMO_PROFILE,
              id: 'demo-emergency-admin',
              username: 'emergency-admin',
              flatId: null,
              flatNumber: undefined,
              ownerName: 'Emergency Administrator',
              role: 'emergency_admin',
              isCurrentAdmin: false,
            }
          : {
              ...DEMO_PROFILE,
              id: `demo-owner-${flatNumber}`,
              username: normalized,
              flatId: `flat-${flatNumber}`,
              flatNumber,
              ownerName: flatNumber === '101' ? 'K V Reddy Prasad' : `Owner · ${flatNumber}`,
              isCurrentAdmin: flatNumber === '101',
            },
      );
      this.resetInactivityTimer();
      return;
    }
    if (!this.supabase) throw new Error('Supabase is not configured.');
    const identity = loginIdentity(username);
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: identity,
      password,
    });
    if (error || !data.user) throw new Error('The username or password is incorrect.');
    await this.loadProfile(data.user.id);
    if (this.profileState()?.accountStatus !== 'active') {
      await this.logout();
      throw new Error('This account is inactive. Contact the Emergency Administrator.');
    }
    await this.supabase.rpc('audit_session_event', { p_action: 'login' });
    this.resetInactivityTimer();
  }

  async changePassword(currentPassword: string, password: string): Promise<void> {
    if (!this.supabase) {
      const profile = this.profileState();
      if (profile) this.profileState.set({ ...profile, mustChangePassword: false });
      return;
    }
    const profile = this.profileState();
    if (!profile) throw new Error('Your session has expired. Sign in again.');
    const identity = `${profile.username}@owners.mukunda-enclave.invalid`;
    const { error: verifyError } = await this.supabase.auth.signInWithPassword({
      email: identity,
      password: currentPassword,
    });
    if (verifyError) throw new Error('The current password is incorrect.');
    const { error } = await this.supabase.auth.updateUser({ password });
    if (error) throw error;
    await this.supabase.rpc('complete_initial_password_change');
    const updatedProfile = this.profileState();
    if (updatedProfile) this.profileState.set({ ...updatedProfile, mustChangePassword: false });
  }

  async logout(): Promise<void> {
    clearTimeout(this.inactivityTimer);
    const userId = this.profileState()?.id;
    if (this.supabase && userId) {
      await this.supabase.rpc('audit_session_event', { p_action: 'logout' });
    }
    await this.supabase?.auth.signOut();
    this.profileState.set(null);
    await this.router.navigateByUrl('/login');
  }

  resetInactivityTimer(): void {
    clearTimeout(this.inactivityTimer);
    if (!this.authenticated()) return;
    this.inactivityTimer = setTimeout(() => void this.logout(), 15 * 60 * 1000);
  }

  relinquishCurrentResponsibility(): void {
    const profile = this.profileState();
    if (profile?.role === 'owner' && profile.isCurrentAdmin) {
      this.profileState.set({ ...profile, isCurrentAdmin: false });
    }
  }

  private async loadProfile(userId: string): Promise<void> {
    if (!this.supabase) return;
    const { data, error } = await this.supabase
      .from('profiles')
      .select(
        'id,username,flat_id,owner_name,role,account_status,must_change_password,flats(flat_number)',
      )
      .eq('id', userId)
      .single();
    if (error) throw error;
    const { data: current } = await this.supabase
      .from('maintenance_responsibilities')
      .select('owner_profile_id')
      .eq('status', 'current')
      .maybeSingle();
    const flat = Array.isArray(data.flats) ? data.flats[0] : data.flats;
    this.profileState.set({
      id: data.id,
      username: data.username,
      flatId: data.flat_id,
      flatNumber: (flat as { flat_number?: string } | null)?.flat_number,
      ownerName: data.owner_name,
      role: data.role,
      accountStatus: data.account_status,
      mustChangePassword: data.must_change_password,
      isCurrentAdmin: current?.owner_profile_id === data.id,
    });
  }
}
