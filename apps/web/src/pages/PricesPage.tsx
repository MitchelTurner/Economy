import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  api,
  apiErrorMessage,
  type PriceCompareResponse,
  type PriceHistoryResponse,
  type Product,
} from '../lib/api';
import { formatCents } from '../lib/money';
import { toast } from '../lib/toast';

type PremiumInfo = {
  premiumPct: number | null;
  local: { pricePerBaseUom: string | number } | null;
  baseline: { pricePerBaseUom: string | number; region: string } | null;
};

export function PricesPage() {
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<PriceHistoryResponse | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compare, setCompare] = useState<PriceCompareResponse | null>(null);
  const [premium, setPremium] = useState<PremiumInfo | null>(null);
  const deepLinkProductId = params.get('productId');

  useEffect(() => {
    const t = setTimeout(() => {
      void api<Product[]>(`/catalog/products?q=${encodeURIComponent(q)}`)
        .then(setProducts)
        .catch((err) => toast(apiErrorMessage(err, 'Could not search products'), 'danger'));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function openProduct(p: Product) {
    setSelected(p);
    setPremium(null);
    try {
      const [rows, prem] = await Promise.all([
        api<PriceHistoryResponse>(`/prices/product/${p.id}/history`),
        api<PremiumInfo>(`/prices/premium/${p.id}`).catch(() => null),
      ]);
      setHistory(rows);
      setPremium(prem);
    } catch (err) {
      setHistory(null);
      toast(apiErrorMessage(err, 'Could not load price history'), 'danger');
    }
  }

  useEffect(() => {
    if (!deepLinkProductId) return;
    if (selected?.id === deepLinkProductId) return;
    void api<PriceHistoryResponse>(`/prices/product/${deepLinkProductId}/history`)
      .then(async (rows) => {
        if (!rows.product) return;
        setSelected(rows.product);
        setHistory(rows);
        setPremium(
          await api<PremiumInfo>(`/prices/premium/${deepLinkProductId}`).catch(
            () => null,
          ),
        );
      })
      .catch((err) =>
        toast(apiErrorMessage(err, 'Could not open linked product'), 'danger'),
      );
  }, [deepLinkProductId, selected?.id]);

  function toggleCompare(id: string) {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-6),
    );
  }

  useEffect(() => {
    if (compareIds.length === 0) {
      setCompare(null);
      return;
    }
    void api<PriceCompareResponse>(
      `/prices/compare?productIds=${compareIds.join(',')}`,
    )
      .then(setCompare)
      .catch((err) => {
        setCompare(null);
        toast(apiErrorMessage(err, 'Could not compare prices'), 'danger');
      });
  }, [compareIds]);

  const chartData = useMemo(() => {
    if (!history) return [];
    return history.observations.map((o) => ({
      date: new Date(o.observedAt).toLocaleDateString(),
      unit: o.unitPriceCents / 100,
      perBase: o.pricePerBaseUom / 100,
      store: o.store.name,
    }));
  }, [history]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Prices</h1>
          <p className="mt-1 text-[var(--ink-muted)]">
            Per-unit history across stores — always compare on base UOM.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm font-semibold text-[var(--brand-soft)]">
          <Link to="/prices/index">Cost index</Link>
          <Link to="/alerts">Alerts</Link>
        </div>
      </div>

      <div className="grid gap-6 min-[900px]:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] min-[900px]:items-start">
      <div className="space-y-3 min-[900px]:sticky min-[900px]:top-6">
      <label className="block text-sm">
        Search products
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products"
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
        />
      </label>

      <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {products.map((p) => (
          <li
            key={p.id}
            className={[
              'flex items-center gap-2 py-3',
              selected?.id === p.id ? 'bg-[var(--brand)]/5' : '',
            ].join(' ')}
          >
            <button
              type="button"
              className="flex-1 text-left"
              onClick={() => void openProduct(p)}
            >
              <span className="font-semibold">{p.name}</span>
              <span className="mt-0.5 block text-sm text-[var(--ink-muted)]">
                {p.category.name}
                {p.sizeValue ? ` · ${p.sizeValue} ${p.sizeUom}` : ''}
                {p.baseUom ? ` · base ${p.baseUom}` : ''}
              </span>
            </button>
            <Link
              to={`/alerts?productId=${p.id}`}
              className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold"
            >
              Alert
            </Link>
            <button
              type="button"
              onClick={() => toggleCompare(p.id)}
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                compareIds.includes(p.id)
                  ? 'bg-[var(--brand)] text-white'
                  : 'border border-[var(--line)]'
              }`}
            >
              Compare
            </button>
          </li>
        ))}
        {products.length === 0 && (
          <li className="py-8 text-center text-[var(--ink-muted)]">
            No products yet. Confirm matched receipt lines to grow the catalog.
          </li>
        )}
      </ul>
      </div>

      {selected && history ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{selected.name}</h2>
          {premium?.premiumPct != null && premium.baseline && premium.local && (
            <p className="text-sm text-[var(--ink-muted)]">
              Island premium vs {premium.baseline.region}:{' '}
              <span className="font-semibold text-[var(--brand)]">
                {premium.premiumPct.toFixed(0)}%
              </span>{' '}
              (
              ${(Number(premium.local.pricePerBaseUom) / 100).toFixed(4)} local vs $
              {(Number(premium.baseline.pricePerBaseUom) / 100).toFixed(4)} baseline per{' '}
              {selected.baseUom ?? 'unit'})
            </p>
          )}
          {premium && premium.premiumPct == null && (
            <p className="text-sm text-[var(--ink-muted)]">
              No island premium yet — need a local observation and a baseline price (run
              reference seed).
            </p>
          )}
          {history.observations.length === 0 ? (
            <p className="text-[var(--ink-muted)]">
              No observations yet. Confirm a matched receipt line to start the series.
            </p>
          ) : (
            <>
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(20,35,29,0.12)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
                      width={56}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `$${Number(value).toFixed(4)}`,
                        name === 'perBase'
                          ? `Per ${history.baseUom ?? 'base'}`
                          : 'Unit price',
                      ]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="unit"
                      name="Unit $"
                      stroke="#0c4a3e"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="perBase"
                      name={`$ / ${history.baseUom ?? 'base'}`}
                      stroke="#c45c26"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-2 text-sm">
                {history.observations.map((h, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>
                      {new Date(h.observedAt).toLocaleDateString()} · {h.store.name}
                    </span>
                    <span className="tabular-nums">
                      {formatCents(h.unitPriceCents)}
                      <span className="text-[var(--ink-muted)]">
                        {' '}
                        · ${(h.pricePerBaseUom / 100).toFixed(4)}/{history.baseUom}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        <p className="hidden rounded-xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-[var(--ink-muted)] min-[900px]:block">
          Select a product to see price history and island premium.
        </p>
      )}
      </div>

      {compare && compare.products.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Store comparison</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Latest household observations — values are price per base UOM.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--ink-muted)]">
                  <th className="py-2 pr-3 font-medium">Product</th>
                  {compare.stores.map((s) => (
                    <th key={s.id} className="py-2 pr-3 font-medium">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compare.products.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--line)]">
                    <td className="py-2 pr-3 font-semibold">
                      {p.name}
                      <span className="block text-xs font-normal text-[var(--ink-muted)]">
                        per {p.baseUom ?? 'unit'}
                      </span>
                    </td>
                    {compare.stores.map((s) => {
                      const cell = compare.cells.find(
                        (c) => c.productId === p.id && c.storeId === s.id,
                      );
                      return (
                        <td key={s.id} className="py-2 pr-3 tabular-nums">
                          {cell
                            ? `$${(cell.pricePerBaseUom / 100).toFixed(4)}`
                            : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
