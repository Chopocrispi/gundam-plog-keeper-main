import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const OUT_DIR = path.join(ROOT, 'scrapers', 'out');
const DEST = path.join(OUT_DIR, 'products_upsert.sql');

if (!fs.existsSync(OUT_DIR)) {
  console.error('No scrapers/out dir found. Run scrapers first.');
  process.exit(1);
}

function sqlEscape(s) {
  if (s === null || s === undefined) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}

const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.json') && f.startsWith('products-'));
if (!files.length) {
  console.error('No products-*.json files found in scrapers/out');
  process.exit(1);
}

let stmts = [];
for (const f of files) {
  const full = path.join(OUT_DIR, f);
  const arr = JSON.parse(fs.readFileSync(full, 'utf8'));
  for (const it of arr) {
    const store = it.store || f.replace(/^products-/, '').replace(/\.json$/, '');
    const url = it.url || null;
    const title = it.title || '';
    const sku = it.sku || null;
    const price = (it.price === null || it.price === undefined) ? 'NULL' : Number(it.price);
    const currency = it.currency || null;
    const extra = it.extra ? JSON.stringify(it.extra).replace(/'/g, "''") : null;
    const now = new Date().toISOString();

    const insert = `INSERT INTO public.products (store, url, title, sku, price, currency, last_seen, extra, active)
VALUES (${sqlEscape(store)}, ${sqlEscape(url)}, ${sqlEscape(title)}, ${sqlEscape(sku)}, ${price === 'NULL' ? 'NULL' : price}, ${sqlEscape(currency)}, ${sqlEscape(now)}, ${extra === null ? 'NULL' : `'${extra}'`}, true)
ON CONFLICT (store, url) DO UPDATE SET
  title = EXCLUDED.title,
  sku = COALESCE(EXCLUDED.sku, public.products.sku),
  price = EXCLUDED.price,
  currency = COALESCE(EXCLUDED.currency, public.products.currency),
  last_seen = EXCLUDED.last_seen,
  extra = COALESCE(EXCLUDED.extra, public.products.extra),
  active = true;`;
    stmts.push(insert);
  }
}

fs.writeFileSync(DEST, stmts.join('\n\n'));
console.log('Wrote', DEST, 'with', stmts.length, 'upsert statements');
