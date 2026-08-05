import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../lib/api';
import { formatCents, parseDollarsToCents } from '../lib/money';
import { toast } from '../lib/toast';

type Budget = {
  id: string;
  amountCents: number;
  period: string;
  categoryId?: string | null;
  category: { id: string; name: string } | null;
};

type Category = { id: string; name: string; slug: string };

type SpendResponse = {
  from: string;
  to: string;
  totalCents: number;
  groups: Array<{ key: string; label: string; totalCents: number }>;
};

export function BudgetsPage() {
  const [params] = useSearchParams();
  const highlightCategoryId = params.get('categoryId');
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [weekSpend, setWeekSpend] = useState<SpendResponse | null>(null);
  const [monthSpend, setMonthSpend] = useState<SpendResponse | null>(null);
  const [amount, setAmount] = useState('250');
  const [period, setPeriod] = useState<'WEEKLY' | 'MONTHLY'>('MONTHLY');
  const [categoryId, setCategoryId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (highlightCategoryId) setCategoryId(highlightCategoryId);
  }, [highlightCategoryId]);

  useEffect(() => {
    if (!highlightCategoryId || loading) return;
    const el = document.getElementById(`budget-cat-${highlightCategoryId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightCategoryId, loading, budgets]);

  async function load() {
    const weekFrom = startOfWeekIso();
    const weekTo = endOfPeriodIso(weekFrom, 7);
    const monthFrom = startOfMonthIso();
    const monthTo = endOfMonthIso();
    setLoading(true);
    setLoadError(null);
    try {
      const [b, c, week, month] = await Promise.all([
        api<Budget[]>('/budgets'),
        api<Category[]>('/catalog/categories'),
        api<SpendResponse>(
          `/analytics/spend?groupBy=category&from=${encodeURIComponent(weekFrom)}&to=${encodeURIComponent(weekTo)}`,
        ),
        api<SpendResponse>(
          `/analytics/spend?groupBy=category&from=${encodeURIComponent(monthFrom)}&to=${encodeURIComponent(monthTo)}`,
        ),
      ]);
      setBudgets(b);
      setCategories(c);
      setWeekSpend(week);
      setMonthSpend(month);
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'Could not load budgets'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const amountCents = parseDollarsToCents(amount);
    if (amountCents == null) {
      toast('Enter a valid dollar amount', 'danger');
      return;
    }
    const startsOn =
      period === 'WEEKLY' ? startOfWeekIso() : startOfMonthIso();
    setBusy(true);
    try {
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
      toast('Budget added', 'ok');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not add budget'), 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    const amountCents = parseDollarsToCents(editAmount);
    if (amountCents == null) {
      toast('Enter a valid dollar amount', 'danger');
      return;
    }
    setActionId(id);
    try {
      await api(`/budgets/${id}`, {
        method: 'PATCH',
        json: { amountCents },
      });
      setEditingId(null);
      toast('Budget updated', 'ok');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'Update failed'), 'danger');
    } finally {
      setActionId(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this budget?')) return;
    setActionId(id);
    try {
      await api(`/budgets/${id}`, { method: 'DELETE' });
      toast('Budget deleted', 'ok');
      await load();
    } catch (err) {
      toast(apiErrorMessage(err, 'Delete failed'), 'danger');
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Budgets</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Weekly or monthly caps by category. Progress uses the current week or month window.
        </p>
      </div>

      {loadError && (
        <p className="border-l-4 border-[var(--danger)] bg-[var(--surface)] px-4 py-3 text-sm" role="alert">
          {loadError}{' '}
          <button
            type="button"
            className="font-semibold text-[var(--brand-soft)]"
            onClick={() => void load()}
          >
            Retry
          </button>
        </p>
      )}
      {loading && budgets.length === 0 && !loadError && (
        <p className="text-sm text-[var(--ink-muted)]">Loading budgets…</p>
      )}

      <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-4" aria-label="Add budget">
        <label className="text-sm sm:col-span-1">
          Amount ($)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="250"
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Period
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'WEEKLY' | 'MONTHLY')}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          >
            <option value="MONTHLY">Monthly</option>
            <option value="WEEKLY">Weekly</option>
          </select>
        </label>
        <label className="text-sm">
          Category
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          >
            <option value="">Overall</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="self-end rounded-md bg-[var(--brand)] px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Add budget'}
        </button>
      </form>

      {!loading && !loadError && budgets.length === 0 && (
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
          const spend = b.period === 'WEEKLY' ? weekSpend : monthSpend;
          const spent = b.category
            ? (spend?.groups.find((g) => g.label === b.category!.name)?.totalCents ?? 0)
            : (spend?.totalCents ?? 0);
          const pct = b.amountCents ? Math.round((spent / b.amountCents) * 100) : 0;
          const windowLabel =
            b.period === 'WEEKLY'
              ? 'this week'
              : 'this month';
          const highlighted =
            highlightCategoryId != null &&
            (b.categoryId === highlightCategoryId ||
              (!b.categoryId && highlightCategoryId === ''));
          return (
            <li
              key={b.id}
              id={b.categoryId ? `budget-cat-${b.categoryId}` : 'budget-overall'}
              className={[
                'py-3',
                highlighted ? 'bg-[var(--brand)]/5 ring-1 ring-[var(--brand)]/30' : '',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span>
                  {b.category?.name ?? 'Overall'} · {b.period.toLowerCase()}
                  <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">
                    Pace for {windowLabel}
                  </span>
                </span>
                {editingId === b.id ? (
                  <div className="flex gap-2">
                    <label className="sr-only" htmlFor={`edit-${b.id}`}>
                      Edit amount
                    </label>
                    <input
                      id={`edit-${b.id}`}
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-24 rounded-md border border-[var(--line)] px-2 py-1"
                    />
                    <button
                      type="button"
                      className="text-sm font-semibold text-[var(--brand)] disabled:opacity-50"
                      disabled={actionId === b.id}
                      aria-busy={actionId === b.id}
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
                <p className="text-xs text-[var(--ink-muted)]">
                  {pct}% of {windowLabel} budget
                </p>
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
                    className="font-semibold text-[var(--danger)] disabled:opacity-50"
                    disabled={actionId === b.id}
                    aria-busy={actionId === b.id}
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

function startOfMonthIso() {
  return new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();
}

function endOfMonthIso() {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  ).toISOString();
}

function endOfPeriodIso(startIso: string, days: number) {
  const d = new Date(startIso);
  d.setUTCDate(d.getUTCDate() + days - 1);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}
