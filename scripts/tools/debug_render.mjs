import { renderHtml } from '../lib/render.mjs';
import * as cheerio from 'cheerio';

async function extractLinksFromHtml(html, predicate) {
  const $ = cheerio.load(html);
  const links = $('a[href]').map((_, el) => $(el).attr('href')).get();
  return Array.from(new Set(links)).filter(Boolean).filter(predicate);
}

async function probe(url, predicate, name) {
  console.log('\n--- Probe', name, url);
  try {
    const html = await renderHtml(url, 15000);
    const links = await extractLinksFromHtml(html, predicate);
    console.log('Found links count:', links.length);
    console.log('Sample links:');
    for (let i = 0; i < Math.min(10, links.length); i++) console.log('-', links[i]);
    // print a short snippet
    console.log('\nHTML snippet:');
    console.log(html.slice(0, 2000));
  } catch (e) {
    console.error('Render failed:', e.message);
  }
}

async function run() {
  // HLJ search page (example)
  await probe('https://www.hlj.com/search/?q=gunpla', (h) => h && (h.includes('/product/') || h.includes('/product_detail/') || /product/.test(h)), 'HLJ search');
  // AmiAmi search
  await probe('https://www.amiami.com/eng/search/list/?s_keywords=gunpla', (h) => h && (h.includes('/product/') || h.includes('/p/') || /product/.test(h)), 'AmiAmi search');
}

run().catch(e => { console.error(e); process.exit(1); });
