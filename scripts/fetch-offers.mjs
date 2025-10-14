// Node-based connectors to fetch prices without Scrapy.
// Usage:
//   npm run offers:fetch -- --query "RGM-89 Jegan" --grade "High Grade (HG)"
// Writes/merges public/offers.json

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cheerio = require('cheerio');

const argv = process.argv.slice(2);
function arg(name, def = '') {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] || '') : def;
}

const query = arg('query');
const grade = arg('grade');
if (!query) {
  console.error('Missing --query');
  process.exit(1);
}

const ROOT = path.resolve('.');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEST = path.join(PUBLIC_DIR, 'offers.json');

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function canonicalAlnum(s){
  return (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
function extractModelParts(s){
  // returns { base: 'rx78', variant: '2' } or null
  if(!s) return null;
  const c = canonicalAlnum(s);
  // find rx followed by at least two digits, optionally followed by one more digit (variant)
  const m = c.match(/rx(\d{2})(\d)?/);
  if(!m) return null;
  const base = `rx${m[1]}`;
  const variant = m[2] || null;
  return { base, variant };
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

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

// Shopify connector (suggest + product.js)
async function shopify(domain, source) {
  const base = `https://${domain}`;
  const out = [];
  // First try suggest.json (fast, authoritative when available)
  try{
    const suggest = `${base}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=20`;
    const data = await fetchJson(suggest);
    const products = data?.resources?.results?.products || [];
    for (const p of products) {
      const handle = p.handle || (p.url?.split('/products/')[1] || '').replace(/\/$/, '');
      if (!handle) continue;
      const pjs = await fetchJson(`${base}/products/${handle}.js`).catch(() => null);
      let price = null;
      if (pjs && typeof pjs.price === 'number') price = Math.round(pjs.price) / 100;
      out.push({ store: source, title: p.title || 'Product', url: `${base}/products/${handle}`, price, currency: 'USD' });
    }
  }catch(e){ /* ignore suggest failures */ }

  // If suggest returned nothing, try a /collections/all paginated scan (graceful, small depth)
  if (out.length === 0) {
    for (let page = 1; page <= 5; page++) {
      try{
        const colUrl = `${base}/collections/all?page=${page}`;
        const html = await fetchText(colUrl).catch(()=>null);
        if (!html) break;
        const $ = cheerio.load(html);
        const anchors = $('a[href]').map((_, el) => $(el).attr('href')).get();
        const handles = new Set();
        for (const a of anchors) {
          if (!a) continue;
          const m = a.match(/\/products\/([^\/?#]+)/);
          if (m) handles.add(m[1]);
        }
        if (handles.size === 0) continue;
        for (const h of Array.from(handles).slice(0, 50)) {
          const pjs = await fetchJson(`${base}/products/${h}.js`).catch(() => null);
          let price = null;
          if (pjs && typeof pjs.price === 'number') price = Math.round(pjs.price) / 100;
          out.push({ store: source, title: pjs?.title || h, url: `${base}/products/${h}`, price, currency: 'USD' });
        }
        // small delay between pages
      }catch(e){ break; }
    }
  }

  return out;
}

// Simple HTML connector reading JSON-LD prices
async function htmlJsonLd(url, source, currencyGuess = 'USD') {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items = [];
  const scripts = $('script[type="application/ld+json"]').map((_, el) => $(el).text()).get();
  for (const s of scripts) {
    try {
      const obj = JSON.parse(s);
      const arr = Array.isArray(obj) ? obj : [obj];
      for (const it of arr) {
        const offers = it.offers;
        const titleFromLd = it.name || null;
        const title = titleFromLd || 'Product';
        let pushed = false;
        if (offers) {
          const offArr = Array.isArray(offers) ? offers : [offers];
          for (const off of offArr) {
            const priceRaw = off.price || off?.priceSpecification?.price;
            const price = priceRaw ? Number(String(priceRaw).replace(',', '.')) : null;
            const availability = off?.availability || null;
            items.push({ store: source, title, url, price: !isNaN(price) ? price : null, currency: off.priceCurrency || currencyGuess, availability });
            pushed = true;
          }
        }
        // If no offers present, still emit the product with null price so out-of-stock or price-hidden products are captured
        if (!pushed) {
          // try to enrich from DOM when JSON-LD has no offers
          const domTitle = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || title;
          // try robust price extraction from the full html
          const priceInfo = extractPriceFromHtml(html, currencyGuess);
          items.push({ store: source, title: domTitle || title, url, price: priceInfo.price, currency: priceInfo.currency || currencyGuess });
        }
      }
    } catch {}
  }
  // If no JSON-LD scripts emitted items, still attempt to parse page for a product
  if (items.length === 0) {
    const domTitle = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || $('title').text();
    if (domTitle) {
      const priceInfo = extractPriceFromHtml(html, currencyGuess);
      items.push({ store: source, title: domTitle, url, price: priceInfo.price, currency: priceInfo.currency || currencyGuess });
    }
  }
  return items;
}

// Robust price extraction: JSON-LD, meta tags, data-price attributes, common selectors, inline scripts, regex
function extractPriceFromHtml(html, currencyGuess='USD'){
  const $ = cheerio.load(html);
  // 1) meta tags
  const metaPrice = $('meta[itemprop="price"]').attr('content') || $('meta[property="product:price:amount"]').attr('content') || $('meta[name="price"]').attr('content');
  if(metaPrice && metaPrice.trim()){
    const p = Number(String(metaPrice).replace(/[^0-9.,]/g,'').replace(',','.'));
    if(!isNaN(p)) return { price: p, currency: $('meta[itemprop="priceCurrency"]').attr('content') || $('meta[property="product:price:currency"]').attr('content') || currencyGuess };
  }

  // 2) common data attributes
  const dataPrice = $('[data-price]').attr('data-price') || $('[data-product-price]').attr('data-product-price');
  if(dataPrice){
    const p = Number(String(dataPrice).replace(/[^0-9.,]/g,'').replace(',','.'));
    if(!isNaN(p)) return { price: p/ (p>1000?100:1), currency: currencyGuess };
  }

  // 3) price-like selectors (common classes/ids)
  const priceSelectors = ['.price', '.product-price', '.price--amount', '.price_block', '.productPrice', '#price', '.price__regular', '.price--sale', '.money'];
  for(const sel of priceSelectors){
    const el = $(sel).first();
    if(el && el.text()){
      const txt = el.text();
      const m = txt.match(/\$\s*([0-9]+(?:[.,][0-9]{2})?)/);
      if(m) return { price: Number(m[1].replace(',','.')), currency: currencyGuess };
      const m2 = txt.match(/([0-9]+(?:[.,][0-9]{2})?)\s*(?:USD|US\$|\$)/i);
      if(m2) return { price: Number(m2[1].replace(',','.')), currency: currencyGuess };
    }
  }

  // 4) inline scripts with Shopify-like price objects
  const scripts = $('script').map((_,s)=>$(s).html()).get();
  for(const sc of scripts){
    if(!sc) continue;
    const m = sc.match(/"price"\s*:\s*(\d{1,9})/);
    if(m){
      const p = Number(m[1]);
      if(!isNaN(p)) return { price: p/100, currency: currencyGuess };
    }
    const m2 = sc.match(/price\s*[:=]\s*([0-9]+(?:\.[0-9]{2})?)/i);
    if(m2){
      const p = Number(m2[1]);
      if(!isNaN(p)) return { price: p, currency: currencyGuess };
    }
  }

  // 5) regex fallback over whole text, support Euro formats
  const body = $.text();
  // euro e.g. 29,95 € or €29.95
  const meuro = body.match(/€\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/) || body.match(/([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)\s*€/);
  if(meuro){
    const raw = meuro[1].replace(/\./g,'').replace(',', '.');
    const n = Number(raw);
    if(!isNaN(n)) return { price: n, currency: 'EUR' };
  }
  const m = body.match(/\$\s*([0-9]+(?:\.[0-9]{2})?)/);
  if(m) return { price: Number(m[1]), currency: 'USD' };
  return { price: null, currency: currencyGuess };
}

async function findProductLinks(searchUrl, linkPredicate, absolutize) {
  const html = await fetchText(searchUrl);
  const $ = cheerio.load(html);
  const all = $('a[href]').map((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text();
    return { href, text };
  }).get();
  const links = [];
  for (const a of all) {
    if (!a.href) continue;
    if (linkPredicate(a.href, a.text)) {
      links.push(absolize(a.href));
    }
  }
  // unique
  return Array.from(new Set(links)).slice(0, 5);
}

// Geosan-specific search picker: regex-extract anchors and score by token overlap (similar to src/lib/stores/geosanbattle.ts)
function simpleNormalize(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function scoreTitleForGeosan(title, qTokens, abbr){
  const t = simpleNormalize(title);
  if(abbr && !new RegExp(String.raw`(^|\s)${abbr.toLowerCase()}(\s|$)`).test(t)) return -1;
  if(/\b(cesta|raffle|sorteo)\b/.test(t)) return -1;
  let score = 0;
  for(const tok of qTokens) if(tok && t.includes(tok)) score += 1;
  if(/1\/(144|100|60)/.test(t)) score += 0.5;
  if(t.includes('gundam')) score += 0.25;
  if(/\b(clear|metallic|translucent|event|pearl|coating|ver\.|version)\b/.test(t)) score -= 0.5;
  return score;
}

// Generic Geosan item filter: score items by model token match, version match, and promo-term penalties.
function filterGeosanItems(items, query){
  // Narrow: remove only promotional cards, promo packs and decal/parts items.
  if(!Array.isArray(items)) return [];
  const exclude = /\b(carta|promocional|pack|package|art collection|poster|cesta|raffle|sorteo|decal|gd-97|waterslide|sticker)\b/i;
  const queryHasVerKa = /\bver[\s.-]*ka\b/i.test(query) || /\bverka\b/i.test(query);
  return items.filter(it => {
    if(!it || !it.title) return false;
    const txt = (it.title || it.url || '').toLowerCase();
    // exclude promos/decals
    if(exclude.test(txt)) return false;
    // exclude VER KA variants unless the query explicitly asked for VER KA
    const isVerKa = /\bver[\s.-]*ka\b/i.test(it.title) || /ver-?ka/i.test(it.url || '');
    if(isVerKa && !queryHasVerKa) return false;
    return true;
  });
}

async function geosanPickLinks(query, grade){
  const base = 'https://geosanbattle.com';
  const qTokens = simpleNormalize(query).split(' ').filter(Boolean).filter(t=>t.length>1);
  const abbr = (grade||'').toUpperCase().split('(')[0].trim();
  async function fetchAndScore(url){
    try{
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if(!res.ok) return [];
      const html = await res.text();
      const linkRegex = /<a\s+[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/gi;
      const candidates = [];
      let m;
      while((m = linkRegex.exec(html)) !== null){
        const href = m[1];
        const text = m[2] || '';
        if(!/\/producto\//i.test(href)) continue;
        const score = scoreTitleForGeosan(text, qTokens, abbr);
        if(score>0) candidates.push({ href, text, score });
      }
      candidates.sort((a,b)=>b.score-a.score);
      return candidates.map(c=> c.href.startsWith('http') ? c.href : base.replace(/\/$/,'') + c.href ).slice(0,5);
    }catch(e){ return []; }
  }
  // primary product-only search
  const url1 = `${base}/?s=${encodeURIComponent(query)}&post_type=product`;
  let pick = await fetchAndScore(url1);
  if(pick && pick.length) return pick;
  const url2 = `${base}/?s=${encodeURIComponent(query)}`;
  pick = await fetchAndScore(url2);
  if(pick && pick.length) return pick;

  // If static HTML didn't contain product anchors, try Playwright rendering as a last resort
  // Try the site's AJAX autocomplete endpoint used by th-advance-product-search
  try{
    const ajaxUrlBase = `${base}/wp-admin/admin-ajax.php`;
    // plugin expects 'action=thaps_ajax_get_search_value' and param 'match' (or 'query')
    const tryAjaxOnce = async (qstr, paramName) => {
      try{
        const url = `${ajaxUrlBase}?action=thaps_ajax_get_search_value&${paramName}=${encodeURIComponent(qstr)}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if(!res.ok) return [];
        const data = await res.json().catch(()=>null);
        if(!data || !Array.isArray(data.suggestions)) return [];
        const prod = data.suggestions.filter(s => s && s.type === 'product' && s.url).map(s => s.url.startsWith('http') ? s.url : (s.url.startsWith('/') ? `${base}${s.url}` : `${base}/${s.url}`));
        return Array.from(new Set(prod)).slice(0,10);
      }catch(e){ return []; }
    };

    // Build a small list of query variants (shorter tokens) to increase chance the site matches
    const variants = [];
    const qnorm = query.replace(/\s+/g,' ').trim();
    variants.push(qnorm);
    // remove 'ver.' or 'ver' and trailing version tokens
    variants.push(qnorm.replace(/ver\.?\s*\d+(?:\.\d+)*/i, '').trim());
    // common shortened forms
    const toks = qnorm.split(/\s+/).filter(Boolean);
    if(toks.length>1) variants.push(`${toks[0]} ${toks[1]}`);
    // try dropping words after the model code (e.g., keep 'MG RX-78-2')
    const modelMatch = qnorm.match(/(mg|hg|rg|pg|sd)?\s*(rx\-?\d{2}(?:\-?\d)?)/i);
    if(modelMatch){
      const prefix = (modelMatch[1]||'').trim();
      const model = modelMatch[2];
      variants.push(((prefix?prefix+' ':'') + model).trim());
      variants.push(model.replace(/-/g,''));
    }
    // also push a couple of generic tokens
    variants.push(qnorm.split(' ').slice(0,2).join(' '));
    variants.push(qnorm.split(' ').slice(0,1).join(' '));

    // try each variant with 'match' then 'query'
    for(const v of Array.from(new Set(variants)).filter(Boolean)){
      let res = await tryAjaxOnce(v, 'match');
      if(res && res.length) return res;
      res = await tryAjaxOnce(v, 'query');
      if(res && res.length) return res;
    }
  }catch(e){ /* ignore */ }

  try{
    const rendered = await renderAndExtractProductLinks(url1, '/a[contains(@href, "/producto/")]');
    if(rendered && rendered.length) return rendered;
  }catch(e){ /* ignore */ }
  return pick;
}

// Optional Playwright renderer: dynamically import playwright and extract product links using a CSS selector or XPath
async function renderAndExtractProductLinks(url, xpathOrSelector){
  let playwright;
  try{
    playwright = await import('playwright');
  }catch(e){
    console.warn('Playwright not installed. To enable JS-render fallback, run: npm i -D playwright');
    return [];
  }
  const browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
  const ctx = await browser.newContext({ userAgent: ua });
  const page = await ctx.newPage();
  try{
    // try networkidle first, but fall back to domcontentloaded + short wait if site blocks long networkidle
    try{
      await page.goto(url, { waitUntil: 'networkidle' , timeout: 60000});
    }catch(e){
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000});
      // short wait for client-side rendering
      await page.waitForTimeout(2500);
    }
    // try xpath first
    let hrefs = [];
    try{
      const handles = await page.$x(xpathOrSelector).catch(()=>[]);
      for(const h of handles.slice(0,10)){
        const v = await (await h.getProperty('href')).jsonValue().catch(()=>null);
        if(v) hrefs.push(String(v));
      }
    }catch(e){ /* ignore xpath */ }
    // fallback: look for anchors that include /producto/
    if(hrefs.length === 0){
      hrefs = await page.$$eval('a[href*="/producto/"]', els => els.slice(0,10).map(a=>a.href));
    }
    await browser.close();
    return hrefs.map(h => h.startsWith('http') ? h : `https://geosanbattle.com${h}`);
  }catch(e){
    await browser.close();
    throw e;
  }
}

async function fetchSitemapUrls(domain, limit = 100) {
  const base = `https://${domain}`;
  const sitemapUrl = `${base}/sitemap.xml`;
  try{
    const txt = await fetchText(sitemapUrl).catch(()=>null);
    if(!txt) return [];
    const matches = Array.from(txt.matchAll(/<loc>([^<]+)<\/loc>/gi)).map(m=>m[1]);
    const productUrls = matches.filter(u => /\/product|\/products\/|\/itm\//i.test(u)).slice(0, limit);
    return Array.from(new Set(productUrls));
  }catch(e){ return []; }
}

async function fetchProductsFromUrls(urls, source, currencyGuess='USD', limit=10){
  const results = [];
  const EUR_USD_RATE = Number(process.env.VITE_EUR_USD_RATE || process.env.EUR_USD_RATE || 1.08);
  for(const u of urls.slice(0, limit)){
    try{
      const items = await htmlJsonLd(u, source, currencyGuess).catch(()=>[]);
      if(items && items.length) results.push(...items);
      else {
          // fallback: try to extract title and robust price from the page
          const txt = await fetchText(u).catch(()=>null);
          if(!txt) continue;
          const $ = cheerio.load(txt);
          const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || $('title').text();
          const priceInfo = extractPriceFromHtml(txt, currencyGuess);
          const price = priceInfo.price;
          // include the product even when price is missing
          if(title) results.push({ store: source, title, url: u, price: price, currency: priceInfo.currency || currencyGuess });
      }
    }catch(e){}
  }
    // convert EUR to USD when detected
    return results.map(r => {
      if(r.currency && r.currency.toUpperCase() === 'EUR' && r.price != null) {
        const usd = Math.round(r.price * EUR_USD_RATE * 100) / 100;
        return { ...r, price: usd, currency: 'USD' };
      }
      return r;
    });
}

function makeAbsolutizer(base) {
  return (href) => href.startsWith('http') ? href : (href.startsWith('/') ? `${base}${href}` : `${base}/${href}`);
}

async function run() {
  const tasks = [
    // Newtype has product anchors like /p/<id>/h/<handle> — implement adapter
    (async () => {
      const d = 'newtype.us';
      const base = `https://${d}`;
      try{
        const html = await fetchText(`${base}/search/?q=${encodeURIComponent(query)}`);
        const $ = cheerio.load(html);
        const anchors = $('a[href]').map((_, el) => $(el).attr('href')).get();
        const handleMap = new Map();
        for(const a of anchors){
          if(!a) continue;
          const m = a.match(/\/h\/([^\/?#]+)/);
          if(m){
            const handle = m[1];
            if(!handleMap.has(handle)) handleMap.set(handle, a);
          }
        }
        const out = [];
        for(const [h, href] of handleMap.entries()){
          // try product.js first
          const pjs = await fetchJson(`${base}/products/${h}.js`).catch(()=>null);
          if(pjs && pjs.title){
            const price = typeof pjs.price === 'number' ? Math.round(pjs.price)/100 : null;
            out.push({ store: 'Newtype', title: pjs.title, url: `${base}/products/${h}`, price, currency: 'USD' });
            continue;
          }
          // fallback: fetch the anchor URL (which may be /p/<id>/h/<handle>) and parse JSON-LD or meta
          const prodUrl = href.startsWith('http') ? href : (href.startsWith('/') ? `${base}${href}` : `${base}/${href}`);
          const items = await (async ()=>{
            try{
              const found = await htmlJsonLd(prodUrl, 'Newtype', 'USD');
              if(found && found.length) return found;
            }catch(e){}
            return [];
          })();
          if(items && items.length){
            for(const it of items) out.push(it);
          } else {
            // if nothing parseable, at least return a placeholder with title from anchor text and try to extract a price
            try{
              const page = await fetchText(prodUrl).catch(()=>null);
              if(page){
                const $$ = cheerio.load(page);
                const title = $$('h1').first().text().trim() || $$('meta[property="og:title"]').attr('content') || h;
                const priceInfo = extractPriceFromHtml(page, 'USD');
                out.push({ store: 'Newtype', title, url: prodUrl, price: priceInfo.price, currency: priceInfo.currency || 'USD' });
              }
            }catch(e){}
          }
        }
        return out;
      }catch(e){ return []; }
    })(),
    // Geosan Battle (ES, WooCommerce)
    (async () => {
      const d = 'geosanbattle.com';
      const base = `https://${d}`;
          const urls = await fetchSitemapUrls(d, 200);
          if (urls.length === 0) {
            const abs = makeAbsolutizer(base);
            // Geosan search uses ?s=<query>&post_type=product
            const searchUrl = `${base}/?s=${encodeURIComponent(query)}&post_type=product`;
            const links = await geosanPickLinks(query, grade);
      const items = await fetchProductsFromUrls(links, 'Geosan Battle', 'EUR', 10);
      // use scoring filter to keep relevant kit offers and drop promos
      return filterGeosanItems(items, query);
          }
      const all = await fetchProductsFromUrls(urls, 'Geosan Battle', 'EUR', 20);
      return filterGeosanItems(all, query);
    })(),
    shopify('usagundamstore.com', 'USA Gundam Store'),
    shopify('gundamplanet.com', 'Gundam Planet'),
    shopify('tatsuhobby.com', 'Tatsu Hobby'),
    // Non-Shopify fallbacks: sitemap + search page
    (async () => {
      const d = 'newtype.us';
      const urls = await fetchSitemapUrls(d, 200);
      if (urls.length === 0) {
        // fallback to search page anchors
        const abs = makeAbsolutizer(`https://${d}`);
        const links = await findProductLinks(`https://${d}/search/?q=${encodeURIComponent(query)}`, (href) => /product|products|item|itm/i.test(href), abs);
        return await fetchProductsFromUrls(links, 'Newtype', 'USD', 10);
      }
      return await fetchProductsFromUrls(urls, 'Newtype', 'USD', 20);
    })(),
    (async () => {
      const d = 'tatsuhobby.com';
      const urls = await fetchSitemapUrls(d, 200);
      if (urls.length === 0) {
        const abs = makeAbsolutizer(`https://${d}`);
        const links = await findProductLinks(`https://${d}/search/?q=${encodeURIComponent(query)}`, (href) => /product|products|item|itm/i.test(href), abs);
        return await fetchProductsFromUrls(links, 'Tatsu Hobby', 'USD', 10);
      }
      return await fetchProductsFromUrls(urls, 'Tatsu Hobby', 'USD', 20);
    })(),
    (async () => {
      const d = 'gundamexpress.com.au';
      const urls = await fetchSitemapUrls(d, 200);
      if (urls.length === 0) {
        const abs = makeAbsolutizer(`https://${d}`);
        const links = await findProductLinks(`https://${d}/search?q=${encodeURIComponent(query)}`, (href) => /product|products|item|itm/i.test(href), abs);
        return await fetchProductsFromUrls(links, 'GundamExpress', 'AUD', 10);
      }
      return await fetchProductsFromUrls(urls, 'GundamExpress', 'AUD', 20);
    })(),
    // HLJ
    (async () => {
      const base = 'https://www.hlj.com';
      const searchUrl = `${base}/search/?q=${encodeURIComponent(query)}`;
      const abs = makeAbsolutizer(base);
      const links = await findProductLinks(searchUrl, (href) => href.includes('/product/'), abs);
      const results = [];
      for (const url of links) results.push(...await htmlJsonLd(url, 'HLJ', 'JPY'));
      return results;
    })(),
    // HobbySearch 1999
    (async () => {
      const base = 'https://www.1999.co.jp';
      const searchUrl = `${base}/eng/search?typ1=Sld&searchkey=${encodeURIComponent(query)}`;
      const abs = makeAbsolutizer(base);
      const links = await findProductLinks(searchUrl, (href) => href.includes('/itm/'), abs);
      const results = [];
      for (const url of links) results.push(...await htmlJsonLd(url, 'HobbySearch', 'JPY'));
      return results;
    })(),
    // Plaza Japan
    (async () => {
      const base = 'https://www.plazajapan.com';
      const searchUrl = `${base}/search.php?search_query=${encodeURIComponent(query)}`;
      const abs = makeAbsolutizer(base);
      const links = await findProductLinks(searchUrl, (href) => href.includes('/products/'), abs);
      const results = [];
      for (const url of links) results.push(...await htmlJsonLd(url, 'Plaza Japan', 'USD'));
      return results;
    })(),
    // AmiAmi
    (async () => {
      const base = 'https://www.amiami.com';
      const searchUrl = `${base}/eng/search/list/?s_keywords=${encodeURIComponent(query)}`;
      const abs = makeAbsolutizer(base);
      const links = await findProductLinks(searchUrl, (href) => href.includes('/product/'), abs);
      const results = [];
      for (const url of links) results.push(...await htmlJsonLd(url, 'AmiAmi', 'JPY'));
      return results;
    })(),
    // Nin-Nin Game
    (async () => {
      const base = 'https://www.nin-nin-game.com';
      const searchUrl = `${base}/en/module/pm_advancedsearch/pm_advancedsearch?search_query=${encodeURIComponent(query)}`;
      const abs = makeAbsolutizer(base);
      const links = await findProductLinks(searchUrl, (href) => href.includes('/en/') && !href.includes('/search'), abs);
      const results = [];
      for (const url of links) results.push(...await htmlJsonLd(url, 'Nin-Nin Game', 'EUR'));
      return results;
    })(),
  ];
  const results = (await Promise.allSettled(tasks))
    .flatMap(r => r.status === 'fulfilled' ? r.value : []);

  // filter by primary model key from query to avoid wrong model matches (e.g., RX-78-3 vs RX-78-2)
  const queryParts = extractModelParts(query);
  let filtered = results;
  if(queryParts){
    filtered = results.filter(it => {
      const parts = extractModelParts(it.title || it.url || '');
      if(!parts) return true; // keep if we can't identify model in result
      if(parts.base !== queryParts.base) return false;
      // if query specifies a variant digit, require the same variant
      if(queryParts.variant) return parts.variant === queryParts.variant;
      return true;
    });
  }

  const key = normalize(`${abbr(grade)} ${query}`.trim());
  let index = {};
  if (fs.existsSync(DEST)) {
    try { index = JSON.parse(fs.readFileSync(DEST, 'utf8')); } catch {}
  }
  index[key] = (index[key] || []).concat(filtered);

  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(DEST, JSON.stringify(index, null, 2));
  console.log('Wrote', DEST, 'key', key, 'added', results.length, 'offers');
}

run().catch(err => { console.error(err); process.exit(1); });
