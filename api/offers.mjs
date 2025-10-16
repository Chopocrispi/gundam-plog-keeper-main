// Serverless endpoint to fetch live offers from multiple stores.
// Portable across hosts by using global fetch and lazy cheerio.
// Lazy-load Supabase client at runtime to avoid module-evaluation errors
let createSupabaseClient = null;
async function getSupabaseCreateClient() {
  if (createSupabaseClient) return createSupabaseClient;
  try {
    const mod = await import('@supabase/supabase-js');
    // support both named and default exports
    createSupabaseClient = mod.createClient || mod.default?.createClient || mod.default || null;
    return createSupabaseClient;
  } catch (e) {
    console.warn('unable to import @supabase/supabase-js dynamically', e?.message || e);
    return null;
  }
}

let _cheerio = null;
async function getCheerio() {
  if (_cheerio) return _cheerio;
  try {
    const mod = await import('cheerio');
    _cheerio = mod.default || mod;
    return _cheerio;
  } catch {
    return null;
  }
}

function getFetch() {
  if (typeof fetch !== 'undefined') return fetch;
  throw new Error('fetch_not_available: Host must provide global fetch (Node 18+ or Edge runtime).');
}

const DEFAULT_TIMEOUT_MS = 10000;
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const F = getFetch();
  const canAbort = typeof AbortController !== 'undefined';
  const controller = canAbort ? new AbortController() : null;
  const id = canAbort ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await F(url, { ...options, signal: controller?.signal });
    return res;
  } finally {
    if (id) clearTimeout(id);
  }
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[ν]/g, 'nu')
    .replace(/[α]/g, 'alpha')
    .replace(/[β]/g, 'beta')
    .replace(/[γ]/g, 'gamma')
    // Convert common roman numerals (standalone) to digits to help matching
    .replace(/\b(i{1,3})\b/g, (_, m) => String(m.length))
    .replace(/\b(iv)\b/g, '4')
    .replace(/\b(v)\b/g, '5')
    .replace(/\b(vi)\b/g, '6')
    .replace(/\b(vii)\b/g, '7')
    .replace(/\b(viii)\b/g, '8')
    .replace(/\b(ix)\b/g, '9')
    .replace(/\b(x)\b/g, '10')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function abbr(g) {
  const gg = (g || '').toLowerCase();
  if (gg.includes('high grade')) return 'hg';
  if (gg.includes('real grade')) return 'rg';
  if (gg.includes('master grade')) return 'mg';
  if (gg.includes('perfect grade')) return 'pg';
  if (gg.includes('full mechanics')) return 'fm';
  if (gg.includes('super deformed')) return 'sd';
  return '';
}

function tokenize(s) {
  // Split on spaces and hyphens so 'tri-stars' and 'tri stars' become the same tokens
  return normalize(s).split(/[	\n\r\s-]+/).filter(Boolean);
}

// Extract core tokens from the query that define the kit (model code and key words),
// removing generic words and grade-related tokens.
function coreTokens(q, grade) {
  const stop = new Set([
    'gundam','bandai','model','kit','plastic','scale','series','ver','version','limited','set','action','base','weapon','weapons','option','options','parts','support','goods',
    'hg','hguc','rg','mg','pg','fm','sd','high','real','master','perfect','full','mechanics','grade',
    '1','144','1/144','1/100','1/60','eg','fg'
  ]);
  const t = tokenize(q).filter(t => !stop.has(t));
  // keep alphanum with digits (codes like rgm 89s) and meaningful words (len>=3)
  const important = t.filter(tok => /\d/.test(tok) || tok.length >= 3);
  return Array.from(new Set(important));
}

// Basic relevance filter to avoid accessory/MSG/Kotobukiya hits and require token overlap
function isRelevantTitle(title, tokens) {
  const tt = tokenize(title);
  if (!tokens || tokens.length === 0) return true;
  const titleStr = tt.join(' ');
  const present = tokens.filter(t => titleStr.includes(t));
  // Block obvious accessories unless we have strong overlap
  const looksAccessory = /modeling support goods|\bmsg\b|m s g|accessor|weapon set|option parts|kotobukiya|frame arms|30mm|30 minutes missions/.test(titleStr);
  if (looksAccessory && present.length < 2) return false;
  // If any token includes digits (model codes), prefer a digit token match; otherwise allow a strong non-digit token match
  const digitTokens = tokens.filter(t => /\d/.test(t));
  if (digitTokens.length > 0) {
    const digitPresent = present.some(t => /\d/.test(t));
    if (!digitPresent) {
      // Fallback: accept if at least one strong non-digit token matches (e.g., 'justice')
      const strong = tokens.filter(t => !/\d/.test(t));
      if (strong.length === 0) return false;
      const strongPresent = strong.some(t => titleStr.includes(t));
      return strongPresent;
    }
    return true;
  }
  // Otherwise require at least 2 token overlaps to reduce false positives
  return present.length >= 2;
}

