import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../lib/api';
import { formatCents } from '../lib/money';
import { toast } from '../lib/toast';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type SpendResponse = {
  totalCents: number;
  groups: Array<{ key: string; label: string; totalCents: number }>;
};

type Insight = {
  id: string;
  title: string;
  body: string;
  severity: string;
  type: string;
  estimatedSavingsCents: number | null;
};

type Budget = {
  id: string;
  amountCents: number;
  period: string;
  category: { name: string } | null;
};

type Behavior = {
  deltaTotalCents: number;
  deltaPriceCents: number;
  deltaBehaviorCents: number;
  priorSpendCents: number;
  currentSpendCents: number;
};

type Habits = {
  tripCount: number;
  avgBasketCents: number;
  avgLinesPerTrip: number;
  windowDays?: number;
  tripsPerWeek?: number;
  storeMix: Array<{ name: string; count: number }>;
  recurringItems?: Array<{ rawText: string; count: number }>;
};

type SpendGroupBy = 'category' | 'store' | 'month';

type IndexPoint = {
  periodStart: string;
  indexValue: string | number;
  basketCostCents: number;
  storeId: string | null;
};

type ReceiptSummary = { id: string; status: string };

export function DashboardPage() {
  const [monthSpend, setMonthSpend] = useState<SpendResponse | null>(null);
  const [weekSpend, setWeekSpend] = useState<SpendResponse | null>(null);
  const [chartSpend, setChartSpend] = useState<SpendResponse | null>(null);
  const [spendGroupBy, setSpendGroupBy] = useState<SpendGroupBy>('category');
  const [chartLoading, setChartLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [behavior, setBehavior] = useState<Behavior | null>(null);
  const [habits, setHabits] = useState<Habits | null>(null);
  const [indexPoints, setIndexPoints] = useState<IndexPoint[]>([]);
  const [needsReview, setNeedsReview] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const weekFrom = startOfWeekIso();
    const weekTo = endOfPeriodIso(weekFrom, 7);
    const monthFrom = startOfMonthIso();
    const monthTo = endOfMonthIso();
    setLoading(true);
    setLoadError(null);
    void Promise.all([
      api<SpendResponse>(
        `/analytics/spend?groupBy=category&from=${encodeURIComponent(monthFrom)}&to=${encodeURIComponent(monthTo)}`,
      ),
      api<SpendResponse>(
        `/analytics/spend?groupBy=category&from=${encodeURIComponent(weekFrom)}&to=${encodeURIComponent(weekTo)}`,
      ),
      api<Insight[]>('/insights?active=true'),
      api<Budget[]>('/budgets'),
    ])
      .then(([month, week, insightRows, budgetRows]) => {
        setMonthSpend(month);
        setWeekSpend(week);
        setChartSpend(month);
        setInsights(insightRows.slice(0, 3));
        setBudgets(budgetRows);
      })
      .catch((err) => {
        setLoadError(apiErrorMessage(err, 'Could not load dashboard'));
      })
      .finally(() => setLoading(false));

    void api<Behavior>('/insights/behavior').then(setBehavior).catch(() => undefined);
    void api<Habits>('/analytics/habits').then(setHabits).catch(() => undefined);
    void api<IndexPoint[]>('/prices/index?basket=staples-25&region=ketchikan')
      .then(setIndexPoints)
      .catch(() => undefined);
    void api<{ items: ReceiptSummary[] }>('/receipts?status=NEEDS_REVIEW&limit=50')
      .then((r) => setNeedsReview(r.items.length))
      .catch(() => undefined);
    void api<{ items: ReceiptSummary[] }>('/receipts?status=FAILED&limit=50')
      .then((r) => setFailedCount(r.items.length))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (loading) return;
    const monthFrom = startOfMonthIso();
    const monthTo = endOfMonthIso();
    const rangeFrom =
      spendGroupBy === 'month' ? monthsAgoIso(5) : monthFrom;
    const rangeTo = monthTo;
    setChartLoading(true);
    void api<SpendResponse>(
      `/analytics/spend?groupBy=${spendGroupBy}&from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`,
    )
      .then(setChartSpend)
      .catch((err) => {
        toast(apiErrorMessage(err, 'Could not load spend chart'), 'danger');
      })
      .finally(() => setChartLoading(false));
  }, [spendGroupBy, loading]);

  const spend = monthSpend;
  const groceryBudget =
    budgets.find((b) => !b.category && b.period === 'MONTHLY') ??
    budgets.find((b) => b.period === 'MONTHLY') ??
    budgets.find((b) => !b.category && b.period === 'WEEKLY') ??
    budgets.find((b) => b.period === 'WEEKLY') ??
    budgets[0];
  const paceSpend =
    groceryBudget?.period === 'WEEKLY' ? weekSpend : monthSpend;
  const pacePct =
    groceryBudget && paceSpend
      ? Math.min(150, Math.round((paceSpend.totalCents / groceryBudget.amountCents) * 100))
      : null;
  const paceWindow =
    groceryBudget?.period === 'WEEKLY' ? 'this week' : 'this month';

  const regionPoints = indexPoints.filter((p) => !p.storeId);
  const latest = regionPoints[regionPoints.length - 1];
  const prior = regionPoints[regionPoints.length - 2];
  const indexDelta =
    latest && prior
      ? Number(latest.indexValue) - Number(prior.indexValue)
      : null;

  const topStore = habits?.storeMix[0];

  return (
    <div className="space-y-8">
      {loadError && (
        <p className="border-l-4 border-[var(--danger)] bg-[var(--surface)] px-4 py-3 text-sm">
          {loadError}
        </p>
      )}
      <section className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[linear-gradient(135deg,#0c4a3e_0%,#1a6b59_55%,#2d8f6f_100%)] px-5 py-8 text-white shadow-sm">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #e8c547 0%, transparent 35%), radial-gradient(circle at 80% 80%, #9fd4c2 0%, transparent 40%)',
          }}
        />
        <div className="relative">
          <p className="text-sm uppercase tracking-[0.18em] text-white/70">This month</p>
          <p className="brand mt-2 text-5xl font-bold">
            {loading ? '…' : formatCents(spend?.totalCents ?? 0)}
          </p>
          {groceryBudget && pacePct != null && (
            <p className="mt-2 text-white/85">
              {pacePct}% of {formatCents(groceryBudget.amountCents)}{' '}
              {groceryBudget.category?.name ?? 'overall'} {groceryBudget.period.toLowerCase()}{' '}
              budget ({paceWindow}) ·{' '}
              <Link to="/budgets" className="underline decoration-white/40 underline-offset-2">
                Manage budgets
              </Link>
            </p>
          )}
          <p className="mt-2 max-w-md text-white/85">
            Confirmed grocery spend for your household. Tap Capture to add the next receipt.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/capture"
              className="inline-flex rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Capture receipt
            </Link>
            <Link
              to="/budgets"
              className="inline-flex rounded-md border border-white/40 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Budgets
            </Link>
            <Link
              to="/insights"
              className="inline-flex rounded-md border border-white/40 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Weekly digest
            </Link>
          </div>
        </div>
      </section>

      {(needsReview > 0 || failedCount > 0) && (
        <div className="space-y-2">
          {needsReview > 0 && (
            <Link
              to="/receipts?status=NEEDS_REVIEW"
              className="block border-l-4 border-[var(--warn)] bg-[var(--surface)] px-4 py-3"
            >
              <p className="font-semibold">
                {needsReview} receipt{needsReview === 1 ? '' : 's'} need review
              </p>
              <p className="text-sm text-[var(--ink-muted)]">
                Finish confirming so prices and insights stay current.
              </p>
            </Link>
          )}
          {failedCount > 0 && (
            <div className="border-l-4 border-[var(--danger)] bg-[var(--surface)] px-4 py-3">
              <Link to="/receipts?status=FAILED" className="block">
                <p className="font-semibold">
                  {failedCount} failed extraction{failedCount === 1 ? '' : 's'}
                </p>
                <p className="text-sm text-[var(--ink-muted)]">
                  Fix totals on review, or enter the receipt manually.
                </p>
              </Link>
              <p className="mt-2 text-sm">
                <Link
                  to="/capture/manual"
                  className="font-semibold text-[var(--brand-soft)]"
                >
                  Enter manually
                </Link>
              </p>
            </div>
          )}
        </div>
      )}

      {habits && habits.tripCount > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-2xl font-semibold">Shopping habits</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Last {habits.windowDays ?? 90} days · {habits.tripCount} trips ·{' '}
              {habits.tripsPerWeek != null ? `${habits.tripsPerWeek}/week` : '—'} · avg
              basket {formatCents(habits.avgBasketCents)} · avg{' '}
              {habits.avgLinesPerTrip} lines
              {topStore ? ` · most often ${topStore.name}` : ''}
            </p>
          </div>
          {habits.storeMix.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                Store mix
              </p>
              <ul className="mt-1 flex flex-wrap gap-2 text-sm">
                {habits.storeMix.slice(0, 5).map((s) => (
                  <li key={s.name}>
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-[var(--ink-muted)]"> · {s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {habits.recurringItems && habits.recurringItems.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                Recurring items
              </p>
              <ul className="mt-1 space-y-1 text-sm">
                {habits.recurringItems.slice(0, 5).map((item) => (
                  <li key={item.rawText} className="flex justify-between gap-3">
                    <span className="truncate">{item.rawText}</span>
                    <span className="shrink-0 tabular-nums text-[var(--ink-muted)]">
                      ×{item.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {behavior && (behavior.priorSpendCents > 0 || behavior.currentSpendCents > 0) && (
        <section>
          <h2 className="text-2xl font-semibold">Prices vs behavior</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Month-over-month split: inflation held at prior basket vs what you actually bought.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs uppercase text-[var(--ink-muted)]">Δ total</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatCents(behavior.deltaTotalCents, { signed: true })}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-[var(--ink-muted)]">Δ prices</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatCents(behavior.deltaPriceCents, { signed: true })}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-[var(--ink-muted)]">Δ behavior</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatCents(behavior.deltaBehaviorCents, { signed: true })}
              </p>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-2xl font-semibold">
            Spend by {spendGroupBy === 'category' ? 'category' : spendGroupBy === 'store' ? 'store' : 'month'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex rounded-md border border-[var(--line)] text-sm"
              role="group"
              aria-label="Spend grouping"
            >
              {(
                [
                  ['category', 'Category'],
                  ['store', 'Store'],
                  ['month', 'Month'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={spendGroupBy === value}
                  onClick={() => setSpendGroupBy(value)}
                  className={[
                    'px-3 py-1.5 font-semibold',
                    spendGroupBy === value
                      ? 'bg-[var(--brand)] text-white'
                      : 'text-[var(--ink-muted)]',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <Link to="/receipts" className="text-sm font-semibold text-[var(--brand-soft)]">
              All receipts
            </Link>
          </div>
        </div>
        {loading || chartLoading ? (
          <p className="text-[var(--ink-muted)]">Loading spend…</p>
        ) : chartSpend && chartSpend.groups.length > 0 ? (
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <BarChart data={chartSpend.groups.slice(0, 6)}>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `$${v / 100}`} width={48} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatCents(v)} />
                <Bar dataKey="totalCents" fill="#0c4a3e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-[var(--ink-muted)]">
            No confirmed receipts yet. Scan one to start the ledger.
          </p>
        )}
        {spendGroupBy === 'month' && (
          <p className="mt-2 text-xs text-[var(--ink-muted)]">Showing the last 6 months.</p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-2xl font-semibold">Insights</h2>
          <Link to="/insights" className="text-sm font-semibold text-[var(--brand-soft)]">
            Full feed
          </Link>
        </div>
        {insights.length === 0 ? (
          <p className="text-[var(--ink-muted)]">
            No active tips yet.{' '}
            <Link to="/insights" className="font-semibold text-[var(--brand-soft)]">
              Generate insights
            </Link>{' '}
            after confirming receipts.
          </p>
        ) : (
          <ul className="space-y-3">
            {insights.map((i) => (
              <li
                key={i.id}
                className="border-l-4 border-[var(--accent)] bg-[var(--surface)] px-4 py-3 backdrop-blur"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link to={insightHref(i)} className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                      {i.type.replace(/_/g, ' ')}
                    </p>
                    <p className="font-semibold">{i.title}</p>
                    <p className="mt-1 text-sm text-[var(--ink-muted)]">{i.body}</p>
                  </Link>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-semibold text-[var(--ink-muted)]"
                    onClick={() =>
                      void api(`/insights/${i.id}/dismiss`, { method: 'POST' })
                        .then(() => {
                          setInsights((prev) => prev.filter((x) => x.id !== i.id));
                          toast('Insight dismissed', 'ok');
                        })
                        .catch((err) =>
                          toast(apiErrorMessage(err, 'Dismiss failed'), 'danger'),
                        )
                    }
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2 sm:grid-cols-2">
        <Link
          to="/prices/index"
          className="block border-l-4 border-[var(--brand)] bg-[var(--surface)] px-4 py-3"
        >
          <p className="font-semibold">Island cost-of-goods index</p>
          {latest ? (
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Latest {Number(latest.indexValue).toFixed(2)}
              {indexDelta != null
                ? ` · ${indexDelta >= 0 ? '+' : ''}${indexDelta.toFixed(2)} vs prior period`
                : ''}{' '}
              · basket {formatCents(latest.basketCostCents)}
            </p>
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">
              No rollup yet — confirm matched receipts, then check again after seed/cron.
            </p>
          )}
        </Link>
        <Link
          to="/delivered"
          className="block border-l-4 border-[var(--accent)] bg-[var(--surface)] px-4 py-3"
        >
          <p className="font-semibold">Mainland delivered cost</p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Compare island shelf price to barge/air freight for bulk orders.
          </p>
        </Link>
      </section>
    </div>
  );
}

function insightHref(i: Insight): string {
  switch (i.type) {
    case 'budget_pace':
      return '/budgets';
    case 'island_premium':
      return '/delivered';
    case 'store_switch':
    case 'price_spike':
    case 'stock_up':
      return '/prices';
    default:
      return '/insights';
  }
}

function monthsAgoIso(monthsBack: number) {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsBack, 1, 0, 0, 0, 0),
  ).toISOString();
}

function startOfWeekIso() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthIso() {
  return new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();
}

function endOfMonthIso() {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  ).toISOString();
}

function endOfPeriodIso(startIso: string, days: number) {
  const d = new Date(startIso);
  d.setUTCDate(d.getUTCDate() + days - 1);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}
