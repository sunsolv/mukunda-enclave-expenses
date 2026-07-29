import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { DataService } from '../../core/data.service';
import { formatApartmentDate, formatInr } from '../../core/financial.utils';

@Component({
  selector: 'app-maintenance',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">COLLECTIONS</p>
        <h1>Monthly maintenance</h1>
        <p class="muted">Generate, track, and reconcile charges for all four homes.</p>
      </div>
      @if (auth.canManage()) {
        <button class="primary" (click)="showGenerator.set(true)">＋ Generate charges</button>
      }
    </header>
    <section class="mini-metrics">
      <div>
        <span>Billed</span><strong>{{ money(data.summary().billed) }}</strong>
      </div>
      <div>
        <span>Collected</span
        ><strong class="success-text">{{ money(data.summary().collected) }}</strong>
      </div>
      <div>
        <span>Pending</span
        ><strong class="warning-text">{{ money(data.summary().pending) }}</strong>
      </div>
      <div>
        <span>Overdue flats</span
        ><strong class="danger-text">{{ data.summary().overdueFlats }}</strong>
      </div>
    </section>
    <section class="panel table-panel">
      <div class="table-toolbar">
        <div>
          <h2>Charge register</h2>
          <p class="muted">{{ filtered().length }} records</p>
        </div>
        <div class="filters">
          <input
            aria-label="Search flat"
            placeholder="Search flat…"
            (input)="search.set($any($event.target).value)"
          />
          <select aria-label="Status" (change)="status.set($any($event.target).value)">
            <option value="">All statuses</option>
            <option>paid</option>
            <option>partially_paid</option>
            <option>unpaid</option>
            <option>overdue</option>
          </select>
        </div>
      </div>
      <div class="responsive-table">
        <table>
          <thead>
            <tr>
              <th>Flat</th>
              <th>Month</th>
              <th>Due date</th>
              <th class="number">Billed</th>
              <th class="number">Paid</th>
              <th class="number">Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            @for (charge of filtered(); track charge.id) {
              <tr>
                <td data-label="Flat">
                  <strong>{{ charge.flatNumber }}</strong>
                </td>
                <td data-label="Month">{{ charge.billingMonth }}</td>
                <td data-label="Due date">{{ date(charge.dueDate) }}</td>
                <td data-label="Billed" class="number">{{ money(charge.totalAmount) }}</td>
                <td data-label="Paid" class="number">{{ money(charge.paidAmount) }}</td>
                <td data-label="Balance" class="number">{{ money(charge.balanceAmount) }}</td>
                <td data-label="Status">
                  <span class="badge" [class]="charge.status">{{ label(charge.status) }}</span>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="empty">No charges match these filters.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    @if (showGenerator()) {
      <div class="dialog-backdrop">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="charge-title">
          <p class="eyebrow">NEW BILLING PERIOD</p>
          <h2 id="charge-title">Generate monthly charges</h2>
          <form [formGroup]="form" (ngSubmit)="generate()">
            <label>Billing month<input type="month" formControlName="billingMonth" /></label>
            <label>Due date<input type="date" formControlName="dueDate" /></label>
            <label
              >Maintenance amount<input
                type="number"
                min="0.01"
                step="0.01"
                formControlName="amount"
            /></label>
            <div class="preview-box">
              <strong>{{ data.flats().length }} active flats</strong
              ><span
                >The entered amount applies to this billing month. Existing non-cancelled charges
                remain protected from duplicates.</span
              >
            </div>
            @if (message()) {
              <div class="alert" [class.error]="failed()">{{ message() }}</div>
            }
            <div class="dialog-actions">
              <button type="button" class="secondary" (click)="showGenerator.set(false)">
                Cancel</button
              ><button class="primary" type="submit">Confirm generation</button>
            </div>
          </form>
        </section>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaintenanceComponent {
  readonly data = inject(DataService);
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  readonly search = signal('');
  readonly status = signal('');
  readonly showGenerator = signal(false);
  readonly message = signal('');
  readonly failed = signal(false);
  private readonly now = new Date();
  readonly form = this.fb.nonNullable.group({
    billingMonth: [
      `${this.now.getFullYear()}-${String(this.now.getMonth() + 1).padStart(2, '0')}`,
      Validators.required,
    ],
    dueDate: [
      `${this.now.getFullYear()}-${String(this.now.getMonth() + 1).padStart(2, '0')}-10`,
      Validators.required,
    ],
    amount: [3000, [Validators.required, Validators.min(0.01)]],
  });
  readonly filtered = computed(() =>
    this.data
      .charges()
      .filter(
        (item) =>
          item.flatNumber.includes(this.search().trim()) &&
          (!this.status() || item.status === this.status()),
      ),
  );
  money = formatInr;
  date = formatApartmentDate;
  label(value: string): string {
    return value.replaceAll('_', ' ');
  }
  async generate(): Promise<void> {
    if (this.form.invalid) return;
    try {
      await this.data.generateCharges(
        this.form.value.billingMonth!,
        this.form.value.dueDate!,
        this.form.value.amount!,
      );
      this.failed.set(false);
      this.message.set('Charges generated successfully.');
      setTimeout(() => this.showGenerator.set(false), 700);
    } catch (error) {
      this.failed.set(true);
      this.message.set(error instanceof Error ? error.message : 'Generation failed.');
    }
  }
}
