import fetch from 'node-fetch';

const SITES = [
  { name: 'HLJ', domain: 'https://www.hlj.com' },
  { name: 'AmiAmi', domain: 'https://www.amiami.com' },
  { name: 'Plaza Japan', domain: 'https://www.plazajapan.com' },
  { name: 'Tatsu Hobby', domain: 'https://www.tatsuhobby.com' },
];

const candidates = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-products.xml', '/sitemap/sitemap.xml'];

async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) { return null; }
}

async function findSitemap(domain) {
  for (const c of candidates) {
    const url = `${domain}${c}`;
    const txt = await fetchText(url);
    if (!txt) continue;
    const locs = Array.from(txt.matchAll(/<loc>([^<]+)<\/loc>/gi)).map(m => m[1]);
    if (locs.length) return { url, count: locs.length, sample: locs.slice(0,5) };
  }
  return null;
}

async function run() {
  for (const s of SITES) {
    console.log('\n---', s.name, s.domain);
    const res = await findSitemap(s.domain);
    if (!res) console.log('No sitemap found in common locations');
    else {
      console.log('Sitemap:', res.url);
      console.log('Entries:', res.count);
      console.log('Sample:', res.sample.join('\n  '));
    }
  }
}

run().catch(e => { console.error(e); process.exit(1); });
