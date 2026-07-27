import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatCents } from '../lib/money';

type Product = {
  id: string;
  name: string;
  sizeValue: string | null;
  sizeUom: string | null;
  category: { name: string };
};

export function PricesPage() {
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<
    Array<{ observedAt: string; unitPriceCents: number; store: { name: string } }>
  >([]);
  const [selected, setSelected] = useState<Product | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      void api<Product[]>(`/catalog/products?q=${encodeURIComponent(q)}`).then(setProducts);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function openProduct(p: Product) {
    setSelected(p);
    const rows = await api<typeof history>(`/prices/product/${p.id}/history`);
    setHistory(rows);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Prices</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Per-unit history across stores — Phase 1 fills in as products are matched.
        </p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search products"
        className="w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
      />

      <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {products.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between py-3 text-left"
              onClick={() => void openProduct(p)}
            >
              <span>
                <span className="font-semibold">{p.name}</span>
                <span className="mt-0.5 block text-sm text-[var(--ink-muted)]">
                  {p.category.name}
                  {p.sizeValue ? ` · ${p.sizeValue} ${p.sizeUom}` : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <section>
          <h2 className="text-xl font-semibold">{selected.name}</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-[var(--ink-muted)]">No observations yet for this item.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {history.map((h, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span>
                    {new Date(h.observedAt).toLocaleDateString()} · {h.store.name}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatCents(h.unitPriceCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
