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
  type: string;
  estimatedSavingsCents: number | null;
};

type Budget = {
  id: string;
  amountCents: number;
  category: { name: string } | null;
};

type Behavior = {
  deltaTotalCents: number;
  deltaPriceCents: number;
  deltaBehaviorCents: number;
  priorSpendCents: number;
  currentSpendCents: number;
};

export function DashboardPage() {
  const [spend, setSpend] = useState<SpendResponse | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [behavior, setBehavior] = useState<Behavior | null>(null);

  useEffect(() => {
    void api<SpendResponse>('/analytics/spend?groupBy=category').then(setSpend);
    void api<Insight[]>('/insights?active=true').then((rows) => setInsights(rows.slice(0, 3)));
    void api<Budget[]>('/budgets').then(setBudgets);
    void api<Behavior>('/insights/behavior').then(setBehavior).catch(() => undefined);
  }, []);

  const groceryBudget = budgets[0];
  const pacePct =
    groceryBudget && spend
      ? Math.min(150, Math.round((spend.totalCents / groceryBudget.amountCents) * 100))
      : null;

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
          {groceryBudget && pacePct != null && (
            <p className="mt-2 text-white/85">
              {pacePct}% of {formatCents(groceryBudget.amountCents)}{' '}
              {groceryBudget.category?.name ?? 'overall'} budget
            </p>
          )}
          <p className="mt-2 max-w-md text-white/85">
            Confirmed grocery spend for your household. Tap Capture to add the next receipt.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/capture"
              className="inline-flex rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Capture receipt
            </Link>
            <Link
              to="/insights"
              className="inline-flex rounded-md border border-white/40 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Weekly digest
            </Link>
          </div>
        </div>
      </section>

      {behavior && (behavior.priorSpendCents > 0 || behavior.currentSpendCents > 0) && (
        <section>
          <h2 className="text-2xl font-semibold">Prices vs behavior</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Month-over-month split: inflation held at prior basket vs what you actually bought.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs uppercase text-[var(--ink-muted)]">Δ total</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatCents(behavior.deltaTotalCents, { signed: true })}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-[var(--ink-muted)]">Δ prices</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatCents(behavior.deltaPriceCents, { signed: true })}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-[var(--ink-muted)]">Δ behavior</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatCents(behavior.deltaBehaviorCents, { signed: true })}
              </p>
            </div>
          </div>
        </section>
      )}

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
            Run generate from Insights after seeding history, or confirm a few more receipts.
          </p>
        ) : (
          <ul className="space-y-3">
            {insights.map((i) => (
              <li
                key={i.id}
                className="border-l-4 border-[var(--accent)] bg-[var(--surface)] px-4 py-3 backdrop-blur"
              >
                <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                  {i.type.replace(/_/g, ' ')}
                </p>
                <p className="font-semibold">{i.title}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{i.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <Link
          to="/prices/index"
          className="block border-l-4 border-[var(--brand)] bg-[var(--surface)] px-4 py-3"
        >
          <p className="font-semibold">Island cost-of-goods index</p>
          <p className="text-sm text-[var(--ink-muted)]">
            Staples-25 basket rollups by store and region
          </p>
        </Link>
      </section>
    </div>
  );
}
