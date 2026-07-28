import { describe, expect, it, vi } from 'vitest';
import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  it('echoes inbound x-request-id and sets response header', () => {
    const mw = new RequestIdMiddleware();
    const req = {
      header: (name: string) =>
        name.toLowerCase() === 'x-request-id' ? 'req-abc' : undefined,
      method: 'GET',
      originalUrl: '/household/usage',
      path: '/household/usage',
    };
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
      on: vi.fn(),
      statusCode: 200,
    };
    const next = vi.fn();
    mw.use(req as never, res as never, next);
    expect(headers['x-request-id']).toBe('req-abc');
    expect((req as { requestId?: string }).requestId).toBe('req-abc');
    expect(next).toHaveBeenCalledOnce();
  });

  it('generates an id when header missing', () => {
    const mw = new RequestIdMiddleware();
    const req = {
      header: () => undefined,
      method: 'GET',
      originalUrl: '/x',
      path: '/x',
    };
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
      on: vi.fn(),
      statusCode: 200,
    };
    mw.use(req as never, res as never, vi.fn());
    expect(headers['x-request-id']).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });
});
