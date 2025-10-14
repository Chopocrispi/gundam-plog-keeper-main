import fs from 'fs';
import playwright from 'playwright';

(async ()=>{
  const base = 'https://geosanbattle.com';
  const query = 'MG RX-78-2 Gundam Ver. 3.0';
  const url = `${base}/?s=${encodeURIComponent(query)}&post_type=product`;
  console.log('loading', url);
  const browser = await playwright.chromium.launch({ headless: true });
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
  const ctx = await browser.newContext({ userAgent: ua });
  const page = await ctx.newPage();

  const hits = [];
  page.on('request', req => {
    const url = req.url();
    if(/producto|product|wp-json|api|search|ajax/i.test(url)){
      console.log('REQ:', req.method(), url);
      hits.push({ type: 'req', url, method: req.method() });
    }
  });
  page.on('response', async res => {
    try{
      const url = res.url();
      if(/producto|product|wp-json|api|search|ajax/i.test(url)){
        console.log('RESP:', res.status(), url);
        const ct = res.headers()['content-type'] || '';
        let snippet = '';
        if(ct.includes('application/json') || ct.includes('text/html') || ct.includes('text/plain')){
          const txt = await res.text().catch(()=>'');
          const found = /\/producto\//i.test(txt) || /"slug"\s*:\s*"[^"]+"/i.test(txt) || /"products"/i.test(txt);
          snippet = txt.slice(0, 2000);
          hits.push({ type: 'resp', url, status: res.status(), ct, found, snippet: found ? snippet : '' });
          if(found) console.log('  --> contains product-like data snippet (first 500 chars):\n', snippet.slice(0,500));
        } else {
          hits.push({ type: 'resp', url, status: res.status(), ct });
        }
      }
    }catch(e){ }
  });

  try{
    try{ await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }); }catch(e){ await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); }
    // wait longer for any lazy XHRs
    await page.waitForTimeout(8000);
    const out = 'scripts/out/geosan_network_log.json';
    fs.mkdirSync('scripts/out', { recursive: true });
    fs.writeFileSync(out, JSON.stringify(hits, null, 2), 'utf8');
    console.log('Wrote', out, 'entries', hits.length);
  }catch(e){ console.error('error', e); }
  await browser.close();
})();
