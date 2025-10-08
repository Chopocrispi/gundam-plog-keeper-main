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

function gradeAbbr(grade?: GundamGrade): string | undefined {
  switch (grade) {
    case 'High Grade (HG)': return 'HG';
    case 'Real Grade (RG)': return 'RG';
    case 'Master Grade (MG)': return 'MG';
    case 'Perfect Grade (PG)': return 'PG';
    case 'Full Mechanics (FM)': return 'FM';
    case 'Super Deformed (SD)': return 'SD';
    default: return undefined;
  }
}

function normalizeName(raw: string): string {
  // Remove common scale tokens and inline grade tokens from the name to avoid over-restricting search
  let s = raw
    .replace(/\b1\s*\/\s*144\b/gi, '')
    .replace(/\b1\s*\/\s*100\b/gi, '')
    .replace(/\b1\s*\/\s*60\b/gi, '')
    .replace(/\b(HG|RG|MG|PG|FM|SD)\b/gi, '')
    .replace(/\b(High Grade|Real Grade|Master Grade|Perfect Grade|Full Mechanics|Super Deformed)\b/gi, '');
  // Collapse multiple spaces and trim
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

function buildSearchQueries(name: string, grade?: GundamGrade): string[] {
  const abbr = gradeAbbr(grade);
  const cleaned = normalizeName(name);
  const queries: string[] = [];
  if (abbr && cleaned) queries.push(`${abbr} ${cleaned}`.trim());
  if (cleaned) queries.push(cleaned);
  // If the cleaned name doesn't include 'gundam', try variants with the suffix which many stores include
  if (cleaned && !/\bgundam\b/i.test(cleaned)) {
    if (abbr) queries.push(`${abbr} ${cleaned} Gundam`.trim());
    queries.push(`${cleaned} Gundam`.trim());
  }
  // Final fallback: original name as-is
  queries.push(name);
  // Deduplicate while preserving order
  return Array.from(new Set(queries.filter(Boolean)));
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

  // Try multiple query variants, preferring "MG Aegis"-style over including scales like "1/100"
  const queries = buildSearchQueries(name, model.grade as GundamGrade);
  let productUrl: string | null = null;
  for (const q of queries) {
    productUrl = await findFirstProductUrl(q);
    if (productUrl) break;
  }
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
