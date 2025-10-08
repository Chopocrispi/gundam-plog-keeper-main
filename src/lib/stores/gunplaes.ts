import type { GundamModel } from '@/types/gundam';

const BASE = 'https://gunpla.es';
const DEFAULT_PROXY_BASE = typeof window !== 'undefined' ? `${window.location.origin}/api/proxy` : '';
const PROXY_BASE = import.meta.env?.VITE_PROXY_BASE || DEFAULT_PROXY_BASE;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function proxied(url: string) { return PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(url)}` : url; }
function keyFor(model: GundamModel) { return `store:gunplaes:v2:${(model.name||'').toLowerCase()}|${model.grade||''}`; }

export async function getGunplaEsPrice(model: GundamModel): Promise<{ price: number; currency: 'EUR'; url?: string } | null> {
  const name = model.name?.trim(); if (!name) return null;
  try { const raw = localStorage.getItem(keyFor(model)); if (raw) { const c = JSON.parse(raw); if (Date.now()-c.ts < CACHE_TTL_MS) return c; } } catch { /* ignore cache parse */ }
  const q = encodeURIComponent(name);
  try {
    // Try common Shopify-style endpoints, else HTML
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
              const out = { price: Math.round(num*100)/100, currency: 'EUR' as const, url: `${BASE}/products/${handle}` };
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
    const m = html.match(/€\s*([0-9]+(?:,[0-9]{2})?)/);
    if (m && m[1]) {
      const price = parseFloat(m[1].replace(',', '.'));
      const out = { price, currency: 'EUR' as const };
      try { localStorage.setItem(keyFor(model), JSON.stringify({ ...out, ts: Date.now() })); } catch { /* ignore cache set */ }
      return out;
    }
  } catch { /* ignore html parse errors */ }
  return null;
}
