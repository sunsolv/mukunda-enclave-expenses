import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DataService } from '../../core/data.service';
import { ExportService } from '../../core/export.service';
import { formatApartmentDate, formatInr } from '../../core/financial.utils';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-records',
  imports: [RouterLink],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
        <p class="muted">{{ subtitle }}</p>
      </div>
    </header>
    @switch (view) {
      @case ('flats') {
        <section class="flat-grid">
          @for (flat of data.flats(); track flat.id) {
            <article class="panel flat-card">
              <div class="flat-number">{{ flat.flatNumber }}</div>
              <div>
                <h2>{{ flat.ownerName }}</h2>
                <p>{{ flat.floor }} floor</p>
                <span class="badge verified">{{ flat.active ? 'active' : 'inactive' }}</span>
              </div>
              <div class="flat-charge">
                <small>Monthly maintenance</small
                ><strong>{{ money(flat.maintenanceAmount) }}</strong>
              </div>
            </article>
          }
        </section>
      }
      @case ('documents') {
        <section class="panel table-panel">
          <div class="table-toolbar">
            <div>
              <h2>Private document register</h2>
              <p class="muted">
                {{ data.documents().length }} files · {{ storagePercent() }}% of configured storage
              </p>
            </div>
            <button class="secondary" (click)="downloadZip()">Download authorized ZIP</button>
          </div>
          <div class="storage-bar"><span [style.width.%]="storagePercent()"></span></div>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Record</th>
                  <th>Uploaded</th>
                  <th class="number">Size</th>
                </tr>
              </thead>
              <tbody>
                @for (doc of data.documents(); track doc.id) {
                  <tr>
                    <td>
                      <strong>{{ doc.originalFilename }}</strong>
                    </td>
                    <td>{{ label(doc.documentType) }}</td>
                    <td>{{ doc.entityType }} · {{ doc.entityId }}</td>
                    <td>{{ date(doc.createdAt.slice(0, 10)) }}</td>
                    <td class="number">{{ fileSize(doc.sizeBytes) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="alert">
            Files are accessed through short-lived signed URLs in production. The storage bucket is
            never public.
          </div>
          @if (documentMessage()) {
            <div class="alert error">{{ documentMessage() }}</div>
          }
        </section>
      }
      @case ('audit') {
        <section class="panel table-panel">
          <div class="table-toolbar">
            <div>
              <h2>Immutable activity history</h2>
              <p class="muted">Material account, finance, document, and handover actions.</p>
            </div>
          </div>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                @for (entry of data.auditLogs(); track entry.id) {
                  <tr>
                    <td>{{ timestamp(entry.createdAt) }}</td>
                    <td>
                      <strong>{{ entry.username }}</strong>
                    </td>
                    <td>{{ label(entry.action) }}</td>
                    <td>{{ entry.entityType }} {{ entry.entityId ?? '' }}</td>
                    <td>{{ entry.reason ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
      @case ('profile') {
        <section class="two-column">
          <article class="panel profile-panel">
            <div class="profile-avatar">{{ initials() }}</div>
            <h2>{{ auth.profile()?.ownerName }}</h2>
            <p>
              {{ auth.profile()?.username }} · Flat
              {{ auth.profile()?.flatNumber ?? 'Not assigned' }}
            </p>
            <dl>
              <div>
                <dt>Access</dt>
                <dd>{{ auth.canManage() ? 'Financial manager' : 'Owner view' }}</dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>{{ auth.profile()?.accountStatus }}</dd>
              </div>
              <div>
                <dt>Responsibility</dt>
                <dd>{{ auth.profile()?.isCurrentAdmin ? 'Current' : 'Read only' }}</dd>
              </div>
            </dl>
            <a class="secondary" routerLink="/change-password">Change password</a>
          </article>
          <article class="panel">
            <p class="eyebrow">SESSION SECURITY</p>
            <h2>Protected access</h2>
            <ul class="check-list">
              <li>Automatic token refresh</li>
              <li>15-minute inactivity logout</li>
              <li>No financial records in local storage</li>
              <li>Private documents via signed links</li>
            </ul>
          </article>
        </section>
      }
      @case ('accounts') {
        <section class="panel empty-state">
          <span>♙</span>
          <h2>Account provisioning uses a trusted server</h2>
          <p>
            Four owner accounts and one Emergency Administrator are created by the bundled Edge
            Function or provisioning script. Temporary passwords never enter source code or audit
            logs.
          </p>
          <div class="alert warning">
            Live account administration becomes available after Supabase is configured.
          </div>
        </section>
      }
      @case ('settings') {
        <section class="two-column">
          <article class="panel settings-list">
            <h2>Apartment settings</h2>
            <dl>
              <div>
                <dt>Apartment</dt>
                <dd>Mukunda Enclave</dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>INR</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>Asia/Kolkata</dd>
              </div>
              <div>
                <dt>Default due day</dt>
                <dd>10</dd>
              </div>
              <div>
                <dt>Storage bucket</dt>
                <dd>{{ env.storageBucket }}</dd>
              </div>
            </dl>
          </article>
          <article class="panel">
            <p class="eyebrow">PROTECTED CONFIGURATION</p>
            <h2>Critical changes are audited</h2>
            <p class="muted">
              Bank details, role assignments, account activation, and responsibility corrections are
              enforced by database authorization—not only by this screen.
            </p>
          </article>
        </section>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordsComponent {
  readonly data = inject(DataService);
  readonly auth = inject(AuthService);
  private readonly exports = inject(ExportService);
  readonly documentMessage = signal('');
  readonly env = environment;
  readonly view = inject(ActivatedRoute).snapshot.data['view'] as string;
  readonly content: Record<string, [string, string, string]> = {
    flats: [
      'APARTMENT DIRECTORY',
      'Flats & owners',
      'The four homes and their configured maintenance rates.',
    ],
    documents: [
      'PRIVATE STORAGE',
      'Documents',
      'Authorized payment proofs, receipts, bills, and legacy references.',
    ],
    audit: ['TRANSPARENCY', 'Audit logs', 'A permanent record of every material action.'],
    profile: ['YOUR ACCOUNT', 'Profile & security', 'Account access and session protection.'],
    accounts: [
      'EMERGENCY ADMINISTRATION',
      'Owner accounts',
      'Provision, activate, deactivate, or securely reset an owner.',
    ],
    settings: [
      'CONFIGURATION',
      'Apartment settings',
      'Protected community and financial defaults.',
    ],
  };
  get eyebrow(): string {
    return this.content[this.view]?.[0] ?? '';
  }
  get title(): string {
    return this.content[this.view]?.[1] ?? '';
  }
  get subtitle(): string {
    return this.content[this.view]?.[2] ?? '';
  }
  money = formatInr;
  date = formatApartmentDate;
  label(value: string): string {
    return value.replaceAll(/[._]/g, ' ');
  }
  fileSize(bytes: number): string {
    return `${(bytes / 1024).toFixed(bytes > 1024 * 1024 ? 1 : 0)} ${bytes > 1024 * 1024 ? 'MB' : 'KB'}`;
  }
  storagePercent(): number {
    return Math.min(
      100,
      Math.round((this.data.storageUsage() / environment.storageLimitBytes) * 100),
    );
  }
  timestamp(value: string): string {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(new Date(value));
  }
  initials(): string {
    return (this.auth.profile()?.ownerName ?? 'ME')
      .split(' ')
      .slice(0, 2)
      .map((x) => x[0])
      .join('')
      .toUpperCase();
  }
  async downloadZip(): Promise<void> {
    this.documentMessage.set('');
    try {
      await this.exports.downloadDocumentZip(await this.data.authorizedDocumentDownloads());
    } catch (error) {
      this.documentMessage.set(
        error instanceof Error ? error.message : 'Document ZIP download failed.',
      );
    }
  }
}
