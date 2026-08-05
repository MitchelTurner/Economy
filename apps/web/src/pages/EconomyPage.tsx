import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, apiErrorMessage } from '../lib/api';
import { formatCents } from '../lib/money';
import { toast } from '../lib/toast';

type TaxSummary = {
  taxPaidCents: number;
  pretaxSpendCents: number;
  receiptCount: number;
  lineCount: number;
  taxableLineCount: number;
  taxableLineSharePct: number | null;
  effectiveTaxRatePct: number | null;
};

type EconomyResponse = {
  region: string;
  inflation: {
    momPct: number | null;
    yoyPct: number | null;
    latestIndex: number | null;
    latestBasketCostCents: number | null;
    latestCoverage: number | null;
    series: Array<{
      periodStart: string;
      indexValue: number;
      basketCostCents: number;
      coverage: number;
      changePct: number | null;
    }>;
  };
  tax: {
    current: TaxSummary;
    prior: TaxSummary;
    deltaTaxCents: number;
  };
  categories: Array<{
    categoryId: string;
    categoryName: string;
    priorSpendCents: number;
    currentSpendCents: number;
    deltaTotalCents: number;
    deltaPriceCents: number;
    deltaBehaviorCents: number;
    priceChangePct: number | null;
  }>;
  products: Array<{
    productId: string;
    productName: string;
    categoryName: string | null;
    priorCents: number;
    currentCents: number;
    changePct: number;
  }>;
};

function signedPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

