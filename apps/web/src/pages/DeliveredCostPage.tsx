import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Product } from '../lib/api';
import { formatCents } from '../lib/money';

type Lane = {
  id: string;
  name: string;
  originRegion: string;
  flatFeeCents: number;
  perLbCents: number;
  leadTimeDays: number;
};

type Comparison = {
  product: { id: string; name: string };
  lane: Lane;
  baselineRegion: string;
  mainlandUnitCents: number;
  localUnitCents: number;
  localStore: string;
  quantity: number;
  comparison: {
    mainlandSubtotalCents: number;
    shippingCents: number;
    deliveredTotalCents: number;
    localTotalCents: number;
    savingsVsLocalCents: number;
    preferMainland: boolean;
  };
};

export function DeliveredCostPage() {
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [productId, setProductId] = useState(params.get('productId') ?? '');
  const [laneId, setLaneId] = useState('');
  const [qty, setQty] = useState('6');
  const [result, setResult] = useState<Comparison | null>(null);

  useEffect(() => {
    void api<Lane[]>('/prices/shipping-lanes').then((l) => {
      setLanes(l);
      if (l[0]) setLaneId(l[0].id);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void api<Product[]>(`/catalog/products?q=${encodeURIComponent(q)}`).then((p) => {
        setProducts(p);
        if (!productId && p[0]) setProductId(p[0].id);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const pre = params.get('productId');
    if (pre) setProductId(pre);
  }, [params]);

  async function compare() {
    if (!productId) return;
    const qs = new URLSearchParams({
      quantity: qty,
      ...(laneId ? { laneId } : {}),
    });
    setResult(
      await api<Comparison>(`/prices/delivered/${productId}?${qs.toString()}`),
    );
  }

  const c = result?.comparison;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Mainland delivered cost</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Compare island shelf price to mainland unit cost plus barge/air freight.
        </p>
      </div>

      <label className="block text-sm">
        Search products
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Coffee, butter…"
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        Product
        <select
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">Select a product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {products.length === 0 && (
        <p className="text-sm text-[var(--ink-muted)]">
          No products yet. Confirm matched receipt lines first, or browse{' '}
          <Link to="/prices" className="font-semibold text-[var(--brand-soft)]">
            Prices
          </Link>
          .
        </p>
      )}

      <label className="block text-sm">
        Shipping lane
        <select
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          value={laneId}
          onChange={(e) => setLaneId(e.target.value)}
        >
          {lanes.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · {l.leadTimeDays}d · flat {formatCents(l.flatFeeCents)}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        Quantity
        <input
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          aria-label="Quantity to ship"
        />
      </label>

      <button
        type="button"
        onClick={() => void compare()}
        disabled={!productId}
        className="rounded-md bg-[var(--brand)] px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        Compare
      </button>

      {result && c && (
        <section className="space-y-2 border-l-4 border-[var(--brand)] bg-[var(--surface)] px-4 py-3">
          <p className="font-semibold">{result.product.name}</p>
          <p className="text-sm text-[var(--ink-muted)]">
            Local {result.localStore}: {formatCents(result.localUnitCents)}/ea · Mainland (
            {result.baselineRegion}): {formatCents(result.mainlandUnitCents)}/ea via{' '}
            {result.lane.name}
          </p>
          <ul className="mt-2 space-y-1 text-sm tabular-nums">
            <li>Mainland subtotal {formatCents(c.mainlandSubtotalCents)}</li>
            <li>Shipping {formatCents(c.shippingCents)}</li>
            <li>Delivered total {formatCents(c.deliveredTotalCents)}</li>
            <li>Local total {formatCents(c.localTotalCents)}</li>
            <li className="font-semibold text-[var(--brand)]">
              {c.preferMainland
                ? `Mainland saves ${formatCents(c.savingsVsLocalCents)}`
                : `Local is cheaper by ${formatCents(-c.savingsVsLocalCents)}`}
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}
