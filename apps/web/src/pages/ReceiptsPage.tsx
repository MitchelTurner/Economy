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

type Store = { id: string; name: string };

export function ReceiptsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const storeId = params.get('storeId') ?? '';
  const [items, setItems] = useState<ReceiptSummary[]>([]);
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    void api<Store[]>('/catalog/stores').then(setStores);
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (storeId) qs.set('storeId', storeId);
    if (from) qs.set('from', new Date(`${from}T00:00:00.000Z`).toISOString());
    if (to) qs.set('to', new Date(`${to}T23:59:59.999Z`).toISOString());
    const q = qs.toString();
    void api<{ items: ReceiptSummary[] }>(`/receipts${q ? `?${q}` : ''}`).then((r) =>
      setItems(r.items),
    );
  }, [status, from, to, storeId]);

  function setParam(key: string, value: string) {
    const n = new URLSearchParams(params);
    if (value) n.set(key, value);
    else n.delete(key);
    setParams(n);
  }

  async function remove(id: string) {
    if (!confirm('Delete this receipt and its image?')) return;
    await api(`/receipts/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Receipts</h1>
          <p className="mt-1 text-[var(--ink-muted)]">Filter by status, store, and date.</p>
        </div>
        <div className="flex gap-3 text-sm font-semibold text-[var(--brand-soft)]">
          <Link to="/capture">Scan</Link>
          <Link to="/capture/manual">Manual</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Status filter">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => setParam('status', f.value)}
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
          Store
          <select
            value={storeId}
            onChange={(e) => setParam('storeId', e.target.value)}
            className="ml-2 rounded border border-[var(--line)] bg-white/90 px-2 py-1"
          >
            <option value="">Any</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--ink-muted)]">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setParam('from', e.target.value)}
            className="ml-2 rounded border border-[var(--line)] bg-white/90 px-2 py-1"
          />
        </label>
        <label className="text-xs text-[var(--ink-muted)]">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setParam('to', e.target.value)}
            className="ml-2 rounded border border-[var(--line)] bg-white/90 px-2 py-1"
          />
        </label>
      </div>

      <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {items.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-3">
            <Link to={`/receipts/${r.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{r.store?.name ?? 'Unknown store'}</p>
                <p className="text-sm text-[var(--ink-muted)]">
                  {r.purchasedAt
                    ? new Date(r.purchasedAt).toLocaleDateString()
                    : 'No date'}{' '}
                  · {r._count.lines} lines · {r.status}
                </p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{formatCents(r.totalCents)}</p>
            </Link>
            <button
              type="button"
              className="shrink-0 text-xs font-semibold text-[var(--danger)]"
              onClick={() => void remove(r.id)}
            >
              Delete
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="space-y-3 py-8 text-center text-[var(--ink-muted)]">
            <p>No receipts match these filters.</p>
            <p>
              <Link to="/capture" className="font-semibold text-[var(--brand-soft)]">
                Scan a receipt
              </Link>
              {' · '}
              <Link to="/capture/manual" className="font-semibold text-[var(--brand-soft)]">
                Enter manually
              </Link>
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}
