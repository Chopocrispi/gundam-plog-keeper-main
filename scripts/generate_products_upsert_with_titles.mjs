#!/usr/bin/env node
/**
 * generate_products_upsert_with_titles.mjs
 *
 * Connects to Supabase REST and fetches products. For rows missing a title,
 * derives a friendly title from the product URL and writes an SQL file with
 * UPDATE statements to fill those titles.
 *
 * Usage:
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_KEY=... node scripts/generate_products_upsert_with_titles.mjs
 *
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Backwards-compatible check for common env var names
const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);

if (!HAS_SUPABASE) {
  console.warn('\nSupabase env vars not found. The script will attempt to parse local scrapers/out/products_upsert.sql as a fallback.');
}

const OUT_PATH = path.resolve('scrapers/out/products_upsert_with_titles.sql');

function usage() {
  console.log('\nUsage: node scripts/generate_products_upsert_with_titles.mjs [--input path/to/products.json|csv|tsv]');
  console.log('Options:');
  console.log('  --input   Path to a JSON (array of objects) or CSV/TSV file containing products with columns id,title,url,handle,extra');
  console.log('If no --input is provided, the script will try to use SUPABASE_URL + SUPABASE_SERVICE_KEY to fetch products.');
}

function titleCaseSlug(slug) {
  if (!slug) return '';
  // Replace en/em dashes with hyphen, plus signs with space
  let s = slug.replace(/[–—]/g, '-').replace(/\+/g, ' ');
  try { s = decodeURIComponent(s); } catch (e) { /* ignore */ }

  // remove common file extensions
  s = s.replace(/\.(html?|php|asp|aspx)$/i, '');

  // remove trailing numeric suffixes like -123 or -v2 or _123
  s = s.replace(/[-_](?:v?\d+|p\d+)$/i, '');

  // split on delimiters and collapse multiple separators
  s = s.replace(/[._]+/g, ' ').replace(/[-]+/g, ' ');

  // trim and collapse spaces
  s = s.replace(/\s+/g, ' ').trim();

  // Title case each word. Keep known acronyms uppercase.
  const ACRONYMS = new Set(['MG','HG','RG','PG','SD','UC','RX','ZAKU','GUNDAM','LED']);
  return s.split(' ').map(w => {
    if (!w) return '';
    const up = w.toUpperCase();
    if (ACRONYMS.has(up)) return up;
    // Preserve roman numerals like II, III
    if (/^(?=.{1,4}$)(M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))$/i.test(w)) {
      return w.toUpperCase();
    }
    return w[0].toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

function deriveTitleFromUrl(rawUrl) {
  if (!rawUrl) return null;
  let u = rawUrl;
  // sometimes urls are stored without protocol
  if (!/^https?:\/\//i.test(u)) {
    u = 'https://' + u.replace(/^\/+/, '');
  }
  try {
    const parsed = new URL(u);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    let last = parts[parts.length - 1];
    // strip trailing product id segments like /products/slug -> slug
    // if last is numeric then try the previous segment
    if (/^\d+$/.test(last) && parts.length > 1) last = parts[parts.length - 2];
    // remove common query-like suffixes or anchors (already removed by pathname)
    last = last.replace(/\.(?:html?|php|asp|aspx)$/i, '');
    // replace common separators
    last = last.replace(/[–—]/g, '-');
    // decode
    try { last = decodeURIComponent(last); } catch (e) { /* ignore */ }
    // strip trailing -number groups
    last = last.replace(/[-_](?:v?\d+|p?\d+)$/i, '');
    // replace delimiters
    last = last.replace(/[._+]/g, ' ').replace(/[-]+/g, ' ');
    last = last.replace(/^product[\-\s_]*/i, '');
    last = last.replace(/\s+/g, ' ').trim();
    if (!last) return null;
    return titleCaseSlug(last);
  } catch (err) {
    // fallback: try to decode and clean the raw string
    let s = rawUrl.replace(/^.*\/+/,'');
    try { s = decodeURIComponent(s); } catch (e) {}
    s = s.replace(/\?.*$/, '').replace(/#.*$/, '');
    s = s.replace(/\.(?:html?|php|asp|aspx)$/i, '');
    s = s.replace(/[_+]/g, ' ').replace(/[-]+/g, ' ');
    s = s.replace(/^product[\-\s_]*/i, '');
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) return null;
    return titleCaseSlug(s);
  }
}

async function fetchProducts() {
  if (!HAS_SUPABASE) throw new Error('Supabase env vars not available');
  const base = SUPABASE_URL.replace(/\/+$/, '');
  // We'll request only necessary fields. Use a large limit; if your table is bigger
  // you can increase this or implement pagination.
  const url = `${base}/rest/v1/products?select=id,title,url,handle,extra&limit=10000`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch products: ${res.status} ${res.statusText}\n${body}`);
  }
  const data = await res.json();
  return data;
}

function tryParseLocalUpsert() {
  const local = path.resolve('scrapers/out/products_upsert.sql');
  if (!fs.existsSync(local)) return null;
  const raw = fs.readFileSync(local, 'utf8');
  // Quick check: if file looks like a git-lfs pointer, bail
  if (/^version https:\/\/git-lfs.github.com\/spec\/v1/m.test(raw)) return null;

  // Try to find header line in CSV/TSV or SQL INSERT
  // If the file contains a COPY ... (header) or a first line with column names, attempt to parse as CSV/TSV
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return null;

  // Heuristics: find a header line with 'title' and 'url' tokens
  let headerLineIdx = -1;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const l = lines[i];
    if (/\btitle\b/i.test(l) && /\burl\b/i.test(l)) { headerLineIdx = i; break; }
  }
  if (headerLineIdx === -1) return null;

  const header = lines[headerLineIdx].replace(/^\s+|\s+$/g,'').replace(/^#/, '').split(/\t|,|\|/).map(h=>h.replace(/^\"|\"$/g,'').trim());
  const titleIdx = header.findIndex(h=>/\btitle\b/i.test(h));
  const urlIdx = header.findIndex(h=>/\burl\b/i.test(h));
  const idIdx = header.findIndex(h=>/\bid\b/i.test(h));
  if (urlIdx === -1) return null;

  const products = [];
  for (let i = headerLineIdx+1; i < lines.length; i++) {
    const row = lines[i].split(/\t|,|\|/).map(c=>c.replace(/^\'|\'$/g,'').replace(/^\"|\"$/g,'').trim());
    if (row.length <= urlIdx) continue;
    const id = idIdx >=0 ? row[idIdx] : null;
    const title = titleIdx>=0 ? row[titleIdx] : null;
    const url = row[urlIdx];
    products.push({ id, title, url });
  }
  return products;
}

function parseInputFile(inputPath) {
  const abs = path.resolve(inputPath);
  if (!fs.existsSync(abs)) throw new Error(`Input file not found: ${abs}`);
  const raw = fs.readFileSync(abs, 'utf8');
  // JSON array
  try {
    const maybe = JSON.parse(raw);
    if (Array.isArray(maybe)) return maybe.map(p => ({ id: p.id, title: p.title, url: p.url, handle: p.handle, extra: p.extra }));
  } catch (e) {
    // not JSON
  }
  // Otherwise try CSV/TSV parsing
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  // find delimiter by checking header
  const header = lines[0];
  let delim = ',';
  if (header.includes('\t')) delim = '\t';
  else if (header.includes('|')) delim = '|';
  const cols = header.split(delim).map(c => c.replace(/^\"|\"$/g,'').trim());
  const idIdx = cols.findIndex(c=>/\bid\b/i.test(c));
  const titleIdx = cols.findIndex(c=>/\btitle\b/i.test(c));
  const urlIdx = cols.findIndex(c=>/\burl\b/i.test(c));
  const handleIdx = cols.findIndex(c=>/\bhandle\b/i.test(c));
  const out = [];
  for (let i=1;i<lines.length;i++){
    const parts = lines[i].split(delim).map(s=>s.replace(/^\'|\'$/g,'').replace(/^\"|\"$/g,'').trim());
    out.push({ id: idIdx>=0?parts[idIdx]:null, title: titleIdx>=0?parts[titleIdx]:null, url: urlIdx>=0?parts[urlIdx]:null, handle: handleIdx>=0?parts[handleIdx]:null });
  }
  return out;
}

async function main() {
  let products = null;
  // check CLI arg --input
  const args = process.argv.slice(2);
  const inputArgIndex = args.findIndex(a=>a==='--input');
  if (inputArgIndex !== -1 && args[inputArgIndex+1]) {
    const inputPath = args[inputArgIndex+1];
    console.log(`Parsing input file: ${inputPath}`);
    try {
      products = parseInputFile(inputPath);
      console.log(`Parsed ${products.length} products from ${inputPath}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  } else if (HAS_SUPABASE) {
    console.log('Fetching products from Supabase...');
    products = await fetchProducts();
    console.log(`Fetched ${products.length} products.`);
  } else {
    console.log('No Supabase credentials and no --input provided; attempting to parse local scrapers/out/products_upsert.sql...');
    const parsed = tryParseLocalUpsert();
    if (!parsed) {
      console.error('Could not parse local products_upsert.sql (file may be a Git LFS pointer or in an unsupported format).');
      usage();
      process.exit(1);
    }
    products = parsed;
    console.log(`Parsed ${products.length} products from local file.`);
  }

  const updates = [];
  for (const p of products) {
    const hasTitle = p.title && String(p.title).trim().length > 0;
    if (hasTitle) continue;
    const derived = deriveTitleFromUrl(p.url || p.handle || (p.extra && p.extra.handle) || '');
    if (!derived) continue;
    updates.push({ id: p.id || null, title: derived });
  }

  if (!updates.length) {
    console.log('No missing titles found or nothing to update.');
    return;
  }

  // Write SQL file with UPDATE statements guarded by title IS NULL OR title = ''
  const lines = [];
  const header = `-- products_upsert_with_titles.sql
-- Generated by scripts/generate_products_upsert_with_titles.mjs
-- This file contains UPDATE statements to fill missing titles derived from each product URL.
-- Review before running. Back up your table first.
`;
  lines.push(header);

  for (const u of updates) {
    const safe = u.title.replace(/'/g, "''");
    if (u.id) {
      lines.push(`UPDATE products SET title = '${safe}' WHERE id = ${u.id} AND (title IS NULL OR trim(title) = '');`);
    } else {
      // If no id, we cannot safely update by id; skip or write comment
      lines.push(`-- SKIP: could not update entry without id, suggested title: '${safe}'`);
    }
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${updates.length} UPDATE statements to ${OUT_PATH}`);

  console.log('\nPreview (first 10):');
  updates.slice(0,10).forEach(u => console.log(`id=${u.id || '<no-id>'} -> ${u.title}`));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
