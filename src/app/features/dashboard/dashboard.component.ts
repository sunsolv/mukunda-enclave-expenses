import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DataService } from '../../core/data.service';
import { formatApartmentDate, formatInr } from '../../core/financial.utils';
import {
  buildCashFlow,
  buildFinancialPosition,
  buildMaintenanceSummary,
  ReportingPeriod,
} from '../../core/workflow.utils';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">FINANCIAL OVERVIEW</p>
        <h1>Good {{ greeting() }}, {{ firstName() }}</h1>
        <p class="muted">Here is the verified position for {{ periodLabel() }}.</p>
      </div>
      <div class="header-actions">
        <label class="select-label"
          >Reporting period
          <select
            aria-label="Reporting period"
            [value]="reportingPeriod()"
            (change)="reportingPeriod.set($any($event.target).value)"
          >
            <option value="current_month">This month</option>
            <option value="previous_month">Previous month</option>
            <option value="financial_year">Current financial year</option>
          </select>
        </label>
        <a class="primary" routerLink="/reports">Generate report</a>
      </div>
    </header>

    @if (data.loading()) {
      <div class="alert">Loading verified financial records…</div>
    }
    @if (data.loadError()) {
      <div class="alert error">{{ data.loadError() }}</div>
    }

    <section class="summary-grid" aria-label="Financial summary">
      @for (card of cards(); track card.label) {
        <article class="metric-card" [class.featured]="card.featured">
          <div class="metric-icon">{{ card.icon }}</div>
          <span>{{ card.label }}</span>
          <strong>{{ money(card.value) }}</strong>
          <small>{{ card.note }}</small>
        </article>
      }
    </section>

    <section class="dashboard-grid">
      <article class="panel chart-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">CASH FLOW</p>
            <h2>Collections vs expenses</h2>
          </div>
          <span class="legend"
            ><i class="income"></i> Collections <i class="expense"></i> Expenses</span
          >
        </div>
        <div class="bar-chart" [attr.aria-label]="'Verified cash-flow chart for ' + periodLabel()">
          @for (value of cashFlow().buckets; track value.label) {
            <div class="bar-group">
              <span
                class="bar income"
                [style.height.%]="value.collectionHeight"
                [attr.title]="'Collections: ' + money(value.collections)"
              ></span>
              <span
                class="bar expense"
                [style.height.%]="value.expenseHeight"
                [attr.title]="'Expenses: ' + money(value.expenses)"
              ></span>
              <small>{{ value.label }}</small>
            </div>
          }
        </div>
        @if (cashFlow().collectionTotal === 0 && cashFlow().expenseTotal === 0) {
          <p class="muted">No verified collections or approved expenses in this period.</p>
        } @else {
          <p class="muted">
            {{ money(cashFlow().collectionTotal) }} collected ·
            {{ money(cashFlow().expenseTotal) }} spent
          </p>
        }
      </article>

      <article class="panel status-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">{{ periodLabel() }}</p>
            <h2>Payment status</h2>
          </div>
        </div>
        <div class="donut-wrap">
          <div class="donut" [style.--paid]="paidPercent() + '%'">
            <span
              ><strong>{{ maintenanceSummary().paidFlats }}</strong
              ><small>paid</small></span
            >
          </div>
          <ul class="status-list">
            <li>
              <i class="success"></i><span>Paid</span
              ><strong>{{ maintenanceSummary().paidFlats }}</strong>
            </li>
            <li>
              <i class="warning"></i><span>Partial</span
              ><strong>{{ maintenanceSummary().partialFlats }}</strong>
            </li>
            <li>
              <i class="muted-dot"></i><span>Pending</span
              ><strong>{{ maintenanceSummary().pendingFlats }}</strong>
            </li>
            <li>
              <i class="danger"></i><span>Overdue</span
              ><strong>{{ maintenanceSummary().overdueFlats }}</strong>
            </li>
          </ul>
        </div>
      </article>
    </section>

    <section class="dashboard-grid lower">
      <article class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">RECENT ACTIVITY</p>
            <h2>Latest transactions</h2>
          </div>
          <a routerLink="/payments">View all</a>
        </div>
        <div class="activity-list">
          @for (payment of data.payments().slice(0, 3); track payment.id) {
            <div class="activity-row">
              <span class="avatar">₹</span>
              <div>
                <strong>Flat {{ payment.flatNumber }} maintenance</strong
                ><small>{{ date(payment.paymentDate) }} · {{ payment.paymentMode }}</small>
              </div>
              <div class="amount">
                <strong>{{ money(payment.amount) }}</strong
                ><span class="badge" [class]="payment.verificationStatus">{{
                  payment.verificationStatus
                }}</span>
              </div>
            </div>
          }
          @for (expense of data.expenses().slice(0, 2); track expense.id) {
            <div class="activity-row">
              <span class="avatar expense">↗</span>
              <div>
                <strong>{{ expense.vendorName }}</strong
                ><small>{{ date(expense.expenseDate) }} · {{ expense.category }}</small>
              </div>
              <div class="amount">
                <strong>−{{ money(expense.amount) }}</strong
                ><span class="badge" [class]="expense.status">{{ expense.status }}</span>
              </div>
            </div>
          }
        </div>
      </article>

      <aside class="stack">
        <article class="panel administrator-card">
          <p class="eyebrow">CURRENT ADMINISTRATOR</p>
          <div class="admin-person">
            <span>{{ administratorInitials() }}</span>
            <div>
              <h3>{{ administrator()?.ownerName ?? 'Not assigned' }}</h3>
              <p>
                Flat {{ administrator()?.flatNumber ?? '—' }} ·
                {{ administrator()?.responsibilityYear ?? currentYear }}
              </p>
            </div>
          </div>
          <div class="progress-line"><span></span></div>
          <div class="date-range">
            <small>{{ administrator() ? date(administrator()!.startDate) : '—' }}</small
            ><small>{{ administrator() ? date(administrator()!.endDate) : '—' }}</small>
          </div>
          <a routerLink="/responsibility">View responsibility details →</a>
        </article>
        <article class="panel quick-actions">
          <p class="eyebrow">QUICK ACTIONS</p>
          <div>
            <a routerLink="/maintenance"><span>＋</span>Generate charges</a>
            <a routerLink="/payments"><span>₹</span>Record payment</a>
            <a routerLink="/expenses"><span>↗</span>Add expense</a>
            <a routerLink="/reports"><span>⇩</span>Download report</a>
          </div>
        </article>
      </aside>
    </section>

    @if (maintenanceSummary().overdueFlats > 0) {
      <div class="alert warning">
        <strong>Action needed:</strong> {{ maintenanceSummary().overdueFlats }} flat has overdue
        maintenance. <a routerLink="/maintenance">Review now</a>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  readonly currentYear = new Date().getFullYear();
  readonly reportingPeriod = signal<ReportingPeriod>('current_month');
  readonly cashFlow = computed(() =>
    buildCashFlow(this.data.payments(), this.data.expenses(), this.reportingPeriod()),
  );
  readonly financialPosition = computed(() => {
    const range = this.cashFlow().range;
    return buildFinancialPosition(
      this.data.payments(),
      this.data.expenses(),
      this.data.responsibilities(),
      range.from,
      range.to,
    );
  });
  readonly maintenanceSummary = computed(() => {
    const range = this.cashFlow().range;
    return buildMaintenanceSummary(this.data.charges(), range.from, range.to);
  });
  readonly administrator = computed(
    () => this.data.responsibilities().find((item) => item.status === 'current') ?? null,
  );
  readonly firstName = computed(() => this.auth.profile()?.ownerName.split(' ')[0] ?? 'Owner');
  readonly cards = computed(() => {
    const position = this.financialPosition();
    const maintenance = this.maintenanceSummary();
    return [
      {
        label: 'Opening balance',
        value: position.openingBalance,
        note: 'Balance at period start',
        icon: '↳',
      },
      {
        label: 'Maintenance billed',
        value: maintenance.billed,
        note: 'New charges in this period',
        icon: '▦',
      },
      {
        label: 'Verified collections',
        value: position.collections,
        note: `${maintenance.paidFlats} flats fully paid`,
        icon: '↓',
      },
      {
        label: 'Approved expenses',
        value: position.expenses,
        note: 'Approved in this period',
        icon: '↗',
      },
      {
        label: 'Closing balance',
        value: position.closingBalance,
        note: 'Balance at period end',
        icon: '₹',
        featured: true,
      },
    ];
  });
  readonly paidPercent = computed(() =>
    Math.round((this.maintenanceSummary().paidFlats / Math.max(1, this.data.flats().length)) * 100),
  );

  greeting(): string {
    const hour = new Date().getHours();
    return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  }
  periodLabel(): string {
    return this.cashFlow().range.label;
  }
  administratorInitials(): string {
    return (this.administrator()?.ownerName ?? 'NA')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
  money = formatInr;
  date = formatApartmentDate;
}
