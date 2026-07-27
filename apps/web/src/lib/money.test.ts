import { describe, expect, it } from 'vitest';
import { formatCents, parseDollarsToCents } from './money';

describe('formatCents', () => {
  it('formats integer cents as USD', () => {
    expect(formatCents(1999)).toBe('$19.99');
    expect(formatCents(0)).toBe('$0.00');
  });

  it('handles signed display', () => {
    expect(formatCents(50, { signed: true })).toBe('+$0.50');
    expect(formatCents(-50, { signed: true })).toBe('-$0.50');
  });
});

describe('parseDollarsToCents', () => {
  it('parses dollar strings', () => {
    expect(parseDollarsToCents('$2.40')).toBe(240);
    expect(parseDollarsToCents('19.99')).toBe(1999);
  });
});
