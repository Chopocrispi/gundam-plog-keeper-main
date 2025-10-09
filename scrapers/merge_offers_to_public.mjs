// Merge all scraper JSON outputs under scrapers/out into public/offers.json
// Usage (from repo root):
//   node scrapers/merge_offers_to_public.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const OUT_DIR = path.join(ROOT, 'scrapers', 'out');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEST = path.join(PUBLIC_DIR, 'offers.json');

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function abbr(grade) {
  const g = (grade || '').toLowerCase();
  if (g.includes('high grade')) return 'hg';
  if (g.includes('real grade')) return 'rg';
  if (g.includes('master grade')) return 'mg';
  if (g.includes('perfect grade')) return 'pg';
  if (g.includes('full mechanics')) return 'fm';
  if (g.includes('super deformed')) return 'sd';
  return '';
}

function readJson(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    console.warn('Failed to read', file, e.message);
    return [];
  }
}

if (!fs.existsSync(OUT_DIR)) {
  console.error('Missing scrapers/out directory. Create it and place spider outputs there.');
  process.exit(1);
}

const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.json'));
if (files.length === 0) {
  console.error('No JSON files found in scrapers/out. Run spiders first.');
  process.exit(1);
}

const index = {};
for (const f of files) {
  const full = path.join(OUT_DIR, f);
  const arr = readJson(full);
  for (const it of arr) {
    const key = normalize(`${abbr(it.grade)} ${it.query || ''}`.trim());
    if (!key) continue;
    if (!index[key]) index[key] = [];
    index[key].push({
      store: it.source,
      title: it.title,
      url: it.url,
      price: it.price,
      currency: it.currency || 'USD',
    });
  }
}

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.writeFileSync(DEST, JSON.stringify(index, null, 2));
console.log('Wrote', DEST, 'with', Object.keys(index).length, 'keys from', files.length, 'files.');
