import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { blobToBase64, preprocessReceiptImage } from '../lib/image';
import {
  enqueueOutbox,
  getOutboxBlob,
  listOutbox,
  OutboxMeta,
  patchOutbox,
  pendingOutbox,
  removeOutbox,
} from '../lib/outbox';

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
        await flushOutbox();
      }
    })();

    const onOnline = () => {
      void flushOutbox();
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      for (const url of previewUrlsRef.current.values()) URL.revokeObjectURL(url);
      previewUrlsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function flushOutbox() {
    if (flushing) return;
    setFlushing(true);
    setError(null);
    const reviewIds: string[] = [];
    try {
      const pending = await pendingOutbox();
      for (const meta of pending) {
        setQueue((q) =>
          q.map((item) =>
            item.id === meta.id ? { ...item, status: 'Uploading…' } : item,
          ),
        );
        try {
          const receiptId = await uploadFromOutbox(meta);
          reviewIds.push(receiptId);
          setQueue((q) =>
            q.map((item) =>
              item.id === meta.id ? { ...item, status: 'Extracting…' } : item,
            ),
          );
          await waitForReview(receiptId);
          await removeOutbox(meta.id);
          const preview = previewUrlsRef.current.get(meta.id);
          if (preview) {
            URL.revokeObjectURL(preview);
            previewUrlsRef.current.delete(meta.id);
          }
          setQueue((q) =>
            q.map((item) =>
              item.id === meta.id ? { ...item, status: 'Done' } : item,
            ),
          );
        } catch (err) {
          await patchOutbox(meta.id, {
            status: 'failed',
            error: (err as Error).message,
          });
          setQueue((q) =>
            q.map((item) =>
              item.id === meta.id ? { ...item, status: 'Queued (offline)' } : item,
            ),
          );
          setError((err as Error).message || 'Upload failed — saved to outbox');
        }
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
        // Prefer processed JPEG preview
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
      await flushOutbox();
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
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {queue.some((q) => q.status.includes('Queued') || q.status.includes('offline')) && (
        <button
          type="button"
          disabled={flushing || !navigator.onLine}
          onClick={() => void flushOutbox()}
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
  if (m.status === 'failed') return 'Queued (offline)';
  if (m.status === 'uploading') return 'Uploading…';
  if (m.status === 'done') return 'Done';
  return 'Queued';
}

async function uploadFromOutbox(meta: OutboxMeta): Promise<string> {
  const blob = await getOutboxBlob(meta.id);
  if (!blob) throw new Error('Outbox image missing');
  await patchOutbox(meta.id, { status: 'uploading' });

  const { uploadUrl, imageKey } = await api<{ uploadUrl: string; imageKey: string }>(
    '/receipts/upload-url',
    { method: 'POST', json: { contentType: 'image/jpeg', extension: 'jpg' } },
  );

  let imageBase64: string | undefined;
  if (uploadUrl.startsWith('memory://')) {
    imageBase64 = await blobToBase64(blob);
  } else {
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    });
    if (!put.ok) {
      imageBase64 = await blobToBase64(blob);
    }
  }

  const registered = await api<{ receiptId: string; deduped: boolean }>(
    '/receipts',
    {
      method: 'POST',
      json: { imageKey, imageHash: meta.hash, imageBase64 },
    },
  );
  await patchOutbox(meta.id, {
    status: 'done',
    receiptId: registered.receiptId,
  });
  return registered.receiptId;
}

async function waitForReview(receiptId: string) {
  for (let i = 0; i < 20; i++) {
    const receipt = await api<{ status: string }>(`/receipts/${receiptId}`);
    if (
      receipt.status === 'NEEDS_REVIEW' ||
      receipt.status === 'FAILED' ||
      receipt.status === 'CONFIRMED'
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 750));
  }
}
