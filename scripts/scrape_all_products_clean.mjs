#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// Fresh clean enumerator (single-file). Keeps logic minimal to avoid merge artifacts.

const ROOT = path.resolve('.');
const OUT_DIR = path.join(ROOT, 'scrapers', 'out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function shopifyEnumerate(domain) {
  const base = `https://${domain}`;
  const perRequest = 250;
  const out = [];
  const seen = new Set();
  let sinceId = 0;

  while (true) {
    const ep = `${base}/products.json?limit=${perRequest}${sinceId ? `&since_id=${sinceId}` : ''}`;
    let data;
    try { data = await fetchJson(ep); } catch (e) { break; }
    const products = Array.isArray(data?.products) ? data.products : [];
    if (!products.length) break;
    for (const p of products) {
      const handle = p?.handle || '';
      if (!handle) continue;
      const url = `${base}/products/${handle}`;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ url, title: p?.title || '' });
    }
    const last = products[products.length - 1];
    if (!last?.id) break;
    sinceId = last.id;
  }
  return out;
}

const STORES = [
  { domain: 'usagundamstore.com', name: 'USA_Gundam_Store' },
  { domain: 'gundamplanet.com', name: 'Gundam_Planet' },
];

if (import.meta.url.endsWith('.mjs')) {
  (async () => {
    for (const s of STORES) {
      console.log('Enumerating', s.name);
      const res = await shopifyEnumerate(s.domain);
      const file = path.join(OUT_DIR, `products-${s.name.replace(/[^a-z0-9]/ig, '_')}.json`);
      fs.writeFileSync(file, JSON.stringify(res, null, 2));
      console.log('Wrote', file, 'count', res.length);
    }
  })().catch(e => { console.error(e); process.exit(1); });
}
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// Minimal single-file enumerator (clean).

const ROOT = path.resolve('.');
const OUT_DIR = path.join(ROOT, 'scrapers', 'out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function shopifyEnumerate(domain) {
  const base = `https://${domain}`;
  const perRequest = 250;
  const out = [];
  const seen = new Set();
  let sinceId = 0;

  for (;;) {
    const ep = `${base}/products.json?limit=${perRequest}${sinceId ? `&since_id=${sinceId}` : ''}`;
    let data;
    try { data = await fetchJson(ep); } catch (e) { break; }
    const products = Array.isArray(data?.products) ? data.products : [];
    if (!products.length) break;
    for (const p of products) {
      const handle = p?.handle || '';
      if (!handle) continue;
      const url = `${base}/products/${handle}`;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ url, title: p?.title || '' });
    }
    const last = products[products.length - 1];
    if (!last?.id) break;
    sinceId = last.id;
  }
  return out;
}

const STORES = [
  { domain: 'usagundamstore.com', name: 'USA_Gundam_Store' },
  { domain: 'gundamplanet.com', name: 'Gundam_Planet' },
];

if (import.meta.url.endsWith('.mjs')) {
  (async () => {
    for (const s of STORES) {
      console.log('Enumerating', s.name);
      const res = await shopifyEnumerate(s.domain);
      const file = path.join(OUT_DIR, `products-${s.name.replace(/[^a-z0-9]/ig, '_')}.json`);
      fs.writeFileSync(file, JSON.stringify(res, null, 2));
      console.log('Wrote', file, 'count', res.length);
    }
  })().catch(e => { console.error(e); process.exit(1); });
}
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// Fresh clean enumerator: Shopify since_id pagination, no concatenation artifacts.

const ROOT = path.resolve('.');
const OUT_DIR = path.join(ROOT, 'scrapers', 'out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// Minimal clean enumerator for the two Shopify stores.

const ROOT = path.resolve('.');
const OUT_DIR = path.join(ROOT, 'scrapers', 'out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function shopifyEnumerate(domain) {
  const base = `https://${domain}`;
  const perRequest = 250;
  const out = [];
  const seen = new Set();
  let sinceId = 0;
  let lastSeen = null;

  while (true) {
    const ep = `${base}/products.json?limit=${perRequest}${sinceId ? `&since_id=${sinceId}` : ''}`;
    let data;
    try { data = await fetchJson(ep); } catch (e) { break; }
    const products = Array.isArray(data?.products) ? data.products : [];
    if (!products.length) break;
    for (const p of products) {
      const handle = p?.handle || '';
      if (!handle) continue;
      const url = `${base}/products/${handle}`;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ url, title: p?.title || '' });
    }
    const last = products[products.length - 1];
    if (!last?.id) break;
    if (lastSeen && String(lastSeen) === String(last.id)) break;
    lastSeen = last.id;
    sinceId = last.id;
  }
  return out;
}

