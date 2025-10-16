#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const IN = path.join(__dirname, '..', 'scrapers', 'out', 'products_upsert.sql');
const OUT = path.join(__dirname, '..', 'scrapers', 'out', 'products_per_row_update_titles.sql');

function deriveTitleFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return url;
    // take last part normally, but fall back to whole path
    let slug = parts[parts.length - 1] || parts.join('-');
    // remove common prefixes/suffixes
    slug = slug.replace(/[-_]+/g, ' ');
    slug = decodeURIComponent(slug);
    // simple capitalization
    slug = slug.replace(/\b(\w)/g, s => s.toUpperCase());
    return slug.trim();
  } catch (e) {
    return url;
  }
}

function parseLines(input) {
  const lines = input.split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // skip code fences or header
    if (trimmed.startsWith('```')) continue;
    // Expect TSV-like where first column is quoted id and third is quoted url
    // Split on tab
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const id = cols[0].replace(/^"|"$/g, '').trim();
    const url = cols[2].replace(/^"|"$/g, '').trim();
    if (!id || !url) continue;
    rows.push({ id, url });
  }
  return rows;
}

function main() {
  if (!fs.existsSync(IN)) {
    console.error('Input file not found:', IN);
    process.exit(2);
  }
  const input = fs.readFileSync(IN, 'utf8');
  const rows = parseLines(input);
  if (rows.length === 0) {
    console.error('No rows parsed from input');
    process.exit(3);
  }

  const now = new Date().toISOString();
  const out = [];
  out.push('-- Per-row UPDATE statements generated from products_upsert.sql');
  out.push('-- Generated: ' + now);
  out.push('-- Run these on your Supabase / Postgres database');
  out.push('BEGIN;');

  for (const { id, url } of rows) {
    const title = deriveTitleFromUrl(url).replace(/'/g, "''");
    out.push(`UPDATE products SET title = '${title}' WHERE id = '${id}';`);
  }

  out.push('COMMIT;');
  fs.writeFileSync(OUT, out.join('\n') + '\n');
  console.log('Wrote', OUT, 'with', rows.length, 'updates');
}

main();
