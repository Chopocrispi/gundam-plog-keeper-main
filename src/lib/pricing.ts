import type { GundamModel } from '../types/gundam';
import { getHobbyGundamUSAPrice } from './stores/hobbygundamusa';
import { getGeosanBattlePriceUSD } from './stores/geosanbattle';

export type PriceQuote = { store: string; price: number; currency: 'USD'; url?: string };

type CacheEntry = { quotes: PriceQuote[]; ts: number };
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const DEBUG = ((import.meta as unknown as { env?: { VITE_DEBUG_PRICING?: string } }).env?.VITE_DEBUG_PRICING) === 'true';

function cacheKey(name: string) { return `pricecache:v2:${name.toLowerCase()}`; }

export async function estimateModelPrice(
  model: GundamModel,
  opts?: { force?: boolean }
): Promise<{ quotes: PriceQuote[]; average: number | null; currency: 'USD' } | null> {
  const name = model.name?.trim();
  if (!name) return null;
  const key = cacheKey(name);
  if (!opts?.force) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const e = JSON.parse(raw) as CacheEntry;
        if (Date.now() - e.ts < CACHE_TTL_MS) {
          const avg = e.quotes.length ? Math.round((e.quotes.reduce((a, q) => a + q.price, 0) / e.quotes.length) * 100) / 100 : null;
          if (DEBUG) console.debug('[pricing] cache hit', { name, quotes: e.quotes, avg });
          return { quotes: e.quotes, average: avg, currency: 'USD' };
        }
      }
    } catch (e) {
      if (DEBUG) console.debug('[pricing] cache parse error', e);
    }
  }
  if (DEBUG) console.debug('[pricing] fetching providers', { name, force: !!opts?.force });
  const [hg, geo] = await Promise.all([
    getHobbyGundamUSAPrice(model, { force: !!opts?.force }),
    getGeosanBattlePriceUSD(model, { force: !!opts?.force }),
  ]);

  const quotes: PriceQuote[] = [];
  if (hg?.price != null) quotes.push({ store: 'HobbyGundamUSA', price: hg.price, currency: 'USD', url: hg.url });
  if (geo?.price != null) quotes.push({ store: 'Geosan Battle', price: geo.price, currency: 'USD', url: geo.url });

  const avg = quotes.length ? Math.round((quotes.reduce((a, q) => a + q.price, 0) / quotes.length) * 100) / 100 : null;
  try { localStorage.setItem(key, JSON.stringify({ quotes, ts: Date.now() } as CacheEntry)); } catch (e) {
    if (DEBUG) console.debug('[pricing] cache write error', e);
  }
  return { quotes, average: avg, currency: 'USD' };
}
