import type { Offer, OffersIndex, GundamGrade } from '@/types/gundam';

// Lightweight client-side offers lookup that reads a static JSON index from /public
// Later this can be swapped for a real API that serves fresh scraped prices.

let cache: OffersIndex | null = null;

const CDN_BASE = 'https://cdn.gunpladb.net/';
function stripCdnBase(u: string): string {
  if (!u) return u;
  return u.startsWith(CDN_BASE) ? u.slice(CDN_BASE.length) : u;
}

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

// Heuristics to detect grades from offer titles
const GRADE_MARKERS: Record<string, RegExp[]> = {
  hg: [
    /\bhigh\s*grade\b/i,
    /\bhg(?:\b|[A-Z])/i, // HG, HGUC, HGG, etc.
  ],
  rg: [/\breal\s*grade\b/i, /\brg\b/i],
  mg: [/\bmaster\s*grade\b/i, /\bmg\b/i],
  pg: [/\bperfect\s*grade\b/i, /\bpg\b/i],
  fm: [/\bfull\s*mechanics\b/i, /\bfm\b/i],
  sd: [/\bsuper\s*deformed\b/i, /\bsd\b/i, /\bMGSD\b/i],
  mgsd: [/\bMGSD\b/i],
  eg: [/\bentry\s*grade\b/i, /\beg\b/i],
  fg: [/\bfirst\s*grade\b/i, /\bfg\b/i],
  hirm: [/\bhigh\s*resolution\s*model\b/i, /\bhirm\b/i],
  ms: [/\bmega\s*size\b/i],
  lm: [/\blimited\s*model\b/i],
  hy2m: [/\bhy2m\b/i],
};

function normalizeGradeKey(g?: GundamGrade): keyof typeof GRADE_MARKERS | undefined {
  if (!g) return undefined;
  const s = g.toLowerCase();
  if (s.includes('high grade')) return 'hg';
  if (s.includes('real grade')) return 'rg';
  if (s.includes('master grade')) return 'mg';
  if (s.includes('perfect grade')) return 'pg';
  if (s.includes('full mechanics')) return 'fm';
  if (s.includes('super deformed')) return 'sd';
  if (s.includes('mgsd')) return 'mgsd';
  if (s.includes('entry grade')) return 'eg';
  if (s.includes('first grade')) return 'fg';
  if (s.includes('high resolution')) return 'hirm';
  if (s.includes('mega size')) return 'ms';
  if (s.includes('limited model')) return 'lm';
  if (s.includes('hy2m')) return 'hy2m';
  return undefined;
}

function titleHasMarker(title: string, key: keyof typeof GRADE_MARKERS): boolean {
  const patterns = GRADE_MARKERS[key] || [];
  return patterns.some(re => re.test(title));
}

function matchesSelectedGrade(title: string, grade?: GundamGrade): boolean {
  const key = normalizeGradeKey(grade);
  if (!key) return true; // no grade filter
  // Require the selected grade marker, if we can detect it
  if (!titleHasMarker(title, key)) return false;
  // Exclude titles that clearly indicate a conflicting grade
  for (const k of Object.keys(GRADE_MARKERS) as (keyof typeof GRADE_MARKERS)[]) {
    if (k === key) continue;
    if (titleHasMarker(title, k)) {
      return false;
    }
  }
  return true;
}

// Exclude non-model product lines (figures, etc.)
function isNonModelLine(title: string): boolean {
  const bad = [
    /robot\s*(damashii|spirits)/i,
    /tamashii\s*nations/i,
    /metal\s*build/i,
    /chogokin/i,
    /figure[-\s]*rise/i,
    /sh\s*figuarts/i,
    /nx\s*edge/i,
    /converge/i,
  ];
  return bad.some(re => re.test(title));
}

// Explicitly exclude decal listings (accessories)
function isDecal(title: string): boolean {
  return /\bdecals?\b/i.test(title);
}

