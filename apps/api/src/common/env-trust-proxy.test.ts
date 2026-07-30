import { describe, expect, it } from 'vitest';
import { parseTrustProxy } from './env';

describe('parseTrustProxy', () => {
  it('defaults and falsey values disable trust', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('0')).toBe(false);
    expect(parseTrustProxy('off')).toBe(false);
  });

  it('accepts boolean true and hop counts', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('2')).toBe(2);
  });

  it('preserves IP/CIDR lists for Express', () => {
    expect(parseTrustProxy('127.0.0.1,10.0.0.0/8')).toBe('127.0.0.1,10.0.0.0/8');
  });
});
