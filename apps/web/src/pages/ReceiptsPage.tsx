import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type ReceiptSummary } from '../lib/api';
import { formatCents } from '../lib/money';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'NEEDS_REVIEW', label: 'Needs review' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'EXTRACTING', label: 'Extracting' },
] as const;

export function ReceiptsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const [items, setItems] = useState<ReceiptSummary[]>([]);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (from) qs.set('from', new Date(`${from}T00:00:00.000Z`).toISOString());
    if (to) qs.set('to', new Date(`${to}T23:59:59.999Z`).toISOString());
    const q = qs.toString();
    void api<{ items: ReceiptSummary[] }>(`/receipts${q ? `?${q}` : ''}`).then((r) =>
      setItems(r.items),
    );
  }, [status, from, to]);

  function setStatus(next: string) {
    const n = new URLSearchParams(params);
    if (next) n.set('status', next);
    else n.delete('status');
    setParams(n);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Receipts</h1>
          <p className="mt-1 text-[var(--ink-muted)]">Filter by status and date.</p>
        </div>
        <Link to="/capture" className="text-sm font-semibold text-[var(--brand-soft)]">
          Add
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => setStatus(f.value)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-semibold',
              status === f.value
                ? 'bg-[var(--brand)] text-white'
                : 'border border-[var(--line)] bg-[var(--surface)]',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-[var(--ink-muted)]">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => {
              const n = new URLSearchParams(params);
              if (e.target.value) n.set('from', e.target.value);
              else n.delete('from');
              setParams(n);
            }}
            className="ml-2 rounded border border-[var(--line)] bg-white/90 px-2 py-1"
          />
        </label>
        <label className="text-xs text-[var(--ink-muted)]">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => {
              const n = new URLSearchParams(params);
              if (e.target.value) n.set('to', e.target.value);
              else n.delete('to');
              setParams(n);
            }}
            className="ml-2 rounded border border-[var(--line)] bg-white/90 px-2 py-1"
          />
        </label>
      </div>

      <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {items.map((r) => (
          <li key={r.id}>
            <Link to={`/receipts/${r.id}`} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">{r.store?.name ?? 'Unknown store'}</p>
                <p className="text-sm text-[var(--ink-muted)]">
                  {r.purchasedAt
                    ? new Date(r.purchasedAt).toLocaleDateString()
                    : 'No date'}{' '}
                  · {r._count.lines} lines · {r.status}
                </p>
              </div>
              <p className="font-semibold tabular-nums">{formatCents(r.totalCents)}</p>
            </Link>
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-8 text-[var(--ink-muted)]">No receipts match these filters.</li>
        )}
      </ul>
    </div>
  );
}
