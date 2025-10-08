import type { GundamGrade, GundamModel } from '@/types/gundam';

const BASE = 'https://gundamplacestore.com';
const DEFAULT_PROXY_BASE = typeof window !== 'undefined' ? `${window.location.origin}/api/proxy` : '';
const PROXY_BASE = import.meta.env?.VITE_PROXY_BASE || DEFAULT_PROXY_BASE;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function proxied(url: string) { return PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(url)}` : url; }
function keyFor(model: GundamModel) { return `store:gundamplacestore:v2:${(model.name||'').toLowerCase()}|${model.grade||''}`; }

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

async function findHandleFromSearchHtml(q: string): Promise<string | null> {
  const res = await fetch(proxied(`${BASE}/search?q=${encodeURIComponent(q)}`));
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/href\s*=\s*"\/(?:collections\/[^"/]+\/)?products\/([^"?#]+)"/i);
  return m?.[1] || null;
}

async function fetchPriceByHandle(handle: string): Promise<{ price: number; currency: 'USD'|'EUR'; url: string } | null> {
  // Try JSON endpoints first
  try {
    const rj = await fetch(proxied(`${BASE}/products/${handle}.json`));
    if (rj.ok) {
      const data = await rj.json();
      const v = data?.product?.variants?.[0];
      const price = v?.price ?? data?.product?.price ?? data?.product?.price_min ?? null;
      if (price != null) {
        const num = Number(String(price).replace(',', '.'));
        if (Number.isFinite(num)) {
          const currency: 'USD'|'EUR' = BASE.includes('.es') ? 'EUR' : 'USD';
          return { price: num, currency, url: `${BASE}/products/${handle}` };
        }
      }
    }
  } catch { /* ignore */ }
  try {
    const rjs = await fetch(proxied(`${BASE}/products/${handle}.js`));
    if (rjs.ok) {
      const data = await rjs.json();
      const v = data?.variants?.[0];
      let priceRaw = v?.price ?? data?.price ?? data?.price_min ?? null;
      if (priceRaw != null) {
        let num = Number(String(priceRaw).replace(',', '.'));
        if (Number.isFinite(num)) { if (num >= 100 && num % 1 === 0) num = num/100; }
        if (Number.isFinite(num)) {
          const currency: 'USD'|'EUR' = BASE.includes('.es') ? 'EUR' : 'USD';
          return { price: Math.round(num*100)/100, currency, url: `${BASE}/products/${handle}` };
        }
      }
    }
  } catch { /* ignore */ }
  // HTML JSON-LD
  try {
    const rh = await fetch(proxied(`${BASE}/products/${handle}`));
    if (!rh.ok) return null;
    const html = await rh.text();
    const ld = html.match(/<script[^>]*type=\"application\/ld\+json\"[^>]*>([\s\S]*?)<\/script>/i);
    if (ld && ld[1]) {
      try {
        const j = JSON.parse(ld[1]);
        const offer = Array.isArray(j) ? j.find((x:any)=>x?.offers) : j?.offers;
        const price = offer?.price || offer?.[0]?.price;
        const currency = (offer?.priceCurrency || offer?.[0]?.priceCurrency || (BASE.includes('.es')?'EUR':'USD')).toUpperCase() as 'USD'|'EUR';
        const num = price != null ? Number(String(price).replace(',', '.')) : NaN;
        if (Number.isFinite(num)) return { price: num, currency, url: `${BASE}/products/${handle}` };
      } catch { /* ignore */ }
    }
    const euro = html.match(/€\s*([0-9]+(?:,[0-9]{2})?)/);
    const usd = html.match(/\$\s*([0-9]+(?:\.[0-9]{2})?)/);
    if (euro?.[1] || usd?.[1]) {
      const num = parseFloat((euro?.[1] || usd?.[1])!.replace(',', '.'));
      const currency: 'USD'|'EUR' = euro ? 'EUR' : 'USD';
      if (Number.isFinite(num)) return { price: num, currency, url: `${BASE}/products/${handle}` };
    }
  } catch { /* ignore */ }
  return null;
}

export async function getGundamPlaceStorePrice(model: GundamModel): Promise<{ price: number; currency: 'USD'|'EUR'; url?: string } | null> {
  const name = model.name?.trim(); if (!name) return null;
  try { const raw = localStorage.getItem(keyFor(model)); if (raw) { const c = JSON.parse(raw); if (Date.now()-c.ts < CACHE_TTL_MS) return c; } } catch { /* ignore cache parse */ }
  const q = buildSearchQuery(name, model.grade as GundamGrade);
  try {
    // Try Shopify-like endpoints first
    const suggest = await fetch(proxied(`${BASE}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=10`));
    if (suggest.ok) {
      const data = await suggest.json();
      const prod = data?.resources?.results?.products?.[0];
      const handle = prod?.handle;
      if (handle) {
        const out = await fetchPriceByHandle(handle);
        if (out) { try { localStorage.setItem(keyFor(model), JSON.stringify({ ...out, ts: Date.now() })); } catch {}
          return out; }
      }
    }
  } catch { /* ignore suggest errors */ }
  // HTML fallback
  try {
    const handle = await findHandleFromSearchHtml(q);
    if (handle) {
      const out = await fetchPriceByHandle(handle);
      if (out) { try { localStorage.setItem(keyFor(model), JSON.stringify({ ...out, ts: Date.now() })); } catch {}
        return out; }
    }
  } catch { /* ignore html parse errors */ }
  return null;
}
