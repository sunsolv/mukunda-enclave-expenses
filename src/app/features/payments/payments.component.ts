import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { DataService } from '../../core/data.service';
import { ExportService } from '../../core/export.service';
import { fileValidationError, formatApartmentDate, formatInr } from '../../core/financial.utils';
import { outstandingCharges } from '../../core/workflow.utils';

@Component({
  selector: 'app-payments',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">COLLECTIONS</p>
        <h1>Payments & receipts</h1>
        <p class="muted">Record payment proofs, verify collections, and issue official receipts.</p>
      </div>
      <button class="primary" (click)="openForm()">＋ Record payment</button>
    </header>
    @if (notice()) {
      <div class="alert">{{ notice() }}</div>
    }
    <section class="panel table-panel">
      <div class="table-toolbar">
        <div>
          <h2>Payment register</h2>
          <p class="muted">Only verified payments count as collections.</p>
        </div>
        <div class="filters">
          <input
            placeholder="Search flat or reference…"
            aria-label="Search payments"
            (input)="search.set($any($event.target).value)"
          />
          <select aria-label="Verification status" (change)="status.set($any($event.target).value)">
            <option value="">All statuses</option>
            <option>pending</option>
            <option>verified</option>
            <option>rejected</option>
          </select>
        </div>
      </div>
      <div class="responsive-table">
        <table>
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Date</th>
              <th>Flat</th>
              <th>Mode / reference</th>
              <th class="number">Amount</th>
              <th>Status</th>
              <th class="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (payment of filtered(); track payment.id) {
              <tr>
                <td data-label="Receipt">
                  <strong>{{ payment.receiptNumber ?? 'Pending' }}</strong>
                </td>
                <td data-label="Date">{{ date(payment.paymentDate) }}</td>
                <td data-label="Flat">Flat {{ payment.flatNumber }}</td>
                <td data-label="Mode / reference">
                  {{ label(payment.paymentMode)
                  }}<small class="cell-note">{{
                    payment.transactionReference || 'No reference'
                  }}</small>
                </td>
                <td data-label="Amount" class="number">
                  <strong>{{ money(payment.amount) }}</strong>
                </td>
                <td data-label="Status">
                  <span class="badge" [class]="payment.verificationStatus">{{
                    payment.verificationStatus
                  }}</span>
                </td>
                <td data-label="Actions" class="actions">
                  @if (payment.verificationStatus === 'pending' && auth.canManage()) {
                    <button class="small-button success" (click)="review(payment.id, true)">
                      Verify
                    </button>
                    <button class="small-button danger" (click)="review(payment.id, false)">
                      Reject
                    </button>
                  }
                  @if (payment.verificationStatus === 'verified') {
                    <button class="small-button" (click)="receipt(payment.id)">Receipt PDF</button>
                  }
                  @if (!payment.cancelled && auth.canManage()) {
                    <button class="small-button danger" (click)="cancel(payment.id)">Cancel</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="empty">No payments match these filters.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    @if (showForm()) {
      <div class="dialog-backdrop">
        <section class="dialog wide" role="dialog" aria-modal="true">
          <p class="eyebrow">NEW COLLECTION</p>
          <h2>Record payment</h2>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div class="form-grid">
              <label
                >Flat<select
                  formControlName="flatId"
                  (change)="selectFlat($any($event.target).value)"
                >
                  <option value="">Select flat</option>
                  @for (flat of allowedFlats(); track flat.id) {
                    <option [value]="flat.id">{{ flat.flatNumber }} · {{ flat.ownerName }}</option>
                  }
                </select></label
              >
              <label
                >Outstanding month<select formControlName="maintenanceChargeId">
                  <option value="">Select charge</option>
                  @for (charge of outstanding(); track charge.id) {
                    <option [value]="charge.id">
                      {{ charge.billingMonth }} · {{ money(charge.balanceAmount) }} due
                    </option>
                  }
                </select></label
              >
              <label>Payment date<input type="date" formControlName="paymentDate" /></label>
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
              <label
                >Transaction reference<input formControlName="transactionReference" maxlength="100"
              /></label>
            </div>
            <label>Notes<textarea formControlName="notes" rows="2"></textarea></label>
            <label class="upload-box"
              >Payment proof (optional)
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                [disabled]="submitting()"
                (change)="fileSelected($event)"
              />
              <span>{{ selectedFile()?.name ?? 'JPG, PNG, WebP or PDF · maximum 5 MB' }}</span>
            </label>
            @if (selectedFile()) {
              <button
                type="button"
                class="small-button"
                [disabled]="submitting()"
                (click)="removeFile()"
              >
                Remove selected proof
              </button>
            }
            @if (message()) {
              <div class="alert" [class.error]="failed()">{{ message() }}</div>
            }
            <div class="dialog-actions">
              <button type="button" class="secondary" [disabled]="submitting()" (click)="close()">
                Cancel</button
              ><button type="submit" class="primary" [disabled]="submitting()">
                {{ submitting() ? 'Uploading and saving…' : 'Submit' }}
              </button>
            </div>
          </form>
        </section>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsComponent {
  readonly data = inject(DataService);
  readonly auth = inject(AuthService);
  private readonly exports = inject(ExportService);
  private readonly fb = inject(FormBuilder);
  readonly showForm = signal(false);
  readonly search = signal('');
  readonly status = signal('');
  readonly message = signal('');
  readonly notice = signal('');
  readonly failed = signal(false);
  readonly selectedFile = signal<File | null>(null);
  readonly selectedFlatId = signal('');
  readonly submitting = signal(false);
  readonly operationKey = signal('');
  readonly form = this.fb.nonNullable.group({
    flatId: ['', Validators.required],
    maintenanceChargeId: ['', Validators.required],
    paymentDate: [new Date().toISOString().slice(0, 10), Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    paymentMode: ['UPI', Validators.required],
    transactionReference: [''],
    notes: [''],
  });
  readonly allowedFlats = computed(() =>
    this.auth.canManage()
      ? this.data.flats()
      : this.data.flats().filter((flat) => flat.id === this.auth.profile()?.flatId),
  );
  readonly outstanding = computed(() =>
    outstandingCharges(this.data.charges(), this.selectedFlatId()),
  );
  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.data
      .payments()
      .filter(
        (item) =>
          (!query ||
            item.flatNumber.includes(query) ||
            item.transactionReference.toLowerCase().includes(query)) &&
          (!this.status() || item.verificationStatus === this.status()),
      );
  });
  money = formatInr;
  date = formatApartmentDate;
  label(value: string): string {
    return value.replaceAll('_', ' ');
  }
  openForm(): void {
    this.operationKey.set(crypto.randomUUID());
    this.showForm.set(true);
  }
  selectFlat(flatId: string): void {
    this.selectedFlatId.set(flatId);
    this.form.controls.maintenanceChargeId.setValue('');
  }
  fileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const error = file ? fileValidationError(file) : null;
    if (error) {
      this.failed.set(true);
      this.message.set(error);
      this.selectedFile.set(null);
      input.value = '';
      return;
    }
    this.message.set('');
    this.selectedFile.set(file);
  }
  removeFile(): void {
    this.selectedFile.set(null);
    this.message.set('');
  }
  async save(): Promise<void> {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.failed.set(true);
      this.message.set('Complete every required field.');
      return;
    }
    const value = this.form.getRawValue();
    const charge = this.data.charges().find((item) => item.id === value.maintenanceChargeId);
    if (!charge || value.amount > charge.balanceAmount) {
      this.failed.set(true);
      this.message.set('Amount cannot exceed the outstanding charge balance.');
      return;
    }
    this.submitting.set(true);
    this.message.set('');
    try {
      await this.data.submitPayment(value, this.selectedFile(), this.operationKey());
      this.failed.set(false);
      this.notice.set(
        this.selectedFile()
          ? 'Payment saved once for verification. The proof is stored privately.'
          : 'Payment saved once for verification.',
      );
      this.close();
    } catch (error) {
      this.failed.set(true);
      this.message.set(error instanceof Error ? error.message : 'Unable to save payment.');
    } finally {
      this.submitting.set(false);
    }
  }
  async review(id: string, approve: boolean): Promise<void> {
    const reason = approve
      ? undefined
      : (window.prompt('Enter the rejection reason:') ?? undefined);
    try {
      await this.data.verifyPayment(id, approve, reason);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Review failed.');
    }
  }
  async receipt(id: string): Promise<void> {
    const payment = this.data.payments().find((item) => item.id === id);
    if (!payment) return;
    const charge = this.data.charges().find((item) => item.id === payment.maintenanceChargeId);
    await this.exports.downloadReceipt(payment, charge);
  }
  async cancel(id: string): Promise<void> {
    const reason = window.prompt('Enter the mandatory cancellation reason:') ?? '';
    try {
      await this.data.cancelPayment(id, reason);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Cancellation failed.');
    }
  }
  close(): void {
    this.showForm.set(false);
    this.message.set('');
    this.selectedFile.set(null);
    this.selectedFlatId.set('');
    this.operationKey.set('');
    this.form.reset({
      paymentDate: new Date().toISOString().slice(0, 10),
      amount: 0,
      paymentMode: 'UPI',
      flatId: '',
      maintenanceChargeId: '',
      transactionReference: '',
      notes: '',
    });
  }
}
