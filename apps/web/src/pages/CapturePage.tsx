import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { preprocessReceiptImage } from '../lib/image';
import {
  enqueueOutbox,
  getOutboxBlob,
  listOutbox,
  type OutboxMeta,
} from '../lib/outbox';
import { flushPendingOutbox } from '../lib/outbox-sync';

type QueueItem = { id: string; previewUrl: string; status: string };

export function CapturePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flushing, setFlushing] = useState(false);
  const navigate = useNavigate();
  const previewUrlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    void (async () => {
      const existing = await listOutbox();
      const items: QueueItem[] = [];
      for (const m of existing.filter((x) => x.status !== 'done')) {
        const blob = await getOutboxBlob(m.id);
        let previewUrl = '';
        if (blob) {
          previewUrl = URL.createObjectURL(blob);
          previewUrlsRef.current.set(m.id, previewUrl);
        }
        items.push({ id: m.id, previewUrl, status: labelFor(m) });
      }
      setQueue(items);
      if (navigator.onLine) {
        await runFlush();
      }
    })();

    return () => {
      for (const url of previewUrlsRef.current.values()) URL.revokeObjectURL(url);
      previewUrlsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runFlush() {
    setFlushing(true);
    setError(null);
    try {
      const { reviewIds, failures } = await flushPendingOutbox((id, status) => {
        setQueue((q) =>
          q.map((item) => (item.id === id ? { ...item, status } : item)),
        );
        if (status === 'Done') {
          const preview = previewUrlsRef.current.get(id);
          if (preview) {
            URL.revokeObjectURL(preview);
            previewUrlsRef.current.delete(id);
          }
        }
      });

      if (failures.length) {
        const first = failures[0]!;
        setError(
          first.offlineLikely
            ? 'Offline — receipts saved locally and will upload when you reconnect.'
            : first.message,
        );
      }

      if (reviewIds.length === 1) {
        navigate(`/receipts/${reviewIds[0]}`);
      } else if (reviewIds.length > 1) {
        navigate('/receipts?status=NEEDS_REVIEW');
      }
    } finally {
      setFlushing(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);

    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.set(id, previewUrl);
      setQueue((q) => [...q, { id, previewUrl, status: 'Processing…' }]);

      try {
        const { blob, hash } = await preprocessReceiptImage(file);
        await enqueueOutbox({ id, hash, blob });
        URL.revokeObjectURL(previewUrl);
        const processedPreview = URL.createObjectURL(blob);
        previewUrlsRef.current.set(id, processedPreview);
        setQueue((q) =>
          q.map((item) =>
            item.id === id
              ? { ...item, previewUrl: processedPreview, status: 'Queued' }
              : item,
          ),
        );
      } catch (err) {
        setQueue((q) =>
          q.map((item) =>
            item.id === id ? { ...item, status: 'Failed' } : item,
          ),
        );
        setError((err as Error).message || 'Could not process image');
      }
    }

    if (navigator.onLine) {
      await runFlush();
    } else {
      setError('Offline — receipts saved locally and will upload when you reconnect.');
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold">Capture</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          One tap from home. HEIC is converted when needed; images resize to 1600px and queue in
          IndexedDB until upload succeeds.
        </p>
      </section>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--brand-soft)] bg-[var(--surface)] text-center backdrop-blur"
      >
        <span className="brand text-4xl text-[var(--brand)]">Open camera</span>
        <span className="mt-2 max-w-xs text-sm text-[var(--ink-muted)]">
          Multi-shot queue works offline — sync resumes when you are back online.
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        multiple
        className="hidden"
        aria-label="Choose or take receipt photos"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <p className="text-center text-sm text-[var(--ink-muted)]">
        Photo failed?{' '}
        <Link to="/capture/manual" className="font-semibold text-[var(--brand-soft)]">
          Enter receipt manually
        </Link>
      </p>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {queue.some(
        (q) =>
          q.status.includes('Queued') ||
          q.status.includes('offline') ||
          q.status.startsWith('Failed'),
      ) && (
        <button
          type="button"
          disabled={flushing || !navigator.onLine}
          onClick={() => void runFlush()}
          className="rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {flushing ? 'Syncing…' : 'Retry outbox sync'}
        </button>
      )}

      {queue.length > 0 && (
        <ul className="space-y-3">
          {queue.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              {item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt=""
                  className="h-16 w-16 rounded-md object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-md bg-black/10" />
              )}
              <span className="text-sm font-medium">{item.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function labelFor(m: OutboxMeta) {
  if (m.status === 'failed') {
    if (m.error && !/offline|Failed to fetch|NetworkError/i.test(m.error)) {
      return `Failed: ${m.error}`;
    }
    return 'Queued (offline)';
  }
  if (m.status === 'uploading') return 'Uploading…';
  if (m.status === 'done') return 'Done';
  return 'Queued';
}
