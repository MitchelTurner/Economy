import { useEffect, useMemo, useState } from 'react';
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
import { insightCtaLabel, insightHref } from '../lib/insight-links';
import { formatCents } from '../lib/money';
import { toast } from '../lib/toast';

type Insight = {
  id: string;
  title: string;
  body: string;
  severity: string;
  type: string;
  estimatedSavingsCents: number | null;
  data: Record<string, unknown>;
};

type Digest = {
  insightCount: number;
  estimatedSavingsCents: number;
  aiSummary?: string | null;
  narrationEnabled?: boolean;
  insights: Insight[];
};

type SeverityFilter = 'ALL' | 'WARNING' | 'OPPORTUNITY' | 'INFO';

export function InsightsPage() {
  const [items, setItems] = useState<Insight[]>([]);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showActive, setShowActive] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');

  async function load(active = showActive) {
    setItems(await api<Insight[]>(`/insights?active=${active ? 'true' : 'false'}`));
    setDigest(await api<Digest>('/insights/digest'));
  }

  useEffect(() => {
    setLoading(true);
    void load(showActive)
      .catch((err) => {
        setItems([]);
        setDigest(null);
        toast(apiErrorMessage(err, 'Could not load insights'), 'danger');
      })
      .finally(() => setLoading(false));
  }, [showActive]);

  const filtered = useMemo(() => {
    if (severityFilter === 'ALL') return items;
    return items.filter((i) => i.severity === severityFilter);
  }, [items, severityFilter]);

  async function dismiss(id: string) {
    setActionId(id);
    try {
      await api(`/insights/${id}/dismiss`, { method: 'POST' });
      toast('Insight dismissed', 'ok');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'Dismiss failed'), 'danger');
    } finally {
      setActionId(null);
    }
  }

  async function restore(id: string) {
    setActionId(id);
    try {
      await api(`/insights/${id}/restore`, { method: 'POST' });
      toast('Insight restored', 'ok');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'Restore failed'), 'danger');
    } finally {
      setActionId(null);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      await api('/insights/generate', { method: 'POST' });
      toast('Insights generated', 'ok');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'Generate failed'), 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="page-header-desk flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Insights</h1>
          <p className="mt-1 max-w-2xl text-[var(--ink-muted)]">
            Ranked by severity and dollars at stake. Rules compute the numbers; AI
            sharpens wording. Digests send when enabled in Settings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-[var(--line)] text-sm" role="group" aria-label="Insight filter">
            <button
              type="button"
              aria-pressed={showActive}
              onClick={() => setShowActive(true)}
              className={[
                'px-3 py-1.5 font-semibold',
                showActive ? 'bg-[var(--brand)] text-white' : 'text-[var(--ink-muted)]',
              ].join(' ')}
            >
              Active
            </button>
            <button
              type="button"
              aria-pressed={!showActive}
              onClick={() => setShowActive(false)}
              className={[
                'px-3 py-1.5 font-semibold',
                !showActive ? 'bg-[var(--brand)] text-white' : 'text-[var(--ink-muted)]',
              ].join(' ')}
            >
              Dismissed
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void regenerate()}
            className="rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Running…' : 'Generate'}
          </button>
        </div>
      </div>

      {loading && <p className="text-[var(--ink-muted)]">Loading insights…</p>}

      {!loading && (
        <div className="insights-desk">
          <aside className="insights-desk__aside space-y-4">
            {digest && (
              <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                <p className="text-sm uppercase tracking-wide text-[var(--ink-muted)]">
                  Weekly digest{digest.narrationEnabled ? ' · AI summary' : ''}
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {digest.insightCount} active tips · ~{formatCents(digest.estimatedSavingsCents)}{' '}
                  at stake
                </p>
                {digest.aiSummary && (
                  <p className="mt-2 text-sm leading-relaxed text-[var(--ink)]">{digest.aiSummary}</p>
                )}
              </section>
            )}

            {items.length > 0 && (
              <div
                className="flex flex-wrap gap-2 text-sm min-[900px]:flex-col"
                role="group"
                aria-label="Severity filter"
              >
                {(
                  [
                    ['ALL', 'All'],
                    ['WARNING', 'Warnings'],
                    ['OPPORTUNITY', 'Opportunities'],
                    ['INFO', 'Info'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={severityFilter === value}
                    onClick={() => setSeverityFilter(value)}
                    className={[
                      'rounded-md px-3 py-1.5 font-semibold min-[900px]:w-full min-[900px]:text-left',
                      severityFilter === value
                        ? 'bg-[var(--brand)] text-white'
                        : 'border border-[var(--line)] text-[var(--ink-muted)]',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </aside>

          <ul className="space-y-4">
            {filtered.map((i) => {
              const href = insightHref(i.type, i.data);
              const cta = insightCtaLabel(i.type);
              return (
                <li
                  key={i.id}
                  className="border-l-4 border-[var(--brand)] bg-[var(--surface)] px-4 py-3 backdrop-blur"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                        {i.severity} · {i.type.replace(/_/g, ' ')}
                      </p>
                      <Link to={href} className="mt-1 block font-semibold hover:underline">
                        {i.title}
                      </Link>
                      <p className="mt-1 text-sm text-[var(--ink-muted)]">{i.body}</p>
                      {i.estimatedSavingsCents != null && (
                        <p className="mt-2 text-sm font-semibold text-[var(--brand)]">
                          ~{formatCents(i.estimatedSavingsCents)} at stake
                        </p>
                      )}
                      <EvidenceChart data={i.data} type={i.type} />
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <Link
                          to={href}
                          className="inline-flex min-h-11 items-center rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white"
                        >
                          {cta}
                        </Link>
                        {showActive ? (
                          <button
                            type="button"
                            className="min-h-11 text-sm font-semibold text-[var(--ink-muted)] disabled:opacity-50"
                            disabled={actionId === i.id}
                            aria-busy={actionId === i.id}
                            onClick={() => void dismiss(i.id)}
                          >
                            Dismiss
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="min-h-11 text-sm font-semibold text-[var(--brand-soft)] disabled:opacity-50"
                            disabled={actionId === i.id}
                            aria-busy={actionId === i.id}
                            onClick={() => void restore(i.id)}
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            {items.length === 0 && (
              <li className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-[var(--ink-muted)]">
                {showActive ? (
                  <div className="space-y-3">
                    <p>
                      No active insights yet. Confirm a few receipts so rules have spend and
                      price history to work with.
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                      <Link
                        to="/capture"
                        className="inline-flex min-h-11 items-center rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
                      >
                        Capture a receipt
                      </Link>
                      <button
                        type="button"
                        disabled={busy}
                        className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
                        onClick={() => void regenerate()}
                      >
                        {busy ? 'Running…' : 'Generate now'}
                      </button>
                    </div>
                  </div>
                ) : (
                  'No dismissed insights yet.'
                )}
              </li>
            )}
            {items.length > 0 && filtered.length === 0 && (
              <li className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-[var(--ink-muted)]">
                No insights match this severity. Try All.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function EvidenceChart({ data, type }: { data: Record<string, unknown>; type: string }) {
  if (type === 'category_creep' && Array.isArray(data.months)) {
    const series = (data.months as Array<{
      spendCents?: number;
      fixedBasketSpendCents?: number;
      key?: string;
    }>).map((m, i) => ({
      i: m.key ?? String(i + 1),
      spend: Number(m.spendCents ?? 0) / 100,
      basket: Number(m.fixedBasketSpendCents ?? m.spendCents ?? 0) / 100,
    }));
    if (series.length < 2) return null;
    return (
      <div className="mt-3 h-28 w-full">
        <ResponsiveContainer>
          <LineChart data={series}>
            <XAxis dataKey="i" hide />
            <YAxis width={36} tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
            <Line type="monotone" dataKey="spend" stroke="#c45c26" strokeWidth={2} dot={false} name="Spend" />
            <Line type="monotone" dataKey="basket" stroke="#0c4a3e" strokeWidth={2} dot={false} name="Fixed basket" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const series = buildEvidenceSeries(data, type);
  if (!series || series.length < 2) return null;
  return (
    <div className="mt-3 h-28 w-full">
      <ResponsiveContainer>
        <LineChart data={series}>
          <XAxis dataKey="i" hide />
          <YAxis width={36} tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
          <Line type="monotone" dataKey="value" stroke="#c45c26" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function buildEvidenceSeries(
  data: Record<string, unknown>,
  type: string,
): Array<{ i: string; value: number }> | null {
  if (
    type === 'price_spike' ||
    type === 'stock_up' ||
    type === 'recurring_change'
  ) {
    const history = data.history;
    if (!Array.isArray(history) || history.length < 2) return null;
    return history.map((v, i) => ({
      i: String(i + 1),
      value: typeof v === 'number' ? v / 100 : 0,
    }));
  }

  if (type === 'store_switch' && data.storeTotals && typeof data.storeTotals === 'object') {
    const names =
      data.storeNames && typeof data.storeNames === 'object'
        ? (data.storeNames as Record<string, string>)
        : {};
    return Object.entries(data.storeTotals as Record<string, number>).map(([k, v], i) => ({
      i: names[k] ?? k.slice(0, 8) ?? String(i + 1),
      value: v / 100,
    }));
  }

  if (type === 'budget_pace') {
    const spent = Number(data.spentCents ?? 0);
    const budget = Number(data.budgetAmountCents ?? 0);
    const projected = Number(data.projectedCents ?? 0);
    if (!budget) return null;
    return [
      { i: 'spent', value: spent / 100 },
      { i: 'budget', value: budget / 100 },
      { i: 'pace', value: projected / 100 },
    ];
  }

  if (type === 'island_premium') {
    const local = Number(data.local ?? 0);
    const baseline = Number(data.baseline ?? 0);
    if (!local && !baseline) return null;
    return [
      { i: 'baseline', value: baseline / 100 },
      { i: 'local', value: local / 100 },
    ];
  }

  if (type === 'impulse_pattern') {
    return [
      { i: 'day', value: Number(data.dayAvgCents ?? 0) / 100 },
      { i: 'evening', value: Number(data.eveningAvgCents ?? 0) / 100 },
    ];
  }

  return null;
}
