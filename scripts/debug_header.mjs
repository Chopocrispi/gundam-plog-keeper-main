import fs from 'fs';
const raw = fs.readFileSync('scrapers/out/products_upsert.sql', 'utf8');
const header = raw.split(/\r?\n/)[0] || '';
console.log('RAW HEADER:');
console.log(header);
console.log('---TOKENS---');
console.log(header.split('\t').map(c => c.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim().toLowerCase()));
