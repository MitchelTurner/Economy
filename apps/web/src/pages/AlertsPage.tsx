import { FormEvent, useEffect, useState } from 'react';
import { api, type Product } from '../lib/api';
import { formatCents } from '../lib/money';

type Alert = {
  id: string;
  dropPct: number | null;
  targetCents: number | null;
  active: boolean;
  lastTriggeredAt: string | null;
  product: { id: string; name: string };
};

export function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [dropPct, setDropPct] = useState('15');
  const [triggered, setTriggered] = useState<
    Array<{ productName: string; currentCents: number; reason: string }>
  >([]);

  async function load() {
    setAlerts(await api<Alert[]>('/alerts'));
    const products = await api<Product[]>('/catalog/products?q=');
    setProducts(products);
    if (!productId && products[0]) setProductId(products[0].id);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await api('/alerts', {
      method: 'POST',
      json: { productId, dropPct: Number(dropPct) },
    });
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Price-drop alerts</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Notify when a tracked item falls from its 30-day high or hits a target.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-2">
        <select
          className="w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            value={dropPct}
            onChange={(e) => setDropPct(e.target.value)}
            className="w-28 rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
            aria-label="Drop percent"
          />
          <span className="self-center text-sm text-[var(--ink-muted)]">% off 30-day high</span>
          <button
            type="submit"
            className="ml-auto rounded-md bg-[var(--brand)] px-4 py-2 font-semibold text-white"
          >
            Add alert
          </button>
        </div>
      </form>

      <button
        type="button"
        className="text-sm font-semibold text-[var(--brand-soft)]"
        onClick={() =>
          void api<typeof triggered>('/alerts/check', { method: 'POST' }).then(setTriggered)
        }
      >
        Check alerts now
      </button>

      {triggered.length > 0 && (
        <ul className="space-y-2 border-l-4 border-[var(--accent)] bg-[var(--surface)] px-3 py-2">
          {triggered.map((t, i) => (
            <li key={i} className="text-sm">
              <span className="font-semibold">{t.productName}</span> at{' '}
              {formatCents(t.currentCents)} — {t.reason}
            </li>
          ))}
        </ul>
      )}

      <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {alerts.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-semibold">{a.product.name}</p>
              <p className="text-sm text-[var(--ink-muted)]">
                {a.dropPct != null ? `${a.dropPct}% drop` : ''}
                {a.targetCents != null ? ` · target ${formatCents(a.targetCents)}` : ''}
                {a.lastTriggeredAt
                  ? ` · last ${new Date(a.lastTriggeredAt).toLocaleDateString()}`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              className="text-sm font-semibold text-[var(--danger)]"
              onClick={() => void api(`/alerts/${a.id}`, { method: 'DELETE' }).then(load)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
