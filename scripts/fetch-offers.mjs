// Node-based connectors to fetch prices without Scrapy.
// Usage:
//   npm run offers:fetch -- --query "RGM-89 Jegan" --grade "High Grade (HG)"
// Writes/merges public/offers.json

import fs from 'node:fs';
import path from 'node:path';
import cheerio from 'cheerio';

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
  const suggest = `${base}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10`;
  const data = await fetchJson(suggest);
  const products = data?.resources?.results?.products || [];
  const out = [];
  for (const p of products) {
    const handle = p.handle || (p.url?.split('/products/')[1] || '').replace(/\/$/, '');
    if (!handle) continue;
    const pjs = await fetchJson(`${base}/products/${handle}.js`).catch(() => null);
    let price = null;
    if (pjs && typeof pjs.price === 'number') price = Math.round(pjs.price) / 100;
    out.push({
      store: source,
      title: p.title || 'Product',
      url: `${base}/products/${handle}`,
      price,
      currency: 'USD',
    });
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
        if (!offers) continue;
        const offArr = Array.isArray(offers) ? offers : [offers];
        for (const off of offArr) {
          const price = Number(String(off.price || off?.priceSpecification?.price).replace(',', '.'));
          if (!isNaN(price)) {
            items.push({ store: source, title: it.name || 'Product', url, price, currency: off.priceCurrency || currencyGuess });
          }
        }
      }
    } catch {}
  }
  return items;
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

function makeAbsolutizer(base) {
  return (href) => href.startsWith('http') ? href : (href.startsWith('/') ? `${base}${href}` : `${base}/${href}`);
}

async function run() {
  const tasks = [
    shopify('newtype.us', 'Newtype'),
    shopify('usagundamstore.com', 'USA Gundam Store'),
    shopify('gundamplanet.com', 'Gundam Planet'),
    shopify('tatsuhobby.com', 'Tatsu Hobby'),
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

  const key = normalize(`${abbr(grade)} ${query}`.trim());
  let index = {};
  if (fs.existsSync(DEST)) {
    try { index = JSON.parse(fs.readFileSync(DEST, 'utf8')); } catch {}
  }
  index[key] = (index[key] || []).concat(results);

  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(DEST, JSON.stringify(index, null, 2));
  console.log('Wrote', DEST, 'key', key, 'added', results.length, 'offers');
}

run().catch(err => { console.error(err); process.exit(1); });
