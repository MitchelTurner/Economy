import { readFileSync } from 'fs';
import { join } from 'path';

let abbreviations: Record<string, string> | null = null;

function loadAbbreviations(): Record<string, string> {
  if (abbreviations) return abbreviations;
  const path = join(__dirname, '../../../../data/abbreviations.json');
  try {
    abbreviations = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
  } catch {
    abbreviations = {
      WHL: 'WHOLE',
      MLK: 'MILK',
      GA: 'GALLON',
      GAL: 'GALLON',
      LB: 'POUND',
      OZ: 'OUNCE',
      CT: 'COUNT',
      PK: 'PACK',
    };
  }
  return abbreviations;
}

/** Uppercase, strip punctuation, collapse whitespace, expand abbreviations. */
export function normalizeRawText(raw: string): string {
  const dict = loadAbbreviations();
  const tokens = raw
    .toUpperCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .flatMap((t) => {
      // Split glued qty+unit tokens: 1GA → 1 GA, 16OZ → 16 OZ
      const glued = t.match(/^(\d+(?:\.\d+)?)([A-Z]+)$/);
      if (glued) return [glued[1], glued[2]];
      return [t];
    })
    .map((t) => dict[t] ?? t);
  return tokens.join(' ');
}

/**
 * pricePerBaseUom = unitPriceCents / (sizeValue * baseFactor)
 * Returns null when size/base data is missing or zero.
 */
export function pricePerBaseUom(
  unitPriceCents: number,
  sizeValue: number | null | undefined,
  baseFactor: number | null | undefined,
): number | null {
  if (sizeValue == null || baseFactor == null) return null;
  const baseQty = sizeValue * baseFactor;
  if (baseQty <= 0) return null;
  return unitPriceCents / baseQty;
}