const STORES = [
  { domain: 'usagundamstore.com', name: 'USA_Gundam_Store' },
  { domain: 'gundamplanet.com', name: 'Gundam_Planet' },
];

if (import.meta.url.endsWith('.mjs')) {
  (async () => {
    for (const s of STORES) {
      console.log('Enumerating', s.name);
      const res = await shopifyEnumerate(s.domain);
      const file = path.join(OUT_DIR, `products-${s.name.replace(/[^a-z0-9]/ig, '_')}.json`);
      fs.writeFileSync(file, JSON.stringify(res, null, 2));
      console.log('Wrote', file, 'count', res.length);
    }
  })().catch(e => { console.error(e); process.exit(1); });
}
  }

  // optional cheerio fallback to crawl collections if product pages are missing
  try {
    const cheerio = await loadCheerio();
    if (cheerio) {
      const absolutize = makeAbsolutizer(`https://${domain}`);
      for (let pageNum = 1; pageNum <= 20; pageNum++) {
        const listUrl = `https://${domain}/collections/all?page=${pageNum}`;
        let html;
        try { html = await fetchText(listUrl, opts); } catch (e) { break; }
        const $ = cheerio.load(html);
        const hrefs = $('a[href]').map((_, el) => $(el).attr('href')).get().filter(Boolean);
        for (const href of hrefs) {
          if (!/\/products\//i.test(href)) continue;
          const url = absolutize(href);
          if (!url || seen.has(url)) continue;
          seen.add(url);
          const handle = (url.split('/products/')[1] || '').replace(/\/$/, '');
          let pjs = null;
          try { pjs = await fetchJson(`https://${domain}/products/${handle}.js`, opts); } catch (e) { }
          const price = pjs && typeof pjs.price === 'number' ? (pjs.price > 1000 ? Math.round(pjs.price) / 100 : pjs.price) : null;
          const sku = pjs?.variants?.[0]?.sku || null;
          out.push({ store: domain, url, title: pjs?.title || '', sku, price, currency: 'USD', extra: pjs || null });
        }
      }
    }
  } catch (e) { }

  return out;
}

const STORES = [
  { domain: 'usagundamstore.com', name: 'USA_Gundam_Store' },
  { domain: 'gundamplanet.com', name: 'Gundam_Planet' },
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
    console.log('Enumerating', s.name);
    const products = await runStoreWithAbort((opts) => shopifyEnumerate(s.domain, s.name, opts), perStoreTimeout);
    const file = path.join(OUT_DIR, `products-${s.name.replace(/[^a-z0-9]/ig, '_')}.json`);
    try { fs.writeFileSync(file, JSON.stringify(products, null, 2)); } catch (e) { console.error('Failed to write', file, e?.message || e); }
    console.log('Wrote', file, 'count', products.length);
  }
}

if (import.meta.url.endsWith('.mjs')) run().catch((e) => { console.error(e); process.exit(1); });
import fs from 'node:fs';
import path from 'node:path';

// scrape_all_products_clean.mjs — robust single-file Shopify enumerator

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

function makeAbsolutizer(base) {
  return (href) => {
    if (!href) return null;
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return `${base}${href}`;
    return `${base}/${href}`;
  };
}

async function loadCheerio() {
  try {
    const mod = await import('cheerio');
    return mod.default || mod;
  } catch (e) {
    console.error('cheerio missing:', e?.message || e);
    return null;
  }
}

