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

  it('classifies network failures as offlineLikely', async () => {
    pendingOutbox.mockResolvedValue([
      { id: '1', hash: 'h', createdAt: new Date().toISOString(), status: 'queued' },
    ]);
    getOutboxBlob.mockResolvedValue(new Blob(['x']));
    api.mockRejectedValue(new Error('Failed to fetch'));

    const { flushPendingOutbox } = await import('./outbox-sync');
    const result = await flushPendingOutbox();
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.offlineLikely).toBe(true);
    expect(patchOutbox).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('classifies API errors as not offline', async () => {
    pendingOutbox.mockResolvedValue([
      { id: '2', hash: 'h', createdAt: new Date().toISOString(), status: 'queued' },
    ]);
    getOutboxBlob.mockResolvedValue(new Blob(['x']));
    api.mockRejectedValue(new Error('API 403'));

    const { flushPendingOutbox } = await import('./outbox-sync');
    const result = await flushPendingOutbox();
    expect(result.failures[0]!.offlineLikely).toBe(false);
  });

  it('is single-flight (second call while flushing is no-op)', async () => {
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
    const second = await flushPendingOutbox();
    expect(second).toEqual({ reviewIds: [], failures: [] });
    release();
    await first;
  });
});
