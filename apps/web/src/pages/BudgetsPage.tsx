import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatCents, parseDollarsToCents } from '../lib/money';

type Budget = {
  id: string;
  amountCents: number;
  period: string;
  categoryId?: string | null;
  category: { id: string; name: string } | null;
};

type Category = { id: string; name: string; slug: string };

type SpendResponse = {
  totalCents: number;
  groups: Array<{ key: string; label: string; totalCents: number }>;
};

export function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [spend, setSpend] = useState<SpendResponse | null>(null);
  const [amount, setAmount] = useState('250');
  const [period, setPeriod] = useState<'WEEKLY' | 'MONTHLY'>('MONTHLY');
  const [categoryId, setCategoryId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');

  async function load() {
    const [b, c, s] = await Promise.all([
      api<Budget[]>('/budgets'),
      api<Category[]>('/catalog/categories'),
      api<SpendResponse>('/analytics/spend?groupBy=category'),
    ]);
    setBudgets(b);
    setCategories(c);
    setSpend(s);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const amountCents = parseDollarsToCents(amount);
    if (amountCents == null) return;
    const startsOn =
      period === 'WEEKLY'
        ? startOfWeekIso()
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    await api('/budgets', {
      method: 'POST',
      json: {
        amountCents,
        period,
        categoryId: categoryId || null,
        startsOn,
      },
    });
    setAmount('');
    setCategoryId('');
    await load();
  }

  async function saveEdit(id: string) {
    const amountCents = parseDollarsToCents(editAmount);
    if (amountCents == null) return;
    await api(`/budgets/${id}`, {
      method: 'PATCH',
      json: { amountCents },
    });
    setEditingId(null);
    await load();
  }

  async function remove(id: string) {
    await api(`/budgets/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Budgets</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Weekly or monthly caps by category. Insights warn when spend projects over pace.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-4">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="rounded-md border border-[var(--line)] bg-white/80 px-3 py-2 sm:col-span-1"
        />
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as 'WEEKLY' | 'MONTHLY')}
          className="rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
        >
          <option value="MONTHLY">Monthly</option>
          <option value="WEEKLY">Weekly</option>
        </select>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
        >
          <option value="">Overall</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-[var(--brand)] px-4 py-2 font-semibold text-white"
        >
          Add budget
        </button>
      </form>

      {budgets.length === 0 && (
        <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-sm text-[var(--ink-muted)]">
          No budgets yet. Add one above — or{' '}
          <Link to="/capture" className="font-semibold text-[var(--brand-soft)]">
            confirm a few receipts
          </Link>{' '}
          first so category spend has something to pace against.
        </p>
      )}

      <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {budgets.map((b) => {
          const spent = b.category
            ? (spend?.groups.find((g) => g.label === b.category!.name)?.totalCents ?? 0)
            : (spend?.totalCents ?? 0);
          const pct = b.amountCents ? Math.round((spent / b.amountCents) * 100) : 0;
          return (
            <li key={b.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span>
                  {b.category?.name ?? 'Overall'} · {b.period.toLowerCase()}
                </span>
                {editingId === b.id ? (
                  <div className="flex gap-2">
                    <input
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-24 rounded-md border border-[var(--line)] px-2 py-1"
                    />
                    <button
                      type="button"
                      className="text-sm font-semibold text-[var(--brand)]"
                      onClick={() => void saveEdit(b.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="text-sm text-[var(--ink-muted)]"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span className="font-semibold tabular-nums">
                    {formatCents(spent)} / {formatCents(b.amountCents)}
                  </span>
                )}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-[var(--brand)]"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-xs text-[var(--ink-muted)]">{pct}% of period budget</p>
                <div className="flex gap-3 text-xs">
                  <button
                    type="button"
                    className="font-semibold text-[var(--brand)]"
                    onClick={() => {
                      setEditingId(b.id);
                      setEditAmount((b.amountCents / 100).toFixed(2));
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="font-semibold text-[var(--danger)]"
                    onClick={() => void remove(b.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function startOfWeekIso() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
