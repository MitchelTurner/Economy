import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, apiErrorMessage, type ReceiptSummary } from '../lib/api';
import { formatCents } from '../lib/money';
import { toast } from '../lib/toast';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'NEEDS_REVIEW', label: 'Needs review' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'EXTRACTING', label: 'Extracting' },
] as const;

type Store = { id: string; name: string };

export function ReceiptsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const storeId = params.get('storeId') ?? '';
  const q = params.get('q') ?? '';
  const [items, setItems] = useState<ReceiptSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchDraft, setSearchDraft] = useState(q);

  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [storesError, setStoresError] = useState<string | null>(null);

  useEffect(() => {
    void api<Store[]>('/catalog/stores')
      .then((rows) => {
        setStores(rows);
        setStoresError(null);
      })
      .catch((err) => {
        setStoresError(apiErrorMessage(err, 'Could not load stores'));
      });
  }, []);

  useEffect(() => {
    setSearchDraft(q);
  }, [q]);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (storeId) qs.set('storeId', storeId);
    if (from) qs.set('from', new Date(`${from}T00:00:00.000Z`).toISOString());
    if (to) qs.set('to', new Date(`${to}T23:59:59.999Z`).toISOString());
    if (q.trim()) qs.set('q', q.trim());
    const query = qs.toString();
    setLoading(true);
    void api<{ items: ReceiptSummary[]; nextCursor: string | null }>(
      `/receipts${query ? `?${query}` : ''}`,
    )
      .then((r) => {
        setItems(r.items);
        setNextCursor(r.nextCursor);
      })
      .catch((err) => {
        setItems([]);
        setNextCursor(null);
        toast(apiErrorMessage(err, 'Could not load receipts'), 'danger');
      })
      .finally(() => setLoading(false));
  }, [status, from, to, storeId, q]);

  const hasInFlight = items.some(
    (r) => r.status === 'UPLOADED' || r.status === 'EXTRACTING',
  );

  useEffect(() => {
    if (!hasInFlight || loading) return;
    let inFlight = false;
    const poll = () => {
      if (document.visibilityState === 'hidden' || inFlight) return;
      inFlight = true;
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (storeId) qs.set('storeId', storeId);
      if (from) qs.set('from', new Date(`${from}T00:00:00.000Z`).toISOString());
      if (to) qs.set('to', new Date(`${to}T23:59:59.999Z`).toISOString());
      if (q.trim()) qs.set('q', q.trim());
      const query = qs.toString();
      void api<{ items: ReceiptSummary[]; nextCursor: string | null }>(
        `/receipts${query ? `?${query}` : ''}`,
      )
        .then((r) => {
          // Merge first-page updates without collapsing Load-more pagination.
          setItems((prev) => {
            const freshById = new Map(r.items.map((row) => [row.id, row]));
            const existingIds = new Set(prev.map((row) => row.id));
            const newcomers = r.items.filter((row) => !existingIds.has(row.id));
            const updated = prev.map((row) => freshById.get(row.id) ?? row);
            return [...newcomers, ...updated];
          });
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    };
    const t = window.setInterval(poll, 2500);
    document.addEventListener('visibilitychange', poll);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [hasInFlight, loading, status, from, to, storeId, q]);

  function setParam(key: string, value: string) {
    const n = new URLSearchParams(params);
    if (value) n.set(key, value);
    else n.delete(key);
    setParams(n);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setParam('q', searchDraft.trim());
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (storeId) qs.set('storeId', storeId);
      if (from) qs.set('from', new Date(`${from}T00:00:00.000Z`).toISOString());
      if (to) qs.set('to', new Date(`${to}T23:59:59.999Z`).toISOString());
      if (q.trim()) qs.set('q', q.trim());
      qs.set('cursor', nextCursor);
      const r = await api<{ items: ReceiptSummary[]; nextCursor: string | null }>(
        `/receipts?${qs.toString()}`,
      );
      setItems((prev) => [...prev, ...r.items]);
      setNextCursor(r.nextCursor);
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not load more'), 'danger');
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(id: string) {
    if (
      !confirm(
        'Delete this receipt and its image? If it was confirmed, its price observations for those lines are removed too.',
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      await api(`/receipts/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((r) => r.id !== id));
      toast('Receipt deleted', 'ok');
    } catch (err) {
      toast(apiErrorMessage(err, 'Delete failed'), 'danger');
    } finally {
      setDeletingId(null);
    }
  }

  async function retryExtract(id: string) {
    setRetryingId(id);
    try {
      await api(`/receipts/${id}/reextract`, { method: 'POST' });
      setItems((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: 'UPLOADED' } : r)),
      );
      toast('Extraction queued', 'ok');
    } catch (err) {
      toast(apiErrorMessage(err, 'Could not retry extraction'), 'danger');
    } finally {
      setRetryingId(null);
    }
  }

  function canRetry(r: ReceiptSummary) {
    if (r.status === 'FAILED' || r.status === 'UPLOADED') return true;
    if (r.status === 'EXTRACTING' && r.updatedAt) {
      return Date.now() - new Date(r.updatedAt).getTime() >= 5 * 60 * 1000;
    }
    return false;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Receipts</h1>
          <p className="mt-1 text-[var(--ink-muted)]">
            Filter by status, store, date, or search text / total.
          </p>
        </div>
        <div className="flex gap-3 text-sm font-semibold text-[var(--brand-soft)]">
          <Link to="/capture">Scan</Link>
          <Link to="/capture/manual">Manual</Link>
        </div>
      </div>

      <form onSubmit={onSearch} className="flex gap-2" role="search">
        <label className="block flex-1 text-sm">
          <span className="sr-only">Search receipts</span>
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Store, item text, or total like 42.17"
            className="w-full rounded-md border border-[var(--line)] bg-white/80 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Status filter">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            aria-pressed={status === f.value}
            onClick={() => setParam('status', f.value)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-semibold',
              status === f.value
                ? 'bg-[var(--brand)] text-white'
                : 'border border-[var(--line)] bg-[var(--surface)]',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {storesError && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {storesError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-[var(--ink-muted)]">
          Store
          <select
            value={storeId}
            onChange={(e) => setParam('storeId', e.target.value)}
            className="ml-2 rounded border border-[var(--line)] bg-white/90 px-2 py-1"
          >
            <option value="">Any</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--ink-muted)]">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setParam('from', e.target.value)}
            className="ml-2 rounded border border-[var(--line)] bg-white/90 px-2 py-1"
          />
        </label>
        <label className="text-xs text-[var(--ink-muted)]">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setParam('to', e.target.value)}
            className="ml-2 rounded border border-[var(--line)] bg-white/90 px-2 py-1"
          />
        </label>
      </div>

      {loading ? (
        <p className="py-8 text-center text-[var(--ink-muted)]">Loading receipts…</p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {items.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <Link
                  to={`/receipts/${r.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{r.store?.name ?? 'Unknown store'}</p>
                    <p className="text-sm text-[var(--ink-muted)]">
                      {r.purchasedAt
                        ? new Date(r.purchasedAt).toLocaleDateString()
                        : 'No date'}{' '}
                      · {r._count.lines} lines · {r.status}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">
                    {formatCents(r.totalCents)}
                  </p>
                </Link>
                {canRetry(r) ? (
                  <button
                    type="button"
                    className="shrink-0 text-xs font-semibold text-[var(--brand-soft)] disabled:opacity-50"
                    disabled={retryingId === r.id}
                    aria-busy={retryingId === r.id}
                    onClick={() => void retryExtract(r.id)}
                  >
                    Retry
                  </button>
                ) : null}
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-[var(--danger)] disabled:opacity-50"
                  disabled={deletingId === r.id}
                  aria-busy={deletingId === r.id}
                  onClick={() => void remove(r.id)}
                >
                  {deletingId === r.id ? 'Deleting…' : 'Delete'}
                </button>
              </li>
            ))}
            {items.length === 0 && (
              <li className="space-y-3 py-8 text-center text-[var(--ink-muted)]">
                <p>No receipts match these filters.</p>
                <p>
                  <Link to="/capture" className="font-semibold text-[var(--brand-soft)]">
                    Scan a receipt
                  </Link>
                  {' · '}
                  <Link to="/capture/manual" className="font-semibold text-[var(--brand-soft)]">
                    Enter manually
                  </Link>
                </p>
              </li>
            )}
          </ul>
          {nextCursor && (
            <button
              type="button"
              disabled={loadingMore}
              aria-busy={loadingMore}
              onClick={() => void loadMore()}
              className="w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
