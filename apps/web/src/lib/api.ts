declare global {
  interface Window {
    /** Set by /runtime-config.js (nginx on Railway) before the app bundle loads. */
    __ISLAND_API_URL__?: string;
  }
}

function resolveApiUrl(): string {
  const runtime =
    typeof window !== 'undefined' ? window.__ISLAND_API_URL__?.trim() : undefined;
  const raw = runtime || import.meta.env.VITE_API_URL || '/api';
  return String(raw).replace(/\/$/, '');
}

/** Public API origin used by the SPA (absolute on Railway, `/api` in Vite proxy). */
export function getApiBaseUrl() {
  return resolveApiUrl();
}

/**
 * Lightweight reachability check (no auth). Distinguishes "device online but API down/CORS/wrong URL"
 * from navigator.onLine.
 */
export async function probeApiReachable(timeoutMs = 5000): Promise<boolean> {
  const base = getApiBaseUrl();
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
      mode: 'cors',
    });
    if (!res.ok) return false;
    // SPA fallback can 200 HTML for wrong API bases like `/api/health` on the web host.
    const ct = res.headers.get('content-type') ?? '';
    return ct.includes('application/json');
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

type Tokens = { accessToken: string; refreshToken: string };

const TOKEN_KEY = 'island.tokens';

/** Single-flight refresh so concurrent 401s share one rotation. */
let refreshInFlight: Promise<string | null> | null = null;

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
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const tokens = getTokens();
    if (!tokens?.refreshToken) return null;
    const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
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
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Prefer Nest/zod `message` from API error bodies over bare `API 401`. */
export function apiErrorMessage(err: unknown, fallback = 'Request failed'): string {
  const e = err as {
    status?: number;
    detail?: { message?: string | string[]; error?: string; retryAfter?: number };
    message?: string;
  };
  const m = e?.detail?.message;
  let base: string | null = null;
  if (typeof m === 'string' && m.trim()) base = m;
  else if (Array.isArray(m) && m[0]) base = String(m[0]);
  else if (typeof e?.detail?.error === 'string' && e.detail.error.trim()) {
    base = e.detail.error;
  } else if (e?.message && !/^API \d+/.test(e.message)) {
    base = e.message;
  }
  const retryAfter = e?.detail?.retryAfter;
  if (
    (e?.status === 429 || typeof retryAfter === 'number') &&
    typeof retryAfter === 'number' &&
    retryAfter > 0
  ) {
    const msg = base ?? fallback;
    return `${msg} Try again in ${retryAfter}s.`;
  }
  return base ?? fallback;
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

  let res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });

  if (res.status === 401 && auth) {
    const next = await refreshAccess();
    if (next) {
      headers.set('Authorization', `Bearer ${next}`);
      res = await fetch(`${getApiBaseUrl()}${path}`, {
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
  let res = await fetch(`${getApiBaseUrl()}${path}`, { headers });
  if (res.status === 401) {
    const next = await refreshAccess();
    if (next) {
      headers.set('Authorization', `Bearer ${next}`);
      res = await fetch(`${getApiBaseUrl()}${path}`, { headers });
    }
  }
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = undefined;
    }
    throw Object.assign(new Error(apiErrorMessage({ detail }, `Could not load image (${res.status})`)), {
      status: res.status,
      detail,
    });
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export type ReceiptSummary = {
  id: string;
  status: string;
  totalCents: number | null;
  purchasedAt: string | null;
  updatedAt?: string;
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
  updatedAt?: string;
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
