import fs from 'node:fs';

async function check(file, domain) {
  if (!fs.existsSync(file)) return console.log(file, 'missing');
  const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  const last = arr[arr.length - 1];
  const lastId = last?.extra?.id;
  if (!lastId) return console.log(file, 'has no last id');
  const url = 'https://' + domain + '/products.json?limit=250&since_id=' + lastId;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    if (!r.ok) return console.log(domain, 'fetch failed', r.status);
    const j = await r.json();
    console.log(domain, 'next-page products length =', (j.products || []).length);
  } catch (e) {
    console.log(domain, 'fetch error', e.message || e);
  }
}

(async function(){
  await check('scrapers/out/products-USA_Gundam_Store.json', 'usagundamstore.com');
  await check('scrapers/out/products-Gundam_Planet.json', 'gundamplanet.com');
})();
