import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  type MatchSuggestion,
  type Product,
  type ReceiptDetail,
  type ReceiptLine,
} from '../lib/api';
import { formatCents, parseDollarsToCents } from '../lib/money';

type Category = { id: string; name: string; slug: string; children?: Category[] };

export function ReceiptReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState(false);

  async function reload() {
    if (!id) return;
    const [r, cats] = await Promise.all([
      api<ReceiptDetail>(`/receipts/${id}`),
      api<Category[]>('/catalog/categories'),
    ]);
    setReceipt(r);
    setCategories(cats.flatMap((c) => [c, ...(c.children ?? [])]));
  }

  useEffect(() => {
    void reload().catch((e) => setError((e as Error).message));
  }, [id]);

  const sortedLines = useMemo(() => {
    if (!receipt) return [];
    // Unmatched products float to the top; else keep print order
    return [...receipt.lines].sort((a, b) => {
      const aMiss = a.productId ? 1 : 0;
      const bMiss = b.productId ? 1 : 0;
      if (aMiss !== bMiss) return aMiss - bMiss;
      return a.lineNumber - b.lineNumber;
    });
  }, [receipt]);

  async function saveLine(line: ReceiptLine, patch: Record<string, unknown>) {
    if (!id) return;
    await api(`/receipts/${id}/lines/${line.id}`, { method: 'PATCH', json: patch });
    await reload();
  }

  async function confirm() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/receipts/${id}/confirm`, {
        method: 'POST',
        json: { overrideArithmetic: override },
      });
      navigate('/receipts');
    } catch (err) {
      const detail = (err as { detail?: { message?: string } }).detail;
      setError(detail?.message ?? (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sameAsLast() {
    if (!id) return;
    const res = await api<{ applied: number }>(`/receipts/${id}/same-as-last`, {
      method: 'POST',
    });
    await reload();
    if (res.applied === 0) setError('No prior confirmed trip at this store to copy from.');
  }

  if (!receipt) {
    return <p className="text-[var(--ink-muted)]">{error ?? 'Loading receipt…'}</p>;
  }

  const delta = receipt.totalDeltaCents;
  const reconciled = delta == null ? false : Math.abs(delta) <= 2;
  const unmatched = receipt.unmatchedCount ?? receipt.lines.filter((l) => !l.productId).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/receipts" className="text-sm font-semibold text-[var(--brand-soft)]">
            ← Receipts
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">
            {receipt.store?.name ?? 'Review receipt'}
          </h1>
          <p className="text-sm text-[var(--ink-muted)]">
            {receipt.status}
            {receipt.confidence != null
              ? ` · confidence ${(receipt.confidence * 100).toFixed(0)}%`
              : ''}
            {unmatched > 0 ? ` · ${unmatched} unmatched` : ' · all matched'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void sameAsLast()}
          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold"
        >
          Same as last time at this store
        </button>
        <button
          type="button"
          onClick={() =>
            void api(`/receipts/${id}/rematch`, { method: 'POST' }).then(() => reload())
          }
          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold"
        >
          Re-run matching
        </button>
      </div>

      {receipt.failureReason && (
        <p className="border-l-4 border-[var(--warn)] bg-[var(--surface)] px-3 py-2 text-sm">
          {receipt.failureReason}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-black/5">
          <div className="flex h-64 items-center justify-center bg-[linear-gradient(160deg,#1a6b59,#0c4a3e)] text-center text-white/80 lg:h-full lg:min-h-[420px]">
            <div className="px-6">
              <p className="brand text-2xl">Receipt image</p>
              <p className="mt-2 text-sm">
                Key: {receipt.imageKey}
                <br />
                Lines stay in print order; unmatched float to the top of the list.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {sortedLines.map((line) => (
            <LineEditor
              key={line.id}
              line={line}
              categories={categories}
              storeId={receipt.store?.id}
              onSave={(patch) => void saveLine(line, patch)}
              onApplyCategorySimilar={async (categoryId) => {
                await api(`/receipts/${id}/lines/${line.id}/apply-category-similar`, {
                  method: 'POST',
                  json: { categoryId },
                });
                await reload();
              }}
            />
          ))}
        </div>
      </div>

      <div className="sticky bottom-20 space-y-3 rounded-2xl border border-[var(--line)] bg-[rgba(238,244,240,0.95)] p-4 backdrop-blur md:bottom-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--ink-muted)]">Running total</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCents(receipt.runningTotalCents)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-[var(--ink-muted)]">Printed total</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCents(receipt.totalCents)}
            </p>
            <p
              className={`text-sm font-semibold ${
                reconciled ? 'text-[var(--ok)]' : 'text-[var(--danger)]'
              }`}
            >
              Diff {formatCents(delta, { signed: true })}
            </p>
          </div>
        </div>

        {!reconciled && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            Override and confirm anyway
          </label>
        )}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <button
          type="button"
          disabled={busy || (!reconciled && !override)}
          onClick={() => void confirm()}
          className="w-full rounded-md bg-[var(--brand)] px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Confirming…' : 'Confirm receipt'}
        </button>
      </div>
    </div>
  );
}

function LineEditor({
  line,
  categories,
  storeId,
  onSave,
  onApplyCategorySimilar,
}: {
  line: ReceiptLine;
  categories: Category[];
  storeId?: string;
  onSave: (patch: Record<string, unknown>) => void;
  onApplyCategorySimilar: (categoryId: string) => Promise<void>;
}) {
  const [qty, setQty] = useState(String(line.quantity));
  const [price, setPrice] = useState(
    line.unitPriceCents != null ? (line.unitPriceCents / 100).toFixed(2) : '',
  );
  const [extended, setExtended] = useState((line.extendedCents / 100).toFixed(2));
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Product[]>([]);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void api<Product[]>(`/catalog/products?q=${encodeURIComponent(search)}`).then(setResults);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  async function bindProduct(productId: string) {
    onSave({ productId });
    setSearch('');
    setResults([]);
  }

  async function createAndBind() {
    if (!search.trim() || !categories[0]) return;
    const dairy =
      categories.find((c) => c.slug === 'dairy') ??
      categories.find((c) => c.slug === 'other') ??
      categories[0];
    const created = await api<Product>('/catalog/products', {
      method: 'POST',
      json: { name: search.trim(), categoryId: dairy.id },
    });
    if (storeId) {
      await api('/catalog/aliases', {
        method: 'POST',
        json: { rawText: line.rawText, productId: created.id, storeId },
      });
    }
    await bindProduct(created.id);
  }

  return (
    <div
      className={[
        'rounded-xl border px-3 py-3',
        line.productId
          ? 'border-[var(--line)] bg-[var(--surface)]'
          : 'border-[var(--accent)] bg-[#fff8f2]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{line.rawText}</p>
          <p className="text-xs text-[var(--ink-muted)]">
            Line {line.lineNumber}
            {line.matchMethod
              ? ` · ${line.matchMethod}${
                  line.matchConfidence != null
                    ? ` (${Math.round(line.matchConfidence * 100)}%)`
                    : ''
                }`
              : ' · unmatched'}
          </p>
          {line.product && (
            <p className="mt-1 text-sm text-[var(--brand)]">{line.product.name}</p>
          )}
        </div>
        <p className="font-semibold tabular-nums">{formatCents(line.extendedCents)}</p>
      </div>

      {!line.productId && (line.suggestions?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {line.suggestions!.map((s: MatchSuggestion) => (
            <button
              key={s.productId}
              type="button"
              onClick={() => void bindProduct(s.productId)}
              className="rounded-md bg-[var(--brand)]/10 px-2 py-1 text-xs font-semibold text-[var(--brand)]"
            >
              {s.name}
              {s.sizeLabel ? ` · ${s.sizeLabel}` : ''}
            </button>
          ))}
        </div>
      )}

      {!line.productId && (
        <div className="mt-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or create product…"
            className="w-full rounded border border-[var(--line)] bg-white/90 px-2 py-1.5 text-sm"
          />
          {results.length > 0 && (
            <ul className="mt-1 max-h-36 overflow-auto border border-[var(--line)] bg-white text-sm">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="block w-full px-2 py-1.5 text-left hover:bg-[var(--bg)]"
                    onClick={() => void bindProduct(p.id)}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {search.trim() && (
            <button
              type="button"
              className="mt-1 text-xs font-semibold text-[var(--brand-soft)]"
              onClick={() => void createAndBind()}
            >
              Create “{search.trim()}” and bind
            </button>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="text-xs">
          Qty
          <input
            className="mt-1 w-full rounded border border-[var(--line)] bg-white/90 px-2 py-1.5"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => {
              const n = Number(qty);
              if (!Number.isNaN(n) && n > 0) onSave({ quantity: n });
            }}
          />
        </label>
        <label className="text-xs">
          Unit $
          <input
            className="mt-1 w-full rounded border border-[var(--line)] bg-white/90 px-2 py-1.5"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => {
              const cents = parseDollarsToCents(price);
              if (cents != null) onSave({ unitPriceCents: cents });
            }}
          />
        </label>
        <label className="text-xs">
          Ext $
          <input
            className="mt-1 w-full rounded border border-[var(--line)] bg-white/90 px-2 py-1.5"
            value={extended}
            onChange={(e) => setExtended(e.target.value)}
            onBlur={() => {
              const cents = parseDollarsToCents(extended);
              if (cents != null) onSave({ extendedCents: cents });
            }}
          />
        </label>
      </div>

      <label className="mt-2 block text-xs">
        Category
        <select
          className="mt-1 w-full rounded border border-[var(--line)] bg-white/90 px-2 py-1.5"
          value={line.categoryId ?? ''}
          onChange={(e) => onSave({ categoryId: e.target.value || null })}
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {line.categoryId && (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-[var(--brand-soft)]"
          onClick={() => void onApplyCategorySimilar(line.categoryId!)}
        >
          Apply category to all similar
        </button>
      )}
    </div>
  );
}
