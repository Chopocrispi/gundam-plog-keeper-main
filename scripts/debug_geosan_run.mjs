#!/usr/bin/env node
import { geosanPickLinks, filterGeosanItems } from './lib/geosan.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cheerio = require('cheerio');

const argv = process.argv.slice(2);
const q = argv[0] || 'MG RX-78-2 Gundam Ver. 3.0';
const grade = argv[1] || 'Master Grade (MG)';

async function fetchText(url){
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

async function inspect(){
  console.log('Query:', q, 'Grade:', grade);
  const links = await geosanPickLinks(q, grade).catch(e=>{ console.error('geosanPickLinks error', e); return []; });
  console.log('Picked links:', links.length);
  for(const u of links){
    console.log('\n---', u);
    try{
      const txt = await fetchText(u).catch(()=>null);
      if(!txt){ console.log('Could not fetch page'); continue; }
      const $ = cheerio.load(txt);
      const title = $('h1').first().text().trim() || $('title').text().trim() || $('meta[property="og:title"]').attr('content');
      console.log('Title:', title);
      const scripts = $('script[type="application/ld+json"]').map((_,s)=>$(s).text()).get();
      console.log('JSON-LD blocks:', scripts.length);
      for(const s of scripts.slice(0,3)){
        try{ const obj = JSON.parse(s); console.log(' - LD type:', (obj['@type']||obj.type)||Object.prototype.toString.call(obj).slice(8, -1)); }catch(e){ console.log(' - LD parse error'); }
      }
    }catch(e){ console.log('Inspect error', String(e)); }
  }
}

inspect().catch(e=>{ console.error(e); process.exit(1); });
