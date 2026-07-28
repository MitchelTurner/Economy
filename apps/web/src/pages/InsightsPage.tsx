import { useEffect, useState } from 'react';
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
  insights: Insight[];
};

export function InsightsPage() {
  const [items, setItems] = useState<Insight[]>([]);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showActive, setShowActive] = useState(true);

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

  async function dismiss(id: string) {
    try {
      await api(`/insights/${id}/dismiss`, { method: 'POST' });
      toast('Insight dismissed', 'ok');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'Dismiss failed'), 'danger');
    }
  }

  async function restore(id: string) {
    try {
      await api(`/insights/${id}/restore`, { method: 'POST' });
      toast('Insight restored', 'ok');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'Restore failed'), 'danger');
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
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Insights</h1>
          <p className="mt-1 text-[var(--ink-muted)]">
            Deterministic rules — every dollar figure comes from stored data. Weekly email
            digests only send if enabled in Settings.
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

      {!loading && digest && (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <p className="text-sm uppercase tracking-wide text-[var(--ink-muted)]">
            Weekly digest
          </p>
          <p className="mt-1 text-lg font-semibold">
            {digest.insightCount} active tips · ~{formatCents(digest.estimatedSavingsCents)} at
            stake
          </p>
        </section>
      )}

      {!loading && (
        <ul className="space-y-4">
          {items.map((i) => (
            <li
              key={i.id}
              className="border-l-4 border-[var(--brand)] bg-[var(--surface)] px-4 py-3 backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                    {i.severity} · {i.type.replace(/_/g, ' ')}
                  </p>
                  <p className="mt-1 font-semibold">{i.title}</p>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">{i.body}</p>
                  {i.estimatedSavingsCents != null && (
                    <p className="mt-2 text-sm font-semibold text-[var(--brand)]">
                      ~{formatCents(i.estimatedSavingsCents)} at stake
                    </p>
                  )}
                  <EvidenceChart data={i.data} type={i.type} />
                </div>
                {showActive ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-[var(--ink-muted)]"
                    onClick={() => void dismiss(i.id)}
                  >
                    Dismiss
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-sm font-semibold text-[var(--brand-soft)]"
                    onClick={() => void restore(i.id)}
                  >
                    Restore
                  </button>
                )}
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-[var(--ink-muted)]">
              {showActive ? (
                <>
                  No active insights yet. Confirm a few receipts, then hit Generate — or open the{' '}
                  <button
                    type="button"
                    className="font-semibold text-[var(--brand-soft)]"
                    onClick={() => void regenerate()}
                  >
                    weekly digest
                  </button>{' '}
                  after seed data is loaded.
                </>
              ) : (
                'No dismissed insights yet.'
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function EvidenceChart({ data, type }: { data: Record<string, unknown>; type: string }) {
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
    return Object.entries(data.storeTotals as Record<string, number>).map(([k, v], i) => ({
      i: k.slice(0, 8) || String(i + 1),
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

  if (type === 'category_creep' && Array.isArray(data.months)) {
    return (data.months as Array<{ spendCents?: number; key?: string }>).map((m, i) => ({
      i: m.key ?? String(i + 1),
      value: Number(m.spendCents ?? 0) / 100,
    }));
  }

  if (type === 'island_premium') {
    const local = Number(data.local ?? 0);
    const baseline = Number(data.baseline ?? 0);
    if (!local && !baseline) return null;
    return [
      { i: 'baseline', value: baseline },
      { i: 'local', value: local },
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
