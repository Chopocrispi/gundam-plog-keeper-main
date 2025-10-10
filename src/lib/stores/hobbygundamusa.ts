import type { GundamModel, GundamGrade } from '@/types/gundam';

type ProviderResult = { price: number; url: string } | null;

const DEBUG = ((import.meta as unknown as { env?: { VITE_DEBUG_PRICING?: string } }).env?.VITE_DEBUG_PRICING) === 'true';
const PROXY_BASE = ((import.meta as unknown as { env?: { VITE_PROXY_BASE?: string } }).env?.VITE_PROXY_BASE) as string | undefined;
const HGUSA_BASE = (((import.meta as unknown as { env?: { VITE_STORE_HGUSA_BASE?: string } }).env?.VITE_STORE_HGUSA_BASE) as string | undefined) || 'https://hobbygundamusa.com';

function gradeAbbr(grade?: GundamGrade): string {
  switch (grade) {
    case 'High Grade (HG)': return 'HG';
    case 'Real Grade (RG)': return 'RG';
    case 'Master Grade (MG)': return 'MG';
    case 'Perfect Grade (PG)': return 'PG';
    case 'Full Mechanics (FM)': return 'FM';
    case 'Super Deformed (SD)': return 'SD';
    case 'Mega Size (MS)': return 'MS';
    default: return '';
  }
}

function cacheKey(name: string) { return `hgusa:v2:${name.toLowerCase()}`; }

function proxied(url: string) {
  return PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(url)}` : url;
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildQuery(name: string, grade?: GundamGrade): string {
  const abbr = gradeAbbr(grade);
  return [abbr, name].filter(Boolean).join(' ').trim();
}

// Known exact overrides to ensure perfect matches for common kits
const HANDLE_OVERRIDES: Array<{ test: RegExp; handle: string }> = [
  // HG Exia
  { test: /\bhg\b.*\bexia\b/i, handle: 'hg-1-144-01-gundam-exia' },
];

async function findProduct(base: string, query: string, expectAbbr: string): Promise<{ handle: string; url: string } | null> {
  // Overrides first
  const override = HANDLE_OVERRIDES.find(o => o.test.test(query));
  if (override) {
    const handle = override.handle;
    return { handle, url: `${base.replace(/\/$/, '')}/products/${handle}` };
  }
  try {
    const url = proxied(`${base.replace(/\/$/, '')}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10`);
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`suggest status ${res.status}`);
    const data = (await res.json().catch(() => null)) as unknown as { resources?: { results?: { products?: Array<{ title?: string; handle?: string; url?: string }> } } };
    const products = data?.resources?.results?.products || [];
    const normQ = normalizeName(query);
    let best: { handle: string; url: string; score: number } | null = null;
    for (const p of products) {
      const title: string = p.title || '';
      const handle: string = p.handle || '';
      const productUrl: string = p.url ? (p.url.startsWith('http') ? p.url : base.replace(/\/$/, '') + p.url) : `${base.replace(/\/$/, '')}/products/${handle}`;
      const normTitle = normalizeName(title);
      // Require the grade token when available and substantial name overlap
      if (expectAbbr && !new RegExp(String.raw`(^|\s)${expectAbbr.toLowerCase()}(\s|$)`).test(normTitle)) continue;
      const matchTokens = normQ.split(' ').filter(Boolean).filter(t => t.length > 1);
      const hits = matchTokens.filter(t => normTitle.includes(t)).length;
      const score = hits + (normTitle.includes('1 144') || normTitle.includes('1/144') ? 1 : 0) + (normTitle.includes('gundam') ? 0.5 : 0);
      if (!best || score > best.score) best = { handle, url: productUrl, score };
    }
    if (best) return { handle: best.handle, url: best.url };
  } catch (e) {
    if (DEBUG) console.debug('[hgusa] suggest error', e);
  }
  return null;
}

async function fetchPriceCentsByHandle(base: string, handle: string): Promise<number | null> {
  // Try JS endpoint first (cents)
  try {
    const url = proxied(`${base.replace(/\/$/, '')}/products/${handle}.js`);
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`product.js status ${res.status}`);
  const product = (await res.json().catch(() => null)) as unknown as { price?: number | string; price_min?: number | string; variants?: Array<{ price?: number | string }>; } | null;
  const cents = product?.price ?? product?.price_min ?? product?.variants?.[0]?.price ?? null;
    if (cents != null) {
      const n = typeof cents === 'string' ? parseInt(cents, 10) : Number(cents);
      if (Number.isFinite(n)) return n;
    }
  } catch (e) {
    if (DEBUG) console.debug('[hgusa] product.js error', e);
  }
  // Fallback to JSON endpoint (dollars)
  try {
    const url = proxied(`${base.replace(/\/$/, '')}/products/${handle}.json`);
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
  const product = (await res.json().catch(() => null)) as unknown as { product?: { variants?: Array<{ price?: number | string }>; price?: number | string; price_min?: number | string } } | null;
  const price = product?.product?.variants?.[0]?.price ?? product?.product?.price ?? product?.product?.price_min ?? null;
    if (price != null) {
      const dollars = typeof price === 'string' ? parseFloat(price) : Number(price);
      if (Number.isFinite(dollars)) return Math.round(dollars * 100);
    }
  } catch (e) {
    if (DEBUG) console.debug('[hgusa] product.json error', e);
  }
  return null;
}

export async function getHobbyGundamUSAPrice(model: GundamModel, opts?: { force?: boolean }): Promise<ProviderResult> {
  const name = model.name?.trim();
  if (!name) return null;
  const key = cacheKey(name);
  if (!opts?.force) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const e = JSON.parse(raw) as { price: number; url: string; ts: number };
        if (Date.now() - e.ts < 1000 * 60 * 60) {
          if (DEBUG) console.debug('[hgusa] cache hit', e);
          return { price: e.price, url: e.url };
        }
      }
    } catch (e) {
      if (DEBUG) console.debug('[hgusa] cache parse error', e);
    }
  }
  const abbr = gradeAbbr(model.grade);
  const query = buildQuery(name, model.grade);
  if (DEBUG) console.debug('[hgusa] querying', { query });
  const pick = await findProduct(HGUSA_BASE, query, abbr);
  if (!pick) return null;
  const cents = await fetchPriceCentsByHandle(HGUSA_BASE, pick.handle);
  if (cents == null) return null;
  const price = Math.round((cents / 100) * 100) / 100;
  const result = { price, url: pick.url };
  try { localStorage.setItem(key, JSON.stringify({ ...result, ts: Date.now() })); } catch (e) {
    if (DEBUG) console.debug('[hgusa] cache write error', e);
  }
  return result;
}
