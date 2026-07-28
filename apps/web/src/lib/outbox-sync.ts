import { api, apiErrorMessage } from './api';
import { blobToBase64 } from './image';
import {
  getOutboxBlob,
  patchOutbox,
  pendingOutbox,
  removeOutbox,
  type OutboxMeta,
} from './outbox';

export type FlushResult = {
  reviewIds: string[];
  failures: Array<{ id: string; message: string; offlineLikely: boolean }>;
};

function isOfflineLikely(err: unknown): boolean {
  if (!navigator.onLine) return true;
  const msg = (err as Error)?.message ?? String(err);
  return /Failed to fetch|NetworkError|Load failed|offline/i.test(msg);
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
    const receipt = await api<{ status: string; failureReason?: string | null }>(
      `/receipts/${receiptId}`,
    );
    if (receipt.status === 'FAILED') {
      throw new Error(receipt.failureReason || 'Extraction failed');
    }
    if (receipt.status === 'NEEDS_REVIEW' || receipt.status === 'CONFIRMED') {
      return;
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error('Extraction timed out — open Receipts to check status');
}

let flushing = false;

/** Flush IndexedDB outbox; safe to call from Capture or shell (single-flight). */
export async function flushPendingOutbox(
  onItem?: (id: string, status: string) => void,
): Promise<FlushResult> {
  if (flushing) return { reviewIds: [], failures: [] };
  flushing = true;
  const reviewIds: string[] = [];
  const failures: FlushResult['failures'] = [];
  try {
    const pending = await pendingOutbox();
    for (const meta of pending) {
      onItem?.(meta.id, 'Uploading…');
      try {
        const receiptId = await uploadFromOutbox(meta);
        reviewIds.push(receiptId);
        onItem?.(meta.id, 'Extracting…');
        await waitForReview(receiptId);
        await removeOutbox(meta.id);
        onItem?.(meta.id, 'Done');
      } catch (err) {
        const message = apiErrorMessage(err, 'Upload failed');
        const offlineLikely = isOfflineLikely(err);
        await patchOutbox(meta.id, { status: 'failed', error: message });
        onItem?.(
          meta.id,
          offlineLikely ? 'Queued (offline)' : `Failed: ${message}`,
        );
        failures.push({ id: meta.id, message, offlineLikely });
      }
    }
  } finally {
    flushing = false;
  }
  return { reviewIds, failures };
}
