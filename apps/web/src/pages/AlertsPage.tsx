import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Product } from '../lib/api';
import { formatCents, parseDollarsToCents } from '../lib/money';

type Alert = {
  id: string;
  dropPct: number | null;
  targetCents: number | null;
  active: boolean;
  lastTriggeredAt: string | null;
  product: { id: string; name: string };
};

export function AlertsPage() {
  const [params] = useSearchParams();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState(params.get('productId') ?? '');
  const [dropPct, setDropPct] = useState('15');
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [triggered, setTriggered] = useState<
    Array<{ productName: string; currentCents: number; reason: string }>
  >([]);

  async function load() {
    setAlerts(await api<Alert[]>('/alerts'));
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void api<Product[]>(`/catalog/products?q=${encodeURIComponent(q)}`).then(setProducts);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const preselect = params.get('productId');
    if (preselect) setProductId(preselect);
  }, [params]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!productId) {
      setMessage('Pick a product first.');
      return;
    }
    const targetCents = target.trim() ? parseDollarsToCents(target) : null;
    const drop = dropPct.trim() ? Number(dropPct) : null;
    if (drop == null && targetCents == null) {
      setMessage('Set a drop % and/or target price.');
      return;
    }
    await api('/alerts', {
      method: 'POST',
      json: {
        productId,
        dropPct: drop,
        targetCents,
      },
    });
    setMessage('Alert saved.');
    setTarget('');
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Price-drop alerts</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Notify when a tracked item falls from its 30-day high or hits a target price.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-2" aria-label="Create price alert">
        <label className="block text-sm">
          Search products
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Milk, coffee…"
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Product
          <select
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
          >
            <option value="">Select a product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <label className="text-sm">
            Drop %
            <input
              value={dropPct}
              onChange={(e) => setDropPct(e.target.value)}
              className="ml-2 w-20 rounded-md border border-[var(--line)] bg-white/80 px-2 py-2"
              aria-label="Drop percent from 30-day high"
            />
          </label>
          <label className="text-sm">
            Target $
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="optional"
              className="ml-2 w-24 rounded-md border border-[var(--line)] bg-white/80 px-2 py-2"
              aria-label="Target price dollars"
            />
          </label>
          <button
            type="submit"
            className="ml-auto rounded-md bg-[var(--brand)] px-4 py-2 font-semibold text-white"
          >
            Add alert
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="text-sm font-semibold text-[var(--brand-soft)]"
          onClick={() =>
            void api<typeof triggered>('/alerts/check', { method: 'POST' }).then((rows) => {
              setTriggered(rows);
              setMessage(
                rows.length
                  ? `${rows.length} alert${rows.length === 1 ? '' : 's'} triggered`
                  : 'No alerts triggered right now.',
              );
            })
          }
        >
          Check now
        </button>
        <Link to="/prices" className="text-sm font-semibold text-[var(--brand-soft)]">
          Browse prices
        </Link>
      </div>

      {message && <p className="text-sm text-[var(--ink-muted)]">{message}</p>}

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

      {alerts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-[var(--ink-muted)]">
          No alerts yet. Search a staple from{' '}
          <Link to="/prices" className="font-semibold text-[var(--brand-soft)]">
            Prices
          </Link>{' '}
          or add one above before the next barge.
        </p>
      ) : (
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
      )}
    </div>
  );
}