async function shopifyEnumerate(domain, source, opts = {}) {
  const base = `https://${domain}`;
  const seen = new Set();
  const out = [];
  const perRequest = 250;
  let sinceId = 0;
  let page = 0;
  let lastSeenSinceId = null;
  const maxPages = Number(process.env.SCRAPER_MAX_PAGES || 1000);
  const pageDelay = Number(process.env.SCRAPER_PAGE_DELAY_MS || 100);

  while (page < maxPages) {
    page++;
    const ep = `${base}/products.json?limit=${perRequest}${sinceId ? `&since_id=${sinceId}` : ''}`;
    console.log(`${source} - fetching page ${page} (since_id=${sinceId || 'none'})`);
    let data;
    try {
      data = await fetchJson(ep, opts);
    } catch (err) {
      console.error(`${source} page ${page} fetch failed:`, err?.message || err);
      break;
    }
    const products = Array.isArray(data?.products) ? data.products : [];
    console.log(`${source} - page ${page} returned ${products.length} products`);
    if (!products.length) break;

    for (const p of products) {
      const handle = p?.handle || (p?.url || '').split('/products/')[1] || '';
      if (!handle) continue;
      const cleanHandle = String(handle).replace(/\/$/, '');
      const url = `${base}/products/${cleanHandle}`;
      if (seen.has(url)) continue;
      seen.add(url);

      let pjs = p;
      try {
        if (!pjs?.variants || !pjs.variants.length) pjs = await fetchJson(`${base}/products/${cleanHandle}.js`, opts);
      } catch (e) {
        // ignore prod.js failure
      }

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
    if (lastSeenSinceId && String(lastSeenSinceId) === String(last.id)) { console.warn(`${source} - last.id unchanged (stuck), stopping pagination`); break; }
    lastSeenSinceId = last.id;
    sinceId = last.id;
    if (products.length < perRequest) break;
    await new Promise((res) => setTimeout(res, pageDelay));
  }

  try {
    import fs from 'node:fs';
    import path from 'node:path';

    // scrape_all_products_clean.mjs — robust single-file Shopify enumerator

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

    function makeAbsolutizer(base) {
      return (href) => {
        if (!href) return null;
        if (href.startsWith('http')) return href;
        if (href.startsWith('/')) return `${base}${href}`;
        return `${base}/${href}`;
      };
    }

    async function loadCheerio() {
      try {
        const mod = await import('cheerio');
        return mod.default || mod;
      } catch (e) {
        return null;
      }
    }

    async function shopifyEnumerate(domain, source, opts = {}) {
      const base = `https://${domain}`;
      const seen = new Set();
      const out = [];
      const perRequest = 250;
      let sinceId = 0;
      let page = 0;
      let lastSeenSinceId = null;
      const maxPages = Number(process.env.SCRAPER_MAX_PAGES || 1000);
      const pageDelay = Number(process.env.SCRAPER_PAGE_DELAY_MS || 100);

      while (page < maxPages) {
        page++;
        const ep = `${base}/products.json?limit=${perRequest}${sinceId ? `&since_id=${sinceId}` : ''}`;
        let data;
        try {
          data = await fetchJson(ep, opts);
        } catch (err) {
          console.error(`${source} page ${page} fetch failed:`, err?.message || err);
          break;
        }
        const products = Array.isArray(data?.products) ? data.products : [];
        if (!products.length) break;

        for (const p of products) {
          const handle = p?.handle || (p?.url || '').split('/products/')[1] || '';
          if (!handle) continue;
          const cleanHandle = String(handle).replace(/\/$/, '');
          const url = `${base}/products/${cleanHandle}`;
          if (seen.has(url)) continue;
          seen.add(url);

          let pjs = p;
          try {
            if (!pjs?.variants || !pjs.variants.length) pjs = await fetchJson(`${base}/products/${cleanHandle}.js`, opts);
          } catch (e) { }

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
        if (lastSeenSinceId && String(lastSeenSinceId) === String(last.id)) break;
        lastSeenSinceId = last.id;
        sinceId = last.id;
        if (products.length < perRequest) break;
        await new Promise((res) => setTimeout(res, pageDelay));
      }

      try {
        const cheerio = await loadCheerio();
        if (cheerio) {
          const absolutize = makeAbsolutizer(base);
          for (let pageNum = 1; pageNum <= 20; pageNum++) {
            const listUrl = `${base}/collections/all?page=${pageNum}`;
            let html;
            try { html = await fetchText(listUrl, opts); } catch (e) { break; }
            const $ = cheerio.load(html);
            const hrefs = $('a[href]').map((_, el) => $(el).attr('href')).get().filter(Boolean);
            for (const href of hrefs) {
              if (!/\/products\//i.test(href)) continue;
              const url = absolutize(href);
              if (!url || seen.has(url)) continue;
              seen.add(url);
              const handle = (url.split('/products/')[1] || '').replace(/\/$/, '');
              let pjs = null;
              try { pjs = await fetchJson(`${base}/products/${handle}.js`, opts); } catch (e) { }
              const price = pjs && typeof pjs.price === 'number' ? (pjs.price > 1000 ? Math.round(pjs.price) / 100 : pjs.price) : null;
              const sku = pjs?.variants?.[0]?.sku || null;
              out.push({ store: source, url, title: pjs?.title || '', sku, price, currency: 'USD', extra: pjs || null });
            }
          }
        }
      } catch (e) { }

      return out;
    }

    const STORES = [
      { domain: 'usagundamstore.com', name: 'USA_Gundam_Store' },
      { domain: 'gundamplanet.com', name: 'Gundam_Planet' },
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
        console.log('Enumerating', s.name);
        const products = await runStoreWithAbort((opts) => shopifyEnumerate(s.domain, s.name, opts), perStoreTimeout);
        const file = path.join(OUT_DIR, `products-${s.name.replace(/[^a-z0-9]/ig, '_')}.json`);
        try { fs.writeFileSync(file, JSON.stringify(products, null, 2)); } catch (e) { console.error('Failed to write', file, e?.message || e); }
        console.log('Wrote', file, 'count', products.length);
      }
    }

    if (import.meta.url.endsWith('.mjs')) run().catch((e) => { console.error(e); process.exit(1); });
    if (href.startsWith('/')) return `${base}${href}`;
    return `${base}/${href}`;
  };
}

async function loadCheerio() {
  try {
    const mod = await import('cheerio');
    return mod.default || mod;
  } catch (e) {
    console.error('cheerio missing:', e?.message || e);
    return null;
  }
}

async function shopifyEnumerate(domain, source, opts = {}) {
  const base = `https://${domain}`;
  const seen = new Set();
  const out = [];
  const perRequest = 250;
  let sinceId = 0;
  let page = 0;
  let lastSeenSinceId = null;
  const maxPages = Number(process.env.SCRAPER_MAX_PAGES || 1000);
  const pageDelay = Number(process.env.SCRAPER_PAGE_DELAY_MS || 100);

  while (page < maxPages) {
    page++;
    const ep = `${base}/products.json?limit=${perRequest}${sinceId ? `&since_id=${sinceId}` : ''}`;
    console.log(`${source} - fetching page ${page} (since_id=${sinceId || 'none'})`);
    let data;
    try {
      data = await fetchJson(ep, opts);
    } catch (err) {
      console.error(`${source} page ${page} fetch failed:`, err?.message || err);
      break;
    }
    const products = Array.isArray(data?.products) ? data.products : [];
    console.log(`${source} - page ${page} returned ${products.length} products`);
    if (!products.length) break;

    for (const p of products) {
      const handle = p?.handle || (p?.url || '').split('/products/')[1] || '';
      if (!handle) continue;
      const cleanHandle = String(handle).replace(/\/$/, '');
      const url = `${base}/products/${cleanHandle}`;
      if (seen.has(url)) continue;
      seen.add(url);

      let pjs = p;
      try {
        if (!pjs?.variants || !pjs.variants.length) pjs = await fetchJson(`${base}/products/${cleanHandle}.js`, opts);
      } catch (e) {
        // ignore prod.js failure
      }

      let price = null;
      if (pjs) {
        if (typeof pjs.price === 'number') price = pjs.price > 1000 ? Math.round(pjs.price) / 100 : pjs.price;
        else if (pjs?.variants?.[0]?.price) price = Number(pjs.variants[0].price) || null;
      }

      const sku = pjs?.variants?.[0]?.sku || null;
      const title = p.title || pjs?.title || '';
      out.push({ store: source, url, title, sku, price, currency: 'USD', extra: pjs || p });
    #!/usr/bin/env node
    // scrape_all_products_clean.mjs — robust Shopify enumerator for two stores

    import fs from 'node:fs';
    import path from 'node:path';

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

    function makeAbsolutizer(base) {
      return (href) => {
        if (!href) return null;
        if (href.startsWith('http')) return href;
        if (href.startsWith('/')) return `${base}${href}`;
        return `${base}/${href}`;
      };
    }

    async function loadCheerio() {
      try {
        const mod = await import('cheerio');
        return mod.default || mod;
      } catch (e) {
        return null;
      }
    }

    async function shopifyEnumerate(domain, source, opts = {}) {
      const base = `https://${domain}`;
      const seen = new Set();
      const out = [];
      const perRequest = 250;
      let sinceId = 0;
      let page = 0;
      let lastSeenSinceId = null;
      const maxPages = Number(process.env.SCRAPER_MAX_PAGES || 1000);
      const pageDelay = Number(process.env.SCRAPER_PAGE_DELAY_MS || 100);

      while (page < maxPages) {
        page++;
        const ep = `${base}/products.json?limit=${perRequest}${sinceId ? `&since_id=${sinceId}` : ''}`;
        console.log(`${source} - fetching page ${page} (since_id=${sinceId || 'none'})`);
        let data;
        try { data = await fetchJson(ep, opts); } catch (err) { console.error(`${source} page ${page} fetch failed:`, err?.message || err); break; }
        const products = Array.isArray(data?.products) ? data.products : [];
        console.log(`${source} - page ${page} returned ${products.length} products`);
        if (!products.length) break;

        for (const p of products) {
          const handle = p?.handle || (p?.url || '').split('/products/')[1] || '';
          if (!handle) continue;
          const cleanHandle = String(handle).replace(/\/$/, '');
          const url = `${base}/products/${cleanHandle}`;
          if (seen.has(url)) continue;
          seen.add(url);

          let pjs = p;
          try { if (!pjs?.variants || !pjs.variants.length) pjs = await fetchJson(`${base}/products/${cleanHandle}.js`, opts); } catch (e) { }

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
        if (lastSeenSinceId && String(lastSeenSinceId) === String(last.id)) { console.warn(`${source} - last.id unchanged (stuck), stopping pagination`); break; }
        lastSeenSinceId = last.id;
        sinceId = last.id;
        if (products.length < perRequest) break;
        await new Promise((res) => setTimeout(res, pageDelay));
      }

      try {
        const cheerio = await loadCheerio();
        if (cheerio) {
          const absolutize = makeAbsolutizer(base);
          for (let pageNum = 1; pageNum <= 20; pageNum++) {
            const listUrl = `${base}/collections/all?page=${pageNum}`;
            let html;
            try { html = await fetchText(listUrl, opts); } catch (e) { break; }
            const $ = cheerio.load(html);
            const hrefs = $('a[href]').map((_, el) => $(el).attr('href')).get().filter(Boolean);
            for (const href of hrefs) {
              if (!/\/products\//i.test(href)) continue;
              const url = absolutize(href);
              if (!url || seen.has(url)) continue;
              seen.add(url);
              const handle = (url.split('/products/')[1] || '').replace(/\/$/, '');
              let pjs = null;
              try { pjs = await fetchJson(`${base}/products/${handle}.js`, opts); } catch (e) { }
              const price = pjs && typeof pjs.price === 'number' ? (pjs.price > 1000 ? Math.round(pjs.price) / 100 : pjs.price) : null;
              const sku = pjs?.variants?.[0]?.sku || null;
              out.push({ store: source, url, title: pjs?.title || '', sku, price, currency: 'USD', extra: pjs || null });
            }
          }
        }
      } catch (e) { }

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
        console.log('Enumerating', s.name);
        const products = await runStoreWithAbort((opts) => shopifyEnumerate(s.domain, s.name, opts), perStoreTimeout);
        const file = path.join(OUT_DIR, `products-${s.name.replace(/[^a-z0-9]/ig, '_')}.json`);
        try { fs.writeFileSync(file, JSON.stringify(products, null, 2)); } catch (e) { console.error('Failed to write', file, e?.message || e); }
        console.log('Wrote', file, 'count', products.length);
      }
    }

    if (import.meta.url.endsWith('.mjs')) run().catch((e) => { console.error(e); process.exit(1); });
    const perRequest = 250;
