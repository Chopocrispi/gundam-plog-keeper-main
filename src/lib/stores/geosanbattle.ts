import type { GundamModel, GundamGrade } from '@/types/gundam';

type ProviderResult = { price: number; url: string } | null;

const DEBUG = ((import.meta as unknown as { env?: { VITE_DEBUG_PRICING?: string } }).env?.VITE_DEBUG_PRICING) === 'true';
const PROXY_BASE = ((import.meta as unknown as { env?: { VITE_PROXY_BASE?: string } }).env?.VITE_PROXY_BASE) as string | undefined;
const GEOSAN_BASE = (((import.meta as unknown as { env?: { VITE_STORE_GEOSAN_BASE?: string } }).env?.VITE_STORE_GEOSAN_BASE) as string | undefined) || 'https://geosan-battle.com';
const EUR_USD_RATE = Number(((import.meta as unknown as { env?: { VITE_EUR_USD_RATE?: string } }).env?.VITE_EUR_USD_RATE)) || 1.08;

function proxied(url: string) {
  return PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(url)}` : url;
}

function cacheKey(name: string) {
  return `geosan:v3:${name.toLowerCase()}`;
}

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

function buildQueries(name: string, grade?: GundamGrade): string[] {
  const abbr = gradeAbbr(grade);
  const base = `${abbr} ${name}`.trim();
  const variants = [base, name];
  // Try without parentheses etc.
  const simple = name.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim();
  if (simple && simple !== name) variants.push(`${abbr} ${simple}`.trim(), simple);
  return Array.from(new Set(variants.filter(Boolean)));
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreTitle(title: string, qTokens: string[], abbr: string) {
  const t = normalize(title);
  if (abbr && !new RegExp(String.raw`(^|\s)${abbr.toLowerCase()}(\s|$)`).test(t)) return -1; // ensure grade presence
  if (/\b(cesta|raffle|sorteo)\b/.test(t)) return -1; // ignore baskets/raffles
  let score = 0;
  for (const tok of qTokens) if (t.includes(tok)) score += 1;
  if (/1\/(144|100|60)/.test(t)) score += 0.5;
  if (t.includes('gundam')) score += 0.25;
  // penalize variant words
  if (/\b(clear|metallic|translucent|event|pearl|coating|ver\.|version)\b/.test(t)) score -= 0.5;
  return score;
}

async function searchAndPickProductUrl(query: string, grade?: GundamGrade): Promise<string | null> {
  const qTokens = normalize(query).split(' ').filter(Boolean).filter(t => t.length > 1);
  const abbr = gradeAbbr(grade);
  const url = proxied(`${GEOSAN_BASE.replace(/\/$/, '')}/?s=${encodeURIComponent(query)}`);
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const html = await res.text();
    // Collect candidate product links
    const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const candidates: Array<{ href: string; text: string; score: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(html)) !== null) {
      const href = m[1];
      const text = m[2] || '';
      if (!/\/producto\//.test(href)) continue; // likely product
      const score = scoreTitle(text, qTokens, abbr);
      if (score > 0) candidates.push({ href, text, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    const pick = candidates[0]?.href;
    if (!pick) return null;
    return pick.startsWith('http') ? pick : GEOSAN_BASE.replace(/\/$/, '') + pick;
  } catch (e) {
    if (DEBUG) console.debug('[geosan] search error', e);
    return null;
  }
}

function parseEuroFromText(text: string): number | null {
  // Examples: 29,95 € or €29.95
  // Normalize separators
  const cleaned = text.replace(/\u00A0/g, ' ');
  const euroMatch = cleaned.match(/(?:(?:€|eur|euros)\s*)?([0-9]{1,3}(?:[.,][0-9]{3})*|[0-9]+)([.,][0-9]{2})\s*(?:€|eur|euros)?/i);
  if (!euroMatch) return null;
  let int = euroMatch[1];
  const dec = euroMatch[2];
  int = int.replace(/[.]/g, '').replace(/,/g, '');
  const num = parseFloat(int + '.' + dec.replace(/^[.,]/, ''));
  return Number.isFinite(num) ? num : null;
}

function extractPriceEURFromJsonLD(html: string): number | null {
  try {
    const scripts = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const tag of scripts) {
      const m = tag.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      const body = m ? m[1] : '';
      const data: unknown = JSON.parse(body);
      const arr: unknown[] = Array.isArray(data) ? data : [data];
      for (const d of arr) {
        if (!d || typeof d !== 'object') continue;
        const obj = d as Record<string, unknown>;
        const offers = obj['offers'];
        const offerItems: Array<Record<string, unknown>> = Array.isArray(offers)
          ? (offers as unknown[]).filter(o => o && typeof o === 'object') as Array<Record<string, unknown>>
          : (offers && typeof offers === 'object')
            ? [offers as Record<string, unknown>]
            : [];
        for (const off of offerItems) {
          const priceRaw = (off['price'] as unknown) ?? (off['priceSpecification'] && (off['priceSpecification'] as Record<string, unknown>)['price']);
          const currRaw = (off['priceCurrency'] as unknown) ?? (off['priceSpecification'] && (off['priceSpecification'] as Record<string, unknown>)['priceCurrency']);
          const curr = typeof currRaw === 'string' ? currRaw.toUpperCase() : '';
          if (priceRaw != null && (!curr || curr === 'EUR')) {
            const n = typeof priceRaw === 'string' ? parseFloat(priceRaw) : Number(priceRaw);
            if (Number.isFinite(n)) return n;
          }
        }
      }
    }
  } catch (e) {
    if (DEBUG) console.debug('[geosan] json-ld parse error', e);
  }
  return null;
}

function extractPriceEURFromSummary(html: string): number | null {
  // WooCommerce often has <p class="price">… €</p>
  const priceBlock = html.match(/<p[^>]*class="[^"]*price[^"]*"[^>]*>[\s\S]*?<\/p>/i)?.[0] || '';
  if (priceBlock) {
    const n = parseEuroFromText(priceBlock);
    if (n != null) return n;
  }
  // Try generic price span
  const amt = html.match(/<span[^>]*class="[^"]*(amount|Price-amount)[^"]*"[^>]*>[\s\S]*?<\/span>/i)?.[0] || '';
  if (amt) {
    const n = parseEuroFromText(amt);
    if (n != null) return n;
  }
  return null;
}

function extractPriceEURFromMeta(html: string): number | null {
  const m1 = html.match(/<meta[^>]*property="product:price:amount"[^>]*content="([^"]+)"/i);
  if (m1) {
    const n = parseFloat(m1[1]);
    if (Number.isFinite(n)) return n;
  }
  const m2 = html.match(/<meta[^>]*itemprop="price"[^>]*content="([^"]+)"/i);
  if (m2) {
    const n = parseFloat(m2[1]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function fetchProductPriceEUR(url: string): Promise<number | null> {
  try {
    const res = await fetch(proxied(url), { mode: 'cors' });
    if (!res.ok) return null;
    const html = await res.text();
    return (
      extractPriceEURFromJsonLD(html) ??
      extractPriceEURFromSummary(html) ??
      extractPriceEURFromMeta(html) ??
      null
    );
  } catch (e) {
    if (DEBUG) console.debug('[geosan] product parse error', e);
    return null;
  }
}

export async function getGeosanBattlePriceUSD(model: GundamModel, opts?: { force?: boolean }): Promise<ProviderResult> {
  const name = model.name?.trim();
  if (!name) return null;
  const key = cacheKey(name);
  if (!opts?.force) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const e = JSON.parse(raw) as { price: number; url: string; ts: number };
        if (Date.now() - e.ts < 1000 * 60 * 60) {
          if (DEBUG) console.debug('[geosan] cache hit', e);
          return { price: e.price, url: e.url };
        }
      }
    } catch (e) {
      if (DEBUG) console.debug('[geosan] cache parse error', e);
    }
  }

  // Search across variant queries and pick the best result
  const queries = buildQueries(name, model.grade as GundamGrade);
  if (DEBUG) console.debug('[geosan] queries', queries);
  for (const q of queries) {
    const productUrl = await searchAndPickProductUrl(q, model.grade as GundamGrade);
    if (!productUrl) continue;
    const eur = await fetchProductPriceEUR(productUrl);
    if (eur == null) continue;
    const usd = Math.round(eur * EUR_USD_RATE * 100) / 100;
    const result = { price: usd, url: productUrl };
    try { localStorage.setItem(key, JSON.stringify({ ...result, ts: Date.now() })); } catch (e) {
      if (DEBUG) console.debug('[geosan] cache write error', e);
    }
    return result;
  }
  return null;
}
// (Note) Single implementation above; no legacy duplicates.
