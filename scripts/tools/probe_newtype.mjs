#!/usr/bin/env node
const base = 'https://newtype.us';
const urls = [
  `${base}/products.json?limit=250`,
  `${base}/collections/all/products.json`,
  `${base}/products.json`,
  `${base}/search/suggest.json?q=&resources[type]=product&resources[limit]=50`,
  `${base}/collections/all?page=1`,
  `${base}/search/?q=gunpla`,
];

async function probe() {
  for (const u of urls) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' } });
      console.log('\nURL:', u, 'STATUS', res.status);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      console.log('Content-Type:', ct);
      if (ct.includes('application/json')) {
        const j = await res.json().catch(() => null);
        if (Array.isArray(j)) console.log('JSON array length', j.length);
        else if (j && typeof j === 'object') console.log('JSON keys', Object.keys(j).slice(0, 20));
        else console.log('JSON response (non-object)');
      } else {
        const t = await res.text().catch(() => '');
        console.log('HTML length', t.length);
        console.log('Snippet:\n', t.slice(0, 800));
      }
    } catch (e) {
      console.error('ERR', u, e.message);
    }
  }
}

probe().catch(e => { console.error(e); process.exit(1); });
