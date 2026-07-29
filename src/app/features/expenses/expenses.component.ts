import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { DataService } from '../../core/data.service';
import { ExportService } from '../../core/export.service';
import { fileValidationError, formatApartmentDate, formatInr } from '../../core/financial.utils';
import { resolvedExpenseCategory } from '../../core/workflow.utils';

@Component({
  selector: 'app-expenses',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">SPENDING</p>
        <h1>Expense management</h1>
        <p class="muted">Bills, approvals, and category-wise visibility without losing history.</p>
      </div>
      <div class="header-actions">
        <button class="secondary" (click)="exportCsv()">Export register</button>
        @if (auth.canManage()) {
          <button class="primary" (click)="showForm.set(true)">＋ Add expense</button>
        }
      </div>
    </header>
    <section class="mini-metrics">
      <div>
        <span>Approved</span><strong>{{ money(approvedTotal()) }}</strong>
      </div>
      <div>
        <span>Pending approval</span><strong class="warning-text">{{ pendingCount() }}</strong>
      </div>
      <div>
        <span>Drafts</span><strong>{{ draftCount() }}</strong>
      </div>
      <div>
        <span>Largest category</span><strong>{{ topCategory() }}</strong>
      </div>
    </section>
    <section class="panel table-panel">
      <div class="table-toolbar">
        <div>
          <h2>Expense register</h2>
          <p class="muted">Draft and rejected items are excluded from financial totals.</p>
        </div>
        <div class="filters">
          <input
            placeholder="Search vendor or description…"
            (input)="search.set($any($event.target).value)"
          /><select (change)="status.set($any($event.target).value)">
            <option value="">All statuses</option>
            <option>draft</option>
            <option>pending</option>
            <option>approved</option>
            <option>rejected</option>
          </select>
        </div>
      </div>
      <div class="responsive-table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Vendor / description</th>
              <th>Mode</th>
              <th class="number">Amount</th>
              <th>Status</th>
              <th class="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (expense of filtered(); track expense.id) {
              <tr>
                <td data-label="Date">{{ date(expense.expenseDate) }}</td>
                <td data-label="Category">
                  <span class="category-dot"></span>{{ expense.category }}
                </td>
                <td data-label="Vendor">
                  <strong>{{ expense.vendorName }}</strong
                  ><small class="cell-note">{{ expense.description }}</small>
                </td>
                <td data-label="Mode">{{ label(expense.paymentMode) }}</td>
                <td data-label="Amount" class="number">
                  <strong>{{ money(expense.amount) }}</strong>
                </td>
                <td data-label="Status">
                  <span class="badge" [class]="expense.status">{{ expense.status }}</span>
                </td>
                <td data-label="Actions" class="actions">
                  @if (expense.status === 'pending' && auth.canManage()) {
                    <button class="small-button success" (click)="review(expense.id, true)">
                      Approve</button
                    ><button class="small-button danger" (click)="review(expense.id, false)">
                      Reject
                    </button>
                  }
                  @if (expense.status !== 'cancelled' && auth.canManage()) {
                    <button class="small-button danger" (click)="cancel(expense.id)">Cancel</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="empty">No expenses match these filters.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    @if (showForm()) {
      <div class="dialog-backdrop">
        <section class="dialog wide" role="dialog" aria-modal="true">
          <p class="eyebrow">NEW SPEND</p>
          <h2>Add expense</h2>
          <form [formGroup]="form" (ngSubmit)="save(true)">
            <div class="form-grid">
              <label>Expense date<input type="date" formControlName="expenseDate" /></label>
              <label
                >Category<select
                  formControlName="category"
                  (change)="selectCategory($any($event.target).value)"
                >
                  @for (category of categories; track category) {
                    <option>{{ category }}</option>
                  }
                </select></label
              >
              @if (isOther()) {
                <label
                  >Other category<input
                    formControlName="customCategory"
                    maxlength="120"
                    placeholder="Enter expense category"
                /></label>
              }
              <label
                >Vendor / service provider<input formControlName="vendorName" maxlength="120"
              /></label>
              <label
                >Amount<input type="number" min="0.01" step="0.01" formControlName="amount"
              /></label>
              <label
                >Payment mode<select formControlName="paymentMode">
                  <option>UPI</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option>cash</option>
                  <option>cheque</option>
                  <option>card</option>
                  <option>other</option>
                </select></label
              >
              <label>Transaction reference<input formControlName="transactionReference" /></label>
            </div>
            <label>Description<textarea formControlName="description" rows="2"></textarea></label>
            <label>Notes<textarea formControlName="notes" rows="2"></textarea></label>
            <label class="upload-box"
              >Bills (optional)<input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                (change)="filesSelected($event)"
              /><span>{{ fileLabel() }}</span></label
            >
            @if (message()) {
              <div class="alert error">{{ message() }}</div>
            }
            <div class="dialog-actions">
              <button type="button" class="secondary" (click)="close()">Close</button
              ><button type="button" class="secondary" (click)="save(false)">Save draft</button
              ><button type="submit" class="primary">Submit</button>
            </div>
          </form>
        </section>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpensesComponent {
  readonly data = inject(DataService);
  readonly auth = inject(AuthService);
  private readonly exports = inject(ExportService);
  private readonly fb = inject(FormBuilder);
  readonly showForm = signal(false);
  readonly search = signal('');
  readonly status = signal('');
  readonly message = signal('');
  readonly files = signal<File[]>([]);
  readonly isOther = signal(false);
  readonly categories = [
    'Security',
    'Housekeeping',
    'Common Electricity',
    'Water',
    'Repairs and Maintenance',
    'Lift Maintenance',
    'Gardening',
    'Plumbing',
    'Electrical',
    'Waste Management',
    'Administrative',
    'Festival or Event',
    'Other',
  ];
  readonly form = this.fb.nonNullable.group({
    expenseDate: [new Date().toISOString().slice(0, 10), Validators.required],
    category: ['Security', Validators.required],
    customCategory: [''],
    vendorName: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.required, Validators.minLength(3)]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    paymentMode: ['UPI', Validators.required],
    transactionReference: [''],
    notes: [''],
  });
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.data
      .expenses()
      .filter(
        (item) =>
          (!q || `${item.vendorName} ${item.description}`.toLowerCase().includes(q)) &&
          (!this.status() || item.status === this.status()),
      );
  });
  readonly approvedTotal = computed(() =>
    this.data
      .expenses()
      .filter((item) => item.status === 'approved')
      .reduce((sum, item) => sum + item.amount, 0),
  );
  readonly pendingCount = computed(
    () => this.data.expenses().filter((item) => item.status === 'pending').length,
  );
  readonly draftCount = computed(
    () => this.data.expenses().filter((item) => item.status === 'draft').length,
  );
  readonly topCategory = computed(() => {
    const totals = new Map<string, number>();
    this.data
      .expenses()
      .filter((item) => item.status === 'approved')
      .forEach((item) => totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount));
    return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  });
  readonly fileLabel = computed(() =>
    this.files().length
      ? `${this.files().length} file(s) selected`
      : 'JPG, PNG, WebP or PDF · maximum 5 MB each',
  );
  money = formatInr;
  date = formatApartmentDate;
  label(value: string): string {
    return value.replaceAll('_', ' ');
  }
  selectCategory(category: string): void {
    const control = this.form.controls.customCategory;
    this.isOther.set(category === 'Other');
    if (category === 'Other') {
      control.setValidators([Validators.required, Validators.minLength(2)]);
    } else {
      control.clearValidators();
      control.setValue('');
    }
    control.updateValueAndValidity();
  }
  filesSelected(event: Event): void {
    const files = [...((event.target as HTMLInputElement).files ?? [])];
    const error = files.map(fileValidationError).find(Boolean);
    if (error) {
      this.message.set(error);
      this.files.set([]);
      return;
    }
    this.message.set('');
    this.files.set(files);
  }
  async save(submit: boolean): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.message.set('Complete every required field.');
      return;
    }
    try {
      const value = this.form.getRawValue();
      const expenseId = await this.data.addExpense(
        {
          ...value,
          ...resolvedExpenseCategory(value.category, value.customCategory),
        },
        submit,
      );
      for (const file of this.files()) {
        await this.data.uploadDocument(file, 'expense', expenseId, 'expense_bill');
      }
      this.close();
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Unable to save expense.');
    }
  }
  async review(id: string, approve: boolean): Promise<void> {
    const reason = approve
      ? undefined
      : (window.prompt('Enter the rejection reason:') ?? undefined);
    try {
      await this.data.approveExpense(id, approve, reason);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Review failed.');
    }
  }
  async cancel(id: string): Promise<void> {
    const reason = window.prompt('Enter the mandatory cancellation reason:') ?? '';
    try {
      await this.data.cancelExpense(id, reason);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Cancellation failed.');
    }
  }
  async exportCsv(): Promise<void> {
    await this.exports.downloadCsv(
      'mukunda-enclave-expenses',
      this.exports.expenseRows(this.filtered()),
    );
  }
  close(): void {
    this.showForm.set(false);
    this.message.set('');
    this.files.set([]);
    this.isOther.set(false);
    this.form.reset({
      expenseDate: new Date().toISOString().slice(0, 10),
      category: 'Security',
      customCategory: '',
      vendorName: '',
      description: '',
      amount: 0,
      paymentMode: 'UPI',
      transactionReference: '',
      notes: '',
    });
  }
}
