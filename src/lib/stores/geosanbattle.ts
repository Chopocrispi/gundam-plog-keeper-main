import type { GundamGrade, GundamModel } from '@/types/gundam';

const BASE = 'https://geosanbattle.com';
const PROXY_BASE = (import.meta as any).env?.VITE_PROXY_BASE || 'https://gundapp.xyz/api/proxy';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const DEFAULT_EUR_USD = Number((import.meta as any).env?.VITE_EUR_USD_RATE) || 1.08;

function proxied(url: string) {
  return PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(url)}` : url;
}

function makeAbsolute(url: string): string {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${BASE}${url}`;
  return `${BASE}/${url}`;
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

function extractProductsFromSearch(html: string): Array<{ url: string; priceEur: number; img?: string; title?: string }> {
  const items: Array<{ url: string; priceEur: number; img?: string; title?: string }> = [];
  // WooCommerce archives typically wrap items in <li class="product"> ... </li>
  const liRe = /<li[^>]*class=["'][^"']*product[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;
  while ((match = liRe.exec(html)) !== null) {
    const block = match[1];
    const hrefMatch = block.match(/href=["']((?:https?:\/\/(?:www\.)?geosanbattle\.com)?\/(?:products?|product|producto)\/[A-Za-z0-9\-_%]+\/?)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1].startsWith('http') ? hrefMatch[1] : `${BASE}${hrefMatch[1]}`;
    // Try to capture image URL from common attributes
    let img: string | undefined;
    const imgTagMatch = block.match(/<img[^>]*>/i);
    if (imgTagMatch) {
      const tag = imgTagMatch[0];
      const srcset = tag.match(/srcset=["']([^"']+)["']/i)?.[1];
      const dataSrc = tag.match(/data-src=["']([^"']+)["']/i)?.[1] || tag.match(/data-lazy-src=["']([^"']+)["']/i)?.[1];
      const src = tag.match(/src=["']([^"']+)["']/i)?.[1];
      const firstSrcset = srcset ? srcset.split(',')[0].trim().split(' ')[0] : undefined;
      img = makeAbsolute((firstSrcset || dataSrc || src || '').trim());
    }
    const title = block.match(/<h2[^>]*class=["'][^"']*woocommerce-loop-product__title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
    const price = parseEuroPrice(block);
    if (price != null) {
      items.push({ url: href, priceEur: price, img, title });
    }
  }
  return items;
}

function expectedScaleFor(grade?: GundamGrade): string | undefined {
  switch (grade) {
    case 'High Grade (HG)':
    case 'Real Grade (RG)':
      return '1/144';
    case 'Master Grade (MG)':
    case 'Full Mechanics (FM)':
      return '1/100';
    case 'Perfect Grade (PG)':
      return '1/60';
    default:
      return undefined;
  }
}

function buildNameTokensForMatch(name: string): string[] {
  let s = name.toLowerCase();
  // Remove accents
  s = s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  // Keep letters, numbers, and separators -> split
  const raw = s.replace(/[^a-z0-9]+/g, ' ').trim();
  const parts = raw.split(/\s+/).filter(t => t.length >= 2);
  // De-duplicate tokens
  return Array.from(new Set(parts));
}

function scoreProductCandidate(p: { url: string; priceEur: number; title?: string }, opts: { gradeAbbr?: string; scale?: string; nameTokens: string[] }): number {
  const title = (p.title || '').toLowerCase();
  const urlPath = p.url.toLowerCase();
  const { gradeAbbr, scale, nameTokens } = opts;

  // Hard negative keywords common for accessories/promos
  const negatives = [
    'carta', 'promocional', 'promo', 'sticker', 'pegatina', 'soporte', 'base', 'stand', 'display',
    'decal', 'calcomania', 'calcomanias', 'decals', 'efecto', 'effect', 'weapons', 'weapon',
    'pieza', 'piezas', 'repuesto', 'part', 'parts', 'option', 'opcionales', 'gift card', 'tarjeta', 'entrada', 'ticket'
  ];
  for (const n of negatives) {
    if (title.includes(n)) return -1000; // reject
  }

  let score = 0;
  if (gradeAbbr) {
    const re = new RegExp(`(^|[^a-z0-9])${gradeAbbr.toLowerCase()}([^a-z0-9]|$)`);
    if (re.test(title) || urlPath.includes(`/${gradeAbbr.toLowerCase()}-`)) score += 50;
  }
  if (scale) {
    const s1 = scale.replace('/', '\\/');
    const re = new RegExp(`(\\b|^)${s1}(\\b|$)`);
    if (re.test(title) || urlPath.includes(scale.replace('/', '-'))) score += 25;
  }
  // Name tokens presence
  let tokenHits = 0;
  for (const t of nameTokens) {
    if (t.length <= 2) continue;
    if (title.includes(t)) tokenHits++;
  }
  score += tokenHits * 15;

  if (title.includes('gundam')) score += 10;
  if (/bandai|gunpla/.test(title)) score += 8;

  // Mild price bias (avoid ultra-low prices which are filtered anyway)
  if (p.priceEur > 10) score += 5;
  if (p.priceEur > 25) score += 5;
  if (p.priceEur > 40) score += 5;

  return score;
}

async function findFirstProductUrl(query: string, grade?: GundamGrade, modelName?: string): Promise<string | null> {
  // Try common search patterns (including WooCommerce search with post_type=product)
  const candidates = [
    // Prioritize WooCommerce-native product search
    proxied(`${BASE}/?s=${encodeURIComponent(query)}&post_type=product`),
    proxied(`${BASE}/?s=${encodeURIComponent(query)}`),
    // Fall back to other potential search endpoints
    proxied(`${BASE}/search?q=${encodeURIComponent(query)}&type=product`),
    proxied(`${BASE}/search?q=${encodeURIComponent(query)}`),
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) continue;
      const html = await res.text();
      const products = extractProductsFromSearch(html);
      if (products.length) {
        // Filter out very cheap items (e.g., promo cards at 0,75€). Keep items strictly over 2€
        const filtered = products.filter(p => p.priceEur > 2);
        const abbr = gradeAbbr(grade);
        const scale = expectedScaleFor(grade);
        const tokens = buildNameTokensForMatch(modelName || '');
        const scored = (filtered.length ? filtered : products)
          .map(p => ({ p, score: scoreProductCandidate(p, { gradeAbbr: abbr, scale, nameTokens: tokens }) }))
          .sort((a, b) => b.score - a.score || b.p.priceEur - a.p.priceEur);
        const top = scored[0];
        if (top && top.score > -1000) return top.p.url;
      }
      // Fallback: look for the first product-like link if no items parsed
      const m = html.match(/href=["']((?:https?:\/\/(?:www\.)?geosanbattle\.com)?\/(?:products?|product|producto)\/[A-Za-z0-9\-_%]+\/?)["']/i);
      if (m && m[1]) {
        const href = m[1].startsWith('http') ? m[1] : `${BASE}${m[1]}`;
        return href;
      }
    } catch {}
  }
  return null;
}

function parseEuroPrice(html: string): number | null {
  // Handle both formats: "€ 50,00" and "50,00€"
  const m = html.match(/€\s*([0-9]{1,4}(?:[\.,][0-9]{2})?)|([0-9]{1,4}(?:[\.,][0-9]{2})?)\s*€/);
  if (!m) return null;
  const raw = (m[1] || m[2]);
  if (!raw) return null;
  const norm = raw.replace(/\./g, '').replace(',', '.');
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
    productUrl = await findFirstProductUrl(q, model.grade as GundamGrade, name);
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