export async function loadOffersIndex(): Promise<OffersIndex> {
  // If we already have a non-empty cache, use it
  if (cache && Object.keys(cache).length > 0) return cache;
  try {
    // Respect Vite base path (works for dev, preview, and subpath deployments)
    const base = import.meta.env?.BASE_URL || '/';
    const makePath = (name: string) => base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
    const ts = `t=${Date.now()}`;
    const relPrimary = `${makePath('offers.json')}?${ts}`;
    const relFallback = `${makePath('offers.sample.json')}?${ts}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const absPrimary = origin ? `${origin}${relPrimary.startsWith('/') ? '' : '/'}${relPrimary}` : relPrimary;
    const absFallback = origin ? `${origin}${relFallback.startsWith('/') ? '' : '/'}${relFallback}` : relFallback;

    const candidates = [relPrimary, relFallback, absPrimary, absFallback, '/offers.json?' + ts, '/offers.sample.json?' + ts];
    console.log('[offers] index candidates:', candidates);
    let lastErr: unknown = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          console.warn('[offers] fetch not ok:', url, res.status, res.statusText);
          continue;
        }
        const data = (await res.json()) as OffersIndex;
        cache = data || {};
        console.log('[offers] index loaded from', url, 'keys:', Object.keys(cache).length);
        return cache;
      } catch (err) {
        lastErr = err;
        console.warn('[offers] fetch failed for', url, err);
      }
    }
    console.error('[offers] all index candidates failed', lastErr);
    cache = {};
    return cache;
  } catch (e) {
    console.warn('Failed to load offers index', e);
    cache = {};
    return cache;
  }
}

// Prefetch the offers index (no-op if already cached)
export async function prefetchOffersIndex(): Promise<void> {
  try { await loadOffersIndex(); } catch {}
}

// Clear the in-memory cache (use on logout)
export function clearOffersCache(): void {
  cache = {} as OffersIndex;
}

const STOP = new Set([
  'hg','rg','mg','pg','fm','sd','ms','eg','fg','hirm','mgsd','lm','hy2m',
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
    // drop noisy tokens like 'hggs' 'hghggseed' that are grade prefixes glued to other letters
    if (/^(hg|rg|mg|pg|fm|sd)[a-z]{2,}$/.test(t)) return false;
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

async function tokensFromImage(imageUrl?: string): Promise<string[]> {
  if (!imageUrl) return [];
  let filename = '';
  try {
    const u = new URL(imageUrl);
    filename = u.pathname.split('/').pop() || '';
  } catch {
    filename = imageUrl.split('/').pop() || imageUrl;
  }
  const base = filename.replace(/\.[^.]+$/, '');
  const fromFilename = tokenize(base);
  // Augment tokens with the human-friendly kit name fetched from Supabase by URL
  try {
    const { supabaseAvailable, getSupabase } = await import('@/utils/supabase');
    if (!supabaseAvailable()) throw new Error('SUPABASE_DISABLED');
    const supabase = getSupabase();
    // Try exact full URL, then try matching stored path (without CDN base)
    const pathOnly = stripCdnBase(imageUrl);
    let { data, error } = await supabase
      .from('gunpla_models')
      .select('name')
      .eq('url', imageUrl)
      .maybeSingle();
    if ((error || !data) && pathOnly) {
      const alt = await supabase
        .from('gunpla_models')
        .select('name')
        .eq('url', pathOnly)
        .maybeSingle();
      data = alt.data as any;
      error = alt.error as any;
    }
    if (!error && data?.name) {
      const nameTokens = tokenize(String(data.name));
      const uniq = new Set<string>([...fromFilename, ...nameTokens]);
      return Array.from(uniq);
    }
  } catch (e) {
    if ((e as Error).message !== 'SUPABASE_DISABLED') {
      console.warn('[offers] supabase tokensFromImage error', e);
    }
  }
  return fromFilename;
}

function filenameFromUrl(imageUrl?: string): string | '' {
  if (!imageUrl) return '';
  try {
    const u = new URL(imageUrl);
    return u.pathname.split('/').pop() || '';
  } catch {
    return imageUrl.split('/').pop() || '';
  }
}

async function kitNameFromImage(imageUrl?: string): Promise<string | undefined> {
  const filename = filenameFromUrl(imageUrl);
  if (!filename) return undefined;
  // Prefer exact URL match in Supabase
  try {
    const { supabaseAvailable, getSupabase } = await import('@/utils/supabase');
    if (!supabaseAvailable()) throw new Error('SUPABASE_DISABLED');
    const supabase = getSupabase();
    const pathOnly = imageUrl ? stripCdnBase(imageUrl) : '';
    let { data, error } = await supabase
      .from('gunpla_models')
      .select('name')
      .eq('url', imageUrl)
      .maybeSingle();
    if ((error || !data) && pathOnly) {
      const alt = await supabase
        .from('gunpla_models')
        .select('name')
        .eq('url', pathOnly)
        .maybeSingle();
      data = alt.data as any;
      error = alt.error as any;
    }
    if (!error && data?.name) return String(data.name);
  } catch (e) {
    // ignore in absence of Supabase
  }
  // Fallback: try matching by filename suffix
  try {
    const { supabaseAvailable, getSupabase } = await import('@/utils/supabase');
    if (!supabaseAvailable()) throw new Error('SUPABASE_DISABLED');
    const supabase = getSupabase();
    const { data } = await supabase
      .from('gunpla_models')
      .select('name,url')
      .ilike('url', `%/${filename}`);
    const hit = (data || []).find(r => (r as any).url.endsWith(filename));
    return hit ? String((hit as any).name) : undefined;
  } catch {}
  return undefined;
}

function pickByTokens(idx: OffersIndex, tokens: string[]): Offer[] {
  if (!tokens.length) return [];
  const results: Offer[] = [];
  const seen = new Set<string>();
  // Strengthen threshold: if we have many tokens, require more to match
  const needed = tokens.length >= 6 ? 4 : tokens.length >= 4 ? 3 : Math.min(2, tokens.length);
  // Anchor pairs to enforce when present in the query tokens
  const anchorPairs: Array<[string, string]> = [
    ['astray', 'frame'],
  ];
  for (const [key, offers] of Object.entries(idx)) {
    const k = normalize(key);
    let matched = 0;
    for (const t of tokens) {
      if (k.includes(t)) matched++;
    }
    // If anchors are present in the query, require they exist in the key
    const anchorsOk = anchorPairs.every(([a, b]) => {
      if (tokens.includes(a) && tokens.includes(b)) {
        return k.includes(a) && k.includes(b);
      }
      return true;
    });
    if (matched >= needed && anchorsOk) {
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
  // Resolve the most specific human title we can (prefer Supabase name by image),
  // then query the live API FIRST using that exact title to maximize store coverage.
  const imgTokens = await tokensFromImage(opts?.imageUrl || '');
  // Prefer the canonical kit name from the database when available
  const dbName = await kitNameFromImage(opts?.imageUrl);
  const effectiveName = dbName || name;
  // eslint-disable-next-line no-console
  console.log('[offers] live-first query:', { effectiveName, providedName: name, grade });

  let offers: Offer[] = [];
  try {
    const live = await fetchLiveOffers(effectiveName, grade);
    if (live.length > 0) {
      offers = live
        .filter(o => typeof o.price === 'number' && o.price > 0)
        .filter(o => matchesSelectedGrade(o.title, grade) && !isNonModelLine(o.title) && !isDecal(o.title));
    }
  } catch (e) {
    console.warn('[offers] live fetch failed', e);
  }

  // If live came back empty, fall back to the static index (direct key, then a loose token match)
  if (!offers || offers.length === 0) {
    const idx = await loadOffersIndex();
    const q = normalize(`${gradeAbbr(grade)} ${effectiveName}`.trim());
    let staticOffers = idx[q] || [];
    if (!staticOffers || staticOffers.length === 0) {
      const extra = (opts?.extraTerms || []).concat(imgTokens);
      const combo = normalize(`${gradeAbbr(grade)} ${effectiveName} ${extra.join(' ')}`.trim());
      const byTokens = pickByTokens(idx, tokenize(combo));
      staticOffers = byTokens;
    }
    offers = (staticOffers || [])
      .filter(o => typeof o.price === 'number' && o.price > 0)
      .filter(o => matchesSelectedGrade(o.title, grade) && !isNonModelLine(o.title) && !isDecal(o.title));
  }

  // Dedupe by hostname and sort by price ascending
  const seen = new Map<string, Offer>();
  for (const o of offers) {
    try {
      const host = new URL(o.url).hostname.replace(/^www\./, '');
      const prev = seen.get(host);
      if (!prev || o.price < prev.price) seen.set(host, o);
    } catch {
      const key = o.store.toLowerCase();
      const prev = seen.get(key);
      if (!prev || o.price < prev.price) seen.set(key, o);
    }
  }
  return Array.from(seen.values())
    .filter(o => !isDecal(o.title))
    .sort((a, b) => a.price - b.price);
}

async function fetchLiveOffers(name: string, grade?: GundamGrade): Promise<Offer[]> {
  const base = import.meta.env?.BASE_URL || '/';
  const qs = new URLSearchParams({ query: name, grade: grade || '' }).toString();
  // Prefer same-origin /api path
  const urls = [
    `${base.endsWith('/') ? base.slice(0, -1) : base}/api/offers?${qs}`,
    `/api/offers?${qs}`,
  ];
  for (const u of urls) {
    try {
      console.log('[offers] live fetch', u);
      const res = await fetch(u, { cache: 'no-store' });
      if (!res.ok) {
        console.warn('[offers] live fetch not ok', res.status, res.statusText);
        continue;
      }
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.offers || []);
      const out: Offer[] = arr
        .filter((o: any) => o && typeof o.url === 'string')
        .map((o: any) => ({
          store: String(o.store || o.source || 'Store'),
          title: String(o.title || 'Product'),
          url: String(o.url),
          price: typeof o.price === 'number' ? o.price : Number(o.price),
          currency: String(o.currency || 'USD'),
          availability: o.availability || undefined,
        }))
        .filter(o => !Number.isNaN(o.price) && o.price > 0);
      if (out.length > 0) return out;
    } catch (e) {
      console.warn('[offers] live fetch error', e);
    }
  }
  return [];
}

// Lightweight static-only variant used for summary UI (e.g., avg price on cards)
// Avoids calling the live API to keep the UI snappy.
export async function findStaticOffersForModel(name: string, grade?: GundamGrade, opts?: { imageUrl?: string }): Promise<Offer[]> {
  const idx = await loadOffersIndex();
  const imgTokens = await tokensFromImage(opts?.imageUrl || '');
  const q = normalize(`${gradeAbbr(grade)} ${name}`.trim());
  let staticOffers = idx[q] || [];
  if (!staticOffers || staticOffers.length === 0) {
    const combo = normalize(`${gradeAbbr(grade)} ${name} ${imgTokens.join(' ')}`.trim());
    staticOffers = pickByTokens(idx, tokenize(combo));
  }
  const filtered = (staticOffers || [])
    .filter(o => typeof o.price === 'number' && o.price > 0)
    .filter(o => matchesSelectedGrade(o.title, grade) && !isNonModelLine(o.title) && !isDecal(o.title));

  // Dedupe by hostname and sort by price ascending
  const seen = new Map<string, Offer>();
  for (const o of filtered) {
    try {
      const host = new URL(o.url).hostname.replace(/^www\./, '');
      const prev = seen.get(host);
      if (!prev || o.price < prev.price) seen.set(host, o);
    } catch {
      const key = o.store.toLowerCase();
      const prev = seen.get(key);
      if (!prev || o.price < prev.price) seen.set(key, o);
    }
  }
  return Array.from(seen.values())
    .filter(o => !isDecal(o.title))
    .sort((a, b) => a.price - b.price);
}
