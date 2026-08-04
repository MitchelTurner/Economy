import { beforeEach, describe, expect, it, vi } from 'vitest';

const pendingOutbox = vi.fn();
const getOutboxBlob = vi.fn();
const patchOutbox = vi.fn();
const removeOutbox = vi.fn();
const api = vi.fn();

vi.mock('./outbox', () => ({
  pendingOutbox: (...args: unknown[]) => pendingOutbox(...args),
  getOutboxBlob: (...args: unknown[]) => getOutboxBlob(...args),
  patchOutbox: (...args: unknown[]) => patchOutbox(...args),
  removeOutbox: (...args: unknown[]) => removeOutbox(...args),
}));

vi.mock('./api', () => ({
  api: (...args: unknown[]) => api(...args),
  apiErrorMessage: (err: unknown, fallback = 'Request failed') =>
    (err as Error)?.message && !/^API \d+/.test((err as Error).message)
      ? (err as Error).message
      : fallback,
}));

vi.mock('./image', () => ({
  blobToBase64: vi.fn().mockResolvedValue('abc'),
}));

describe('flushPendingOutbox', () => {
  beforeEach(() => {
    vi.resetModules();
    pendingOutbox.mockReset();
    getOutboxBlob.mockReset();
    patchOutbox.mockReset();
    removeOutbox.mockReset();
    api.mockReset();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('classifies network failures as api-unreachable when the device is online', async () => {
    pendingOutbox.mockResolvedValue([
      { id: '1', hash: 'h', createdAt: new Date().toISOString(), status: 'queued' },
    ]);
    getOutboxBlob.mockResolvedValue(new Blob(['x']));
    api.mockRejectedValue(new Error('Failed to fetch'));

    const { flushPendingOutbox } = await import('./outbox-sync');
    const result = await flushPendingOutbox();
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.kind).toBe('api-unreachable');
    expect(result.failures[0]!.offlineLikely).toBe(true);
    expect(patchOutbox).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('classifies API errors as hard failures', async () => {
    pendingOutbox.mockResolvedValue([
      { id: '2', hash: 'h', createdAt: new Date().toISOString(), status: 'queued' },
    ]);
    getOutboxBlob.mockResolvedValue(new Blob(['x']));
    api.mockRejectedValue(new Error('API 403'));

    const { flushPendingOutbox } = await import('./outbox-sync');
    const result = await flushPendingOutbox();
    expect(result.failures[0]!.kind).toBe('error');
    expect(result.failures[0]!.offlineLikely).toBe(false);
  });

  it('classifies device offline separately', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    pendingOutbox.mockResolvedValue([
      { id: '3', hash: 'h', createdAt: new Date().toISOString(), status: 'queued' },
    ]);
    getOutboxBlob.mockResolvedValue(new Blob(['x']));
    api.mockRejectedValue(new Error('Failed to fetch'));

    const { flushPendingOutbox } = await import('./outbox-sync');
    const result = await flushPendingOutbox();
    expect(result.failures[0]!.kind).toBe('device-offline');
  });

  it('is single-flight (second call shares the same result)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    pendingOutbox.mockImplementation(async () => {
      await gate;
      return [];
    });

    const { flushPendingOutbox } = await import('./outbox-sync');
    const first = flushPendingOutbox();
    const second = flushPendingOutbox();
    expect(second).toBe(first);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { reviewIds: [], failures: [] },
      { reviewIds: [], failures: [] },
    ]);
  });
});
