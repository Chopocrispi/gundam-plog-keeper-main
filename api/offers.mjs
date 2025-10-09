// Serverless endpoint to fetch live offers from multiple stores.
// Works on platforms like Vercel as /api/offers.

import cheerio from 'cheerio';

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

async function shopify(domain, query, source) {
  try {
    const base = `https://${domain}`;
    const suggest = `${base}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=8`;
    const data = await fetchJson(suggest);
    const products = data?.resources?.results?.products || [];
    const out = [];
    for (const p of products) {
      const handle = p.handle || (p.url?.split('/products/')[1] || '').replace(/\/$/, '');
      if (!handle) continue;
      const pjs = await fetchJson(`${base}/products/${handle}.js`).catch(() => null);
      let price = null;
      if (pjs && typeof pjs.price === 'number') price = Math.round(pjs.price) / 100;
      out.push({ store: source, title: p.title || 'Product', url: `${base}/products/${handle}`, price, currency: 'USD' });
    }
    return out;
  } catch {
    return [];
  }
}

async function htmlJsonLd(url, source, currencyGuess = 'USD') {
  try {
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
  const q = (req.query?.query || req.query?.q || '').toString();
  const grade = (req.query?.grade || '').toString();
  if (!q) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }
  const tasks = [
    shopify('newtype.us', q, 'Newtype'),
    shopify('usagundamstore.com', q, 'USA Gundam Store'),
    shopify('gundamplanet.com', q, 'Gundam Planet'),
    shopify('tatsuhobby.com', q, 'Tatsu Hobby'),
    (async () => {
      const base = 'https://www.hlj.com';
      const abs = makeAbsolutizer(base);
      const links = await findProductLinks(`${base}/search/?q=${encodeURIComponent(q)}`, (href) => href.includes('/product/'), abs);
      const results = [];
      for (const url of links) results.push(...await htmlJsonLd(url, 'HLJ', 'JPY'));
      return results;
    })(),
    (async () => {
      const base = 'https://www.1999.co.jp';
      const abs = makeAbsolutizer(base);
      const links = await findProductLinks(`${base}/eng/search?typ1=Sld&searchkey=${encodeURIComponent(q)}`, (href) => href.includes('/itm/'), abs);
      const results = [];
      for (const url of links) results.push(...await htmlJsonLd(url, 'HobbySearch', 'JPY'));
      return results;
    })(),
    (async () => {
      const base = 'https://www.plazajapan.com';
      const abs = makeAbsolutizer(base);
      const links = await findProductLinks(`${base}/search.php?search_query=${encodeURIComponent(q)}`, (href) => href.includes('/products/'), abs);
      const results = [];
      for (const url of links) results.push(...await htmlJsonLd(url, 'Plaza Japan', 'USD'));
      return results;
    })(),
    (async () => {
      const base = 'https://www.amiami.com';
      const abs = makeAbsolutizer(base);
      const links = await findProductLinks(`${base}/eng/search/list/?s_keywords=${encodeURIComponent(q)}`, (href) => href.includes('/product/'), abs);
      const results = [];
      for (const url of links) results.push(...await htmlJsonLd(url, 'AmiAmi', 'JPY'));
      return results;
    })(),
    (async () => {
      const base = 'https://www.nin-nin-game.com';
      const abs = makeAbsolutizer(base);
      const links = await findProductLinks(`${base}/en/module/pm_advancedsearch/pm_advancedsearch?search_query=${encodeURIComponent(q)}`, (href) => href.includes('/en/') && !href.includes('/search'), abs);
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
}
