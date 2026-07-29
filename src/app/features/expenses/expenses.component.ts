import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { DataService } from '../../core/data.service';
import { ExportService } from '../../core/export.service';
import { fileValidationError, formatApartmentDate, formatInr } from '../../core/financial.utils';
import { Expense } from '../../core/models';
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
          <button class="primary" (click)="openCreate()">＋ Add expense</button>
        }
      </div>
    </header>
    @if (notice()) {
      <div class="alert" [class.error]="noticeError()">{{ notice() }}</div>
    }
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
                  @if (auth.canManage()) {
                    <button
                      type="button"
                      class="small-button"
                      [disabled]="deletingId() === expense.id"
                      (click)="edit(expense)"
                    >
                      Edit
                    </button>
                  }
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
                  @if (auth.canDeleteExpenses()) {
                    <button
                      type="button"
                      class="small-button danger"
                      [disabled]="deletingId() === expense.id"
                      (click)="delete(expense)"
                    >
                      {{ deletingId() === expense.id ? 'Deleting…' : 'Delete' }}
                    </button>
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
          <p class="eyebrow">{{ isEditing() ? 'CORRECT SPEND' : 'NEW SPEND' }}</p>
          <h2>{{ isEditing() ? 'Edit expense' : 'Add expense' }}</h2>
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
            @if (existingDocuments().length) {
              <div class="upload-box">
                <strong>Existing supporting document</strong>
                @for (document of existingDocuments(); track document.id) {
                  <button type="button" class="small-button" (click)="viewDocument(document.id)">
                    {{ document.originalFilename }}
                  </button>
                }
                <span>A selected replacement is linked only after the edit succeeds.</span>
              </div>
            }
            <label class="upload-box"
              >{{ isEditing() ? 'Replacement bill (optional)' : 'Bills (optional)' }}
              <input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                [disabled]="saving()"
                (change)="filesSelected($event)"
              /><span>{{ fileLabel() }}</span></label
            >
            @if (files().length) {
              <div class="selected-files">
                @for (file of files(); track $index) {
                  <span>
                    {{ file.name }}
                    <button
                      type="button"
                      class="small-button"
                      [disabled]="saving()"
                      (click)="removeFile($index)"
                    >
                      Remove
                    </button>
                  </span>
                }
              </div>
            }
            @if (message()) {
              <div class="alert error">{{ message() }}</div>
            }
            <div class="dialog-actions">
              <button type="button" class="secondary" [disabled]="saving()" (click)="close()">
                Cancel
              </button>
              @if (!isEditing()) {
                <button type="button" class="secondary" [disabled]="saving()" (click)="save(false)">
                  Save draft
                </button>
              }
              <button type="submit" class="primary" [disabled]="saving()">
                {{ saving() ? 'Uploading and saving…' : isEditing() ? 'Save changes' : 'Submit' }}
              </button>
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
  readonly notice = signal('');
  readonly noticeError = signal(false);
  readonly files = signal<File[]>([]);
  readonly isOther = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly operationKey = signal('');
  readonly saving = signal(false);
  readonly deletingId = signal<string | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);
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
  readonly existingDocuments = computed(() => {
    const expenseId = this.editingId();
    return expenseId
      ? this.data
          .documents()
          .filter((item) => item.entityType === 'expense' && item.entityId === expenseId)
      : [];
  });
  readonly fileLabel = computed(() =>
    this.files().length
      ? `${this.files().length} file(s) selected`
      : 'JPG, PNG, WebP or PDF · maximum 5 MB each · up to 5 files',
  );
  money = formatInr;
  date = formatApartmentDate;

  label(value: string): string {
    return value.replaceAll('_', ' ');
  }

  openCreate(): void {
    this.resetForm();
    this.editingId.set(null);
    this.operationKey.set(crypto.randomUUID());
    this.showForm.set(true);
  }

  edit(expense: Expense): void {
    this.resetForm();
    this.editingId.set(expense.id);
    this.operationKey.set(crypto.randomUUID());
    const category = expense.baseCategory ?? expense.category;
    this.form.setValue({
      expenseDate: expense.expenseDate,
      category,
      customCategory: expense.customCategory ?? '',
      vendorName: expense.vendorName,
      description: expense.description,
      amount: expense.amount,
      paymentMode: expense.paymentMode,
      transactionReference: expense.transactionReference ?? '',
      notes: expense.notes ?? '',
    });
    this.selectCategory(category);
    if (expense.customCategory) {
      this.form.controls.customCategory.setValue(expense.customCategory);
    }
    this.showForm.set(true);
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
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    if (files.length > 5) {
      this.message.set('Attach no more than five documents.');
      this.files.set([]);
      input.value = '';
      return;
    }
    const error = files.map(fileValidationError).find(Boolean);
    if (error) {
      this.message.set(error);
      this.files.set([]);
      input.value = '';
      return;
    }
    this.message.set('');
    this.files.set(files);
  }

  removeFile(index: number): void {
    this.files.update((items) => items.filter((_, itemIndex) => itemIndex !== index));
  }

  async save(submit: boolean): Promise<void> {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.message.set('Complete every required field.');
      return;
    }
    this.saving.set(true);
    this.message.set('');
    try {
      const value = this.form.getRawValue();
      const expense = {
        ...value,
        ...resolvedExpenseCategory(value.category, value.customCategory),
      };
      if (this.editingId()) {
        await this.data.updateExpense(
          this.editingId()!,
          expense,
          this.files(),
          this.operationKey(),
        );
        this.notice.set('Expense updated. Totals and reports now use the corrected values.');
      } else {
        await this.data.submitExpense(expense, submit, this.files(), this.operationKey());
        this.notice.set(
          submit
            ? this.files().length
              ? 'Expense submitted successfully with its private document.'
              : 'Expense submitted successfully.'
            : 'Expense draft saved successfully.',
        );
      }
      this.noticeError.set(false);
      this.close();
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Unable to save expense.');
    } finally {
      this.saving.set(false);
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

  async delete(expense: Expense): Promise<void> {
    const identity = `${this.date(expense.expenseDate)} · ${expense.vendorName} · ${this.money(expense.amount)}`;
    if (!window.confirm(`Delete this expense from normal financial records?\n${identity}`)) return;
    const reason = window.prompt('Enter the mandatory deletion reason:') ?? '';
    if (!reason) return;
    this.deletingId.set(expense.id);
    try {
      await this.data.deleteExpense(expense.id, reason);
      this.noticeError.set(false);
      this.notice.set(`Expense deleted from normal records: ${identity}`);
    } catch (error) {
      this.noticeError.set(true);
      this.notice.set(error instanceof Error ? error.message : 'Deletion failed.');
    } finally {
      this.deletingId.set(null);
    }
  }

  async viewDocument(documentId: string): Promise<void> {
    try {
      const url = await this.data.signedDocumentUrl(documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Unable to open document.');
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
    this.resetForm();
  }

  private resetForm(): void {
    this.message.set('');
    this.files.set([]);
    this.isOther.set(false);
    this.editingId.set(null);
    this.operationKey.set('');
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
