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

function canonicalAlnum(s){
  return (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
function extractModelParts(s){
  if(!s) return null;
  const c = canonicalAlnum(s);
  const m = c.match(/rx(\d{2})(\d)?/);
  if(!m) return null;
  const base = `rx${m[1]}`;
  const variant = m[2] || null;
  return { base, variant };
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
      // Geosan Battle (ES, WooCommerce) - delegate to shared helper
        (async () => {
          try{
            // use the shared geosan helpers (lightweight, no cheerio dependency here)
            const geosan = await import('../scripts/lib/geosan.mjs');
            const links = await geosan.geosanPickLinks(q, grade).catch(()=>[]);
            const results = [];
            for (const url of Array.from(new Set(links)).slice(0,20)) {
              results.push(...await htmlJsonLd(url, 'Geosan Battle', 'EUR', coreTokens(q, grade)));
            }
            return geosan.filterGeosanItems(results, q, grade);
          }catch(e){ return []; }
        })(),
      // Newtype specific adapter (site uses /p/<id>/h/<handle> links, product.js may be available)
      (async () => {
        const d = 'newtype.us';
        const base = `https://${d}`;
        try{
          const html = await fetchText(`${base}/search/?q=${encodeURIComponent(q)}`);
          const cheerio = await getCheerio();
          if(!cheerio) return [];
          const $ = cheerio.load(html);
          const anchors = $('a[href]').map((_, el) => $(el).attr('href')).get();
          const handleMap = new Map();
          for(const a of anchors){
            if(!a) continue;
            const m = a.match(/\/h\/([^\/\?#]+)/);
            if(m){ const handle = m[1]; if(!handleMap.has(handle)) handleMap.set(handle, a); }
          }
          const out = [];
          for(const [h, href] of handleMap.entries()){
            // try product.js first
            const pjs = await (async ()=>{ try{ return await fetchJson(`${base}/products/${h}.js`); }catch(e){ return null; } })();
            if(pjs && pjs.title){
              const price = typeof pjs.price === 'number' ? Math.round(pjs.price)/100 : null;
              out.push({ store: 'Newtype', title: pjs.title, url: `${base}/products/${h}`, price, currency: 'USD' });
              continue;
            }
            // fallback: fetch anchor URL and parse JSON-LD or meta
            const prodUrl = href.startsWith('http') ? href : (href.startsWith('/') ? `${base}${href}` : `${base}/${href}`);
            try{
              const items = await htmlJsonLd(prodUrl, 'Newtype', 'USD', coreTokens(q, grade));
              if(items && items.length) out.push(...items);
              else {
                const page = await fetchText(prodUrl).catch(()=>null);
                if(page){
                  const $$ = cheerio.load(page);
                  const title = $$('h1').first().text().trim() || $$('meta[property="og:title"]').attr('content') || h;
                  const priceInfo = null; // rely on htmlJsonLd above; cheap fallback omitted
                  out.push({ store: 'Newtype', title, url: prodUrl, price: null, currency: 'USD' });
                }
              }
            }catch(e){}
          }
          return out;
        }catch(e){ return []; }
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'HobbyDigi', 'HKD', coreTokens(q, grade)));
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'Mighty Ape', 'AUD', coreTokens(q, grade)));
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'Entertainment Earth', 'USD', coreTokens(q, grade)));
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'ZAVVI', 'USD', coreTokens(q, grade)));
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'HLJ', 'JPY', coreTokens(q, grade)));
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'HobbySearch', 'JPY', coreTokens(q, grade)));
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'Plaza Japan', 'USD', coreTokens(q, grade)));
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'AmiAmi', 'JPY', coreTokens(q, grade)));
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'Nin-Nin Game', 'EUR', coreTokens(q, grade)));
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'BigBadToyStore', 'USD', coreTokens(q, grade)));
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'Premium Bandai USA', 'USD', coreTokens(q, grade)));
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'MyKombini', 'EUR', coreTokens(q, grade)));
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
  for (const url of links) results.push(...await htmlJsonLd(url, 'Tokyo Otaku Mode', 'USD', coreTokens(q, grade)));
      return results;
    })(),
  ];
    const settled = await Promise.allSettled(tasks);
    const offers = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    // Dedupe by hostname, keep lowest price. Also filter out obvious Geosan promos/raffles early.
    const seen = new Map();
  const promoRegex = /\b(rifa|rifar|rifando|cesta|navidad|cesta de navidad|sorteo|raffle|promocional|carta|pack|package)\b/i;
    for (const o of offers) {
      if (!o?.url) continue;
      // drop obvious Geosan promo/raffle items
      if (/geosanbattle/.test(o.url || '') && promoRegex.test(o.title || '')) continue;
      try {
        const host = new URL(o.url).hostname.replace(/^www\./, '');
        const prev = seen.get(host);
        if (!prev) seen.set(host, o);
        else if (typeof o.price === 'number' && typeof prev.price === 'number') {
          if (o.price < prev.price) seen.set(host, o);
        } else if (typeof o.price === 'number' && prev.price == null) {
          seen.set(host, o);
        }
      } catch {}
    }
    // Keep offers even if price is missing when title strongly matches query tokens
    const tokens = coreTokens(q, grade);
    const strongMatches = [];
    const fallback = [];
    for (const o of Array.from(seen.values())){
      const title = (o.title||'').toLowerCase();
      const present = tokens.filter(t => title.includes(t));
      if(present.length >= Math.min(2, Math.max(1, tokens.length))) strongMatches.push(o);
      else fallback.push(o);
    }
    let out = (strongMatches.length ? strongMatches : fallback).filter(o => o && o.url);
    // If the query contains a model (e.g., RX-78-2), prefer offers matching that model base/variant
    const queryParts = extractModelParts(q);
    if(queryParts){
      const matches = out.filter(o => {
        const p = extractModelParts(o.title || o.url || '');
        if(!p) return false;
        if(p.base !== queryParts.base) return false;
        if(queryParts.variant) return p.variant === queryParts.variant;
        return true;
      });
      if(matches.length) out = matches;
    }
    // sort by numeric price when available, else leave as-is
    out.sort((a,b)=> {
      if(typeof a.price === 'number' && typeof b.price === 'number') return a.price - b.price;
      if(typeof a.price === 'number') return -1;
      if(typeof b.price === 'number') return 1;
      return 0;
    });
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ key: normalize(`${abbr(grade)} ${q}`.trim()), offers: out });
  } catch (e) {
    console.error('offers api error', e);
    res.status(500).json({ error: 'internal_error', message: String(e?.message || e) });
  }
}
