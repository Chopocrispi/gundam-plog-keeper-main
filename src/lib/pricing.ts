import type { GundamModel } from '@/types/gundam';
import { STORE_FETCHERS } from '@/lib/stores/providers';

export type PriceQuote = {
  store: string;
  price: number;
  currency: string; // e.g., USD
  url?: string;
};

// Note: We only use real store fetchers from STORE_FETCHERS. No baseline/sample fallbacks.

type CacheEntry = { quotes: PriceQuote[]; ts: number };
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function cacheKey(name: string, grade?: string) {
  // v2: bust old caches that contained baseline/sample quotes
  return `pricecache:v2:${name.toLowerCase()}|${grade || ''}`;
}

let purgedOldPriceCache = false;
function purgeOldPriceCachesOnce() {
  if (purgedOldPriceCache) return;
  purgedOldPriceCache = true;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('pricecache:v1:')) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// Convert a quote to USD using a simple, configurable rate for EUR→USD.
// Set VITE_EUR_USD_RATE to override; default is 1.08.
function eurUsdRate(): number {
  const raw = import.meta.env?.VITE_EUR_USD_RATE as unknown as string | undefined;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1.08;
}

function toUSD(price: number, currency: string): number {
  if (currency === 'EUR') return Math.round(price * eurUsdRate() * 100) / 100;
  return price;
}

export async function estimateModelPrice(model: GundamModel): Promise<{ quotes: PriceQuote[]; average: number | null; currency: string } | null> {
  purgeOldPriceCachesOnce();
  const name = model.name?.trim();
  if (!name) return null;
  const key = cacheKey(name, model.grade);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const entry = JSON.parse(raw) as CacheEntry;
      if (Date.now() - entry.ts < CACHE_TTL_MS) {
        const avgUSD = entry.quotes.length
          ? Math.round((entry.quotes.reduce((a, q) => a + toUSD(q.price, q.currency), 0) / entry.quotes.length) * 100) / 100
          : null;
        return { quotes: entry.quotes, average: avgUSD, currency: 'USD' };
      }
    }
  } catch { /* ignore cache parse */ }

  // Try all real stores
  const realResults = await Promise.all(
    STORE_FETCHERS.map(async s => {
      const r = await s.fetcher(model);
      return r ? ({ store: s.name, price: r.price, currency: r.currency, url: r.url } as PriceQuote) : null;
    })
  );

  let quotes = realResults.filter(Boolean) as PriceQuote[];
  if (!quotes.length) return null;
  // Convert all quotes to USD and average
  const sumUSD = quotes.reduce((a, q) => a + toUSD(q.price, q.currency), 0);
  const average = Math.round((sumUSD / quotes.length) * 100) / 100;

  try { localStorage.setItem(key, JSON.stringify({ quotes, ts: Date.now() } satisfies CacheEntry)); } catch { /* ignore cache set */ }
  return { quotes, average, currency: 'USD' };
}

export async function estimateCollectionValue(models: GundamModel[]): Promise<{ total: number; counted: number; currency: string; perModel: Record<string, number> }>{
  let total = 0; let counted = 0; const perModel: Record<string, number> = {};
  const currency = 'USD';
  for (const m of models) {
    const est = await estimateModelPrice(m);
    const price = est?.average ?? (typeof m.price === 'number' ? m.price : null);
    if (price != null) { total += price; counted += 1; perModel[m.id] = price; }
  }
  return { total, counted, currency, perModel };
}