export function EconomyPage() {
  const [region, setRegion] = useState('ketchikan');
  const [data, setData] = useState<EconomyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    void api<EconomyResponse>(
      `/analytics/economy?region=${encodeURIComponent(region)}`,
    )
      .then(setData)
      .catch((err) => {
        setData(null);
        const msg = apiErrorMessage(err, 'Could not load island economy');
        setLoadError(msg);
        toast(msg, 'danger');
      })
      .finally(() => setLoading(false));
  }, [region]);

  const chartData =
    data?.inflation.series.map((p) => ({
      date: new Date(p.periodStart).toLocaleDateString(),
      index: p.indexValue,
      change: p.changePct,
    })) ?? [];

  return (
    <div className="space-y-8">
      <div className="page-header-desk flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Island economy</h1>
          <p className="mt-1 max-w-2xl text-[var(--ink-muted)]">
            Staples inflation, sales tax paid, and price moves by AI category — butter in
            dairy, firearms in sporting goods. Dollar figures come from confirmed receipts
            and price observations.
          </p>
        </div>
        <label className="block text-sm">
          Region
          <select
            className="mt-1 w-full min-w-[12rem] rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            <option value="ketchikan">Ketchikan</option>
            <option value="anchorage">Anchorage</option>
            <option value="seattle">Seattle</option>
          </select>
        </label>
      </div>

      {loading && <p className="text-[var(--ink-muted)]">Loading economy…</p>}
      {loadError && (
        <p className="border-l-4 border-[var(--danger)] bg-[var(--surface)] px-4 py-3 text-sm" role="alert">
          {loadError}
        </p>
      )}

      {!loading && data && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 min-[900px]:grid-cols-4">
            <Stat
              label="Staples MoM"
              value={signedPct(data.inflation.momPct)}
              hint="Cost-of-goods index vs prior period"
            />
            <Stat
              label="Staples YoY"
              value={signedPct(data.inflation.yoyPct)}
              hint="Needs ~13 monthly rollups"
            />
            <Stat
              label="Tax this month"
              value={formatCents(data.tax.current.taxPaidCents)}
              hint={
                data.tax.current.effectiveTaxRatePct != null
                  ? `~${data.tax.current.effectiveTaxRatePct}% of pretax spend`
                  : 'From receipt tax totals'
              }
            />
            <Stat
              label="Tax vs last month"
              value={formatCents(data.tax.deltaTaxCents, { signed: true })}
              hint={
                data.tax.current.taxableLineSharePct != null
                  ? `${data.tax.current.taxableLineSharePct}% of lines marked taxable`
                  : 'Receipt-level tax only'
              }
            />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-2xl font-semibold">Inflation pulse</h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Fixed staples-25 basket for {region}
                  {data.inflation.latestBasketCostCents != null
                    ? ` · latest basket ${formatCents(data.inflation.latestBasketCostCents)}`
                    : ''}
                  {data.inflation.latestCoverage != null
                    ? ` · ${Math.round(data.inflation.latestCoverage * 100)}% coverage`
                    : ''}
                </p>
              </div>
              <Link
                to="/prices/index"
                className="text-sm font-semibold text-[var(--brand-soft)]"
              >
                Full index
              </Link>
            </div>
            {chartData.length < 2 ? (
              <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-sm text-[var(--ink-muted)]">
                Not enough index points yet. Confirm matched receipts so nightly rollups can
                fill the staples basket — or open the{' '}
                <Link to="/island" className="font-semibold text-[var(--brand-soft)]">
                  public island index
                </Link>
                .
              </p>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip
                      formatter={(v: number, name: string) =>
                        name === 'change' && v != null
                          ? signedPct(v)
                          : Number(v).toFixed(3)
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="index"
                      stroke="#0c4a3e"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div className="dashboard-desk">
            <section className="space-y-3">
              <div>
                <h2 className="text-2xl font-semibold">Category price pressure</h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Month-over-month: how much of the spend change is prices vs what you bought.
                  AI assigns categories on review (dairy, sporting goods, fuel, …).
                </p>
              </div>
              {data.categories.length === 0 ? (
                <p className="text-sm text-[var(--ink-muted)]">
                  Confirm receipts in two months with categories to see movers.{' '}
                  <Link to="/receipts?status=NEEDS_REVIEW" className="font-semibold text-[var(--brand-soft)]">
                    Review queue
                  </Link>
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                        <th className="py-2 pr-3 font-semibold">Category</th>
                        <th className="py-2 pr-3 font-semibold tabular-nums">Price Δ</th>
                        <th className="py-2 pr-3 font-semibold tabular-nums">Behavior Δ</th>
                        <th className="py-2 font-semibold tabular-nums">Price %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.categories.slice(0, 10).map((c) => (
                        <tr key={c.categoryId} className="border-b border-[var(--line)]/70">
                          <td className="py-2 pr-3 font-medium">
                            <Link
                              to={`/budgets?categoryId=${encodeURIComponent(c.categoryId)}`}
                              className="hover:underline"
                            >
                              {c.categoryName}
                            </Link>
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatCents(c.deltaPriceCents, { signed: true })}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-[var(--ink-muted)]">
                            {formatCents(c.deltaBehaviorCents, { signed: true })}
                          </td>
                          <td className="py-2 tabular-nums">{signedPct(c.priceChangePct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <aside className="dashboard-desk__aside space-y-6">
              <section className="space-y-3">
                <div>
                  <h2 className="text-2xl font-semibold">Product movers</h2>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">
                    Largest unit-price swings in the last 90 days (≥5%).
                  </p>
                </div>
                {data.products.length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">
                    No matched price history yet.{' '}
                    <Link to="/capture" className="font-semibold text-[var(--brand-soft)]">
                      Capture a receipt
                    </Link>
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.products.map((p) => (
                      <li
                        key={p.productId}
                        className="border-l-4 border-[var(--accent)] bg-[var(--surface)] px-3 py-2"
                      >
                        <Link
                          to={`/prices?productId=${encodeURIComponent(p.productId)}`}
                          className="font-semibold hover:underline"
                        >
                          {p.productName}
                        </Link>
                        <p className="text-xs text-[var(--ink-muted)]">
                          {p.categoryName ?? 'Uncategorized'} ·{' '}
                          {formatCents(p.priorCents)} → {formatCents(p.currentCents)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--brand)]">
                          {signedPct(p.changePct)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm">
                <p className="font-semibold">AI categorization</p>
                <p className="mt-1 text-[var(--ink-muted)]">
                  On receipt review, use “AI categorize missing” so butter lands in Dairy and
                  guns/ammo in Sporting Goods. Tax stays on the receipt total; taxable lines are
                  flagged for share stats.
                </p>
                <Link
                  to="/receipts?status=NEEDS_REVIEW"
                  className="mt-3 inline-block font-semibold text-[var(--brand-soft)]"
                >
                  Categorize receipts →
                </Link>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border-l-4 border-[var(--brand)] bg-[var(--surface)] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">{hint}</p>
    </div>
  );
}
