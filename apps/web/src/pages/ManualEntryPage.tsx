import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../lib/api';
import { parseDollarsToCents } from '../lib/money';

type DraftLine = { rawText: string; extended: string; quantity: string };

export function ManualEntryPage() {
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [tax, setTax] = useState('0');
  const [total, setTotal] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { rawText: '', extended: '', quantity: '1' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const totalCents = parseDollarsToCents(total);
    const taxCents = parseDollarsToCents(tax) ?? 0;
    if (totalCents == null) {
      setError('Enter a printed total.');
      return;
    }
    const parsedLines = lines
      .map((l) => {
        const extendedCents = parseDollarsToCents(l.extended);
        const quantity = Number(l.quantity) || 1;
        if (!l.rawText.trim() || extendedCents == null) return null;
        return {
          rawText: l.rawText.trim(),
          quantity,
          extendedCents,
          discountCents: 0,
          unitPriceCents: quantity ? Math.round(extendedCents / quantity) : extendedCents,
        };
      })
      .filter(Boolean);
    if (parsedLines.length === 0) {
      setError('Add at least one line with text and amount.');
      return;
    }

    setBusy(true);
    try {
      const res = await api<{ receiptId: string }>('/receipts/manual', {
        method: 'POST',
        json: {
          storeName: storeName.trim() || undefined,
          purchasedAt: new Date(`${date}T12:00:00.000Z`).toISOString(),
          taxCents,
          totalCents,
          paymentMethod: paymentMethod.trim() || undefined,
          lines: parsedLines,
        },
      });
      navigate(`/receipts/${res.receiptId}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create receipt'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/capture" className="text-sm font-semibold text-[var(--brand-soft)]">
          ← Capture
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Enter receipt manually</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Use when the photo fails extraction or you only have a paper total. Lands on review to
          confirm.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm">
          Store
          <input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="Safeway"
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="block text-sm">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Tax $
            <input
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Printed total $
            <input
              required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Payment
            <input
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="VISA"
              className="mt-1 w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="font-semibold">Lines</legend>
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input
                aria-label={`Line ${i + 1} text`}
                value={l.rawText}
                onChange={(e) => updateLine(i, { rawText: e.target.value })}
                placeholder="Item as printed"
                className="min-w-[140px] flex-1 rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
              />
              <input
                aria-label={`Line ${i + 1} qty`}
                value={l.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
                className="w-16 rounded-md border border-[var(--line)] bg-white/80 px-2 py-2"
              />
              <input
                aria-label={`Line ${i + 1} amount`}
                value={l.extended}
                onChange={(e) => updateLine(i, { extended: e.target.value })}
                placeholder="$"
                className="w-24 rounded-md border border-[var(--line)] bg-white/80 px-2 py-2"
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  className="text-sm font-semibold text-[var(--danger)]"
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-semibold text-[var(--brand-soft)]"
            onClick={() =>
              setLines((prev) => [...prev, { rawText: '', extended: '', quantity: '1' }])
            }
          >
            + Add line
          </button>
        </fieldset>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-[var(--brand)] px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Continue to review'}
        </button>
      </form>
    </div>
  );
}
