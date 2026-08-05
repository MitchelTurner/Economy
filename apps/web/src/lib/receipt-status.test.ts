import { describe, expect, it } from 'vitest';
import { receiptStatusLabel, receiptStatusTone } from './receipt-status';

describe('receiptStatusLabel', () => {
  it('maps enums to friendly labels', () => {
    expect(receiptStatusLabel('NEEDS_REVIEW')).toBe('Needs review');
    expect(receiptStatusLabel('CONFIRMED')).toBe('Confirmed');
    expect(receiptStatusLabel('FAILED')).toBe('Failed');
  });
});

describe('receiptStatusTone', () => {
  it('returns danger tone for failed', () => {
    expect(receiptStatusTone('FAILED')).toContain('danger');
  });
});
