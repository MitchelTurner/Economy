import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { blobToBase64, preprocessReceiptImage } from '../lib/image';
import { set as idbSet } from 'idb-keyval';

type QueueItem = { id: string; previewUrl: string; status: string };

export function CapturePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);

    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setQueue((q) => [...q, { id, previewUrl, status: 'Processing…' }]);

      try {
        const { blob, hash } = await preprocessReceiptImage(file);
        await idbSet(`outbox:${hash}`, blob);

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
            // fallback: send bytes with register
            imageBase64 = await blobToBase64(blob);
          }
        }

        const registered = await api<{ receiptId: string; deduped: boolean }>(
          '/receipts',
          {
            method: 'POST',
            json: { imageKey, imageHash: hash, imageBase64 },
          },
        );

        setQueue((q) =>
          q.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: registered.deduped ? 'Already uploaded' : 'Extracting…',
                }
              : item,
          ),
        );

        // Poll briefly then open review
        await waitForReview(registered.receiptId);
        navigate(`/receipts/${registered.receiptId}`);
        return;
      } catch (err) {
        setQueue((q) =>
          q.map((item) =>
            item.id === id ? { ...item, status: 'Failed' } : item,
          ),
        );
        setError((err as Error).message || 'Upload failed');
      }
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold">Capture</h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          One tap from home. Images are resized to 1600px and hashed for dedupe before upload.
        </p>
      </section>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--brand-soft)] bg-[var(--surface)] text-center backdrop-blur"
      >
        <span className="brand text-4xl text-[var(--brand)]">Open camera</span>
        <span className="mt-2 max-w-xs text-sm text-[var(--ink-muted)]">
          Or choose an existing photo. Multi-shot queue is offline-tolerant via IndexedDB.
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {queue.length > 0 && (
        <ul className="space-y-3">
          {queue.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <img
                src={item.previewUrl}
                alt=""
                className="h-16 w-16 rounded-md object-cover"
              />
              <span className="text-sm font-medium">{item.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
