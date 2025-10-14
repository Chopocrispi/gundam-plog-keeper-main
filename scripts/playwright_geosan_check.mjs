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
  try{
    try{ await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }); }catch(e){ await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(2500); }
    const anchors = await page.$$eval('a', els => els.map(a=>({href: a.href, text: a.textContent?.trim()})));
    const rxAnchors = anchors.filter(a => /rx\s*[-]?\s*78|rx78/i.test(a.href + '\\n' + (a.text||'')) ).slice(0,50);
    console.log('anchors total', anchors.length, 'rxAnchors', rxAnchors.length);
    console.log(rxAnchors.slice(0,20));
  }catch(e){ console.error(e); }
  await browser.close();
})();
