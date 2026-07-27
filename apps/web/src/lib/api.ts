const API_URL = import.meta.env.VITE_API_URL ?? '/api';

type Tokens = { accessToken: string; refreshToken: string };

const TOKEN_KEY = 'island.tokens';

export function getTokens(): Tokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
}

export function setTokens(tokens: Tokens | null) {
  if (!tokens) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

async function refreshAccess(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return null;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!res.ok) {
    setTokens(null);
    return null;
  }
  const data = (await res.json()) as Tokens;
  setTokens(data);
  return data.accessToken;
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const auth = init.auth !== false;
  const tokens = getTokens();
  if (auth && tokens?.accessToken) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }

  let res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });

  if (res.status === 401 && auth) {
    const next = await refreshAccess();
    if (next) {
      headers.set('Authorization', `Bearer ${next}`);
      res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers,
        body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      });
    }
  }

  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    throw Object.assign(new Error(`API ${res.status}`), { status: res.status, detail });
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Fetch a binary path with auth and return an object URL (caller must revoke). */
export async function fetchAuthedBlobUrl(path: string): Promise<string> {
  const headers = new Headers();
  const tokens = getTokens();
  if (tokens?.accessToken) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }
  let res = await fetch(`${API_URL}${path}`, { headers });
  if (res.status === 401) {
    const next = await refreshAccess();
    if (next) {
      headers.set('Authorization', `Bearer ${next}`);
      res = await fetch(`${API_URL}${path}`, { headers });
    }
  }
  if (!res.ok) throw new Error(`Image ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export type ReceiptSummary = {
  id: string;
  status: string;
  totalCents: number | null;
  purchasedAt: string | null;
  store: { id: string; name: string } | null;
  _count: { lines: number };
};

export type MatchSuggestion = {
  productId: string;
  name: string;
  score: number;
  brand?: string | null;
  sizeLabel?: string | null;
};

export type ReceiptLine = {
  id: string;
  lineNumber: number;
  rawText: string;
  quantity: string | number;
  unitPriceCents: number | null;
  extendedCents: number;
  discountCents: number;
  categoryId: string | null;
  productId: string | null;
  matchMethod: string | null;
  matchConfidence: number | null;
  category: { id: string; name: string; slug: string } | null;
  product: { id: string; name: string } | null;
  suggestions?: MatchSuggestion[];
};

export type ReceiptDetail = {
  id: string;
  status: string;
  imageKey: string;
  imageUrl?: string | null;
  signedImageUrl?: string | null;
  purchasedAt: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  paymentMethod: string | null;
  failureReason: string | null;
  confidence: number | null;
  store: { id: string; name: string; address: string | null } | null;
  lines: ReceiptLine[];
  unmatchedCount?: number;
  suspectLineNumbers?: number[];
  runningTotalCents: number;
  totalDeltaCents: number | null;
  canConfirm: boolean;
};

export type Product = {
  id: string;
  name: string;
  brand?: string | null;
  sizeValue: string | number | null;
  sizeUom: string | null;
  baseUom: string | null;
  category: { id: string; name: string };
};

export type PriceHistoryResponse = {
  product: Product | null;
  baseUom: string | null;
  observations: Array<{
    observedAt: string;
    unitPriceCents: number;
    pricePerBaseUom: number;
    store: { id: string; name: string };
  }>;
};

export type PriceCompareResponse = {
  products: Array<{
    id: string;
    name: string;
    baseUom: string | null;
    sizeValue: number | null;
    sizeUom: string | null;
  }>;
  stores: Array<{ id: string; name: string }>;
  cells: Array<{
    productId: string;
    storeId: string;
    unitPriceCents: number;
    pricePerBaseUom: number;
    observedAt: string;
    baseUom: string | null;
  }>;
};
