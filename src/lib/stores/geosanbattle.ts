import type { GundamModel, GundamGrade } from '@/types/gundam';

const BASE = 'https://geosanbattle.com';
const PROXY_BASE = (import.meta as any).env?.VITE_PROXY_BASE || 'https://gundapp.xyz/api/proxy';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const EUR_USD = Number((import.meta as any).env?.VITE_EUR_USD_RATE) || 1.08;

function proxied(url: string) {
  return PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(url)}` : url;
}

function keyFor(model: GundamModel) {
  return `store:geosan:v2:${(model.name || '').toLowerCase()}|${model.grade || ''}`;
}

function gradeAbbr(g?: GundamGrade) {
  switch (g) {
    case 'High Grade (HG)': return 'HG';
    case 'Real Grade (RG)': return 'RG';
    case 'Master Grade (MG)': return 'MG';
    case 'Perfect Grade (PG)': return 'PG';
    case 'Full Mechanics (FM)': return 'FM';
    case 'Super Deformed (SD)': return 'SD';
    default: return undefined;
  }
}

// Basic stopwords to reduce noise in store search queries
const QUERY_STOPWORDS = new Set([
  'gundam', 'mobile', 'suit', 'ver', 'version', 'clear', 'color', 'colors', 'the', 'of', 'from', 'and'
]);

function normalizeName(raw: string): string {
  // remove scales and grade abbreviations
  let s = raw
    .replace(/\b1\s*\/\s*(144|100|60)\b/gi, '')
    .replace(/\b(HG|RG|MG|PG|FM|SD)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // strip simple stopwords
  const parts = s.split(/\s+/).map(p => p.toLowerCase());
  const kept = parts.filter(p => p && !QUERY_STOPWORDS.has(p));
  return kept.length ? kept.join(' ') : s;
}

function buildQueries(name: string, grade?: GundamGrade) {
  const ab = gradeAbbr(grade);
  const cleaned = normalizeName(name);
  const q: string[] = [];
  if (ab && cleaned) q.push(`${ab} ${cleaned}`);
  q.push(cleaned, `${cleaned} Gundam`, name);
  return Array.from(new Set(q.filter(Boolean)));
}

function parseEuro(html: string): number | null {
  const m = html.match(/€\s*([0-9]{1,4}(?:[\.,][0-9]{2})?)|([0-9]{1,4}(?:[\.,][0-9]{2})?)\s*€/);
  if (!m) return null;
  const raw = (m[1] || m[2]);
  if (!raw) return null;
  const norm = raw.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(norm);
  return Number.isFinite(num) ? num : null;
}

async function searchAndPickProductUrl(query: string): Promise<string | null> {
  const candidates = [
    proxied(`${BASE}/?s=${encodeURIComponent(query)}&post_type=product`),
    proxied(`${BASE}/?s=${encodeURIComponent(query)}`),
  ];
  for (const u of candidates) {
    try {
      const res = await fetch(u, { mode: 'cors' });
      if (!res.ok) continue;
      const html = await res.text();
      // Collect product entries
      const items: Array<{ url: string; price: number; title?: string }> = [];
      const liRe = /<li[^>]*class=["'][^"']*product[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
      let m: RegExpExecArray | null;
      while ((m = liRe.exec(html)) !== null) {
        const block = m[1];
        const href = block.match(/href=["']((?:https?:\/\/(?:www\.)?geosanbattle\.com)?\/(?:product|products|producto)\/[A-Za-z0-9\-_%]+\/?)["']/i)?.[1];
        if (!href) continue;
        const url = href.startsWith('http') ? href : `${BASE}${href}`;
        const eur = parseEuro(block);
        if (eur == null) continue;
        // ignore accessories <= 2€
        if (eur <= 2) continue;
        const title = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
        items.push({ url, price: eur, title });
      }
      if (items.length) {
        // Prefer highest price to bias toward full kits
        items.sort((a, b) => b.price - a.price);
        return items[0].url;
      }
    } catch {}
  }
  return null;
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

  const queries = buildQueries(name, model.grade as GundamGrade);
  let url: string | null = null;
  for (const q of queries) {
    url = await searchAndPickProductUrl(q);
    if (url) break;
  }
  if (!url) return null;
  try {
    const res = await fetch(proxied(url), { mode: 'cors' });
    if (!res.ok) return null;
    const html = await res.text();
    const eur = parseEuro(html);
    if (eur == null) return null;
    const usd = Math.round((eur * EUR_USD) * 100) / 100;
    try { localStorage.setItem(cacheKey, JSON.stringify({ price: usd, ts: Date.now(), url })); } catch {}
    return { price: usd, currency: 'USD', url };
  } catch {
    return null;
  }
}

// (Note) A legacy implementation was removed; the above function is the only export.
