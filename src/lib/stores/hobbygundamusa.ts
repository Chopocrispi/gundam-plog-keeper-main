import type { GundamGrade, GundamModel } from '@/types/gundam';

const BASE = 'https://hobbygundamusa.com';
const PROXY_BASE = (import.meta as any).env?.VITE_PROXY_BASE || 'https://gundapp.xyz/api/proxy';

function proxied(url: string) {
  return PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(url)}` : url;
}
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function keyFor(model: GundamModel) {
  return `store:hgusa:v1:${(model.name || '').toLowerCase()}|${model.grade || ''}`;
}

function buildSearchQuery(name: string, grade?: GundamGrade) {
  const tokens: string[] = [];
  switch (grade) {
    case 'High Grade (HG)': tokens.push('HG', '1/144'); break;
    case 'Real Grade (RG)': tokens.push('RG', '1/144'); break;
    case 'Master Grade (MG)': tokens.push('MG', '1/100'); break;
    case 'Perfect Grade (PG)': tokens.push('PG', '1/60'); break;
    case 'Full Mechanics (FM)': tokens.push('FM', '1/100'); break;
    case 'Super Deformed (SD)': tokens.push('SD'); break;
  }
  tokens.push(name);
  return tokens.join(' ');
}

type SuggestProduct = { title?: string; handle?: string };

function tokenize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\w\s-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

async function findProductHandle(query: string): Promise<string | null> {
  const url = proxied(`${BASE}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10`);
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const data = await res.json();
    // Shopify suggest typical shape: data.resources.results.products: SuggestProduct[]
    const products: SuggestProduct[] = data?.resources?.results?.products || data?.resources?.products || [];
    if (!products || !products.length) return null;
    // Score results by token overlap with query
    const qTokens = tokenize(query);
    let best: { handle: string; score: number } | null = null;
    for (const p of products) {
      if (!p.handle) continue;
      const title = p.title || p.handle;
      const tTokens = tokenize(title);
      let score = 0;
      for (const t of qTokens) {
        if (t.length < 2) continue;
        if (tTokens.includes(t)) score += 2;
        else if (tTokens.some(x => x.includes(t))) score += 1;
      }
      if (!best || score > best.score) best = { handle: p.handle, score };
    }
    return best?.handle || products[0].handle || null;
  } catch (e) {
    console.warn('HGUSA suggest failed', e);
    return null;
  }
}

async function fetchProductPriceByHandle(handle: string): Promise<number | null> {
  // Try JSON endpoint first
  try {
  const res = await fetch(proxied(`${BASE}/products/${handle}.json`), { mode: 'cors' });
    if (res.ok) {
      const data = await res.json();
      const v = data?.product?.variants?.[0];
      let price = v?.price ?? v?.compare_at_price ?? data?.product?.price ?? data?.product?.price_min ?? null;
      if (price != null) {
        const num = typeof price === 'string' ? parseFloat(price) : Number(price);
        if (Number.isFinite(num)) return num;
      }
    }
  } catch (e) {
    console.warn('HGUSA product .json fetch failed', e);
  }
  // Fallback to .js endpoint (may return price in cents)
  try {
  const res2 = await fetch(proxied(`${BASE}/products/${handle}.js`), { mode: 'cors' });
    if (!res2.ok) return null;
    const data2 = await res2.json();
    const v2 = data2?.variants?.[0];
    let priceRaw = v2?.price ?? data2?.price ?? data2?.price_min ?? null;
    if (priceRaw == null) return null;
    let num = typeof priceRaw === 'string' ? parseFloat(priceRaw) : Number(priceRaw);
    if (!Number.isFinite(num)) return null;
    // If looks like cents (e.g., 2300 -> 23.00)
    if (num >= 100 && num % 1 === 0) {
      const divided = num / 100;
      if (divided < 10000) return divided;
    }
    return num;
  } catch (e) {
    console.warn('HGUSA product .js fetch failed', e);
  }
  // Last-resort: parse HTML price elements if CORS allows
  try {
  const res3 = await fetch(proxied(`${BASE}/products/${handle}`), { mode: 'cors' });
    if (!res3.ok) return null;
    const html = await res3.text();
    // Prefer sale price, then regular
    const saleMatch = html.match(/price-item--sale[^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{2})?)\s*USD/i);
    if (saleMatch && saleMatch[1]) {
      const num = parseFloat(saleMatch[1]);
      if (Number.isFinite(num)) return num;
    }
    const regMatch = html.match(/price-item--regular[^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{2})?)\s*USD/i);
    if (regMatch && regMatch[1]) {
      const num = parseFloat(regMatch[1]);
      if (Number.isFinite(num)) return num;
    }
  } catch (e) {
    console.warn('HGUSA product HTML fetch failed', e);
  }
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

  const query = buildSearchQuery(name, model.grade as GundamGrade);
  const handle = await findProductHandle(query);
  if (!handle) return null;
  const price = await fetchProductPriceByHandle(handle);
  if (price == null) return null;
  const url = `${BASE}/products/${handle}`;
  try { localStorage.setItem(cacheKey, JSON.stringify({ price, ts: Date.now(), url })); } catch {}
  return { price, currency: 'USD', url };
}
