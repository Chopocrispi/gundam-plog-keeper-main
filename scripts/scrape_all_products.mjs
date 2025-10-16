#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// scrape_all_products.mjs — canonical orchestrator (robust pagination + fallbacks)

const ROOT = path.resolve('.');
const OUT_DIR = path.join(ROOT, 'scrapers', 'out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: opts?.signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: opts?.signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

async function loadCheerio() {
  try { const mod = await import('cheerio'); return mod.default || mod; } catch (e) { return null; }
}

async function renderHtml(url, opts = {}) {
  // optional Playwright render helper, keep graceful if lib missing
  try { const { render } = await import('../lib/render.mjs'); return await render(url, opts); } catch (e) { return null; }
}

async function shopifyEnumerate(domain, source, opts = {}) {
  const base = `https://${domain}`;
  const perRequest = 250;
  const out = [];
  const seen = new Set();
  let sinceId = 0;
  let page = 0;
  let lastSeen = null;
  let repeatCount = 0;
  const pageDelay = Number(process.env.SCRAPER_PAGE_DELAY_MS || 100);
  const maxPages = Number(process.env.SCRAPER_MAX_PAGES || 10000);

  // Primary: exhaust Shopify /products.json using since_id pagination
  while (page < maxPages) {
    page++;
    const ep = `${base}/products.json?limit=${perRequest}${sinceId ? `&since_id=${sinceId}` : ''}`;
    let data;
    try { data = await fetchJson(ep, opts); } catch (e) { console.error(`${source} fetch failed:`, e?.message || e); break; }
    const products = Array.isArray(data?.products) ? data.products : [];
    if (!products.length) break;
    for (const p of products) {
      const handle = p?.handle || (p?.url || '').split('/products/')[1] || '';
      if (!handle) continue;
      const cleanHandle = String(handle).replace(/\/$/, '');
      const url = `${base}/products/${cleanHandle}`;
      if (seen.has(url)) continue;
      seen.add(url);

      // try to enrich using products/{handle}.js
      let pjs = p;
      try { if (!pjs?.variants || !pjs.variants.length) pjs = await fetchJson(`${base}/products/${cleanHandle}.js`, opts); } catch (e) { /* ignore */ }

      let price = null;
      if (pjs) {
        if (typeof pjs.price === 'number') price = pjs.price > 1000 ? Math.round(pjs.price) / 100 : pjs.price;
        else if (pjs?.variants?.[0]?.price) price = Number(pjs.variants[0].price) || null;
      }
      const sku = pjs?.variants?.[0]?.sku || null;
      const title = p.title || pjs?.title || '';
      out.push({ store: source, url, title, sku, price, currency: 'USD', extra: pjs || p });
    }

    const last = products[products.length - 1];
    if (!last?.id) break;
    if (lastSeen && String(lastSeen) === String(last.id)) {
      repeatCount++;
      if (repeatCount > 2) { console.warn(source, 'stuck at', last.id); break; }
    } else {
      repeatCount = 0;
    }
    lastSeen = last.id;
    sinceId = last.id;
    if (products.length < perRequest) break; // no more full pages
    await new Promise((r) => setTimeout(r, pageDelay));
  }

  // If the Shopify API pagination wasn't exhaustive, use a collections/list fallback
  if (seen.size < 10000) {
    const cheerio = await loadCheerio();
    if (cheerio) {
      const absolutize = (href) => {
        if (!href) return null; if (href.startsWith('http')) return href; if (href.startsWith('/')) return `https://${domain}${href}`; return `https://${domain}/${href}`;
      };
      for (let pageNum = 1; pageNum <= 200; pageNum++) {
        const listUrl = `https://${domain}/collections/all?page=${pageNum}`;
        let html;
        try { html = await fetchText(listUrl, opts); } catch (e) { break; }
        const $ = cheerio.load(html);
        const hrefs = $('a[href]').map((_, el) => $(el).attr('href')).get().filter(Boolean);
        let added = 0;
        for (const href of hrefs) {
          if (!/\/products\//i.test(href)) continue;
          const url = absolutize(href);
          if (!url || seen.has(url)) continue;
          seen.add(url);
          added++;
          const handle = (url.split('/products/')[1] || '').replace(/\/$/, '');
          let pjs = null;
          try { pjs = await fetchJson(`https://${domain}/products/${handle}.js`, opts); } catch (e) { /* ignore */ }
          const price = pjs && typeof pjs.price === 'number' ? (pjs.price > 1000 ? Math.round(pjs.price) / 100 : pjs.price) : null;
          const sku = pjs?.variants?.[0]?.sku || null;
          out.push({ store: source, url, title: pjs?.title || '', sku, price, currency: 'USD', extra: pjs || null });
        }
        if (!added) break;
        await new Promise((r) => setTimeout(r, pageDelay));
      }
    }
  }

  return out;
}

const STORES = [
  { type: 'shopify', domain: 'usagundamstore.com', name: 'USA_Gundam_Store' },
  { type: 'shopify', domain: 'gundamplanet.com', name: 'Gundam_Planet' },
];

async function runStoreWithAbort(fn, ms) {
  const controller = new AbortController();
  const opts = { signal: controller.signal };
  const p = fn(opts);
  const timeout = setTimeout(() => controller.abort(), ms);
  try { const res = await p; clearTimeout(timeout); return res; } catch (e) { clearTimeout(timeout); if (e?.name === 'AbortError' || String(e).toLowerCase().includes('aborted')) return []; console.error('Task failed:', e?.message || e); return []; }
}

async function run() {
  const perStoreTimeout = Number(process.env.SCRAPER_STORE_TIMEOUT_MS || 10 * 60 * 1000);
  for (const s of STORES) {
    console.log('Starting', s.name);
    const products = await runStoreWithAbort((opts) => shopifyEnumerate(s.domain, s.name, opts), perStoreTimeout);
    const file = path.join(OUT_DIR, `products-${s.name.replace(/[^a-z0-9]/ig, '_')}.json`);
    try { fs.writeFileSync(file, JSON.stringify(products, null, 2)); console.log('Wrote', file, 'count', products.length); } catch (e) { console.error('Write failed', e); }
  }
}

if (import.meta.url.endsWith('.mjs')) run().catch((e) => { console.error(e); process.exit(1); });

