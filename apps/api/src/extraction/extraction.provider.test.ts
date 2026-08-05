import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ExtractionProvider, looksLikeImageBytes } from './extraction.provider';
import { receiptArithmeticOk } from '../common/money';

describe('ExtractionProvider mock', () => {
  const provider = new ExtractionProvider(
    new ConfigService({ EXTRACTION_PROVIDER: 'mock' }),
  );

  it('returns arithmetic-valid mock extraction for non-image buffers', () => {
    const { result } = provider.mockExtract(Buffer.from('ok'));
    const arith = receiptArithmeticOk({
      lines: result.lines,
      taxCents: result.taxCents,
      totalCents: result.totalCents,
    });
    expect(arith.ok).toBe(true);
  });

  it('refuses to invent a basket for real JPEG uploads', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    expect(looksLikeImageBytes(jpeg)).toBe(true);
    expect(() => provider.mockExtract(jpeg)).toThrow(/Mock extraction cannot read/);
  });

  it('catches intentionally corrupted extraction until retry hint', () => {
    const first = provider.mockExtract(Buffer.from('CORRUPT_EXTRACTION'));
    const bad = receiptArithmeticOk({
      lines: first.result.lines,
      taxCents: first.result.taxCents,
      totalCents: first.result.totalCents,
    });
    expect(bad.ok).toBe(false);

    const retry = provider.mockExtract(
      Buffer.from('CORRUPT_EXTRACTION'),
      'previous failed',
    );
    const good = receiptArithmeticOk({
      lines: retry.result.lines,
      taxCents: retry.result.taxCents,
      totalCents: retry.result.totalCents,
    });
    expect(good.ok).toBe(true);
  });

  it('returns scenario keyed by fixture:<id> buffer', () => {
    const { result } = provider.mockExtract(Buffer.from('fixture:mock-short-01'));
    expect(result.store.name).toBe('Three Bears');
    expect(result.lines).toHaveLength(1);
    expect(result.totalCents).toBe(299);
  });
});
