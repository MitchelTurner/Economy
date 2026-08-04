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
