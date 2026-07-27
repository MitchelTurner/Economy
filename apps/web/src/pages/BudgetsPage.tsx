import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatCents, parseDollarsToCents } from '../lib/money';

type Budget = {
  id: string;
  amountCents: number;
  period: string;
  category: { id: string; name: string } | null;
};

type SpendResponse = {
  totalCents: number;
  groups: Array<{ key: string; label: string; totalCents: number }>;
};

export function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spend, setSpend] = useState<SpendResponse | null>(null);
  const [amount, setAmount] = useState('250');

  async function load() {
    setBudgets(await api<Budget[]>('/budgets'));
    setSpend(await api<SpendResponse>('/analytics/spend?groupBy=category'));
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const amountCents = parseDollarsToCents(amount);
    if (amountCents == null) return;
    await api('/budgets', {
      method: 'POST',
      json: {
        amountCents,
        period: 'MONTHLY',
        startsOn: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      },
    });
    setAmount('');
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Budgets</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Monthly caps. Insights warn when spend projects over pace.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="flex-1 rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-md bg-[var(--brand)] px-4 py-2 font-semibold text-white"
        >
          Add monthly
        </button>
      </form>

      <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {budgets.map((b) => {
          const spent = b.category
            ? (spend?.groups.find((g) => g.label === b.category!.name)?.totalCents ?? 0)
            : (spend?.totalCents ?? 0);
          const pct = b.amountCents ? Math.round((spent / b.amountCents) * 100) : 0;
          return (
            <li key={b.id} className="py-3">
              <div className="flex justify-between gap-3">
                <span>
                  {b.category?.name ?? 'Overall'} · {b.period.toLowerCase()}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatCents(spent)} / {formatCents(b.amountCents)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-[var(--brand)]"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">{pct}% of period budget</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
