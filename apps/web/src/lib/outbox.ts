import { entries, get, set, del, update } from 'idb-keyval';

const META_PREFIX = 'outbox-meta:';
const BLOB_PREFIX = 'outbox-blob:';

export type OutboxStatus = 'queued' | 'uploading' | 'done' | 'failed';

export type OutboxMeta = {
  id: string;
  hash: string;
  createdAt: string;
  status: OutboxStatus;
  error?: string;
  receiptId?: string;
  previewUrl?: string;
};

export async function enqueueOutbox(item: {
  id: string;
  hash: string;
  blob: Blob;
  previewUrl?: string;
}): Promise<OutboxMeta> {
  const meta: OutboxMeta = {
    id: item.id,
    hash: item.hash,
    createdAt: new Date().toISOString(),
    status: 'queued',
    previewUrl: item.previewUrl,
  };
  await set(`${BLOB_PREFIX}${item.id}`, item.blob);
  await set(`${META_PREFIX}${item.id}`, meta);
  return meta;
}

export async function listOutbox(): Promise<OutboxMeta[]> {
  const all = await entries();
  return all
    .filter(([k]) => String(k).startsWith(META_PREFIX))
    .map(([, v]) => v as OutboxMeta)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getOutboxBlob(id: string): Promise<Blob | undefined> {
  return get<Blob>(`${BLOB_PREFIX}${id}`);
}

export async function patchOutbox(
  id: string,
  patch: Partial<OutboxMeta>,
): Promise<OutboxMeta | null> {
  let next: OutboxMeta | null = null;
  await update<OutboxMeta | undefined>(`${META_PREFIX}${id}`, (cur) => {
    if (!cur) return cur;
    next = { ...cur, ...patch };
    return next;
  });
  return next;
}

export async function removeOutbox(id: string) {
  await del(`${META_PREFIX}${id}`);
  await del(`${BLOB_PREFIX}${id}`);
}

export async function pendingOutbox(): Promise<OutboxMeta[]> {
  const all = await listOutbox();
  return all.filter((m) => m.status === 'queued' || m.status === 'failed');
}
