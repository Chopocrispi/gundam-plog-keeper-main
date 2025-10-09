// Serverless endpoint to fetch live offers from multiple stores.
// Designed to be portable across hosts (Vercel/Netlify/etc.) by avoiding Node-only
// imports at module load. Uses dynamic imports and global fetch when available.

// Lazy-load cheerio only when needed; return null if unavailable in the runtime.
let _cheerio = null;
async function getCheerio() {
  if (_cheerio) return _cheerio;
  try {
    const mod = await import('cheerio');
    _cheerio = mod.default || mod;
    return _cheerio;
  } catch {
    return null; // HTML parsing won't be available; non-Shopify scrapes will be skipped
  }
}

function getFetch() {
  if (typeof fetch !== 'undefined') return fetch;
  throw new Error('fetch_not_available: Host must provide global fetch (Node 18+ or Edge runtime).');
}

const DEFAULT_TIMEOUT_MS = 10000; // 10s per upstream request

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
    // normalize greek letters often used in kit names
    .replace(/[νν]/g, 'nu')
    .replace(/[α]/g, 'alpha')
    .replace(/[β]/g, 'beta')
    .replace(/[γ]/g, 'gamma')
    // strip punctuation
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

function queryVariants(q, grade) {
  const variants = new Set();
  const raw = (q || '').trim();
  const g = (grade || '').toLowerCase();
  const gabbr = abbr(grade);
  variants.add(raw);
  // Remove parentheses and punctuation; collapse dashes
  const depar = raw.replace(/[()]/g, ' ').replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim();
  variants.add(depar);
  // Remove grade words
  const stop = new Set(['hg','rg','mg','pg','fm','sd','high','real','master','perfect','full','mechanics','grade','series']);
  const toks = normalize(depar).split(' ').filter(Boolean);
  const toksNoGrade = toks.filter(t => !stop.has(t) && t !== gabbr);
  if (toksNoGrade.length) variants.add(toksNoGrade.join(' '));
  // Try without model codes with digits-only tokens trimmed to keep nouns
  const toksNoCodes = toksNoGrade.filter(t => !/^[a-z]*\d+[a-z\d-]*$/i.test(t));
  if (toksNoCodes.length) variants.add(toksNoCodes.join(' '));
  // Combine with grade abbr prefix if short query
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

async function shopify(domain, query, source) {
  try {
    const base = `https://${domain}`;
    const variants = queryVariants(query);
    const out = [];
    // Try predictive/suggest API first
    for (const v of variants) {
      try {
        const suggest = `${base}/search/suggest.json?q=${encodeURIComponent(v)}&resources[type]=product&resources[limit]=10`;
        const data = await fetchJson(suggest);
        const products = data?.resources?.results?.products || [];
        for (const p of products) {
          const handle = p.handle || (p.url?.split('/products/')[1] || '').replace(/\/$/, '');
          if (!handle) continue;
          const pjs = await fetchJson(`${base}/products/${handle}.js`).catch(() => null);
          let price = null;
          if (pjs && typeof pjs.price === 'number') price = Math.round(pjs.price) / 100;
          out.push({ store: source, title: p.title || pjs?.title || 'Product', url: `${base}/products/${handle}`, price, currency: 'USD' });
        }
        if (out.length) return out;
      } catch { /* try next variant */ }
    }
    // HTML fallback: parse /search results for product links
    for (const v of variants) {
      try {
        const abs = makeAbsolutizer(base);
        const links = await findProductLinks(`${base}/search?q=${encodeURIComponent(v)}`, (href) => href.includes('/products/'), abs);
        for (const url of links) {
          const handle = (url.split('/products/')[1] || '').replace(/\/$/, '');
          if (!handle) continue;
          const pjs = await fetchJson(`${base}/products/${handle}.js`).catch(() => null);
          let price = null;
          if (pjs && typeof pjs.price === 'number') price = Math.round(pjs.price) / 100;
          out.push({ store: source, title: pjs?.title || 'Product', url: `${base}/products/${handle}`, price, currency: 'USD' });
        }
        if (out.length) return out;
      } catch { /* next variant */ }
    }
    return out;
  } catch {
    return [];
  }
}

async function htmlJsonLd(url, source, currencyGuess = 'USD') {
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
              items.push({ store: source, title: it.name || 'Product', url, price, currency: off.priceCurrency || currencyGuess });
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
    const tasks = [
    shopify('newtype.us', q, 'Newtype'),
    shopify('usagundamstore.com', q, 'USA Gundam Store'),
    shopify('gundamplanet.com', q, 'Gundam Planet'),
    shopify('tatsuhobby.com', q, 'Tatsu Hobby'),
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
      for (const url of links) results.push(...await htmlJsonLd(url, 'HLJ', 'JPY'));
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
      for (const url of links) results.push(...await htmlJsonLd(url, 'HobbySearch', 'JPY'));
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
      for (const url of links) results.push(...await htmlJsonLd(url, 'Plaza Japan', 'USD'));
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
      for (const url of links) results.push(...await htmlJsonLd(url, 'AmiAmi', 'JPY'));
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
      for (const url of links) results.push(...await htmlJsonLd(url, 'Nin-Nin Game', 'EUR'));
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
