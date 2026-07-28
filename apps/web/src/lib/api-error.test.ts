import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api';

describe('apiErrorMessage', () => {
  it('reads Nest message from detail', () => {
    expect(
      apiErrorMessage({ detail: { message: 'Current password is incorrect' } }),
    ).toBe('Current password is incorrect');
  });

  it('falls back when only API status text is present', () => {
    expect(apiErrorMessage({ message: 'API 401' }, 'Sign in failed')).toBe(
      'Sign in failed',
    );
  });

  it('joins array validation messages', () => {
    expect(
      apiErrorMessage({ detail: { message: ['amountCents must be positive'] } }),
    ).toBe('amountCents must be positive');
  });
});
