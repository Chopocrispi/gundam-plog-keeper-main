#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'scrapers', 'out');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const OUT_FILE = path.join(OUT, 'products-USA_Gundam_Store_all.json');

const SITEMAPS = [
  'https://www.usagundamstore.com/sitemap_products_1.xml?from=395520552&to=546081407012',
  'https://www.usagundamstore.com/sitemap_products_2.xml?from=546087960612&to=1411374350372',
  'https://www.usagundamstore.com/sitemap_products_3.xml?from=1411379101732&to=6074449756357',
  'https://www.usagundamstore.com/sitemap_products_4.xml?from=6074455818437&to=6818512568517',
  'https://www.usagundamstore.com/sitemap_products_5.xml?from=6818517876933&to=7164053684421',
  'https://www.usagundamstore.com/sitemap_products_6.xml?from=7164106703045&to=7354417447109',
  'https://www.usagundamstore.com/sitemap_products_7.xml?from=7354424361157&to=7609403310277',
  'https://www.usagundamstore.com/sitemap_products_8.xml?from=7611617247429&to=8139221958853',
  'https://www.usagundamstore.com/sitemap_products_9.xml?from=8139224711365&to=8399966240965',
  'https://www.usagundamstore.com/sitemap_products_10.xml?from=8399967027397&to=8449826259141'
];

const PAGE_DELAY = Number(process.env.SCRAPER_PAGE_DELAY_MS || 200);
const CONCURRENCY = Number(process.env.SCRAPER_CONCURRENCY || 6);

async function fetchText(url, opts = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: opts?.signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: opts?.signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function loadCheerio() {
  try { const mod = await import('cheerio'); return mod.default || mod; } catch (e) { return null; }
}

async function renderHtml(url, opts = {}) {
  try { const { render } = await import('../lib/render.mjs'); return await render(url, opts); } catch (e) { return null; }
}

async function parseSitemap(url) {
  const txt = await fetchText(url);
  const locs = [...txt.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  // filter product URLs only
  return locs.filter(u => /\/products\//i.test(u));
}

function handleFromUrl(u) {
  try { const p = new URL(u).pathname; const seg = p.split('/products/')[1] || ''; return seg.replace(/\/$/, ''); } catch (e) { return null; }
}

async function enrichProduct(url, opts = {}) {
  const handle = handleFromUrl(url);
  const base = 'https://www.usagundamstore.com';
  if (!handle) return { store: 'USA_Gundam_Store', url, title: '', sku: null, price: null, currency: null, extra: null, error: 'no-handle' };
  // try products/{handle}.js
  try {
    const pjs = await fetchJson(`${base}/products/${handle}.js`, opts);
    let price = null;
    if (pjs) {
      if (typeof pjs.price === 'number') price = pjs.price > 1000 ? Math.round(pjs.price) / 100 : pjs.price;
      else if (pjs?.variants?.[0]?.price) price = Number(pjs.variants[0].price) || null;
    }
    const sku = pjs?.variants?.[0]?.sku || null;
    const title = pjs?.title || '';
    return { store: 'USA_Gundam_Store', url, title, sku, price, currency: 'USD', extra: pjs };
  } catch (e) {
    // fall through to HTML parse
  }

  // try HTML + cheerio
  try {
    const html = await fetchText(url, opts);
    const cheerio = await loadCheerio();
    if (cheerio) {
      const $ = cheerio.load(html);
      const title = $('h1.product-title, h1, .product-title, .product-name').first().text().trim() || null;
      // naïve price & sku selects
      const price = ($('[itemprop=price]').attr('content') || $('[data-price]').attr('data-price') || $('.price').first().text() || '').replace(/[^0-9\.]/g, '') || null;
      const sku = ($('.sku, [itemprop=sku]').first().text() || '').trim() || null;
      return { store: 'USA_Gundam_Store', url, title: title || '', sku: sku || null, price: price || null, currency: 'USD', extra: null };
    }
  } catch (e) {
    // fall through to render
  }

  // try Playwright render
  try {
    const html = await renderHtml(url, opts);
    if (html) {
      const cheerio = await loadCheerio();
      if (cheerio) {
        const $ = cheerio.load(html);
        const title = $('h1.product-title, h1, .product-title, .product-name').first().text().trim() || '';
        const price = ($('[itemprop=price]').attr('content') || $('[data-price]').attr('data-price') || $('.price').first().text() || '').replace(/[^0-9\.]/g, '') || null;
        const sku = ($('.sku, [itemprop=sku]').first().text() || '').trim() || null;
        return { store: 'USA_Gundam_Store', url, title, sku, price, currency: 'USD', extra: null };
      }
    }
  } catch (e) {
    // final fail
  }

  return { store: 'USA_Gundam_Store', url, title: '', sku: null, price: null, currency: null, extra: null, error: 'not-enriched' };
}

async function run() {
  console.log('Parsing sitemaps...');
  const urls = new Set();
  for (const sm of SITEMAPS) {
    try {
      const items = await parseSitemap(sm);
      console.log(`sitemap ${sm} -> ${items.length} product urls`);
      for (const u of items) urls.add(u);
      await new Promise(r => setTimeout(r, PAGE_DELAY));
    } catch (e) {
      console.error('sitemap parse failed', sm, e?.message || e);
    }
  }

  const all = Array.from(urls);
  console.log('Total unique product urls:', all.length);

  // enrich in limited concurrency
  const out = [];
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= all.length) break;
      const url = all[i];
      try {
        const res = await enrichProduct(url);
        out.push(res);
      } catch (e) {
        out.push({ store: 'USA_Gundam_Store', url, error: e?.message || String(e) });
      }
      if (i % 100 === 0) console.log(`progress ${i}/${all.length}`);
      await new Promise(r => setTimeout(r, PAGE_DELAY));
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log('Wrote', OUT_FILE, 'count', out.length);
}

if (import.meta.url.endsWith('.mjs')) run().catch(e => { console.error('Fatal:', e); process.exit(1); });
