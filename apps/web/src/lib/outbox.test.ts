import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  set: async (k: string, v: unknown) => {
    store.set(k, v);
  },
  get: async (k: string) => store.get(k),
  del: async (k: string) => {
    store.delete(k);
  },
  update: async (k: string, fn: (v: unknown) => unknown) => {
    store.set(k, fn(store.get(k)));
  },
  entries: async () => [...store.entries()],
}));

import {
  enqueueOutbox,
  listOutbox,
  patchOutbox,
  pendingOutbox,
  removeOutbox,
} from './outbox';

describe('outbox', () => {
  beforeEach(() => store.clear());

  it('enqueues, patches, and lists pending items', async () => {
    await enqueueOutbox({
      id: 'a1',
      hash: 'h1',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
    });
    expect((await listOutbox()).map((m) => m.id)).toEqual(['a1']);
    await patchOutbox('a1', { status: 'failed', error: 'offline' });
    const pending = await pendingOutbox();
    expect(pending[0]?.status).toBe('failed');
    await removeOutbox('a1');
    expect(await listOutbox()).toHaveLength(0);
  });
});
