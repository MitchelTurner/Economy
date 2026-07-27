import { describe, expect, it } from 'vitest';
import { extractProtectedTokens } from './narration.service';

describe('extractProtectedTokens', () => {
  it('collects dollar and percent figures', () => {
    const tokens = extractProtectedTokens(
      'Butter is up 27% — now $5.49 vs $4.20 baseline',
    );
    expect(tokens).toEqual(
      expect.arrayContaining(['27%', '$5.49', '$4.20']),
    );
  });

  it('dedupes repeats', () => {
    const tokens = extractProtectedTokens('$10.00 saved — about $10.00');
    expect(tokens.filter((t) => t === '$10.00')).toHaveLength(1);
  });
});
