import { normalizeRawText } from '../common/normalize';

export type MatchCandidate = {
  productId: string;
  name: string;
  score: number;
  brand?: string | null;
  sizeLabel?: string | null;
};

export type MatchResult = {
  productId: string | null;
  confidence: number;
  method: 'alias' | 'gtin' | 'fuzzy' | 'manual' | null;
  suggestions: MatchCandidate[];
  normalized: string;
};

const FUZZY_AUTO_THRESHOLD = 0.55;

/** Extract a GTIN/UPC-looking digit run from receipt text, if present. */
export function extractGtin(rawText: string): string | null {
  const m = rawText.match(/\b(\d{8}|\d{12}|\d{13}|\d{14})\b/);
  return m?.[1] ?? null;
}

/** Character trigrams for Jaccard-style similarity. */
export function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    out.add(padded.slice(i, i + 3));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter((t) => t.length > 1));
  const tb = new Set(b.split(' ').filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size);
}

/** Combined fuzzy score between normalized receipt text and a product name (+ optional alias). */
export function fuzzyScore(normalizedRaw: string, productName: string, aliasNormalized?: string): number {
  const nameNorm = normalizeRawText(productName);
  const nameTri = jaccard(trigrams(normalizedRaw), trigrams(nameNorm));
  const nameTok = tokenOverlap(normalizedRaw, nameNorm);
  let score = 0.55 * nameTri + 0.45 * nameTok;

  if (aliasNormalized) {
    const aliasTri = jaccard(trigrams(normalizedRaw), trigrams(aliasNormalized));
    const aliasTok = tokenOverlap(normalizedRaw, aliasNormalized);
    const aliasScore = 0.55 * aliasTri + 0.45 * aliasTok;
    score = Math.max(score, aliasScore);
  }

  return score;
}

export function pickFuzzyMatch(
  normalizedRaw: string,
  candidates: Array<{
    productId: string;
    name: string;
    brand?: string | null;
    sizeValue?: number | null;
    sizeUom?: string | null;
    aliasNormalized?: string;
  }>,
  autoThreshold = FUZZY_AUTO_THRESHOLD,
): MatchResult {
  const scored: MatchCandidate[] = candidates
    .map((c) => ({
      productId: c.productId,
      name: c.name,
      brand: c.brand,
      sizeLabel:
        c.sizeValue != null && c.sizeUom
          ? `${c.sizeValue} ${c.sizeUom}`
          : null,
      score: fuzzyScore(normalizedRaw, c.name, c.aliasNormalized),
    }))
    .sort((a, b) => b.score - a.score);

  // Dedupe by productId keeping best score
  const seen = new Set<string>();
  const unique: MatchCandidate[] = [];
  for (const c of scored) {
    if (seen.has(c.productId)) continue;
    seen.add(c.productId);
    unique.push(c);
  }

  const top = unique[0];
  if (top && top.score >= autoThreshold) {
    return {
      productId: top.productId,
      confidence: Math.min(0.89, top.score),
      method: 'fuzzy',
      suggestions: unique.slice(0, 5),
      normalized: normalizedRaw,
    };
  }

  return {
    productId: null,
    confidence: 0,
    method: null,
    suggestions: unique.slice(0, 5),
    normalized: normalizedRaw,
  };
}
