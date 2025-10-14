import fs from 'node:fs';
import path from 'node:path';

const q = process.argv[2] || 'MG RX-78-2 Gundam Ver. 3.0';
const grade = process.argv[3] || 'Master Grade (MG)';

(async ()=>{
  try{
    const geosan = await import('./lib/geosan.mjs');
    console.log('Query:', q, 'Grade:', grade);
    const links = await geosan.geosanPickLinks(q, grade).catch(e=>{ console.error('pickLinks error', e); return []; });
    console.log('Links found:', links.length);
    for(const l of links) console.log(' -', l);
    const results = [];
    const cheerio = (await import('cheerio')).default || (await import('cheerio'));
    for(const url of Array.from(new Set(links)).slice(0,20)){
      try{
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await res.text();
        const $ = cheerio.load(html);
        const scripts = $('script[type="application/ld+json"]').map((_, el) => $(el).text()).get();
        let itemsFromPage = [];
        for(const s of scripts){
          try{
            const obj = JSON.parse(s);
            const arr = Array.isArray(obj) ? obj : [obj];
            for(const it of arr){
              const offers = it.offers;
              const title = it.name || $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || 'Product';
              if(offers){
                const offArr = Array.isArray(offers) ? offers : [offers];
                for(const off of offArr){
                  const priceRaw = off.price || off?.priceSpecification?.price;
                  const price = priceRaw ? Number(String(priceRaw).replace(',', '.')) : null;
                  itemsFromPage.push({ store: 'Geosan Battle', title, url, price: !isNaN(price) ? price : null, currency: off.priceCurrency || 'EUR' });
                }
              } else {
                // emit with robust fallback
                const priceInfo = (function(){
                  const metaPrice = $('meta[itemprop="price"]').attr('content') || $('meta[property="product:price:amount"]').attr('content') || $('meta[name="price"]').attr('content');
                  if(metaPrice){ const p = Number(String(metaPrice).replace(/[^0-9.,]/g,'').replace(',','.')); if(!isNaN(p)) return { price: p, currency: $('meta[itemprop="priceCurrency"]').attr('content') || 'EUR' }; }
                  return { price: null, currency: 'EUR' };
                })();
                itemsFromPage.push({ store: 'Geosan Battle', title, url, price: priceInfo.price, currency: priceInfo.currency });
              }
            }
          }catch(e){ /* ignore json parse */ }
        }
        if(itemsFromPage.length === 0){
          const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || 'Product';
          itemsFromPage.push({ store: 'Geosan Battle', title, url, price: null, currency: 'EUR' });
        }
        console.log('items from url', url, itemsFromPage.length);
        for(const it of itemsFromPage) console.log('  *', it.title, it.price, it.currency, it.url);
        results.push(...itemsFromPage);
      }catch(e){ console.error('fetch/parse error for', url, e); }
    }
    const filtered = geosan.filterGeosanItems(results, q, grade);
    console.log('Filtered results:', filtered.length);
    for(const f of filtered) console.log(' =>', f.store, f.title, f.price, f.currency, f.url);
  }catch(e){ console.error('debug error', e); process.exit(1); }
})();