#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fetch = require('node-fetch');

const domains = process.argv.slice(2);
if(domains.length === 0) domains.push('newtype.us','tatsuhobby.com','gundamexpress.com.au');

async function fetchText(url){
  try{ const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); return await r.text(); }catch(e){ return null; }
}

function extractLocs(xml){
  if(!xml) return [];
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/gi)).map(m=>m[1]);
}

async function check(domain){
  console.log('\nChecking', domain);
  const base = `https://${domain}`;
  const main = await fetchText(`${base}/sitemap.xml`);
  if(!main){ console.log('  no sitemap.xml'); return; }
  // find product sitemaps referenced
  const locs = extractLocs(main);
  const productSitemaps = locs.filter(u => /product|products|sitemap_products/i.test(u));
  // also include sitemap_products_*.xml patterns
  if(productSitemaps.length === 0){
    // try to fetch common Shopify product sitemap
    const guess = `${base}/sitemap_products_1.xml`;
    const gtxt = await fetchText(guess);
    if(gtxt) productSitemaps.push(guess);
  }
  if(productSitemaps.length === 0) {
    console.log('  no product sitemaps found — main sitemap locs:', locs.slice(0,6));
    return;
  }
  for(const s of productSitemaps){
    console.log('  parsing', s);
    const txt = await fetchText(s);
    const urls = extractLocs(txt);
    const hits = urls.filter(u => /rx[-_\s]?78|rx78|rx-78|rx\s78|rx\s*78\s*2|rx[-_]?78[-_]?2/i.test(u) || /rx[-_\s]?78|rx78|rx-78/i.test(u.split('/').pop()));
    console.log(`    total urls: ${urls.length}, rx-like urls: ${hits.length}`);
    for(const h of hits.slice(0,10)) console.log('      ', h);
  }
}

(async()=>{
  for(const d of domains) await check(d);
})();
