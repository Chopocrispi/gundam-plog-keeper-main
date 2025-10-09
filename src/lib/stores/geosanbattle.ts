import type { GundamModel, GundamGrade } from '@/types/gundam';

const BASE = 'https://geosanbattle.com';
const PROXY_BASE = (import.meta as any).env?.VITE_PROXY_BASE || 'https://gundapp.xyz/api/proxy';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const EUR_USD = Number((import.meta as any).env?.VITE_EUR_USD_RATE) || 1.08;
const DEBUG = (import.meta as any).env?.VITE_DEBUG_PRICING === 'true';

function proxied(url: string) {
  return PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(url)}` : url;
}

function keyFor(model: GundamModel) {
  return `store:geosan:v3:${(model.name || '').toLowerCase()}|${model.grade || ''}`;
}

// Known URL overrides for exact matches
const URL_OVERRIDES: Array<{ test: RegExp; url: string }> = [
  // HG Exia
  { test: /\bhg\b.*\bexia\b/i, url: `${BASE}/producto/hg-gundam-00-1-144-gundam-exia-no-01/` },
];

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

function scaleForGrade(g?: GundamGrade): string | undefined {
  switch (g) {
    case 'High Grade (HG)': return '1/144';
    case 'Real Grade (RG)': return '1/144';
    case 'Master Grade (MG)': return '1/100';
    case 'Full Mechanics (FM)': return '1/100';
    case 'Perfect Grade (PG)': return '1/60';
    // SD commonly doesn’t use a scale in titles
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
  const sc = scaleForGrade(grade);
  const cleaned = normalizeName(name);
  const q: string[] = [];
  // Prefer grade + name
  if (ab && cleaned) q.push(`${ab} ${cleaned}`);
  // Add scale-enhanced variants when available
  if (sc && cleaned) {
    if (ab) q.push(`${ab} ${cleaned} ${sc}`);
    q.push(`${cleaned} ${sc}`, `${sc} ${cleaned}`);
  }
  // Generic fallbacks
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

type PickOpts = { gradeAbbr?: string; scale?: string; tokens?: string[] };

async function searchAndPickProductUrl(query: string, opts?: PickOpts): Promise<string | null> {
  const candidates = [
    proxied(`${BASE}/?s=${encodeURIComponent(query)}&post_type=product`),
    proxied(`${BASE}/?s=${encodeURIComponent(query)}`),
  ];
  const allItems: Array<{ url: string; price: number; title?: string }> = [];
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
        // ignore raffles or baskets
        if (/rifa|cesta|sorteo|raffle|basket/i.test(title || '')) continue;
        items.push({ url, price: eur, title });
      }
      allItems.push(...items);
    } catch {}
  }
  if (!allItems.length) return null;
  // Score items using grade abbreviation and scale, plus price as a weak signal
  const ab = opts?.gradeAbbr?.toLowerCase();
  const sc = opts?.scale?.toLowerCase();
  const toks = (opts?.tokens || []).map(s => s.toLowerCase()).filter(Boolean);
  const scored = allItems.map(it => {
    const t = (it.title || '').toLowerCase();
    let s = 0;
    if (ab && new RegExp(`(^|[^a-z0-9])${ab}([^a-z0-9]|$)`, 'i').test(t)) s += 15; // exact-ish grade token
    if (sc && t.includes(sc)) s += 12; // scale match
    // boost tokens from the requested name
    for (const tok of toks) {
      if (!tok) continue;
      if (t.includes(tok)) s += 8;
      if (new RegExp(`(^|[-_\s])${tok}($|[-_\s])`, 'i').test(t)) s += 2;
    }
    // small boost if title includes "gundam"
    if (t.includes('gundam')) s += 2;
    // strong penalties for variants/option sets similar to image ranking
    if (/clear\s*color|titanium|deactive|effect\s*unit|option\s*parts?|weapon\s*set|parts\s*set|recirculation|luminous|neon|plated|sparkle|mirror|coating|exclusive|limited/i.test(t)) s -= 40;
    // price as tie-breaker (prefer higher → full kits)
    s += Math.min(it.price / 10, 10);
    return { ...it, __score: s } as any;
  });
  scored.sort((a, b) => b.__score - a.__score);
  return scored[0].url;
}

export async function getGeosanBattlePriceUSD(
  model: GundamModel,
  opts?: { force?: boolean }
): Promise<{ price: number; currency: 'USD'; url?: string } | null> {
  const name = model.name?.trim();
  if (!name) return null;
  const cacheKey = keyFor(model);
  if (!opts?.force) {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as { price: number; ts: number; url?: string };
        if (Date.now() - cached.ts < CACHE_TTL_MS) {
          if (DEBUG) console.debug('[Geosan] cache hit', { name, url: cached.url, price: cached.price });
          return { price: cached.price, currency: 'USD', url: cached.url };
        }
      }
    } catch {}
  }

  const grade = model.grade as GundamGrade;
  const queries = buildQueries(name, grade);
  const tokens = normalizeName(name).split(/\s+/).map(s => s.trim()).filter(s => s && !QUERY_STOPWORDS.has(s.toLowerCase()) && s.length > 1);
  let url: string | null = null;
  // Apply overrides first
  const override = URL_OVERRIDES.find(o => o.test.test(`${(gradeAbbr(grade) || '')} ${name}`));
  if (override) url = override.url;
  for (const q of queries) {
    const picked = await searchAndPickProductUrl(q, { gradeAbbr: gradeAbbr(grade), scale: scaleForGrade(grade), tokens });
    if (!picked) continue;
    // Guard against mismatched grade in the title
    try {
      const res = await fetch(proxied(picked), { mode: 'cors' });
      if (!res.ok) continue;
      const html = await res.text();
      const title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').toLowerCase() || '';
      const ab = (gradeAbbr(grade) || '').toLowerCase();
      if (ab && !new RegExp(`(^|[^a-z0-9])${ab}([^a-z0-9]|$)`, 'i').test(title)) {
        // wrong grade (e.g., PG shown when asking for HG)
        continue;
      }
      url = picked;
      break;
    } catch {
      url = picked;
      break;
    }
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
