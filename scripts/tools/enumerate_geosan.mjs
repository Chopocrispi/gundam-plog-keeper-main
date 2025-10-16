#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

const ROOT = path.resolve('.');
const OUT_DIR = path.join(ROOT, 'scrapers', 'out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = 'https://geosanbattle.com';
const OUT_FILE = path.join(OUT_DIR, 'products-Geosan_Battle.json');
const MAX_PAGES = Number(process.env.GEOSAN_MAX_PAGES || 50);
const PLAYWRIGHT_PAGES = Number(process.env.GEOSAN_PLAYWRIGHT_PAGES || 5);
const FETCH_TIMEOUT_MS = Number(process.env.SCRAPER_STORE_TIMEOUT_MS || 120000);

async function fetchText(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  }
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

function absolutize(base, href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return 'https:' + href;
  if (href.startsWith('/')) return base.replace(/\/$/, '') + href;
  return base.replace(/\/$/, '') + '/' + href;
}

async function fetchSitemapLocs(base) {
  // returns array of { url, source }
  const envSitemaps = process.env.GEOSAN_SITEMAP_URLS;
  const out = [];
  if (envSitemaps) {
    for (const s of envSitemaps.split(/,\s*/)) {
      if (!s) continue;
      const txt = await fetchText(s).catch(() => null);
      if (!txt) continue;
      for (const m of txt.matchAll(/<loc>([^<]+)<\/loc>/gi)) out.push({ url: m[1], source: s });
    }
    return out;
  }

  const candidates = [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`, `${base}/sitemap-products.xml`, `${base}/sitemap.xml`];
  for (const c of candidates) {
    const txt = await fetchText(c);
    if (!txt) continue;
    for (const m of txt.matchAll(/<loc>([^<]+)<\/loc>/gi)) out.push({ url: m[1], source: c });
    // If sitemap index, try each referenced sitemap too
    if (/sitemapindex/i.test(txt)) {
      for (const m of txt.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
        const sub = m[1];
        const subTxt = await fetchText(sub).catch(() => null);
        if (!subTxt) continue;
        for (const n of subTxt.matchAll(/<loc>([^<]+)<\/loc>/gi)) out.push({ url: n[1], source: sub });
      }
    }
    if (out.length) break;
  }
  return out;
}

async function extractLinksFromHtml(html) {
  const $ = cheerio.load(html);
  const anchors = $('a[href]').map((_, el) => $(el).attr('href')).get();
  return Array.from(new Set(anchors)).filter(Boolean);
}

async function htmlJsonLd(url) {
  const html = await fetchText(url);
  if (!html) return [];
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]').map((_, el) => $(el).text()).get();
  const out = [];
  for (const s of scripts) {
    try {
      const obj = JSON.parse(s);
      const arr = Array.isArray(obj) ? obj : [obj];
      for (const it of arr) {
        if (!it) continue;
        const offers = it.offers || null;
        const price = offers ? (Array.isArray(offers) ? offers[0].price : offers.price) : null;
        out.push({ title: it.name || null, price: price || null, currency: offers?.priceCurrency || null, extra: it });
      }
    } catch (e) { /* ignore */ }
  }
  return out;
}

async function playwrightExtractLinks(pages = 3) {
  try {
    const mod = await import('../../scripts/lib/render.mjs');
    const { renderHtml } = mod;
    const links = new Set();
    for (let p = 1; p <= pages; p++) {
      const url = `${BASE}/?s=&post_type=product&paged=${p}`;
      const html = await renderHtml(url, Math.min(FETCH_TIMEOUT_MS, 30000)).catch(() => null);
      if (!html) continue;
      const arr = await extractLinksFromHtml(html);
      for (const a of arr) if (/\/producto\//i.test(a) || /\/product\//i.test(a)) links.add(absolutize(BASE, a));
    }
    return Array.from(links);
  } catch (e) {
    return [];
  }
}

async function enumerate() {
  console.log('Geosan enumerator: starting sitemap check...');
  const results = [];
  const locs = await fetchSitemapLocs(BASE).catch(() => []);
  let productUrls = [];
  if (locs && locs.length) {
    // locs is array of {url, source}
    const bySource = {};
    for (const l of locs) {
      if (/\/producto\//i.test(l.url) || /\/product\//i.test(l.url)) {
        productUrls.push({ url: l.url, source: l.source });
        bySource[l.source] = (bySource[l.source] || 0) + 1;
      }
    }
    console.log('Found', productUrls.length, 'product URLs in sitemap(s)');
    for (const s of Object.keys(bySource)) console.log('  ', s, '->', bySource[s]);
  }

  if (!productUrls.length) {
    console.log('No sitemap product URLs found; falling back to paged search');
    const found = new Map();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${BASE}/?s=&post_type=product&paged=${page}`;
      console.log('Fetching search page', page);
      const html = await fetchText(url);
      if (!html) break;
      const anchors = await extractLinksFromHtml(html);
      const links = anchors.filter(h => h && (/\/producto\//i.test(h) || /\/product\//i.test(h))).map(h => absolutize(BASE, h));
      if (!links.length) break;
      for (const l of links) found.set(l, { url: l, source: url });
      console.log(`Page ${page} yielded ${links.length} candidate links (total ${found.size})`);
      if (found.size >= 2000) break;
    }
    productUrls = Array.from(found.values());
    console.log('Paged search produced', productUrls.length, 'product URLs');
  }

  // If still few, do Playwright-rendered pages for first N pages
  if (!productUrls.length || productUrls.length < 50) {
    console.log('Insufficient results, attempting Playwright-rendered extraction...');
    const pw = await playwrightExtractLinks(PLAYWRIGHT_PAGES);
    for (const l of pw) if (!productUrls.includes(l)) productUrls.push(l);
    console.log('After Playwright extract, total product URLs:', productUrls.length);
  }

  // Deduplicate
  // Deduplicate by url and preserve source if available
  const uniqMap = new Map();
  for (const p of productUrls) {
    const url = typeof p === 'string' ? p : p.url;
    const source = typeof p === 'string' ? null : p.source || null;
    if (!uniqMap.has(url)) uniqMap.set(url, { url, source });
  }
  const uniq = Array.from(uniqMap.values());
  console.log('Final product URL count (deduped):', uniq.length);
  const onlyUrls = Boolean(process.env.GEOSAN_ONLY_URLS && process.env.GEOSAN_ONLY_URLS !== '0');
  if (onlyUrls) {
    for (const u of uniq) results.push({ store: 'Geosan Battle', url: u.url, sitemap_source: u.source });
  } else {
    for (const u of uniq) {
      const meta = await htmlJsonLd(u.url).catch(() => []);
      const first = meta[0] || {};
      results.push({ store: 'Geosan Battle', url: u.url, sitemap_source: u.source, title: first.title || null, price: first.price || null, currency: first.currency || 'EUR', extra: first.extra || null });
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log('Wrote', OUT_FILE, 'count', results.length);
}

enumerate().catch(e => { console.error(e); process.exit(1); });
