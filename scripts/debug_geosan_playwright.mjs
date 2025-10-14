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
    await page.goto(url, { waitUntil: 'networkidle' , timeout: 60000 });
  }catch(e){
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
  }
  const title = await page.title();
  console.log('page title:', title);
  // collect anchors that include /producto/
  const prodAnchors = await page.$$eval('a[href*="/producto/"]', els => els.map(a=>({href: a.href, text: a.textContent?.trim()})).slice(0,50));
  console.log('producto anchors count:', prodAnchors.length);
  if(prodAnchors.length>0) console.log(prodAnchors.slice(0,20));
  // also list anchors under typical product containers
  const anchors = await page.$$eval('a', els => els.map(a=>({href: a.href, text: a.textContent?.trim()})).slice(0,200));
  console.log('total anchors on page:', anchors.length);
  // print first few anchors with context containing 'producto' or 'product'
  const filtered = anchors.filter(a=>/producto|product/i.test(a.href) || /producto|product/i.test(a.text));
  console.log('anchors filtered (href/text includes product):', filtered.slice(0,30));
  await browser.close();
})();
