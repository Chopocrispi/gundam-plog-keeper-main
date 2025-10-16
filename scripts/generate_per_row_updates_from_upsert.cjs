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
    let slug = parts[parts.length - 1] || parts.join('-');
    slug = slug.replace(/[-_]+/g, ' ');
    slug = decodeURIComponent(slug);
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
    if (trimmed.startsWith('```')) continue;
    // Try robust extraction: quoted id at start and a quoted http(s) url anywhere
    const idMatch = line.match(/^"([^"]+)"/);
  const urlMatch = line.match(/"(https?:\/\/[^\"]+)"/);
    if (!idMatch || !urlMatch) continue;
    const id = idMatch[1].trim();
    const url = urlMatch[1].trim();
    // Sanity: id should look like a UUID (contains dashes)
    if (!/[0-9a-fA-F]-/.test(id) && id.length < 8) continue;
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
    console.error('No rows parsed from input. Showing first 30 non-empty lines for debugging:\n');
    const sample = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 30);
    sample.forEach((l, i) => console.error(String(i + 1).padStart(3, ' '), JSON.stringify(l)));
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
