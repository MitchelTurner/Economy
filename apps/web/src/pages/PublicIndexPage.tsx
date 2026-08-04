import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getApiBaseUrl } from '../lib/api';
import { formatCents } from '../lib/money';

type PublicIndex = {
  region: string;
  basketSlug: string;
  minHouseholds: number;
  contributorStores: Array<{ id: string; name: string }>;
  points: Array<{
    periodStart: string;
    storeId: string | null;
    indexValue: number;
    basketCostCents: number;
    coverage: number;
  }>;
};

type StapleProduct = {
  id: string;
  name: string;
  sizeValue: number | null;
  sizeUom: string | null;
  baseUom: string | null;
};

type PublicPrices = {
  productId: string;
  minHouseholds: number;
  observations: Array<{
    storeId: string;
    storeName: string;
    region: string;
    date: string;
    unitPriceCents: number;
    households: number;
  }>;
};

export function PublicIndexPage() {
  const [region, setRegion] = useState('ketchikan');
  const [data, setData] = useState<PublicIndex | null>(null);
  const [staples, setStaples] = useState<StapleProduct[]>([]);
  const [productId, setProductId] = useState('');
  const [prices, setPrices] = useState<PublicPrices | null>(null);
  const [loading, setLoading] = useState(true);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesError, setPricesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void Promise.all([
      fetch(`${getApiBaseUrl()}/public/index?region=${encodeURIComponent(region)}`).then(
        async (r) => {
          if (!r.ok) {
            let detail: { message?: string } | undefined;
            try {
              detail = (await r.json()) as { message?: string };
            } catch {
              detail = undefined;
            }
            throw Object.assign(new Error(detail?.message || `HTTP ${r.status}`), {
              status: r.status,
              detail,
            });
          }
          return r.json() as Promise<PublicIndex>;
        },
      ),
      fetch(`${getApiBaseUrl()}/public/staples`).then(async (r) => {
        if (!r.ok) {
          let detail: { message?: string } | undefined;
          try {
            detail = (await r.json()) as { message?: string };
          } catch {
            detail = undefined;
          }
          throw Object.assign(new Error(detail?.message || `HTTP ${r.status}`), {
            status: r.status,
            detail,
          });
        }
        return r.json() as Promise<{ products: StapleProduct[] }>;
      }),
    ])
      .then(([index, stapleRes]) => {
        setData(index);
        setStaples(stapleRes.products);
        setProductId((prev) => prev || stapleRes.products[0]?.id || '');
      })
      .catch((e) => {
        const err = e as { detail?: { message?: string }; message?: string };
        const msg =
          typeof err.detail?.message === 'string'
            ? err.detail.message
            : err.message && !/^HTTP \d+/.test(err.message)
              ? err.message
              : 'Could not load public index';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [region]);

  useEffect(() => {
    if (!productId) {
      setPrices(null);
      setPricesError(null);
      return;
    }
    setPricesLoading(true);
    setPricesError(null);
    void fetch(
      `${getApiBaseUrl()}/public/prices/${encodeURIComponent(productId)}?region=${encodeURIComponent(region)}`,
    )
      .then(async (r) => {
        if (!r.ok) {
          let detail: unknown;
          try {
            detail = await r.json();
          } catch {
            detail = undefined;
          }
          const msg =
            detail &&
            typeof detail === 'object' &&
            detail !== null &&
            'message' in detail &&
            typeof (detail as { message: unknown }).message === 'string'
              ? (detail as { message: string }).message
              : `Could not load product prices (${r.status})`;
          throw new Error(msg);
        }
        return r.json() as Promise<PublicPrices>;
      })
      .then((rows) => {
        setPrices(rows);
        setPricesError(null);
      })
      .catch((e) => {
        setPrices(null);
        setPricesError((e as Error).message || 'Could not load product prices');
      })
      .finally(() => setPricesLoading(false));
  }, [productId, region]);

  const chartData =
    data?.points
      .filter((p) => p.storeId == null)
      .map((p) => ({
        date: new Date(p.periodStart).toLocaleDateString(),
        index: p.indexValue,
        cost: p.basketCostCents / 100,
      })) ?? [];

  const selected = staples.find((p) => p.id === productId);

  return (
    <div className="app-shell space-y-6 py-8">
      <div>
        <p className="brand text-4xl font-bold text-[var(--brand)]">Island Ledger</p>
        <h1 className="mt-2 text-3xl font-semibold">Public cost-of-goods index</h1>
        <p className="mt-2 max-w-xl text-[var(--ink-muted)]">
          Anonymized staples basket for the island. Only aggregates with at least{' '}
          {data?.minHouseholds ?? 3} contributing households are shown — never baskets,
          totals, or receipt images.
        </p>
      </div>

      <label className="block text-sm">
        Region
        <select
          className="mt-1 w-full max-w-xs rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="ketchikan">Ketchikan</option>
          <option value="anchorage">Anchorage</option>
        </select>
      </label>

      {loading && <p className="text-[var(--ink-muted)]">Loading index…</p>}
      {error && <p className="text-[var(--danger)]">{error}</p>}

      {data && data.points.length === 0 && !loading && (
        <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-[var(--ink-muted)]">
          No public points yet for {region}. The gate requires ≥{data.minHouseholds} households
          contributing observations at the same stores on overlapping dates, then a staples
          index rollup. After a fresh seed, Ketchikan should populate automatically.
        </p>
      )}

      {data && data.contributorStores.length > 0 && (
        <p className="text-sm text-[var(--ink-muted)]">
          Contributing stores: {data.contributorStores.map((s) => s.name).join(', ')}
        </p>
      )}

      {chartData.length > 0 && (
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip />
              <Line type="monotone" dataKey="index" stroke="#0c4a3e" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {data && data.points.length > 0 && (
        <ul className="space-y-2 text-sm">
          {data.points.slice(-12).map((p, i) => (
            <li key={i} className="flex justify-between border-b border-[var(--line)] py-2">
              <span>
                {new Date(p.periodStart).toLocaleDateString()}
                {p.storeId
                  ? ` · ${data.contributorStores.find((s) => s.id === p.storeId)?.name ?? 'store'}`
                  : ' · region'}
              </span>
              <span className="tabular-nums">
                idx {p.indexValue.toFixed(2)} · {formatCents(p.basketCostCents)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3 border-t border-[var(--line)] pt-6">
        <h2 className="text-xl font-semibold">Public product prices</h2>
        <p className="text-sm text-[var(--ink-muted)]">
          Median unit prices by store/day when ≥{data?.minHouseholds ?? 3} households
          contribute. Household baskets stay private.
        </p>

        {staples.length === 0 && !loading && (
          <p className="text-sm text-[var(--ink-muted)]">
            Staples catalog not seeded yet — run <code>npm run db:seed</code>.
          </p>
        )}

        {staples.length > 0 && (
          <label className="block text-sm">
            Staple
            <select
              className="mt-1 w-full max-w-md rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              {staples.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {pricesLoading && <p className="text-sm text-[var(--ink-muted)]">Loading prices…</p>}

        {!pricesLoading && pricesError && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {pricesError}
          </p>
        )}

        {!pricesLoading && !pricesError && prices && prices.observations.length === 0 && selected && (
          <p className="text-sm text-[var(--ink-muted)]">
            No gated public prices for {selected.name} in {region} yet.
          </p>
        )}

        {!pricesLoading && prices && prices.observations.length > 0 && (
          <ul className="space-y-2 text-sm">
            {prices.observations.slice(0, 24).map((o, i) => (
              <li
                key={`${o.storeId}-${o.date}-${i}`}
                className="flex justify-between gap-3 border-b border-[var(--line)] py-2"
              >
                <span>
                  {o.storeName} · {new Date(o.date).toLocaleDateString()}
                  <span className="text-[var(--ink-muted)]">
                    {' '}
                    · {o.households} households
                  </span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold">
                  {formatCents(o.unitPriceCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm">
        <Link to="/login" className="font-semibold text-[var(--brand-soft)]">
          Sign in
        </Link>{' '}
        to track your own household prices.
      </p>
    </div>
  );
}
