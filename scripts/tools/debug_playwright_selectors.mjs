import playwright from 'playwright';

const SITES = [
  { name: 'HLJ', url: 'https://www.hlj.com/search/?q=gunpla' },
  { name: 'AmiAmi', url: 'https://www.amiami.com/eng/search/list/?s_keywords=gunpla' },
];

const SELECTORS = [
  'a[href*="/product/"]',
  'a[href*="/products/"]',
  '.product',
  '.item',
  '.productCard',
  '.product-list',
  '.search-result-list',
  '.items',
  'ul.products',
  '.c-ProductList',
  '.productList'
];

async function probeSite(site) {
  console.log('\n=== Probing', site.name, site.url);
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
  const page = await context.newPage();
  try {
    await page.goto(site.url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    // Give extra time for hydration
    await page.waitForTimeout(2000);
    for (const sel of SELECTORS) {
      const count = await page.$$eval(sel, els => els.length).catch(() => 0);
      console.log(sel.padEnd(30), '=>', count);
    }
    // also print number of anchor hrefs containing 'product'
    const prodHrefCount = await page.$$eval('a[href]', els => els.filter(e => (e.getAttribute('href')||'').includes('product')).length).catch(() => 0);
    console.log('anchors with "product" in href =>', prodHrefCount);
  } catch (e) {
    console.error('Probe error', e.message);
  } finally {
    await page.close().catch(()=>{});
    await context.close().catch(()=>{});
    await browser.close().catch(()=>{});
  }
}

async function run() {
  for (const s of SITES) await probeSite(s);
}

run().catch(e => { console.error(e); process.exit(1); });
