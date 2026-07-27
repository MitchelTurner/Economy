import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatCents } from '../lib/money';

type Insight = {
  id: string;
  title: string;
  body: string;
  severity: string;
  estimatedSavingsCents: number | null;
};

export function InsightsPage() {
  const [items, setItems] = useState<Insight[]>([]);

  async function load() {
    setItems(await api<Insight[]>('/insights?active=true'));
  }

  useEffect(() => {
    void load();
  }, []);

  async function dismiss(id: string) {
    await api(`/insights/${id}/dismiss`, { method: 'POST' });
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Insights</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Deterministic rules, narrated copy — dollar figures always come from stored data.
        </p>
      </div>

      <ul className="space-y-4">
        {items.map((i) => (
          <li
            key={i.id}
            className="border-l-4 border-[var(--brand)] bg-[var(--surface)] px-4 py-3 backdrop-blur"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                  {i.severity}
                </p>
                <p className="mt-1 font-semibold">{i.title}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{i.body}</p>
                {i.estimatedSavingsCents != null && (
                  <p className="mt-2 text-sm font-semibold text-[var(--brand)]">
                    ~{formatCents(i.estimatedSavingsCents)} at stake
                  </p>
                )}
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-[var(--ink-muted)]"
                onClick={() => void dismiss(i.id)}
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-[var(--ink-muted)]">No active insights.</li>
        )}
      </ul>
    </div>
  );
}
