import type { GundamModel } from '@/types/gundam';

const BASE = 'https://gundamplacestore.com';
const DEFAULT_PROXY_BASE = typeof window !== 'undefined' ? `${window.location.origin}/api/proxy` : '';
const PROXY_BASE = import.meta.env?.VITE_PROXY_BASE || DEFAULT_PROXY_BASE;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function proxied(url: string) { return PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(url)}` : url; }
function keyFor(model: GundamModel) { return `store:gundamplacestore:v2:${(model.name||'').toLowerCase()}|${model.grade||''}`; }

export async function getGundamPlaceStorePrice(model: GundamModel): Promise<{ price: number; currency: 'USD'|'EUR'; url?: string } | null> {
  const name = model.name?.trim(); if (!name) return null;
  try { const raw = localStorage.getItem(keyFor(model)); if (raw) { const c = JSON.parse(raw); if (Date.now()-c.ts < CACHE_TTL_MS) return c; } } catch { /* ignore cache parse */ }
  const q = encodeURIComponent(name);
  try {
    // Try Shopify-like endpoints first
    const suggest = await fetch(proxied(`${BASE}/search/suggest.json?q=${q}&resources[type]=product&resources[limit]=10`));
    if (suggest.ok) {
      const data = await suggest.json();
      const prod = data?.resources?.results?.products?.[0];
      const handle = prod?.handle;
      if (handle) {
        const js = await fetch(proxied(`${BASE}/products/${handle}.js`));
        if (js.ok) {
          const pd = await js.json();
          const v = pd?.variants?.[0];
          const priceRaw = v?.price ?? pd?.price ?? null;
          if (priceRaw != null) {
            let num = typeof priceRaw === 'string' ? parseFloat(priceRaw.replace(',', '.')) : Number(priceRaw);
            if (Number.isFinite(num)) {
              if (num >= 100 && num % 1 === 0) num = num/100;
              const currency: 'USD'|'EUR' = BASE.includes('.es') ? 'EUR' : 'USD';
              const out = { price: Math.round(num*100)/100, currency, url: `${BASE}/products/${handle}` };
              try { localStorage.setItem(keyFor(model), JSON.stringify({ ...out, ts: Date.now() })); } catch { /* ignore cache set */ }
              return out;
            }
          }
        }
      }
    }
  } catch { /* ignore suggest errors */ }
  // HTML fallback
  try {
    const res = await fetch(proxied(`${BASE}/search?q=${q}`));
    if (!res.ok) return null;
    const html = await res.text();
    const euro = html.match(/€\s*([0-9]+(?:,[0-9]{2})?)/);
    const usd = html.match(/\$\s*([0-9]+(?:\.[0-9]{2})?)/);
    const euroVal = euro && euro[1];
    const usdVal = usd && usd[1];
    if (euroVal || usdVal) {
      const price = parseFloat((euroVal || usdVal)!.replace(',', '.'));
      const currency: 'USD'|'EUR' = euro ? 'EUR' : 'USD';
      const out = { price, currency };
      try { localStorage.setItem(keyFor(model), JSON.stringify({ ...out, ts: Date.now() })); } catch { /* ignore cache set */ }
      return out;
    }
  } catch { /* ignore html parse errors */ }
  return null;
}
