import type { GundamModel } from '@/types/gundam';
import { getHobbyGundamUSAPrice } from '@/lib/stores/hobbygundamusa';
import { getGeosanBattlePriceUSD } from '@/lib/stores/geosanbattle';

export type PriceQuote = { store: string; price: number; currency: 'USD'; url?: string };

type CacheEntry = { quotes: PriceQuote[]; ts: number };
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function cacheKey(name: string) { return `pricecache:v2:${name.toLowerCase()}`; }

export async function estimateModelPrice(model: GundamModel): Promise<{ quotes: PriceQuote[]; average: number | null; currency: 'USD' } | null> {
  const name = model.name?.trim();
  if (!name) return null;
  const key = cacheKey(name);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const e = JSON.parse(raw) as CacheEntry;
      if (Date.now() - e.ts < CACHE_TTL_MS) {
        const avg = e.quotes.length ? Math.round((e.quotes.reduce((a, q) => a + q.price, 0) / e.quotes.length) * 100) / 100 : null;
        return { quotes: e.quotes, average: avg, currency: 'USD' };
      }
    }
  } catch {}

  const [hg, geo] = await Promise.all([
    getHobbyGundamUSAPrice(model),
    getGeosanBattlePriceUSD(model),
  ]);

  const quotes: PriceQuote[] = [];
  if (hg?.price != null) quotes.push({ store: 'HobbyGundamUSA', price: hg.price, currency: 'USD', url: hg.url });
  if (geo?.price != null) quotes.push({ store: 'Geosan Battle', price: geo.price, currency: 'USD', url: geo.url });

  const avg = quotes.length ? Math.round((quotes.reduce((a, q) => a + q.price, 0) / quotes.length) * 100) / 100 : null;
  try { localStorage.setItem(key, JSON.stringify({ quotes, ts: Date.now() } as CacheEntry)); } catch {}
  return { quotes, average: avg, currency: 'USD' };
}
