// Serverless endpoint to fetch live offers from multiple stores.
// Portable across hosts by using global fetch and lazy cheerio.

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

// Default timeout for upstream requests (reduced for faster failure and overall latency)
const DEFAULT_TIMEOUT_MS = 7000;
// Limit how many query variants we try per store to avoid excessive requests
const MAX_VARIANTS = 3;
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

// Currency conversion helpers. Default JPY->USD rate can be overridden
// via the `JPY_TO_USD` environment variable (useful for testing or chaining).
const DEFAULT_JPY_TO_USD = Number(process?.env?.JPY_TO_USD || 0.0065);
function isJpyCurrency(c) {
  if (!c) return false;
  return /^(JPY|¥|YEN)$/i.test(String(c).trim());
}
function convertToUSD(amount, currency) {
  if (amount == null || Number.isNaN(Number(amount))) return amount;
  if (isJpyCurrency(currency)) {
    // Round to 2 decimal places for USD cents
    return Number((Number(amount) * DEFAULT_JPY_TO_USD).toFixed(2));
  }
  return Number(amount);
}

// Parse a raw price string/number into a numeric value.
// Handles currency symbols like ¥, commas as thousand separators, and common
// European decimal formats (basic handling).
function parseNumericPrice(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  // Keep digits, comma, dot and minus
  const filtered = s.replace(/[^0-9.,-]/g, '');
  if (!filtered) return NaN;
  let normalized;
  if (filtered.includes(',') && filtered.includes('.')) {
    // If the last comma appears after the last dot, assume dot is thousand sep and comma is decimal
    if (filtered.lastIndexOf(',') > filtered.lastIndexOf('.')) {
      normalized = filtered.replace(/\./g, '').replace(/,/g, '.');
    } else {
      // Otherwise assume commas are thousand separators
      normalized = filtered.replace(/,/g, '');
    }
  } else if (filtered.includes(',')) {
    // Mostly thousands separator for JPY and many stores — remove commas
    normalized = filtered.replace(/,/g, '');
  } else {
    normalized = filtered;
  }
  const num = Number(normalized);
  return Number.isNaN(num) ? NaN : num;
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
    // Try predictive/suggest API first. Limit variants to reduce requests and
    // fetch product JSONs in parallel per-variant for lower latency.
    for (const v of variants.slice(0, MAX_VARIANTS)) {
      const tokens = coreTokens(v, grade);
      try {
        const suggest = `${base}/search/suggest.json?q=${encodeURIComponent(v)}&resources[type]=product&resources[limit]=20`;
        const data = await fetchJson(suggest);
        const products = data?.resources?.results?.products || [];
        // build handles and parallel-fetch product JSONs
        const handlePairs = products.map(p => ({ p, handle: p.handle || (p.url?.split('/products/')[1] || '').replace(/\/$/, '') })).filter(h => h.handle);
        if (handlePairs.length) {
          const pjsList = await Promise.all(handlePairs.map(h => fetchJson(`${base}/products/${h.handle}.js`).catch(() => null)));
          for (let i = 0; i < handlePairs.length; i++) {
            const { p, handle } = handlePairs[i];
            const pjs = pjsList[i];
            let price = null;
            if (pjs && typeof pjs.price === 'number') price = Math.round(pjs.price) / 100;
            const title = p.title || pjs?.title || 'Product';
            if (!isRelevantTitle(title, tokens)) continue;
            const isBanzai = domain && domain.includes('banzaihobby');
            const finalPrice = isBanzai && typeof price === 'number' ? convertToUSD(price, 'JPY') : price;
            out.push({ store: source, title, url: `${base}/products/${handle}`, price: finalPrice, currency: 'USD' });
          }
        }
        if (out.length) return out;
      } catch { /* try next variant */ }
    }
    // HTML fallback: parse /search results for product links
    for (const v of variants.slice(0, MAX_VARIANTS)) {
      const tokens = coreTokens(v, grade);
      try {
        const abs = makeAbsolutizer(base);
        const links = await findProductLinks(`${base}/search?q=${encodeURIComponent(v)}`, (href) => href.includes('/products/'), abs);
        if (links.length) {
          // parallelize product.js fetches for found links
          const handles = links.map(url => ({ url, handle: (url.split('/products/')[1] || '').replace(/\/$/, '') })).filter(h => h.handle);
          const pjsList = await Promise.all(handles.map(h => fetchJson(`${base}/products/${h.handle}.js`).catch(() => null)));
          for (let i = 0; i < handles.length; i++) {
            const { url, handle } = handles[i];
            const pjs = pjsList[i];
            let price = null;
            if (pjs && typeof pjs.price === 'number') price = Math.round(pjs.price) / 100;
            const title = pjs?.title || 'Product';
            if (!isRelevantTitle(title, tokens)) continue;
            const isBanzai = domain && domain.includes('banzaihobby');
            const finalPrice = isBanzai && typeof price === 'number' ? convertToUSD(price, 'JPY') : price;
            out.push({ store: source, title, url: `${base}/products/${handle}`, price: finalPrice, currency: 'USD' });
          }
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
            const rawPrice = off.price || off?.priceSpecification?.price;
            const priceNum = parseNumericPrice(rawPrice);
            if (!Number.isNaN(priceNum)) {
              const title = it.name || 'Product';
              if (!isRelevantTitle(title, tokens)) continue;
              const currencyRaw = off.priceCurrency || currencyGuess || '';
              const converted = convertToUSD(priceNum, currencyRaw);
              const outCurrency = isJpyCurrency(currencyRaw) ? 'USD' : (currencyRaw || currencyGuess || 'USD');
              items.push({ store: source, title, url, price: converted, currency: outCurrency });
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
    //amo a mi mujer
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
