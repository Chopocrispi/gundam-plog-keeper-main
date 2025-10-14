#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const query = argv.join(' ') || 'MG RX-78-2 Gundam Ver. 3.0';
const domains = ['newtype.us','usagundamstore.com','gundamplanet.com','tatsuhobby.com'];

async function fetchJson(url){
  try{
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const txt = await res.text();
    try{ return JSON.parse(txt);}catch(e){ return { status: res.status, text: txt.slice(0,200) }; }
  }catch(e){ return { error: e.message }; }
}

(async function(){
  console.log('Query:', query);
  for(const d of domains){
    const base = `https://${d}`;
    const suggestUrl = `${base}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=5`;
    const s = await fetchJson(suggestUrl);
    let count = 0;
    try{ count = (s?.resources?.results?.products || []).length }catch(e){}
    console.log(`\nDomain: ${d}`);
    if(s?.error) { console.log('  suggest.json error:', s.error); continue; }
    console.log('  suggest count:', count);
    if(count>0){
      const p = (s.resources.results.products[0]);
      const handle = p.handle || (p.url||'').split('/products/')[1] || null;
      console.log('  sample title:', p.title || p.handle || p.url);
      if(handle){
        const prod = await fetchJson(`${base}/products/${handle}.js`);
        console.log('  product.js:', prod?.title ? 'OK' : JSON.stringify(prod && (prod.status||prod.text||prod.error)).slice(0,120));
      }
    } else {
      console.log('  suggest empty or unsupported; the site may not support suggest.json or no match found.');
    }
  }
})();
