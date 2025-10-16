import fs from 'node:fs';
import path from 'node:path';

// scrape_geosan_sitemaps.mjs — clean sitemap-based enumerator

const ROOT = path.resolve('.');
const OUT_DIR = path.join(ROOT, 'scrapers', 'out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const SITEMAPS = [
  'https://geosanbattle.com/wp-sitemap-posts-product-1.xml',
  'https://geosanbattle.com/wp-sitemap-posts-product-2.xml',
  'https://geosanbattle.com/wp-sitemap-posts-product-3.xml',
  'https://geosanbattle.com/wp-sitemap-posts-product-4.xml',
  'https://geosanbattle.com/wp-sitemap-posts-product-5.xml',
  'https://geosanbattle.com/wp-sitemap-posts-product-6.xml',
];

async function fetchText(url, timeout = 20000) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ac.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) { return null; } finally { clearTimeout(id); }
}

function parseLocs(xml) {
  if (!xml) return [];
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/gi)).map(m => m[1]);
}

async function fetchProduct(url) {
  const html = await fetchText(url, 20000);
  if (!html) return null;
  const ld = Array.from(html.matchAll(/<script[^>]*type=(?:"|')application\/ld\+json(?:"|')[^>]*>([\s\S]*?)<\/script>/gi)).map(m => m[1]);
  for (const s of ld) {
    try {
      const obj = JSON.parse(s);
      const arr = Array.isArray(obj) ? obj : [obj];
      for (const it of arr) {
        if (it['@type'] && /product/i.test(String(it['@type']))) {
          const offers = it.offers;
          let price = null, currency = null;
          if (offers) {
            const off = Array.isArray(offers) ? offers[0] : offers;
            price = Number(off.price || off?.priceSpecification?.price) || null;
            currency = off.priceCurrency || off?.priceSpecification?.priceCurrency || null;
          }
          return {
            store: 'Geosan',
            url,
            title: it.name || null,
            sku: it.sku || null,
            price,
            currency: currency || null,
            extra: it,
          };
        }
      }
    } catch (e) { /* ignore */ }
  }
  const ogTitle = (html.match(/<meta[^>]*property=(?:"|')og:title(?:"|')[^>]*content=(?:"|')([^"']+)(?:"|')/i) || [])[1] || null;
  const ogPrice = (html.match(/<meta[^>]*property=(?:"|')product:price:amount(?:"|')[^>]*content=(?:"|')([^"']+)(?:"|')/i) || [])[1] || null;
  const ogCurrency = (html.match(/<meta[^>]*property=(?:"|')product:price:currency(?:"|')[^>]*content=(?:"|')([^"']+)(?:"|')/i) || [])[1] || null;
  return {
    store: 'Geosan',
    url,
    title: ogTitle,
    sku: null,
    price: ogPrice ? Number(ogPrice) : null,
    currency: ogCurrency || null,
    extra: null,
  };
}

async function run() {
  console.log('Fetching sitemap index...');
  const allUrls = new Set();
  for (const s of SITEMAPS) {
    console.log('Fetching', s);
    const xml = await fetchText(s, 20000);
    if (!xml) { console.warn('Failed to fetch', s); continue; }
    const locs = parseLocs(xml);
    console.log('Found', locs.length, 'locs');
    for (const l of locs) allUrls.add(l);
  }

  const urls = Array.from(allUrls).filter(u => u && (u.includes('/product/') || u.includes('/product-') || u.includes('/products/')));
  console.log('Total product URLs deduped:', urls.length);

  const concurrency = Number(process.env.GEOSAN_CONCURRENCY || 8);
  const results = [];
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= urls.length) break;
      const u = urls[i];
      process.stdout.write(`\rProgress: ${i+1}/${urls.length}`);
      try {
        const p = await fetchProduct(u);
        if (p) results.push(p);
      } catch (e) { /* ignore */ }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  console.log('\nFinished fetching products, total:', results.length);

  const outFile = path.join(OUT_DIR, 'products-Geosan.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log('Wrote', outFile);

  try {
    const { execSync } = await import('node:child_process');
    execSync('node scripts/upsert_products_sql.mjs', { stdio: 'inherit' });
  } catch (e) {
    console.error('Failed to run upsert generator:', e.message);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
            const off = Array.isArray(offers) ? offers[0] : offers;
            price = Number(String(off.price || off?.priceSpecification?.price).replace(',', '.')) || null;
            currency = off.priceCurrency || off?.priceSpecification?.priceCurrency || null;
          }
          return { url, title: name, sku, price, currency, extra: obj };
        }
      }
      // fallback to first json-ld object
      const first = jsonld[0];
      return { url, title: first.name || first.title || '', sku: first.sku || null, price: null, currency: null, extra: first };
    }
    // fallback meta
    const meta = extractMetaFallback(html);
    return { url, title: meta.title || '', sku: null, price: meta.price, currency: meta.currency, extra: null };
  } catch (e) {
    return { url, title: '', sku: null, price: null, currency: null, extra: null };
  }
}

async function run() {
  console.log('Parsing sitemaps...');
  const all = new Set();
  for (const s of SITEMAPS) {
    console.log('Fetching sitemap', s);
    const urls = await parseSitemap(s).catch(() => []);
    console.log('Found', urls.length, 'locs in', s);
    for (const u of urls) all.add(u);
  }
  const urls = Array.from(all);
  console.log('Total unique product URLs:', urls.length);

  const out = [];
  const concurrency = Number(process.env.GEOSAN_CONCURRENCY || 8);
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= urls.length) return;
      const u = urls[i];
      process.stdout.write(`\rFetching [${i+1}/${urls.length}] ${u.slice(0,60)}...`);
      const p = await fetchProduct(u);
      out.push({ store: 'Geosan', ...p });
      // small delay to be polite
      await new Promise(r => setTimeout(r, 120));
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);
  console.log('\nFinished fetching products. Writing output.');
  const file = path.join(OUT_DIR, 'products-Geosan.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log('Wrote', file, 'count', out.length);

  // Try to run upsert generator if present
  const upsertScript = path.join(process.cwd(), 'scripts', 'upsert_products_sql.mjs');
  if (fs.existsSync(upsertScript)) {
    console.log('Running upsert generator to produce SQL (products_upsert.sql)');
    try {
      // spawn node to run script
      const { spawnSync } = await import('node:child_process');
      const res = spawnSync('node', [upsertScript], { stdio: 'inherit' });
      if (res.error) console.error('Upsert script failed', res.error.message);
    } catch (e) {
      console.error('Failed to run upsert generator', e.message);
    }
  }
}

run().catch(e => { console.error(e); process.exit(1); });
