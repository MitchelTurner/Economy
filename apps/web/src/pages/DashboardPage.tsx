import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatCents } from '../lib/money';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type SpendResponse = {
  totalCents: number;
  groups: Array<{ key: string; label: string; totalCents: number }>;
};

type Insight = {
  id: string;
  title: string;
  body: string;
  severity: string;
};

export function DashboardPage() {
  const [spend, setSpend] = useState<SpendResponse | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    void api<SpendResponse>('/analytics/spend?groupBy=category').then(setSpend);
    void api<Insight[]>('/insights?active=true').then((rows) => setInsights(rows.slice(0, 3)));
  }, []);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[linear-gradient(135deg,#0c4a3e_0%,#1a6b59_55%,#2d8f6f_100%)] px-5 py-8 text-white shadow-sm">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #e8c547 0%, transparent 35%), radial-gradient(circle at 80% 80%, #9fd4c2 0%, transparent 40%)',
          }}
        />
        <div className="relative">
          <p className="text-sm uppercase tracking-[0.18em] text-white/70">This month</p>
          <p className="brand mt-2 text-5xl font-bold">{formatCents(spend?.totalCents ?? 0)}</p>
          <p className="mt-2 max-w-md text-white/85">
            Confirmed grocery spend for your household. Tap Capture to add the next receipt.
          </p>
          <Link
            to="/capture"
            className="mt-5 inline-flex rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Capture receipt
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-2xl font-semibold">By category</h2>
          <Link to="/receipts" className="text-sm font-semibold text-[var(--brand-soft)]">
            All receipts
          </Link>
        </div>
        {spend && spend.groups.length > 0 ? (
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <BarChart data={spend.groups.slice(0, 6)}>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `$${v / 100}`} width={48} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatCents(v)} />
                <Bar dataKey="totalCents" fill="#0c4a3e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-[var(--ink-muted)]">
            No confirmed receipts yet. Scan one to start the ledger.
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-2xl font-semibold">Insights</h2>
          <Link to="/insights" className="text-sm font-semibold text-[var(--brand-soft)]">
            Full feed
          </Link>
        </div>
        {insights.length === 0 ? (
          <p className="text-[var(--ink-muted)]">
            Advice appears once you have budgets and a few weeks of receipts.
          </p>
        ) : (
          <ul className="space-y-3">
            {insights.map((i) => (
              <li
                key={i.id}
                className="border-l-4 border-[var(--accent)] bg-[var(--surface)] px-4 py-3 backdrop-blur"
              >
                <p className="font-semibold">{i.title}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{i.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
