import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../core/data.service';
import { ExportService } from '../../core/export.service';
import { formatApartmentDate, formatInr } from '../../core/financial.utils';

type ReportType = 'payments' | 'expenses' | 'pending' | 'income-expense';

@Component({
  selector: 'app-reports',
  imports: [FormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">DOWNLOADS & INSIGHTS</p>
        <h1>Reports</h1>
        <p class="muted">One verified definition across every period and export.</p>
      </div>
      <button class="secondary" onclick="window.print()">Print view</button>
    </header>
    <section class="report-builder panel">
      <div class="builder-step">
        <span>1</span>
        <div>
          <label for="report-type">Report type</label
          ><select id="report-type" [(ngModel)]="reportType" (ngModelChange)="reportChanged()">
            <option value="payments">Payment register</option>
            <option value="expenses">Expense register</option>
            <option value="pending">Pending maintenance</option>
            <option value="income-expense">Income versus expense</option>
          </select>
        </div>
      </div>
      <div class="builder-step">
        <span>2</span>
        <div>
          <label for="period">Reporting period</label
          ><select id="period" [(ngModel)]="period" (ngModelChange)="applyPeriod()">
            <option>Current month</option>
            <option>Previous month</option>
            <option>Current quarter</option>
            <option>Previous quarter</option>
            <option>Current half-year</option>
            <option>Current calendar year</option>
            <option>Current financial year</option>
            <option>Custom period</option>
          </select>
        </div>
      </div>
      <div class="builder-step dates">
        <span>3</span>
        <div>
          <span class="field-label">Date range</span>
          <div>
            <input type="date" [(ngModel)]="fromDate" /><span>to</span
            ><input type="date" [(ngModel)]="toDate" />
          </div>
        </div>
      </div>
      <button class="primary" (click)="preview()">Preview report</button>
    </section>
    <section class="report-catalog">
      @for (item of catalog; track item.title) {
        <button class="report-card" (click)="select(item.type)">
          <span class="report-icon">{{ item.icon }}</span
          ><span
            ><strong>{{ item.title }}</strong
            ><small>{{ item.description }}</small></span
          ><b>→</b>
        </button>
      }
    </section>
    <section class="panel report-preview">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">PREVIEW</p>
          <h2>{{ title() }}</h2>
          <p class="muted">{{ fromDate }} to {{ toDate }} · verified definitions</p>
        </div>
        <div class="header-actions">
          <button class="small-button" (click)="download('csv')">CSV</button
          ><button class="small-button" (click)="download('xlsx')">Excel</button
          ><button class="primary small-button" (click)="download('pdf')">PDF</button>
        </div>
      </div>
      <div class="report-total">
        <span>Overall total</span><strong>{{ money(total()) }}</strong
        ><small>{{ rows().length }} matching records</small>
      </div>
      <details class="column-picker">
        <summary>Choose and reorder columns</summary>
        <div>
          @for (header of availableHeaders(); track header) {
            <label>
              <input
                type="checkbox"
                [checked]="isSelected(header)"
                (change)="toggleColumn(header)"
              />
              {{ header }}
            </label>
            <button
              class="small-button"
              type="button"
              [disabled]="columnIndex(header) <= 0"
              (click)="moveColumn(header, -1)"
            >
              ↑
            </button>
            <button
              class="small-button"
              type="button"
              [disabled]="columnIndex(header) < 0 || columnIndex(header) === headers().length - 1"
              (click)="moveColumn(header, 1)"
            >
              ↓
            </button>
          }
        </div>
      </details>
      <div class="responsive-table">
        <table>
          <thead>
            <tr>
              @for (header of headers(); track header) {
                <th>{{ header }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track $index) {
              <tr>
                @for (header of headers(); track header) {
                  <td [class.number]="header === 'Amount'">{{ row[header] }}</td>
                }
              </tr>
            } @empty {
              <tr>
                <td [attr.colspan]="headers().length" class="empty">
                  No verified records in this period.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent {
  private readonly data = inject(DataService);
  private readonly exports = inject(ExportService);
  reportType: ReportType = 'payments';
  period = 'Current month';
  fromDate = '';
  toDate = '';
  readonly refresh = signal(0);
  readonly selectedColumns = signal<string[]>([]);
  readonly catalog: Array<{ type: ReportType; icon: string; title: string; description: string }> =
    [
      {
        type: 'payments',
        icon: '₹',
        title: 'Maintenance collections',
        description: 'Verified payments by flat and month',
      },
      {
        type: 'pending',
        icon: '◷',
        title: 'Pending maintenance',
        description: 'Partial, unpaid, and overdue balances',
      },
      {
        type: 'expenses',
        icon: '↗',
        title: 'Expense register',
        description: 'Approved spending and categories',
      },
      {
        type: 'income-expense',
        icon: '▥',
        title: 'Income vs expense',
        description: 'Opening, collections, spending, closing',
      },
    ];
  readonly title = computed(() => {
    this.refresh();
    return this.catalog.find((x) => x.type === this.reportType)?.title ?? 'Report';
  });
  readonly rows = computed<Array<Record<string, string | number>>>(() => {
    this.refresh();
    if (this.reportType === 'payments')
      return this.data
        .payments()
        .filter(
          (x) => x.verificationStatus === 'verified' && !x.cancelled && this.inRange(x.paymentDate),
        )
        .map((x) => ({
          Date: formatApartmentDate(x.paymentDate),
          Flat: x.flatNumber,
          Receipt: x.receiptNumber ?? '',
          Mode: x.paymentMode.replaceAll('_', ' '),
          Amount: x.amount,
        }));
    if (this.reportType === 'expenses')
      return this.data
        .expenses()
        .filter((x) => x.status === 'approved' && this.inRange(x.expenseDate))
        .map((x) => ({
          Date: formatApartmentDate(x.expenseDate),
          Category: x.category,
          Vendor: x.vendorName,
          Description: x.description,
          Amount: x.amount,
        }));
    if (this.reportType === 'pending')
      return this.data
        .charges()
        .filter((x) => x.balanceAmount > 0)
        .map((x) => ({
          Month: x.billingMonth,
          Flat: x.flatNumber,
          Status: x.status.replaceAll('_', ' '),
          'Due date': formatApartmentDate(x.dueDate),
          Amount: x.balanceAmount,
        }));
    const s = this.data.summary();
    return [
      { Metric: 'Opening balance', Amount: s.openingBalance },
      { Metric: 'Verified collections', Amount: s.collected },
      { Metric: 'Approved expenses', Amount: -s.expenses },
      { Metric: 'Closing balance', Amount: s.closingBalance },
    ];
  });
  readonly availableHeaders = computed(() => Object.keys(this.rows()[0] ?? { Result: '' }));
  readonly headers = computed(() => {
    const available = this.availableHeaders();
    const selected = this.selectedColumns().filter((header) => available.includes(header));
    return selected.length ? selected : available;
  });
  readonly exportRows = computed(() =>
    this.rows().map((row) =>
      Object.fromEntries(this.headers().map((header) => [header, row[header]])),
    ),
  );
  readonly total = computed(() =>
    this.reportType === 'income-expense'
      ? this.data.summary().closingBalance
      : this.rows().reduce((sum, row) => sum + Number(row['Amount'] ?? 0), 0),
  );
  constructor() {
    this.applyPeriod();
  }
  money = formatInr;
  select(type: ReportType): void {
    this.reportType = type;
    this.selectedColumns.set([]);
    this.refresh.update((x) => x + 1);
    document.querySelector('.report-preview')?.scrollIntoView({ behavior: 'smooth' });
  }
  preview(): void {
    this.refresh.update((x) => x + 1);
  }
  reportChanged(): void {
    this.selectedColumns.set([]);
    this.refresh.update((x) => x + 1);
  }
  isSelected(header: string): boolean {
    return this.selectedColumns().length === 0 || this.selectedColumns().includes(header);
  }
  columnIndex(header: string): number {
    return this.headers().indexOf(header);
  }
  toggleColumn(header: string): void {
    const current = this.selectedColumns().length
      ? [...this.selectedColumns()]
      : [...this.availableHeaders()];
    const next = current.includes(header)
      ? current.filter((item) => item !== header)
      : [...current, header];
    if (next.length) this.selectedColumns.set(next);
  }
  moveColumn(header: string, direction: -1 | 1): void {
    const current = this.selectedColumns().length
      ? [...this.selectedColumns()]
      : [...this.availableHeaders()];
    const index = current.indexOf(header);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    this.selectedColumns.set(current);
  }
  applyPeriod(): void {
    const now = new Date();
    let start = new Date(now.getFullYear(), now.getMonth(), 1);
    let end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    if (this.period === 'Previous month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    }
    if (this.period.includes('quarter')) {
      const q = Math.floor(now.getMonth() / 3) + (this.period.startsWith('Previous') ? -1 : 0);
      start = new Date(now.getFullYear(), q * 3, 1);
      end = new Date(now.getFullYear(), q * 3 + 3, 0);
    }
    if (this.period === 'Current half-year') {
      const half = now.getMonth() < 6 ? 0 : 6;
      start = new Date(now.getFullYear(), half, 1);
      end = new Date(now.getFullYear(), half + 6, 0);
    }
    if (this.period === 'Current calendar year') {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
    }
    if (this.period === 'Current financial year') {
      const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
      start = new Date(year, 3, 1);
      end = new Date(year + 1, 2, 31);
    }
    if (this.period !== 'Custom period') {
      this.fromDate = this.iso(start);
      this.toDate = this.iso(end);
    }
    this.refresh.update((x) => x + 1);
  }
  async download(format: 'csv' | 'xlsx' | 'pdf'): Promise<void> {
    const name = `mukunda-enclave-${this.reportType}-${this.fromDate}-${this.toDate}`;
    if (format === 'csv') await this.exports.downloadCsv(name, this.exportRows());
    if (format === 'xlsx') await this.exports.downloadXlsx(name, this.title(), this.exportRows());
    if (format === 'pdf')
      await this.exports.downloadReportPdf(
        this.title(),
        `${this.fromDate} to ${this.toDate}`,
        this.exportRows(),
        this.total(),
      );
  }
  private inRange(value: string): boolean {
    return (!this.fromDate || value >= this.fromDate) && (!this.toDate || value <= this.toDate);
  }
  private iso(value: Date): string {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
