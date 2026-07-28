import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DataService } from '../../core/data.service';
import { formatApartmentDate, formatInr } from '../../core/financial.utils';

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
          <select aria-label="Reporting period">
            <option>This month</option>
            <option>Previous month</option>
            <option>Current financial year</option>
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
        <div class="bar-chart" aria-label="Twelve month illustrative cash-flow chart">
          @for (value of trend; track $index) {
            <div class="bar-group">
              <span class="bar income" [style.height.%]="value.income"></span>
              <span class="bar expense" [style.height.%]="value.expense"></span>
              <small>{{ value.month }}</small>
            </div>
          }
        </div>
      </article>

      <article class="panel status-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">THIS MONTH</p>
            <h2>Payment status</h2>
          </div>
        </div>
        <div class="donut-wrap">
          <div class="donut" [style.--paid]="paidPercent() + '%'">
            <span
              ><strong>{{ data.summary().paidFlats }}</strong
              ><small>paid</small></span
            >
          </div>
          <ul class="status-list">
            <li>
              <i class="success"></i><span>Paid</span
              ><strong>{{ data.summary().paidFlats }}</strong>
            </li>
            <li>
              <i class="warning"></i><span>Partial</span
              ><strong>{{ data.summary().partialFlats }}</strong>
            </li>
            <li>
              <i class="muted-dot"></i><span>Pending</span
              ><strong>{{ data.summary().pendingFlats }}</strong>
            </li>
            <li>
              <i class="danger"></i><span>Overdue</span
              ><strong>{{ data.summary().overdueFlats }}</strong>
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
            <span>AR</span>
            <div>
              <h3>Arjun Rao</h3>
              <p>Flat 101 · {{ currentYear }}</p>
            </div>
          </div>
          <div class="progress-line"><span></span></div>
          <div class="date-range">
            <small>01-01-{{ currentYear }}</small
            ><small>31-12-{{ currentYear }}</small>
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

    @if (data.summary().overdueFlats > 0) {
      <div class="alert warning">
        <strong>Action needed:</strong> {{ data.summary().overdueFlats }} flat has overdue
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
  readonly trend = [
    { month: 'Aug', income: 62, expense: 42 },
    { month: 'Sep', income: 70, expense: 55 },
    { month: 'Oct', income: 55, expense: 37 },
    { month: 'Nov', income: 82, expense: 46 },
    { month: 'Dec', income: 74, expense: 68 },
    { month: 'Jan', income: 91, expense: 52 },
    { month: 'Feb', income: 78, expense: 38 },
    { month: 'Mar', income: 68, expense: 44 },
    { month: 'Apr', income: 88, expense: 62 },
    { month: 'May', income: 73, expense: 45 },
    { month: 'Jun', income: 84, expense: 57 },
    { month: 'Jul', income: 64, expense: 48 },
  ];
  readonly firstName = computed(() => this.auth.profile()?.ownerName.split(' ')[0] ?? 'Owner');
  readonly cards = computed(() => {
    const s = this.data.summary();
    return [
      {
        label: 'Opening balance',
        value: s.openingBalance,
        note: 'Carried into this period',
        icon: '↳',
      },
      { label: 'Maintenance billed', value: s.billed, note: 'Across all active flats', icon: '▦' },
      {
        label: 'Verified collections',
        value: s.collected,
        note: `${s.paidFlats} flats fully paid`,
        icon: '↓',
      },
      { label: 'Approved expenses', value: s.expenses, note: 'Approved only', icon: '↗' },
      {
        label: 'Closing balance',
        value: s.closingBalance,
        note: 'Verified live position',
        icon: '₹',
        featured: true,
      },
    ];
  });
  readonly paidPercent = computed(() =>
    Math.round((this.data.summary().paidFlats / Math.max(1, this.data.flats().length)) * 100),
  );

  greeting(): string {
    const hour = new Date().getHours();
    return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  }
  periodLabel(): string {
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date());
  }
  money = formatInr;
  date = formatApartmentDate;
}
