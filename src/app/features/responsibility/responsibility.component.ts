import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { DataService } from '../../core/data.service';
import { formatApartmentDate, formatInr, validateHandover } from '../../core/financial.utils';

@Component({
  selector: 'app-responsibility',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">ANNUAL ROTATION</p>
        <h1>Maintenance responsibility</h1>
        <p class="muted">A permanent, reconciled record of who managed each year.</p>
      </div>
      @if (auth.canManage()) {
        <button class="primary" (click)="showHandover.set(true)">Begin annual handover</button>
      }
    </header>
    <section class="responsibility-hero panel">
      <div>
        <p class="eyebrow">CURRENT RESPONSIBILITY</p>
        <h2>{{ current()?.ownerName }}</h2>
        <p>Flat {{ current()?.flatNumber }} · {{ current()?.responsibilityYear }}</p>
      </div>
      <div class="balance-callout">
        <span>Opening balance</span><strong>{{ money(current()?.openingBalance ?? 0) }}</strong
        ><small>Current closing position {{ money(data.summary().closingBalance) }}</small>
      </div>
    </section>
    <section class="timeline panel">
      @for (item of data.responsibilities(); track item.id) {
        <article [class.current]="item.status === 'current'">
          <span class="timeline-dot"></span>
          <div class="timeline-year">{{ item.responsibilityYear }}</div>
          <div>
            <strong>{{ item.ownerName }}</strong
            ><small
              >Flat {{ item.flatNumber }} · {{ date(item.startDate) }} to
              {{ date(item.endDate) }}</small
            >
          </div>
          <div>
            <span class="badge" [class]="item.status">{{ item.status }}</span
            ><small>Opening {{ money(item.openingBalance) }}</small>
            @if (item.closingBalance !== null) {
              <small>Closing {{ money(item.closingBalance) }}</small>
            }
          </div>
        </article>
      }
    </section>
    <div class="alert">
      <strong>Financial write access follows the current responsibility.</strong> Completed and
      future administrators remain read-only. Reopening requires an Emergency Administrator, a
      reason, and an audit entry.
    </div>
    @if (showHandover()) {
      <div class="dialog-backdrop">
        <section class="dialog wide" role="dialog" aria-modal="true">
          <p class="eyebrow">RECONCILIATION</p>
          <h2>Annual handover preview</h2>
          <div class="handover-math">
            <span
              ><small>Opening</small
              ><strong>{{ money(data.summary().openingBalance) }}</strong></span
            ><b>+</b
            ><span
              ><small>Collections</small
              ><strong>{{ money(data.summary().collected) }}</strong></span
            ><b>−</b
            ><span
              ><small>Expenses</small><strong>{{ money(data.summary().expenses) }}</strong></span
            ><b>=</b
            ><span class="final"
              ><small>Closing</small
              ><strong>{{ money(data.summary().closingBalance) }}</strong></span
            >
          </div>
          <form [formGroup]="form" (ngSubmit)="complete()">
            <label
              >Next responsible flat<select formControlName="nextFlatId">
                <option value="">Select flat</option>
                @for (flat of data.flats(); track flat.id) {
                  <option [value]="flat.id">{{ flat.flatNumber }} · {{ flat.ownerName }}</option>
                }
              </select></label
            ><label
              >Confirmed closing balance<input
                type="number"
                step="0.01"
                formControlName="confirmedBalance" /></label
            ><label>Handover notes<textarea rows="4" formControlName="notes"></textarea></label>
            @if (error()) {
              <div class="alert error">{{ error() }}</div>
            }
            <div class="dialog-actions">
              <button type="button" class="secondary" (click)="showHandover.set(false)">
                Cancel</button
              ><button class="primary" type="submit">Complete handover</button>
            </div>
          </form>
        </section>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponsibilityComponent {
  readonly data = inject(DataService);
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  readonly showHandover = signal(false);
  readonly error = signal('');
  readonly current = () => this.data.responsibilities().find((item) => item.status === 'current');
  readonly form = this.fb.nonNullable.group({
    nextFlatId: ['', Validators.required],
    confirmedBalance: [this.data.summary().closingBalance, Validators.required],
    notes: ['', [Validators.required, Validators.minLength(10)]],
  });
  money = formatInr;
  date = formatApartmentDate;
  async complete(): Promise<void> {
    const value = this.form.getRawValue();
    const errors = validateHandover(
      value.notes,
      value.nextFlatId,
      value.confirmedBalance,
      this.data.summary().closingBalance,
    );
    if (errors.length) {
      this.error.set(errors.join(' '));
      return;
    }
    try {
      await this.data.completeHandover(value.nextFlatId, value.notes, value.confirmedBalance);
      this.showHandover.set(false);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Handover failed.');
    }
  }
}
