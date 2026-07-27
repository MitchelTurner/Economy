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
import { formatCents } from '../lib/money';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

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

export function PublicIndexPage() {
  const [region, setRegion] = useState('ketchikan');
  const [data, setData] = useState<PublicIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${API_URL}/public/index?region=${encodeURIComponent(region)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [region]);

  const chartData =
    data?.points
      .filter((p) => p.storeId == null)
      .map((p) => ({
        date: new Date(p.periodStart).toLocaleDateString(),
        index: p.indexValue,
        cost: p.basketCostCents / 100,
      })) ?? [];

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

      {error && <p className="text-[var(--danger)]">{error}</p>}

      {data && data.points.length === 0 && (
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

      <p className="text-sm">
        <Link to="/login" className="font-semibold text-[var(--brand-soft)]">
          Sign in
        </Link>{' '}
        to track your own household prices.
      </p>
    </div>
  );
}
