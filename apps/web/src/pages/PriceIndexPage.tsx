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
import { api, apiErrorMessage } from '../lib/api';
import { formatCents } from '../lib/money';
import { toast } from '../lib/toast';

type IndexPoint = {
  periodStart: string;
  indexValue: string | number;
  basketCostCents: number;
  coverage: number;
  region: string;
  storeId: string | null;
};

export function PriceIndexPage() {
  const [region, setRegion] = useState('ketchikan');
  const [points, setPoints] = useState<IndexPoint[]>([]);

  useEffect(() => {
    void api<IndexPoint[]>(
      `/prices/index?basket=staples-25&region=${encodeURIComponent(region)}`,
    )
      .then(setPoints)
      .catch((err) => {
        setPoints([]);
        toast(apiErrorMessage(err, 'Could not load price index'), 'danger');
      });
  }, [region]);

  const chartData = points.map((p) => ({
    date: new Date(p.periodStart).toLocaleDateString(),
    index: Number(p.indexValue),
    cost: p.basketCostCents / 100,
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link to="/prices" className="text-sm font-semibold text-[var(--brand-soft)]">
          ← Prices
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Cost-of-goods index</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Fixed staples-25 basket. Nightly rollups (and seed) populate this chart.
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
          <option value="seattle">Seattle</option>
        </select>
      </label>

      {points.length === 0 ? (
        <p className="text-[var(--ink-muted)]">
          No index points yet for {region}. Confirm matched receipts, then wait for the nightly
          rollup — or re-run seed which writes demo rollups.
        </p>
      ) : (
        <>
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={40} />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === 'cost' ? formatCents(Math.round(v * 100)) : v.toFixed(4)
                  }
                />
                <Line type="monotone" dataKey="index" stroke="#0c4a3e" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-2 text-sm">
            {points.map((p, i) => (
              <li key={i} className="flex justify-between">
                <span>{new Date(p.periodStart).toLocaleDateString()}</span>
                <span className="tabular-nums">
                  idx {Number(p.indexValue).toFixed(2)} · {formatCents(p.basketCostCents)} ·{' '}
                  {Math.round(p.coverage * 100)}% coverage
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
