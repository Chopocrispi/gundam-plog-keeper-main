import playwright from 'playwright';

const SITES = [
  { name: 'HLJ', url: 'https://www.hlj.com/search/?q=gunpla' },
  { name: 'AmiAmi', url: 'https://www.amiami.com/eng/search/list/?s_keywords=gunpla' },
];

async function trace(site) {
  console.log('\n--- Tracing', site.name, site.url);
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
  const page = await context.newPage();
  const hits = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      const ct = (res.headers()['content-type'] || '').toLowerCase();
      const isJson = ct.includes('application/json') || url.includes('/api/') || url.includes('search') || url.includes('list') || url.includes('product');
      if (!isJson) return;
      if (hits.find(h => h.url === url)) return;
      const text = await res.text().catch(() => null);
      if (!text) return;
      const size = text.length;
      let sample = text.slice(0, 2000);
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (e) { /* not JSON */ }
      hits.push({ url, ct, size, parsed, sample });
      // limit
      if (hits.length >= 10) {
        // noop
      }
    } catch (e) { /* ignore */ }
  });

  try {
    await page.goto(site.url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(5000);
    console.log('Collected responses:', hits.length);
    for (const h of hits) {
      console.log('\nResponse URL:', h.url);
      console.log('Content-Type:', h.ct, 'Size:', h.size);
      if (h.parsed) {
        const keys = Array.isArray(h.parsed) ? ['[array] length=' + h.parsed.length] : Object.keys(h.parsed).slice(0,10);
        console.log('JSON keys/sample:', keys);
      } else {
        console.log('Text sample:', h.sample.slice(0,500));
      }
    }
  } catch (e) {
    console.error('Trace error', e.message);
  } finally {
    await page.close().catch(()=>{});
    await context.close().catch(()=>{});
    await browser.close().catch(()=>{});
  }
}

async function run() {
  for (const s of SITES) await trace(s);
}

run().catch(e => { console.error(e); process.exit(1); });
