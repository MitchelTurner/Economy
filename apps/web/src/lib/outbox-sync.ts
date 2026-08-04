import { api, apiErrorMessage } from './api';
import { blobToBase64 } from './image';
import {
  getOutboxBlob,
  patchOutbox,
  pendingOutbox,
  removeOutbox,
  type OutboxMeta,
} from './outbox';

export type SyncFailureKind = 'device-offline' | 'api-unreachable' | 'error';

export type FlushResult = {
  reviewIds: string[];
  failures: Array<{
    id: string;
    message: string;
    kind: SyncFailureKind;
    /** @deprecated use kind — true when sync should retry later */
    offlineLikely: boolean;
  }>;
};

export function classifySyncFailure(err: unknown): SyncFailureKind {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'device-offline';
  const msg = (err as Error)?.message ?? String(err);
  // Only treat opaque network failures as API-unreachable when they look like our API client errors.
  // Presigned S3/MinIO PUT failures also surface as "Failed to fetch" and must not use this label.
  if (/Failed to fetch|NetworkError|Load failed|abort/i.test(msg)) {
    return 'api-unreachable';
  }
  return 'error';
}

export function syncFailureUserMessage(kind: SyncFailureKind, detail?: string): string {
  if (kind === 'device-offline') {
    return 'Device offline — receipts stay queued until you reconnect.';
  }
  if (kind === 'api-unreachable') {
    return 'Can’t reach the API — check that the web build’s VITE_API_URL matches your API and CORS_ORIGIN allows this site.';
  }
  return detail || 'Upload failed';
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
    try {
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      });
      if (!put.ok) {
        imageBase64 = await blobToBase64(blob);
      }
    } catch {
      // Presigned host unreachable from the browser (e.g. localhost MinIO) — send bytes to API.
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

let flushInFlight: Promise<FlushResult> | null = null;

/** Flush IndexedDB outbox; safe to call from Capture or shell (shared single-flight). */
export function flushPendingOutbox(
  onItem?: (id: string, status: string) => void,
): Promise<FlushResult> {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const reviewIds: string[] = [];
    const failures: FlushResult['failures'] = [];
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
        const kind = classifySyncFailure(err);
        const offlineLikely = kind !== 'error';
        await patchOutbox(meta.id, { status: 'failed', error: message });
        const label =
          kind === 'device-offline'
            ? 'Queued (offline)'
            : kind === 'api-unreachable'
              ? 'Queued (API unreachable)'
              : `Failed: ${message}`;
        onItem?.(meta.id, label);
        failures.push({ id: meta.id, message, kind, offlineLikely });
      }
    }
    return { reviewIds, failures };
  })().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}
