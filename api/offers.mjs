// Serverless endpoint to fetch live offers from multiple stores.
// Portable across hosts by using global fetch and lazy cheerio.
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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
  return normalize(s).split(' ').filter(Boolean);
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
    const q = (req.query?.query || req.query?.q || '').toString();
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
        const supabase = createSupabaseClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
        // Accept raw query strings with punctuation (e.g., parentheses). Decode and normalize.
        let raw = q || '';
        if (Array.isArray(raw)) raw = raw[0];
        raw = decodeURIComponent(String(raw || '')).trim();
        const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        // Sanitize title search term to avoid special chars breaking the ilike clause
        const titleSanitized = raw.replace(/[\%\\]/g, '').trim();
        const titleLike = `%${titleSanitized}%`;

        const selectCols = 'store,title,url,price,currency,extra,availability';

        // First try searching by URL-like slug
        let data = null;
        let error = null;
        try {
          const resp = await supabase
            .from('products')
            .select(selectCols)
            .ilike('url', `%${slug}%`)
            .eq('active', true)
            .order('price', { ascending: true })
            .limit(2000);
          data = resp.data;
          error = resp.error;
        } catch (e) {
          // continue to title search
          console.warn('supabase url search failed, will try title search', e?.message || e);
        }

        // If url search returned nothing or errored, try title ilike
        if ((!Array.isArray(data) || data.length === 0) && !error) {
          try {
            const resp2 = await supabase
              .from('products')
              .select(selectCols)
              .ilike('title', titleLike)
              .eq('active', true)
              .order('price', { ascending: true })
              .limit(2000);
            data = resp2.data;
            error = resp2.error;
          } catch (e) {
            error = e;
          }
        }

        if (error) {
          console.error('supabase query error', error);
          res.status(500).json({ error: 'supabase_query_failed', message: String(error.message || error) });
          return;
        }

        // Map DB rows to offer objects; allow price to be null if DB doesn't have it
        const offers = (data || []).map(r => ({
          store: r.store || 'Store',
          title: r.title || '',
          url: r.url || '',
          price: r.price === null || r.price === undefined ? null : Number(r.price),
          currency: r.currency || 'USD',
          availability: r.availability || undefined,
        })).filter(o => o.url);

        // Deduplicate by URL and keep lowest price ordering
        const byUrl = new Map();
        for (const o of offers) {
          if (!o.url) continue;
          const prev = byUrl.get(o.url);
          if (!prev || (typeof o.price === 'number' && o.price < prev.price)) byUrl.set(o.url, o);
        }
        const dedup = Array.from(byUrl.values()).sort((a, b) => (a.price || Infinity) - (b.price || Infinity));

        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        // Match the scraping response shape so the frontend can handle results consistently
        res.status(200).json({ key: normalize(`${abbr(grade)} ${q}`.trim()), offers: dedup });
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