function queryVariants(q, grade) {
  const variants = new Set();
  const raw = (q || '').trim();
  const gabbr = abbr(grade);
  variants.add(raw);
  const depar = raw.replace(/[()]/g, ' ').replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim();
  variants.add(depar);
  const stop = new Set(['hg','rg','mg','pg','fm','sd','high','real','master','perfect','full','mechanics','grade','series']);
  const toks = normalize(depar).split(' ').filter(Boolean);
  const toksNoGrade = toks.filter(t => !stop.has(t) && t !== gabbr);
  if (toksNoGrade.length) variants.add(toksNoGrade.join(' '));
  const toksNoCodes = toksNoGrade.filter(t => !/^[a-z]*\d+[a-z\d-]*$/i.test(t));
  if (toksNoCodes.length) variants.add(toksNoCodes.join(' '));
  if (gabbr && toksNoGrade.length <= 3) variants.add(`${gabbr} ${toksNoGrade.join(' ')}`.trim());
  return Array.from(variants).filter(Boolean);
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
async function fetchText(url) {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

async function shopify(domain, query, source, grade) {
  try {
    const base = `https://${domain}`;
    const variants = queryVariants(query, grade);
    const tokens = coreTokens(query, grade);
    const out = [];
    // Try predictive/suggest API first
    for (const v of variants) {
      const tokens = coreTokens(v, grade);
      try {
        const suggest = `${base}/search/suggest.json?q=${encodeURIComponent(v)}&resources[type]=product&resources[limit]=20`;
        const data = await fetchJson(suggest);
        const products = data?.resources?.results?.products || [];
        for (const p of products) {
          const handle = p.handle || (p.url?.split('/products/')[1] || '').replace(/\/$/, '');
          if (!handle) continue;
          const pjs = await fetchJson(`${base}/products/${handle}.js`).catch(() => null);
          let price = null;
          if (pjs && typeof pjs.price === 'number') price = Math.round(pjs.price) / 100;
          const title = p.title || pjs?.title || 'Product';
          if (!isRelevantTitle(title, tokens)) continue;
          out.push({ store: source, title, url: `${base}/products/${handle}`, price, currency: 'USD' });
        }
        if (out.length) return out;
      } catch { /* try next variant */ }
    }
    // HTML fallback: parse /search results for product links
    for (const v of variants) {
      const tokens = coreTokens(v, grade);
      try {
        const abs = makeAbsolutizer(base);
        const links = await findProductLinks(`${base}/search?q=${encodeURIComponent(v)}`, (href) => href.includes('/products/'), abs);
        for (const url of links) {
          const handle = (url.split('/products/')[1] || '').replace(/\/$/, '');
          if (!handle) continue;
          const pjs = await fetchJson(`${base}/products/${handle}.js`).catch(() => null);
          let price = null;
          if (pjs && typeof pjs.price === 'number') price = Math.round(pjs.price) / 100;
          const title = pjs?.title || 'Product';
          if (!isRelevantTitle(title, tokens)) continue;
          out.push({ store: source, title, url: `${base}/products/${handle}`, price, currency: 'USD' });
        }
        if (out.length) return out;
      } catch { /* next variant */ }
    }
    return out;
  } catch {
    return [];
  }
}

async function htmlJsonLd(url, source, currencyGuess = 'USD', tokens) {
  try {
    const cheerio = await getCheerio();
    if (!cheerio) return [];
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const scripts = $('script[type="application/ld+json"]').map((_, el) => $(el).text()).get();
    const items = [];
    for (const s of scripts) {
      try {
        const obj = JSON.parse(s);
        const arr = Array.isArray(obj) ? obj : [obj];
        for (const it of arr) {
          const offers = it.offers;
          if (!offers) continue;
          const offArr = Array.isArray(offers) ? offers : [offers];
          for (const off of offArr) {
            const price = Number(String(off.price || off?.priceSpecification?.price).replace(',', '.'));
            if (!Number.isNaN(price)) {
              const title = it.name || 'Product';
              if (!isRelevantTitle(title, tokens)) continue;
              items.push({ store: source, title, url, price, currency: off.priceCurrency || currencyGuess });
            }
          }
        }
      } catch {}
    }
    return items;
  } catch {
    return [];
  }
}

function makeAbsolutizer(base) {
  return (href) => href.startsWith('http') ? href : (href.startsWith('/') ? `${base}${href}` : `${base}/${href}`);
}
async function findProductLinks(searchUrl, linkPredicate, absolutize) {
  try {
    const cheerio = await getCheerio();
    if (!cheerio) return [];
    const html = await fetchText(searchUrl);
    const $ = cheerio.load(html);
    const all = $('a[href]').map((_, el) => ({ href: $(el).attr('href'), text: $(el).text() })).get();
    const links = [];
    for (const a of all) {
      if (!a.href) continue;
      if (linkPredicate(a.href, a.text)) links.push(absolutize(a.href));
    }
    return Array.from(new Set(links)).slice(0, 5);
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  try {
  // Prefer frontend-provided canonical names (effectiveName/providedName)
  // which the UI may send as part of a live-first search flow. Be defensive:
  // some runtimes lower-case param names or provide the original query in
  // the raw url. Try several fallbacks before giving up.
  let q = '';
  try {
    const candidateNames = ['query', 'q', 'effectiveName', 'providedName', 'effectivename', 'providedname', 'effective_name', 'provided_name'];
    // Try req.query (direct and case-insensitive)
    const tryFromReqQuery = () => {
      if (!req.query) return null;
      // exact keys first
      for (const n of candidateNames) {
        if (Object.prototype.hasOwnProperty.call(req.query, n)) return req.query[n];
      }
      // case-insensitive match
      const keys = Object.keys(req.query || {});
      for (const k of keys) {
        if (candidateNames.find(n => n.toLowerCase() === k.toLowerCase())) return req.query[k];
      }
      return null;
    };

  let rawVal = tryFromReqQuery();
  let q_source = rawVal ? 'req.query' : null;
    // Fallback: parse req.url searchParams (use Host header if available)
    if (!rawVal && req.url && typeof req.url === 'string') {
      try {
        const base = req.headers && req.headers.host ? `http://${req.headers.host}` : 'http://localhost';
        const u = new URL(req.url, base);
        for (const n of candidateNames) {
          const v = u.searchParams.get(n) || u.searchParams.get(n.toLowerCase()) || u.searchParams.get(n.toUpperCase());
          if (v) { rawVal = v; break; }
        }
        if (rawVal) q_source = 'req.url';
      } catch (e) { /* ignore */ }
    }
    // Fallback: some proxies put the original request uri in headers like x-original-url
    if (!rawVal && req.headers && typeof req.headers === 'object') {
      const headerCandidates = ['x-original-url', 'x-forwarded-url', 'x-rewrite-url', 'x-forwarded-uri', 'x-original-uri'];
      for (const h of headerCandidates) {
        const hv = req.headers[h] || req.headers[h.toLowerCase()];
        if (!hv) continue;
        try {
          const base = req.headers && req.headers.host ? `http://${req.headers.host}` : 'http://localhost';
          const u2 = new URL(hv, base);
          for (const n of candidateNames) {
            const v = u2.searchParams.get(n) || u2.searchParams.get(n.toLowerCase());
            if (v) { rawVal = v; q_source = `header:${h}`; break; }
          }
        } catch (e) { /* ignore parse errors */ }
        if (rawVal) break;
      }
    }
    // Fallback: check JSON body (for POST clients)
    if (!rawVal && req.body) {
      for (const n of candidateNames) {
        if (Object.prototype.hasOwnProperty.call(req.body, n)) { rawVal = req.body[n]; break; }
      }
    }
    // Final robust fallback: try to regex-extract the param from common locations
    // Some hosts/proxies or client libraries may place the raw querystring in
    // req.url or req.originalUrl without populating req.query. Use a case-
    // insensitive regex to capture common param names and decode pluses.
    if (!rawVal) {
      const extractFromString = (s) => {
        if (!s || typeof s !== 'string') return null;
        const m = s.match(/[?&](effectiveName|providedName|effectivename|providedname|effective_name|provided_name|query|q)=([^&\n\r]+)/i);
        if (m && m[2]) return decodeURIComponent(m[2].replace(/\+/g, ' '));
        return null;
      };
      // Try req.url and req.originalUrl
      rawVal = extractFromString(req.url) || extractFromString(req.originalUrl) || rawVal;
      if (rawVal) q_source = rawVal ? (req.originalUrl && extractFromString(req.originalUrl) ? 'req.originalUrl' : 'req.url_regex') : q_source;
      // As a last resort, search stringified headers (some proxies stash the original URL there)
      if (!rawVal && req.headers) {
        try {
          const hs = JSON.stringify(req.headers);
          rawVal = extractFromString(hs);
          if (rawVal) q_source = 'headers_regex';
        } catch (e) {
          // ignore
        }
      }
    }
  q = rawVal ? String(rawVal) : '';
  // Attach q_source to req for debug usage later
  req._q_source = q_source || null;
  } catch (e) {
    q = '';
  }
    const grade = (req.query?.grade || '').toString();
    if (!q) {
      res.status(400).json({ error: 'Missing query' });
      return;
    }
    const variants = queryVariants(q, grade);

    // If Supabase credentials are provided in the environment, prefer reading
    // offers from the `products` table in the DB. This makes serverless
    // deployments return database-backed offers (URLs/prices) instead of
    // performing live scraping.
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL;
    const supabaseAnon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnon) {
      // When Supabase credentials are present, use the `products` table exclusively
      // and do NOT fall back to live scraping. We try a two-step search to avoid
      // malformed OR clause issues: 1) search by normalized url slug, 2) fallback
      // to searching the title text. Return the same response shape as the
      // scraping path ({ key, offers }).
      try {
        const createClient = await getSupabaseCreateClient();
        if (!createClient) {
          res.status(500).json({ error: 'supabase_import_failed', message: 'Could not import @supabase/supabase-js' });
          return;
        }
        const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
  // Accept raw query strings with punctuation (e.g., parentheses). Decode and normalize.
        let raw = q || '';
        if (Array.isArray(raw)) raw = raw[0];
        raw = decodeURIComponent(String(raw || '')).trim();
        const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        // Sanitize title search term to avoid special chars breaking the ilike clause
        const titleSanitized = raw.replace(/[\%\\]/g, '').trim();
        const titleLike = `%${titleSanitized}%`;

  // Sanitize grade for safe ilike usage (remove % and backslashes)
  const gradeSanitized = String(grade || '').replace(/[\%\\]/g, '').trim();

  const selectCols = 'store,title,url,price,currency,extra';

        // Build broad candidate query: search for core tokens in url/title using ilike.
        // We'll fetch candidates and then apply stricter filtering in JS to implement
        // the SQL-like semantics (numeric model matching and grade tokens).
  const mainTokens = coreTokens(raw, grade);
  // Also include raw tokens (pre-normalization) so forms like 'II' are matched.
  const rawTokens = (String(raw || '').toLowerCase().replace(/[()]/g, ' ').split(/\s+/).filter(Boolean)).map(t => t.replace(/[^a-z0-9-]/g, ''));
  // Extract numeric tokens early so slugVariants can use them
  const digitTokens = tokenize(raw).filter(t => /\d/.test(t));
        const tokenClauses = [];
        // Generate slug variants from the raw query to match store product handles/urls
        const slugBase = raw.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const slugVariants = new Set([slugBase]);
        // If there are numeric tokens, create zero-padded variants and simple numeric suffixes
        for (const dt of digitTokens) {
          const digits = (dt.match(/\d+/g) || []).join('');
          if (!digits) continue;
          slugVariants.add(slugBase.replace(digits, digits.padStart(3, '0')));
          slugVariants.add(slugBase.replace(digits, digits));
        }
        if (mainTokens.length === 0 && rawTokens.length === 0) {
          // fallback to raw term
          tokenClauses.push(`title.ilike.%${titleSanitized}%`);
          tokenClauses.push(`url.ilike.%${titleSanitized}%`);
        } else {
          const seenTok = new Set();
          for (const t of [...mainTokens, ...rawTokens]) {
            const tok = String(t || '').trim();
            if (!tok || seenTok.has(tok)) continue;
            seenTok.add(tok);
              const esc = tok.replace(/%/g, '');
              tokenClauses.push(`title.ilike.%${esc}%`);
              tokenClauses.push(`url.ilike.%${esc}%`);
              // Also search common JSON fields stored in `extra` to match SKUs / model codes
              // Example keys: sku, model_code, model, code, product_code
              tokenClauses.push(`extra->>sku.ilike.%${esc}%`);
              tokenClauses.push(`extra->>model_code.ilike.%${esc}%`);
              tokenClauses.push(`extra->>model.ilike.%${esc}%`);
              tokenClauses.push(`extra->>code.ilike.%${esc}%`);
              tokenClauses.push(`extra->>product_code.ilike.%${esc}%`);
          }
          // Add clauses that specifically match /products/<slug> URL forms and stored handles
          for (const s of Array.from(slugVariants)) {
            if (!s) continue;
            const sesc = s.replace(/%/g, '');
            tokenClauses.push(`url.ilike.%/products/${sesc}%`);
            tokenClauses.push(`extra->>handle.ilike.%${sesc}%`);
          }
        }

        // Build or() param for PostgREST
        const orParam = tokenClauses.join(',');
        let data = null;
        let error = null;
        try {
            // If grade is provided, narrow by grade first (exact or abbreviation), then by title/url
            let queryBuilder = supabase.from('products').select(selectCols).eq('active', true);
            if (gradeSanitized) {
              const gradeAbbrev = abbr(grade) || '';
              // Use ilike-based grade filtering (safer for multi-word grades). Match synonyms via abbreviation.
              const clauses = [];
              clauses.push(`grade.ilike.%${gradeSanitized}%`);
              if (gradeAbbrev) clauses.push(`grade.ilike.%${gradeAbbrev}%`);
              queryBuilder = queryBuilder.or(clauses.join(','));
            }
            // If we built specific grade filters, still apply the broad or() over title/url/extra
            if (orParam && orParam.length) {
              queryBuilder = queryBuilder.or(orParam);
            }
            // Final ordering and staged queries to avoid long OR clauses that time out.
            // Strategy:
            // 1) Try a focused title ilike('%raw%') with optional grade filter.
            // 2) If no results, iterate important tokens and accumulate matches (small per-token limits).
            // 3) Fallback to a limited broad OR query (safe guard on length).
            let resp = null;
            let accMap = new Map();
            try {
              // 1) Focused title search
              let q1 = supabase.from('products').select(selectCols).eq('active', true).ilike('title', `%${titleSanitized}%`);
              if (gradeSanitized) q1 = q1.ilike('grade', `%${gradeSanitized}%`);
              resp = await q1.order('price', { ascending: true }).limit(200);
              if (resp && Array.isArray(resp.data) && resp.data.length) {
                data = resp.data;
                error = resp.error;
              } else {
                // 2) Token-by-token accumulation
                const tokensForSearch = Array.from(new Set([...(mainTokens || []), ...(rawTokens || [])]));
                for (const tk of tokensForSearch) {
                  if (!tk) continue;
                  try {
                    let qtok = supabase.from('products').select(selectCols).eq('active', true).ilike('title', `%${tk}%`).limit(100);
                    if (gradeSanitized) qtok = qtok.ilike('grade', `%${gradeSanitized}%`);
                    const r = await qtok.order('price', { ascending: true });
                    if (r && Array.isArray(r.data)) {
                      for (const row of r.data) {
                        if (!row || !row.url) continue;
                        if (!accMap.has(row.url)) accMap.set(row.url, row);
                        if (accMap.size >= 400) break;
                      }
                    }
                  } catch (e) {
                    // ignore token-specific failures, try next token
                  }
                  if (accMap.size >= 400) break;
                }
                if (accMap.size) {
                  data = Array.from(accMap.values()).slice(0, 400);
                  error = null;
                } else {
                  // 3) Safe fallback: run the original broad OR but with a small limit to avoid timeouts
                  try {
                    const safeOr = orParam && orParam.length ? orParam : `title.ilike.%${titleSanitized}%`;
                    const r2 = await supabase.from('products').select(selectCols).or(safeOr).eq('active', true).order('price', { ascending: true }).limit(200);
                    data = r2.data;
                    error = r2.error;
                  } catch (e) {
                    // final fallback: empty result set
                    data = [];
                    error = e;
                  }
                }
              }
            } catch (e) {
              // If anything above throws, surface the error
              data = data || [];
              error = e;
            }
        } catch (e) {
          console.error('supabase broad search failed', e?.message || e);
          res.status(500).json({ error: 'supabase_broad_search_failed', message: String(e) });
          return;
        }

        if (error) {
          console.error('supabase query error', error);
          res.status(500).json({ error: 'supabase_query_failed', message: String(error.message || error) });
          return;
        }

  // Post-filter candidates to enforce numeric model tokens and grade tokens.
        const rows = Array.isArray(data) ? data : [];

  const gradeAbbr = abbr(grade) || '';

    // Extract numeric tokens from query, e.g., '97' from 'RGM-97' or '097'
  // (digitTokens already computed above)
  // Detect roman numerals present in raw tokens (e.g., II)
  const romanMatch = String(raw || '').toLowerCase().match(/\b(i{1,3}|iv|v|vi|vii|viii|ix|x)\b/);
  const hasRoman = !!romanMatch;
        const numericVariants = [];
        for (const dt of digitTokens) {
          const digits = (dt.match(/\d+/g) || []).join('');
          if (!digits) continue;
          const p1 = digits; // e.g., 97
          const p2 = digits.padStart(3, '0'); // e.g., 097
          // variants to match in url/title
          numericVariants.push(`-${p1}`);
          numericVariants.push(p1);
          numericVariants.push(p2);
          numericVariants.push(`no-${p1}`);
          numericVariants.push(`no-${p2}`);
        }

        // Grade tokens we consider satisfied by abbreviations and synonyms
        const gradeTokens = new Set();
        if (gradeAbbr) gradeTokens.add(gradeAbbr);
        if (gradeAbbr === 'hg') {
          gradeTokens.add('hguc');
          gradeTokens.add('high-grade');
          gradeTokens.add('high');
        }
        if (gradeAbbr === 'mg') {
          gradeTokens.add('master');
          gradeTokens.add('master-grade');
          gradeTokens.add('mg');
        }
        if (gradeAbbr === 'rg') {
          gradeTokens.add('real');
          gradeTokens.add('real-grade');
          gradeTokens.add('rg');
        }
        if (gradeAbbr === 'pg') {
          gradeTokens.add('perfect');
          gradeTokens.add('perfect-grade');
          gradeTokens.add('pg');
        }
        if (gradeAbbr === 'fm') {
          gradeTokens.add('full');
          gradeTokens.add('full-mechanics');
          gradeTokens.add('fm');
        }
        if (gradeAbbr === 'sd') {
          gradeTokens.add('super-deformed');
          gradeTokens.add('sd');
        }

        const offers = rows.map(r => {
          // Normalize extra JSON into a searchable string and object
          let extraText = '';
          let extraObj = null;
          try {
            if (r && r.extra) {
              if (typeof r.extra === 'string') {
                extraText = r.extra.toLowerCase();
                try { extraObj = JSON.parse(r.extra); } catch (e) { extraObj = null; }
              } else {
                extraObj = r.extra;
                extraText = JSON.stringify(r.extra || '').toLowerCase();
              }
            }
          } catch (e) {
            extraText = '';
            extraObj = null;
          }
          return {
            store: r.store || 'Store',
            title: r.title || '',
            url: r.url || '',
            price: r.price === null || r.price === undefined ? null : Number(r.price),
            currency: r.currency || 'USD',
            extraText,
            extraObj,
            _raw: r,
          };
        });

        // If debug flag is present, return candidate rows with matching diagnostics
        // Use a much faster, limited path for debug to avoid timeouts and skip
        // expensive enrichment and very large or() clauses.
        const debugMode = !!(req.query && (req.query.debug === '1' || req.query.debug === 'true'));
        if (debugMode) {
          try {
            // Narrow the selection and reduce limit to keep the response fast for debug
            const debugResp = await supabase
              .from('products')
              .select(selectCols)
              .or(orParam || `title.ilike.%${titleSanitized}%`, { count: 'exact' })
              .eq('active', true)
              .limit(200);
            const debugRows = Array.isArray(debugResp.data) ? debugResp.data : rows;
            const diagnostics = debugRows.map(r => {
              const urlL = (r.url || '').toLowerCase();
              const titleL = (r.title || '').toLowerCase();
              let extraL = '';
              let extraObjLocal = null;
              try { extraL = typeof r.extra === 'string' ? r.extra.toLowerCase() : JSON.stringify(r.extra || '').toLowerCase(); extraObjLocal = typeof r.extra === 'string' ? (() => { try { return JSON.parse(r.extra); } catch { return null; } })() : r.extra; } catch (e) { extraL = ''; extraObjLocal = null; }
              const text = `${urlL} ${titleL} ${extraL}`.trim();
              // consider both normalized main tokens and raw tokens (preserves hyphenated phrases)
              const matchTokens = Array.from(new Set([...(mainTokens || []), ...(rawTokens || [])]));
              const presentTokens = matchTokens.length ? matchTokens.filter(t => t && text.includes(t)) : [];
              const hasMain = matchTokens.length ? presentTokens.length > 0 : true;
              const hasNum = numericVariants.length ? numericVariants.some(v => text.includes(v)) || (hasRoman && (romanMatch && text.includes(romanMatch[0]))) : true;
              const hasGrade = gradeTokens.size ? Array.from(gradeTokens).some(gt => text.includes(gt)) : true;
              // detect extra/handle/sku exact or contains matches
              let matchedByExtra = false;
              let matchedExtraKey = null;
              const qLower = raw.toLowerCase();
              try {
                if (extraObjLocal) {
                  const keys = ['sku','model_code','model','code','product_code','handle'];
                  for (const k of keys) {
                    const v = extraObjLocal[k] || (extraObjLocal[k] === 0 ? '0' : null);
                    if (!v) continue;
                    const vs = String(v).toLowerCase();
                    if (vs === qLower || vs.includes(qLower) || qLower.includes(vs)) { matchedByExtra = true; matchedExtraKey = k; break; }
                  }
                }
              } catch (e) { matchedByExtra = false; }
              // detect slug/handle in url and return which slug matched for diagnostics
              let matchedByHandleUrl = false;
              let matchedSlug = null;
              if (slugVariants) {
                for (const s of Array.from(slugVariants)) {
                  if (!s) continue;
                  if (urlL.includes(s)) { matchedByHandleUrl = true; matchedSlug = s; break; }
                }
              }
              // include token/slug info to help debugging
              return { row: r, hasMain, hasNum, hasGrade, text, matchedByExtra, matchedExtraKey, matchedByHandleUrl, matchedSlug, slugVariants: Array.from(slugVariants || []), mainTokens, numericVariants: Array.from(numericVariants || []), gradeTokens: Array.from(gradeTokens || []) };
            });
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).json({ key: normalize(`${abbr(grade)} ${q}`.trim()), q_source: req._q_source || null, diagnostics });
            return;
          } catch (dbgE) {
            // Fall back to previously fetched rows if debug fast path fails
            console.warn('debug fast path failed, falling back to existing rows', dbgE?.message || dbgE);
            const diagnostics = rows.map(r => {
              const urlL = (r.url || '').toLowerCase();
              const titleL = (r.title || '').toLowerCase();
              let extraL = '';
              let extraObjLocal = null;
              try { extraL = typeof r.extra === 'string' ? r.extra.toLowerCase() : JSON.stringify(r.extra || '').toLowerCase(); extraObjLocal = typeof r.extra === 'string' ? (() => { try { return JSON.parse(r.extra); } catch { return null; } })() : r.extra; } catch (e) { extraL = ''; extraObjLocal = null; }
              const text = `${urlL} ${titleL} ${extraL}`.trim();
              const matchTokens = Array.from(new Set([...(mainTokens || []), ...(rawTokens || [])]));
              const presentTokens = matchTokens.length ? matchTokens.filter(t => t && text.includes(t)) : [];
              const hasMain = matchTokens.length ? presentTokens.length > 0 : true;
              const hasNum = numericVariants.length ? numericVariants.some(v => text.includes(v)) || (hasRoman && (romanMatch && text.includes(romanMatch[0]))) : true;
              const hasGrade = gradeTokens.size ? Array.from(gradeTokens).some(gt => text.includes(gt)) : true;
              let matchedByExtra = false;
              let matchedExtraKey = null;
              const qLower = raw.toLowerCase();
              try {
                if (extraObjLocal) {
                  const keys = ['sku','model_code','model','code','product_code','handle'];
                  for (const k of keys) {
                    const v = extraObjLocal[k] || (extraObjLocal[k] === 0 ? '0' : null);
                    if (!v) continue;
                    const vs = String(v).toLowerCase();
                    if (vs === qLower || vs.includes(qLower) || qLower.includes(vs)) { matchedByExtra = true; matchedExtraKey = k; break; }
                  }
                }
              } catch (e) { matchedByExtra = false; }
                let matchedByHandleUrl = false;
                let matchedSlug = null;
                if (slugVariants) {
                  for (const s of Array.from(slugVariants)) {
                    if (!s) continue;
                    if (urlL.includes(s)) { matchedByHandleUrl = true; matchedSlug = s; break; }
                  }
                }
                return { row: r, hasMain, hasNum, hasGrade, text, matchedByExtra, matchedExtraKey, matchedByHandleUrl, matchedSlug, slugVariants: Array.from(slugVariants || []), mainTokens, numericVariants: Array.from(numericVariants || []), gradeTokens: Array.from(gradeTokens || []) };
            });
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).json({ key: normalize(`${abbr(grade)} ${q}`.trim()), q_source: req._q_source || null, diagnostics });
            return;
          }
        }

        // Apply post-filtering to map->offers
        const filteredOffers = offers.filter(o => {
          if (!o.url && !o.title) return false;
          const urlL = (o.url || '').toLowerCase();
          const titleL = (o.title || '').toLowerCase();
          const extraL = (o.extraText || '').toLowerCase();
          const text = `${urlL} ${titleL} ${extraL}`;

          // Quick accept: if extra fields or the URL/handle slug match the query,
          // accept the row immediately (these indicate a canonical SKU/handle hit).
          const qLower = raw.toLowerCase();
          let matchedByExtra = false;
          try {
            const eo = o.extraObj;
            if (eo) {
              const keys = ['sku','model_code','model','code','product_code','handle'];
              for (const k of keys) {
                const v = eo[k] || (eo[k] === 0 ? '0' : null);
                if (!v) continue;
                const vs = String(v).toLowerCase();
                if (vs === qLower || vs.includes(qLower) || qLower.includes(vs)) { matchedByExtra = true; break; }
              }
            }
          } catch (e) { matchedByExtra = false; }
          const matchedByHandleUrl = slugVariants && Array.from(slugVariants).some(s => s && urlL.includes(s));
          if (matchedByExtra || matchedByHandleUrl) return true;

          // Require stronger token overlap to avoid single-token/color matches (e.g., 'black' matching many items)
          const matchTokens = Array.from(new Set([...(mainTokens || []), ...(rawTokens || [])]));
          const presentTokens = matchTokens.length ? matchTokens.filter(t => t && text.includes(t)) : [];
          if (matchTokens.length) {
            if (numericVariants.length) {
              // numeric queries: require at least one numeric match AND at least one other token
              const hasNumNow = numericVariants.some(v => text.includes(v)) || (hasRoman && (romanMatch && text.includes(romanMatch[0])));
              if (!hasNumNow) return false;
              if (presentTokens.length < 1) return false;
            } else {
              // non-numeric queries: require at least two matching tokens to be confident
              if (presentTokens.length < 2) return false;
            }
          }

          // If grade token exists, require grade token in url/title (e.g., hg => hguc or hg)
          if (gradeTokens.size) {
            const hasGradeNow = Array.from(gradeTokens).some(gt => text.includes(gt));
            if (!hasGradeNow) {
              // Relax grade enforcement when there's strong numeric + main-token evidence
              const hasNumNow = numericVariants.length ? numericVariants.some(v => text.includes(v)) || (hasRoman && (romanMatch && text.includes(romanMatch[0]))) : true;
              const hasMainNow = mainTokens.length ? mainTokens.some(t => text.includes(t)) : true;
              if (!(hasNumNow && hasMainNow)) return false;
            }
          }

          return true;
        });

        // Deduplicate by URL and keep lowest price ordering
        const byUrl = new Map();
        for (const o of filteredOffers) {
          if (!o.url) continue;
          const prev = byUrl.get(o.url);
          if (!prev || (typeof o.price === 'number' && o.price < prev.price)) byUrl.set(o.url, o);
        }
        const dedup = Array.from(byUrl.values()).sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
        // Enrich offers by scraping their URLs for missing title/price when possible.
        async function enrichOffer(o) {
          try {
            if ((o.title && o.title.trim()) && (typeof o.price === 'number' && !Number.isNaN(o.price))) return o;
            // Try JSON-LD parsing first
            const items = await htmlJsonLd(o.url, o.store || 'Store', o.currency || 'USD', coreTokens(raw, grade));
            if (Array.isArray(items) && items.length) {
              const it = items[0];
              if (it.title) o.title = it.title;
              if (typeof it.price === 'number' && !Number.isNaN(it.price)) o.price = it.price;
              if (it.currency) o.currency = it.currency;
              return o;
            }
            // Fallback: lightweight meta tag parsing
            const cheerio = await getCheerio();
            if (!cheerio) return o;
            const html = await fetchText(o.url).catch(() => null);
            if (!html) return o;
            const $ = cheerio.load(html);
            const ogTitle = $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || $('title').text();
            if (ogTitle && ogTitle.trim()) o.title = o.title || ogTitle.trim();
            // Try some common price hints
            const priceMeta = $('meta[property="product:price:amount"]').attr('content') || $('meta[itemprop="price"]').attr('content') || $('[itemprop="price"]').attr('content') || $('.price').first().text();
            if (priceMeta) {
              const priceNum = Number(String(priceMeta).replace(/[^0-9.,]/g, '').replace(',', '.'));
              if (!Number.isNaN(priceNum)) o.price = priceNum;
            }
            return o;
          } catch (e) {
            return o;
          }
        }

        // Limit concurrent enrichments to first N offers to avoid excessive scraping
        const ENRICH_LIMIT = 10;
        const toEnrich = dedup.slice(0, ENRICH_LIMIT);
        await Promise.all(toEnrich.map(o => enrichOffer(o)));

        // Resort after enrichment (price may have been filled)
  const final = Array.from(byUrl.values()).sort((a, b) => (a.price || Infinity) - (b.price || Infinity));

  // Strip internal fields (extraText/_raw) before returning to frontend
  const finalClean = final.map(({ store, title, url, price, currency }) => ({ store, title, url, price, currency }));

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  // Match the scraping response shape so the frontend can handle results consistently
  res.status(200).json({ key: normalize(`${abbr(grade)} ${q}`.trim()), offers: finalClean });
        return;
      } catch (dbErr) {
        console.error('supabase offers query failed', dbErr);
        // Return a helpful error body so client logs are more informative
        res.status(500).json({ error: 'supabase_query_exception', message: String(dbErr && dbErr.message ? dbErr.message : dbErr) });
        return;
      }
    }

    // Shopify domains across multiple regions
    const shopifyDomains = [
      // US
      ['newtype.us', 'Newtype'],
      ['usagundamstore.com', 'USA Gundam Store'],
      ['gundamplanet.com', 'Gundam Planet'],
      ['tatsuhobby.com', 'Tatsu Hobby'],
      ['mechawarehouse.com', 'Mecha Warehouse'],
      ['galactictoys.com', 'Galactic Toys'],
      ['gundampros.com', 'Gundam Pros'],
      ['modelgrade.net', 'Model Grade'],
      ['thegundamplace.com', 'The Gundam Place'],
      ['kappahobby.com', 'Kappa Hobby'],
      ['thegundamshop.com', 'The Gundam Shop'],
      ['eknightmedia.com', 'EKnight Media'], // some stores expose /products too
      // CA
      ['canadiangundam.com', 'Canadian Gundam'],
      // UK/IE
      ['gundammad.co.uk', 'Gundam Mad'],
      ['hobbyfrontline.com', 'Hobby Frontline'],
      // AU
      ['gundamexpress.com.au', 'Gundam Express'],
      ['akihabarastation.com.au', 'Akihabara Station'],
      ['metrohobbies.com.au', 'Metro Hobbies'],
      ['hobbyco.com.au', 'Hobbyco'],
      // JP/Intl (Shopify-based)
      ['hobby-genki.com', 'Hobby Genki'],
      ['sugoimart.com', 'Sugoi Mart'],
      ['ohmygundam.com', 'Oh My Gundam'],
      ['solarisjapan.com', 'Solaris Japan'],
      ['banzaihobby.com', 'Banzai Hobby'],
      ['lunapark.store', 'LUNA PARK'],
      ['kitzumi.shop', 'Kitzumi'],
    ];

    const tasks = [
      // Shopify stores
  ...shopifyDomains.map(([domain, label]) => shopify(domain, q, label, grade)),
      // Non-Shopify and international stores with HTML/JSON-LD parsing
      // Geosan Battle (ES, WooCommerce)
      (async () => {
        const base = 'https://geosanbattle.com';
        const abs = makeAbsolutizer(base);
        let links = [];
        // Prefer product search: /?s=term&post_type=product
        for (const v of variants) {
          const l = await findProductLinks(`${base}/?s=${encodeURIComponent(v)}&post_type=product`, (href) => href.includes('/producto/'), abs);
          links.push(...l);
          if (links.length) break;
        }
        // Fallback: shop page search (some themes support query on shop URL)
        if (!links.length) {
          for (const v of variants) {
            const l = await findProductLinks(`${base}/tienda-model-kit-gundam/?s=${encodeURIComponent(v)}`, (href) => href.includes('/producto/'), abs);
            links.push(...l);
            if (links.length) break;
          }
        }
        const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'Geosan Battle', 'EUR', coreTokens(v, grade)));
        return results;
      })(),
      // HobbyDigi (HK) — multiple locales
      (async () => {
        const base = 'https://www.hobbydigi.com';
        const abs = makeAbsolutizer(base);
        const searches = [
          `${base}/en_us/catalogsearch/result/?q=`,
          `${base}/en/catalogsearch/result/?q=`,
        ];
        let links = [];
        const predicate = (href) => (href.includes('/en_us/') || href.includes('/en/')) && (href.endsWith('.html') || href.includes('/product'));
        for (const s of searches) {
          for (const v of variants) {
            const l = await findProductLinks(`${s}${encodeURIComponent(v)}`, predicate, abs);
            links.push(...l);
            if (links.length) break;
          }
          if (links.length) break;
        }
        const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'HobbyDigi', 'HKD', coreTokens(v, grade)));
        return results;
      })(),
      // Mighty Ape (AU/NZ)
      (async () => {
        const base = 'https://www.mightyape.com.au';
        const abs = makeAbsolutizer(base);
        let links = [];
        for (const v of variants) {
          const l = await findProductLinks(`${base}/search?q=${encodeURIComponent(v)}`, (href) => href.includes('/product/'), abs);
          links.push(...l);
          if (links.length) break;
        }
        const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'Mighty Ape', 'AUD', coreTokens(v, grade)));
        return results;
      })(),
      // Entertainment Earth (US)
      (async () => {
        const base = 'https://www.entertainmentearth.com';
        const abs = makeAbsolutizer(base);
        let links = [];
        for (const v of variants) {
          const l = await findProductLinks(`${base}/search/?q=${encodeURIComponent(v)}`, (href) => href.includes('/product/'), abs);
          links.push(...l);
          if (links.length) break;
        }
        const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'Entertainment Earth', 'USD', coreTokens(v, grade)));
        return results;
      })(),
      // ZAVVI (US/UK/EU)
      (async () => {
        const base = 'https://www.zavvi.com';
        const abs = makeAbsolutizer(base);
        let links = [];
        for (const v of variants) {
          const l = await findProductLinks(`${base}//search/${encodeURIComponent(v)}/list`, (href) => href.includes('/zavvi/') || href.includes('/products/'), abs);
          links.push(...l);
          if (links.length) break;
        }
        const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'ZAVVI', 'USD', coreTokens(v, grade)));
        return results;
      })(),
      (async () => {
      const base = 'https://www.hlj.com';
      const abs = makeAbsolutizer(base);
      let links = [];
      for (const v of variants) {
        const l = await findProductLinks(`${base}/search/?q=${encodeURIComponent(v)}`, (href) => href.includes('/product/'), abs);
        links.push(...l);
        if (links.length) break;
      }
      const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'HLJ', 'JPY', coreTokens(v, grade)));
      return results;
    })(),
    (async () => {
      const base = 'https://www.1999.co.jp';
      const abs = makeAbsolutizer(base);
      let links = [];
      for (const v of variants) {
        const l = await findProductLinks(`${base}/eng/search?typ1=Sld&searchkey=${encodeURIComponent(v)}`, (href) => href.includes('/itm/'), abs);
        links.push(...l);
        if (links.length) break;
      }
      const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'HobbySearch', 'JPY', coreTokens(v, grade)));
      return results;
    })(),
    (async () => {
      const base = 'https://www.plazajapan.com';
      const abs = makeAbsolutizer(base);
      let links = [];
      for (const v of variants) {
        const l = await findProductLinks(`${base}/search.php?search_query=${encodeURIComponent(v)}`, (href) => href.includes('/products/'), abs);
        links.push(...l);
        if (links.length) break;
      }
      const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'Plaza Japan', 'USD', coreTokens(v, grade)));
      return results;
    })(),
    (async () => {
      const base = 'https://www.amiami.com';
      const abs = makeAbsolutizer(base);
      let links = [];
      for (const v of variants) {
        const l = await findProductLinks(`${base}/eng/search/list/?s_keywords=${encodeURIComponent(v)}`, (href) => href.includes('/product/'), abs);
        links.push(...l);
        if (links.length) break;
      }
      const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'AmiAmi', 'JPY', coreTokens(v, grade)));
      return results;
    })(),
    (async () => {
      const base = 'https://www.nin-nin-game.com';
      const abs = makeAbsolutizer(base);
      let links = [];
      for (const v of variants) {
        const l = await findProductLinks(`${base}/en/module/pm_advancedsearch/pm_advancedsearch?search_query=${encodeURIComponent(v)}`, (href) => (href.includes('/en/') || href.includes('/en/')) && !href.includes('/search') && !href.includes('/module/pm_advancedsearch'), abs);
        links.push(...l);
        if (links.length) break;
      }
      const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'Nin-Nin Game', 'EUR', coreTokens(v, grade)));
      return results;
    })(),
    // BigBadToyStore (BBTS)
    (async () => {
      const base = 'https://www.bigbadtoystore.com';
      const abs = makeAbsolutizer(base);
      let links = [];
      for (const v of variants) {
        const l = await findProductLinks(`${base}/Search?SearchText=${encodeURIComponent(v)}`,
          (href) => href.includes('/Product/'), abs);
        links.push(...l);
        if (links.length) break;
      }
      const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'BigBadToyStore', 'USD', coreTokens(v, grade)));
      return results;
    })(),
    // Premium Bandai USA
    (async () => {
      const base = 'https://p-bandai.com';
      const abs = makeAbsolutizer(base);
      let links = [];
      for (const v of variants) {
        const l = await findProductLinks(`${base}/us/search?keyword=${encodeURIComponent(v)}&all=true`,
          (href) => href.includes('/us/') && (href.includes('/product') || href.includes('/item') || href.includes('/products/')),
          abs);
        links.push(...l);
        if (links.length) break;
      }
      const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'Premium Bandai USA', 'USD', coreTokens(v, grade)));
      return results;
    })(),
    // MyKombini (FR)
    (async () => {
      const base = 'https://mykombini.com';
      const abs = makeAbsolutizer(base);
      let links = [];
      for (const v of variants) {
        const l = await findProductLinks(`${base}/en/search?controller=search&s=${encodeURIComponent(v)}`, (href) => href.includes('/en/') && (href.endsWith('.html') || href.includes('/product')), abs);
        links.push(...l);
        if (links.length) break;
      }
      const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'MyKombini', 'EUR', coreTokens(v, grade)));
      return results;
    })(),
    // Tokyo Otaku Mode
    (async () => {
      const base = 'https://otakumode.com';
      const abs = makeAbsolutizer(base);
      let links = [];
      for (const v of variants) {
        const l = await findProductLinks(`${base}/shop/search?keyword=${encodeURIComponent(v)}`, (href) => href.includes('/shop/p') || href.includes('/shop/'), abs);
        links.push(...l);
        if (links.length) break;
      }
      const results = [];
  for (const url of links) results.push(...await htmlJsonLd(url, 'Tokyo Otaku Mode', 'USD', coreTokens(v, grade)));
      return results;
    })(),
  ];
    const settled = await Promise.allSettled(tasks);
    const offers = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    // Dedupe by hostname, keep lowest price
    const seen = new Map();
    for (const o of offers) {
      if (!o?.url) continue;
      try {
        const host = new URL(o.url).hostname.replace(/^www\./, '');
        const prev = seen.get(host);
        if (!prev || (typeof o.price === 'number' && o.price < prev.price)) seen.set(host, o);
      } catch {}
    }
    const out = Array.from(seen.values()).filter(o => typeof o.price === 'number').sort((a, b) => a.price - b.price);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ key: normalize(`${abbr(grade)} ${q}`.trim()), offers: out });
  } catch (e) {
    console.error('offers api error', e);
    res.status(500).json({ error: 'internal_error', message: String(e?.message || e) });
  }
}
