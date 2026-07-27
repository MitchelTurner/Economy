import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ReceiptSummary } from '../lib/api';
import { formatCents } from '../lib/money';

export function ReceiptsPage() {
  const [items, setItems] = useState<ReceiptSummary[]>([]);

  useEffect(() => {
    void api<{ items: ReceiptSummary[] }>('/receipts').then((r) => setItems(r.items));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Receipts</h1>
          <p className="mt-1 text-[var(--ink-muted)]">Filter by store, date, and status later.</p>
        </div>
        <Link to="/capture" className="text-sm font-semibold text-[var(--brand-soft)]">
          Add
        </Link>
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
          <li className="py-8 text-[var(--ink-muted)]">No receipts yet.</li>
        )}
      </ul>
    </div>
  );
}
