import type { GundamModel } from '@/types/gundam';

const BASE = 'https://hobbygundamusa.com';
const PROXY_BASE = (import.meta as any).env?.VITE_PROXY_BASE || 'https://gundapp.xyz/api/proxy';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function proxied(url: string) {
  return PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(url)}` : url;
}

function keyFor(model: GundamModel) {
  return `store:hgusa:v2:${(model.name || '').toLowerCase()}|${model.grade || ''}`;
}

// Known exact overrides to ensure perfect matches for common kits
const HANDLE_OVERRIDES: Array<{ test: RegExp; handle: string }> = [
  // HG Exia
  { test: /\bhg\b.*\bexia\b/i, handle: 'hg-1-144-01-gundam-exia' },
];

async function findProductHandle(query: string): Promise<string | null> {
  try {
    const url = proxied(`${BASE}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10`);
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const data = await res.json();
    const products: any[] = data?.resources?.results?.products || [];
    const scored = products.map(p => ({
      handle: p.handle,
      title: p.title as string,
      score: scoreTitle(p.title as string, query),
    })).sort((a, b) => b.score - a.score);
    return scored[0]?.handle || null;
  } catch {
    return null;
  }
}

function scoreTitle(title: string, query: string): number {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  let s = 0;
  if (t.includes(q)) s += 50;
  for (const tok of q.split(/\s+/)) {
    if (tok && t.includes(tok)) s += 10;
  }
  if (/\b(hg|rg|mg|pg|fm|sd)\b/.test(t)) s += 10;
  if (/1\/(144|100|60)/.test(t)) s += 5;
  if (t.includes('gundam')) s += 3;
  return s;
}

async function fetchPriceCentsByHandle(handle: string): Promise<number | null> {
  // Try JSON endpoint
  try {
    const url = proxied(`${BASE}/products/${handle}.json`);
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) {
      const data = await res.json();
      const price = data?.product?.variants?.[0]?.price || data?.product?.price || data?.product?.price_min;
      if (price != null) {
        const num = typeof price === 'string' ? parseFloat(price) : Number(price);
        return Number.isFinite(num) ? Math.round(num * 100) : null;
      }
    }
  } catch {}
  // Try JS endpoint (Shopify returns cents)
  try {
    const url2 = proxied(`${BASE}/products/${handle}.js`);
    const res2 = await fetch(url2, { mode: 'cors' });
    if (res2.ok) {
      const data2 = await res2.json();
      let priceRaw = data2?.price ?? data2?.price_min ?? null;
      if (priceRaw != null) {
        const cents = typeof priceRaw === 'string' ? parseInt(priceRaw, 10) : Number(priceRaw);
        return Number.isFinite(cents) ? cents : null;
      }
    }
  } catch {}
  return null;
}

export async function getHobbyGundamUSAPrice(model: GundamModel): Promise<{ price: number; currency: 'USD'; url?: string } | null> {
  const name = model.name?.trim();
  if (!name) return null;
  const cacheKey = keyFor(model);
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw) as { price: number; ts: number; url?: string };
      if (Date.now() - cached.ts < CACHE_TTL_MS) return { price: cached.price, currency: 'USD', url: cached.url };
    }
  } catch {}

  const handle = await findProductHandle(name);
  // Apply overrides if the name matches known patterns
  const override = HANDLE_OVERRIDES.find(o => o.test.test(`${(model.grade || '')} ${name}`));
  const chosenHandle = override?.handle || handle;
  if (!chosenHandle) return null;
  const cents = await fetchPriceCentsByHandle(chosenHandle);
  if (cents == null) return null;
  const usd = Math.round(cents) / 100;
  const url = `${BASE}/products/${chosenHandle}`;
  try { localStorage.setItem(cacheKey, JSON.stringify({ price: usd, ts: Date.now(), url })); } catch {}
  return { price: usd, currency: 'USD', url };
}
