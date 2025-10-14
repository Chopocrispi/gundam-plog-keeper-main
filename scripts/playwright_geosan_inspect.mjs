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
    try{ await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }); }catch(e){ await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(3000); }

    const selectors = [
      'article.product',
      '.products li.product',
      '.products .product',
      '.woocommerce ul.products li',
      '.products',
      '.product',
      'a[href*="/producto/"]',
      'a[href*="/product/"]'
    ];

    for(const sel of selectors){
      try{
        const nodes = await page.$$eval(sel, els => els.slice(0,8).map(e=>({ outer: e.outerHTML.slice(0,400), hrefs: Array.from(e.querySelectorAll('a')).map(a=>({href: a.href, text: a.textContent?.trim()})).slice(0,8) })));
        if(nodes && nodes.length){
          console.log('\nSelector:', sel, 'found', nodes.length, 'items');
          for(const n of nodes) console.log(' - hrefs:', n.hrefs.map(h=>h.href).slice(0,6));
          // print first node outer snippet
          console.log(' - snippet:', nodes[0].outer.replace(/\s+/g,' ').slice(0,300));
        } else {
          console.log('\nSelector:', sel, 'found 0');
        }
      }catch(e){ console.log('selector error', sel, e.message); }
    }

    // Also print first 20 anchors that include 'producto' or 'rx-78'
    const anchors = await page.$$eval('a', els => els.map(a=>({href: a.href, text: a.textContent?.trim() || ''})).slice(0,800));
    const prodAnchors = anchors.filter(a => /producto|product/i.test(a.href) || /producto|product/i.test(a.text)).slice(0,40);
    console.log('\nAnchors matching product/producto count', prodAnchors.length);
    for(const a of prodAnchors.slice(0,20)) console.log(' *', a.href, '->', a.text.slice(0,80));

  }catch(e){ console.error('error', e); }
  await browser.close();
})();
