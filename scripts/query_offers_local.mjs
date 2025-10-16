#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.log('Usage: node scripts/query_offers_local.mjs --query "NAME" [--grade "GRADE"]');
  process.exit(1);
}

const argv = process.argv.slice(2);
let QUERY = null;
let GRADE = '';
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--query') { QUERY = argv[++i]; continue; }
  if (a === '--grade') { GRADE = argv[++i]; continue; }
}
if (!QUERY) usage();

const OUT_DIR = path.join(process.cwd(), 'scrapers', 'out');
if (!fs.existsSync(OUT_DIR)) { console.error('No scrapers/out dir'); process.exit(1); }

function gradeKeyFromString(s) {
  if (!s) return null;
  s = s.toLowerCase();
  if (s.includes('high grade') || s.includes('hg')) return 'hg';
  if (s.includes('real grade') || s.includes('rg')) return 'rg';
  if (s.includes('master grade') || s.includes('mg')) return 'mg';
  if (s.includes('perfect grade') || s.includes('pg')) return 'pg';
  if (s.includes('super deformed') || s.includes('sd')) return 'sd';
  if (s.includes('mega size') || s.includes('ms')) return 'ms';
  return null;
}

const GRADE_MARKERS = {
  hg: [/\bhigh\s*grade\b/i, /\bhg\b/i],
  rg: [/\breal\s*grade\b/i, /\brg\b/i],
  mg: [/\bmaster\s*grade\b/i, /\bmg\b/i],
  pg: [/\bperfect\s*grade\b/i, /\bpg\b/i],
  sd: [/\bsuper\s*deformed\b/i, /\bsd\b/i],
  ms: [/\bmega\s*size\b/i, /\bms\b/i],
};

function titleHasGrade(title, gkey) {
  const pats = GRADE_MARKERS[gkey] || [];
  return pats.some(re => re.test(title));
}

function normalize(s){
  return String(s || '').toLowerCase();
}

const files = fs.readdirSync(OUT_DIR).filter(f => f.startsWith('products-') && f.endsWith('.json'));
let rows = [];
for (const f of files) {
  try {
    const arr = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
    for (const it of arr) rows.push(it);
  } catch (e) { console.warn('failed to read', f, e); }
}

const q = normalize(QUERY);
const slug = q.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const desiredGrade = gradeKeyFromString(GRADE);

const filtered = rows.filter(r => {
  if (!r || !r.url) return false;
  // Allow entries with missing price (some sources like Geosan only provide URLs).
  const priceNum = (r.price === null || r.price === undefined) ? null : Number(r.price);
  if (priceNum !== null && (Number.isNaN(priceNum) || priceNum <= 0)) return false;
  // Match by URL slug only (many sources don't populate titles)
  const urlOk = normalize(r.url).includes(slug) || (r.url && r.url.toLowerCase().includes(slug));
  if (!urlOk) return false;
  if (desiredGrade) {
    if (r.title) {
      if (!titleHasGrade(r.title, desiredGrade)) return false;
    } else {
      // no title: accept URL match but still prefer entries with grade markers when available
    }
  }
  return true;
});

// Dedupe by hostname/store, keep lowest price
const seen = new Map();
for (const r of filtered) {
  const price = (r.price === null || r.price === undefined) ? null : Number(r.price);
  let host = (r.store || '').toString().toLowerCase();
  try { host = new URL(r.url).hostname.replace(/^www\./, '').toLowerCase(); } catch {}
  const prev = seen.get(host);
  // If no previous entry, take this one. If previous exists, prefer one with numeric lower price.
  if (!prev) {
    seen.set(host, { store: r.store || host, title: r.title, url: r.url, price, currency: r.currency || 'USD', availability: r.availability || undefined });
  } else {
    if (prev.price === null && price !== null) {
      // prefer entry with a price
      seen.set(host, { store: r.store || host, title: r.title, url: r.url, price, currency: r.currency || 'USD', availability: r.availability || undefined });
    } else if (prev.price !== null && price !== null && price < prev.price) {
      seen.set(host, { store: r.store || host, title: r.title, url: r.url, price, currency: r.currency || 'USD', availability: r.availability || undefined });
    }
  }
}

const offers = Array.from(seen.values()).sort((a,b)=>a.price-b.price);

console.log('Query:', QUERY, 'Grade:', GRADE, ' -> matches:', offers.length);
for (let i=0;i<Math.min(30, offers.length); i++){
  const o = offers[i];
  console.log(`${i+1}. ${o.store} — ${o.currency} ${o.price} — ${o.url}`);
}

// Print JSON to stdout for programmatic consumption
console.log('\nJSON_OUTPUT_START');
console.log(JSON.stringify({ query: QUERY, grade: GRADE, offers }, null, 2));
