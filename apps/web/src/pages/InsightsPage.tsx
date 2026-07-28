import { useEffect, useState } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api';
import { formatCents } from '../lib/money';

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

  async function load() {
    setItems(await api<Insight[]>('/insights?active=true'));
    setDigest(await api<Digest>('/insights/digest'));
  }

  useEffect(() => {
    void load()
      .catch(() => {
        setItems([]);
        setDigest(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function dismiss(id: string) {
    await api(`/insights/${id}/dismiss`, { method: 'POST' });
    await load();
  }

  async function regenerate() {
    setBusy(true);
    try {
      await api('/insights/generate', { method: 'POST' });
      await load();
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
            Deterministic rules — every dollar figure comes from stored data.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void regenerate()}
          className="rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Running…' : 'Generate'}
        </button>
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
                <button
                  type="button"
                  className="text-sm font-semibold text-[var(--ink-muted)]"
                  onClick={() => void dismiss(i.id)}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-[var(--ink-muted)]">
              No active insights yet. Confirm a few receipts, then hit Generate — or open the{' '}
              <button
                type="button"
                className="font-semibold text-[var(--brand-soft)]"
                onClick={() => void regenerate()}
              >
                weekly digest
              </button>{' '}
              after seed data is loaded.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function EvidenceChart({ data, type }: { data: Record<string, unknown>; type: string }) {
  const history = data.history;
  if (!Array.isArray(history) || history.length < 2) return null;
  if (type !== 'price_spike' && type !== 'stock_up' && type !== 'recurring_change') {
    return null;
  }
  const chartData = history.map((v, i) => ({
    i: String(i + 1),
    value: typeof v === 'number' ? v / 100 : 0,
  }));
  return (
    <div className="mt-3 h-28 w-full">
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <XAxis dataKey="i" hide />
          <YAxis width={36} tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
          <Line type="monotone" dataKey="value" stroke="#c45c26" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
