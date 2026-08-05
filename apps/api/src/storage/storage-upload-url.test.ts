import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

describe('StorageService.createUploadUrl', () => {
  it('returns memory:// when S3_ENDPOINT is localhost (unreachable from browsers)', async () => {
    const svc = new StorageService(
      new ConfigService({
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'island-ledger-receipts',
        S3_ACCESS_KEY_ID: 'minioadmin',
        S3_SECRET_ACCESS_KEY: 'minioadmin',
      }),
    );
    const res = await svc.createUploadUrl('receipts/h1/a.jpg');
    expect(res.uploadUrl).toBe('memory://receipts/h1/a.jpg');
    expect(res.imageKey).toBe('receipts/h1/a.jpg');
  });

  it('returns memory:// when S3_ENDPOINT is unset', async () => {
    const svc = new StorageService(new ConfigService({}));
    const res = await svc.createUploadUrl('receipts/h1/b.jpg');
    expect(res.uploadUrl.startsWith('memory://')).toBe(true);
  });
});

describe('StorageService.createDownloadUrl', () => {
  it('returns null for localhost S3 so the SPA uses the authed image route', async () => {
    const svc = new StorageService(
      new ConfigService({
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'island-ledger-receipts',
        S3_ACCESS_KEY_ID: 'minioadmin',
        S3_SECRET_ACCESS_KEY: 'minioadmin',
      }),
    );
    await expect(svc.createDownloadUrl('receipts/h1/a.jpg')).resolves.toBeNull();
  });
});

describe('StorageService.getObjectBuffer', () => {
  it('throws a clear error for missing memory objects instead of an S3 500', async () => {
    const svc = new StorageService(
      new ConfigService({
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'island-ledger-receipts',
        S3_ACCESS_KEY_ID: 'minioadmin',
        S3_SECRET_ACCESS_KEY: 'minioadmin',
      }),
    );
    await expect(svc.getObjectBuffer('receipts/h1/missing.jpg')).rejects.toThrow(
      /no longer available|demo storage/i,
    );
  });

  it('returns bytes from the in-memory fallback', async () => {
    const svc = new StorageService(
      new ConfigService({
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'island-ledger-receipts',
      }),
    );
    svc.putLocal('receipts/h1/a.jpg', Buffer.from('hello'));
    await expect(svc.getObjectBuffer('receipts/h1/a.jpg')).resolves.toEqual(
      Buffer.from('hello'),
    );
  });
});
