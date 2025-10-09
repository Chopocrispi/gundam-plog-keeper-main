import type { Offer, OffersIndex, GundamGrade } from '@/types/gundam';

// Lightweight client-side offers lookup that reads a static JSON index from /public
// Later this can be swapped for a real API that serves fresh scraped prices.

let cache: OffersIndex | null = null;

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function gradeAbbr(grade?: GundamGrade) {
  if (!grade) return '';
  const g = grade.toLowerCase();
  if (g.includes('high grade')) return 'hg';
  if (g.includes('real grade')) return 'rg';
  if (g.includes('master grade')) return 'mg';
  if (g.includes('perfect grade')) return 'pg';
  if (g.includes('full mechanics')) return 'fm';
  if (g.includes('super deformed')) return 'sd';
  if (g.includes('mega size')) return 'ms';
  return '';
}

export async function loadOffersIndex(): Promise<OffersIndex> {
  if (cache) return cache;
  try {
    // Respect Vite base path (works for dev, preview, and subpath deployments)
    const base = (import.meta as any)?.env?.BASE_URL || '/';
  const makePath = (name: string) => base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
  const buster = `t=${Date.now()}`;
  const primary = `${makePath('offers.json')}?${buster}`;
  const fallback = `${makePath('offers.sample.json')}?${buster}`;
    // eslint-disable-next-line no-console
    console.log('[offers] fetching index from', primary, 'or', fallback);
    let res: Response;
    try {
      res = await fetch(primary, { cache: 'no-store' });
    } catch (e) {
      console.warn('[offers] primary fetch failed, trying fallback', e);
      res = await fetch(fallback, { cache: 'no-store' });
    }
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('[offers] failed to load index:', res.status, res.statusText);
    }
    if (!res.ok) throw new Error(`Offers index fetch failed: ${res.status}`);
    const data = (await res.json()) as OffersIndex;
    cache = data;
  // eslint-disable-next-line no-console
  console.log('[offers] index loaded with keys:', Object.keys(data).length);
    return data;
  } catch (e) {
    console.warn('Failed to load offers index', e);
    cache = {};
    return cache;
  }
}

const STOP = new Set([
  'hg','rg','mg','pg','fm','sd','ms',
  'hguc','hghguc',
  'high','real','master','perfect','full','mechanics','mega','size','super','deformed','grade',
  'gundam','mobile','suit','model','kit'
]);

function tokenize(s: string): string[] {
  // split camelCase and letter-digit boundaries, underscores, and multiple hyphens
  const withSpaces = s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/[._]+/g, ' ')
    .replace(/-+/g, ' ');
  const raw = normalize(withSpaces)
    .split(' ')
    .filter(Boolean);
  const filtered = raw.filter(t => {
    if (STOP.has(t)) return false;
    if (t.length <= 1) return false;
    // drop pure numbers (like 097)
    if (/^\d+$/.test(t)) return false;
    return true;
  });
  // unique preserve order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of filtered) {
    if (!seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}

function tokensFromImageUrl(imageUrl?: string): string[] {
  if (!imageUrl) return [];
  try {
    const u = new URL(imageUrl);
    const base = u.pathname.split('/').pop() || '';
    const namePart = base.replace(/\.[^.]+$/, '');
    return tokenize(namePart);
  } catch {
    return tokenize(imageUrl);
  }
}

function pickByTokens(idx: OffersIndex, tokens: string[]): Offer[] {
  if (!tokens.length) return [];
  const results: Offer[] = [];
  const seen = new Set<string>();
  for (const [key, offers] of Object.entries(idx)) {
    const k = normalize(key);
    let matched = 0;
    for (const t of tokens) {
      if (k.includes(t)) matched++;
    }
    const needed = Math.min(3, tokens.length);
    if (matched >= needed) {
      for (const o of offers) {
        const sig = `${o.store}|${o.url}`;
        if (!seen.has(sig)) {
          seen.add(sig);
          results.push(o);
        }
      }
    }
  }
  return results;
}

export async function findOffersForModel(name: string, grade?: GundamGrade, opts?: { extraTerms?: string[]; imageUrl?: string }): Promise<Offer[]> {
  const idx = await loadOffersIndex();
  const extra = (opts?.extraTerms || []).concat(tokensFromImageUrl(opts?.imageUrl || ''));
  const extraStr = extra.join(' ');
  const q = normalize(`${gradeAbbr(grade)} ${name}`.trim());
  // eslint-disable-next-line no-console
  console.log('[offers] query:', q);
  // direct key match first
  let offers = idx[q];
  if (!offers) {
    // fallback: try without grade abbreviation
    const fallback = normalize(name);
  // eslint-disable-next-line no-console
  console.log('[offers] fallback query:', fallback);
    offers = idx[fallback] || [];
  }
  if (!offers || offers.length === 0) {
    // Try with extra terms from image/name tokens
    const combo1 = normalize(`${gradeAbbr(grade)} ${name} ${extraStr}`.trim());
    const combo2 = normalize(`${name} ${extraStr}`.trim());
    const tokens1 = tokenize(combo1);
    const tokens2 = tokenize(combo2);
    // eslint-disable-next-line no-console
    console.log('[offers] token search with', { tokens1, tokens2 });
    const byTokens = pickByTokens(idx, tokens1.length ? tokens1 : tokens2);
    offers = byTokens;
  }

  // dedupe by store hostname and sort by price asc
  const seen = new Map<string, Offer>();
  for (const o of offers) {
    try {
      const host = new URL(o.url).hostname.replace(/^www\./, '');
      const prev = seen.get(host);
      if (!prev || o.price < prev.price) seen.set(host, o);
    } catch {
      // if URL parsing fails, fallback to store string
      const key = o.store.toLowerCase();
      const prev = seen.get(key);
      if (!prev || o.price < prev.price) seen.set(key, o);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.price - b.price);
}
