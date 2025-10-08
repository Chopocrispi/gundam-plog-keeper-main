import type { GundamGrade, GundamModel } from '@/types/gundam';

const BASE = 'https://geosanbattle.com';
const PROXY_BASE = (import.meta as any).env?.VITE_PROXY_BASE || 'https://gundapp.xyz/api/proxy';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const DEFAULT_EUR_USD = Number((import.meta as any).env?.VITE_EUR_USD_RATE) || 1.08;

function proxied(url: string) {
  return PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(url)}` : url;
}

function keyFor(model: GundamModel) {
  return `store:geosan:v1:${(model.name || '').toLowerCase()}|${model.grade || ''}`;
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

async function findFirstProductUrl(query: string): Promise<string | null> {
  // Try common search patterns
  const candidates = [
    proxied(`${BASE}/search?q=${encodeURIComponent(query)}`),
    proxied(`${BASE}/search?q=${encodeURIComponent(query)}&type=product`),
    proxied(`${BASE}/?s=${encodeURIComponent(query)}`),
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) continue;
      const html = await res.text();
      // Look for product links
      const m = html.match(/href=["']((?:https?:\/\/geosanbattle\.com)?\/(?:products?|product)\/[A-Za-z0-9\-_%]+)["']/i);
      if (m && m[1]) {
        const href = m[1].startsWith('http') ? m[1] : `${BASE}${m[1]}`;
        return href;
      }
    } catch {}
  }
  return null;
}

function parseEuroPrice(html: string): number | null {
  // Prefer a price with € symbol
  const m = html.match(/€\s*([0-9]{1,4}(?:[\.,][0-9]{2})?)/);
  if (!m || !m[1]) return null;
  const norm = m[1].replace('.', '').replace(',', '.');
  const num = parseFloat(norm);
  return Number.isFinite(num) ? num : null;
}

export async function getGeosanBattlePriceUSD(model: GundamModel): Promise<{ price: number; currency: 'USD'; url?: string } | null> {
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
  const productUrl = await findFirstProductUrl(query);
  if (!productUrl) return null;
  try {
    const res = await fetch(proxied(productUrl), { mode: 'cors' });
    if (!res.ok) return null;
    const html = await res.text();
    const eur = parseEuroPrice(html);
    if (eur == null) return null;
    const usd = Math.round((eur * DEFAULT_EUR_USD) * 100) / 100;
    try { localStorage.setItem(cacheKey, JSON.stringify({ price: usd, ts: Date.now(), url: productUrl })); } catch {}
    return { price: usd, currency: 'USD', url: productUrl };
  } catch {
    return null;
  }
}
