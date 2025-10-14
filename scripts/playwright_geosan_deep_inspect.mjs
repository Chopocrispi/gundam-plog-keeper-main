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
    try{ await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }); }catch(e){ await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(4000); }

    // collect anchors that look like product links
    const anchors = await page.$$eval('a[href]', els => els.map(a=>({ href: a.href, text: a.textContent?.trim() || '', outer: a.outerHTML.slice(0,500), parent: a.parentElement ? a.parentElement.outerHTML.slice(0,500) : '' })));
    const prod = anchors.filter(a => /\/producto\//i.test(a.href) || /\/product\//i.test(a.href));
    console.log('Found product-like anchors:', prod.length);
    for(let i=0;i<prod.length;i++){
      const p = prod[i];
      console.log('\n--- Anchor', i+1, '---');
      console.log('href:', p.href);
      console.log('text:', p.text.slice(0,120));
      console.log('anchor snippet:', p.outer.replace(/\s+/g,' ').slice(0,300));
      // print parent element snippet
      console.log('parent snippet:', p.parent.replace(/\s+/g,' ').slice(0,300));
    }

    // also try to find product containers by scanning for elements that have child anchors to /producto/
    const containers = await page.$$eval('*', els => {
      return els.slice(0,2000).map(e => ({ tag: e.tagName.toLowerCase(), class: e.className || '', html: e.outerHTML.slice(0,800), anchors: Array.from(e.querySelectorAll('a')).map(a=>a.href) })).filter(x => x.anchors.some(h => /\/producto\//i.test(h))).slice(0,40);
    });
    console.log('\nFound container candidates:', containers.length);
    for(let i=0;i<containers.length;i++){
      const c = containers[i];
      console.log('\n=== Container', i+1, '===');
      console.log('tag:', c.tag, 'class:', (c.class || '').slice(0,200));
      console.log('html snippet:', c.html.replace(/\s+/g,' ').slice(0,300));
      // print first few anchors in container
      const as = c.anchors.filter(Boolean).slice(0,6);
      for(const a of as) console.log(' - anchor:', a);
    }

  }catch(e){ console.error('error', e); }
  await browser.close();
})();
