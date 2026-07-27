import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type ReceiptDetail, type ReceiptLine } from '../lib/api';
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
    // Unmatched (no category) float to top; else keep print order
    return [...receipt.lines].sort((a, b) => {
      const aMiss = a.categoryId ? 1 : 0;
      const bMiss = b.categoryId ? 1 : 0;
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

  if (!receipt) {
    return <p className="text-[var(--ink-muted)]">{error ?? 'Loading receipt…'}</p>;
  }

  const delta = receipt.totalDeltaCents;
  const reconciled = delta == null ? false : Math.abs(delta) <= 2;

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
            {receipt.confidence != null ? ` · confidence ${(receipt.confidence * 100).toFixed(0)}%` : ''}
          </p>
        </div>
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
                (zoomable image viewer wires to object storage URL in deploy)
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
              onSave={(patch) => void saveLine(line, patch)}
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
  onSave,
}: {
  line: ReceiptLine;
  categories: Category[];
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [qty, setQty] = useState(String(line.quantity));
  const [price, setPrice] = useState(
    line.unitPriceCents != null ? (line.unitPriceCents / 100).toFixed(2) : '',
  );
  const [extended, setExtended] = useState((line.extendedCents / 100).toFixed(2));

  return (
    <div
      className={[
        'rounded-xl border px-3 py-3',
        line.categoryId
          ? 'border-[var(--line)] bg-[var(--surface)]'
          : 'border-[var(--accent)] bg-[#fff8f2]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{line.rawText}</p>
          <p className="text-xs text-[var(--ink-muted)]">Line {line.lineNumber}</p>
        </div>
        <p className="font-semibold tabular-nums">{formatCents(line.extendedCents)}</p>
      </div>

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
    </div>
  );
}
