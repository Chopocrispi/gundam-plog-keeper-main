import fs from 'fs';
import path from 'path';

const inPath = path.resolve(process.cwd(), 'scrapers', 'out', 'products_upsert.sql');
const outPath = path.resolve(process.cwd(), 'scrapers', 'out', 'products_upsert_with_titles.sql');

function titleize(s) {
  if (!s) return '';
  // replace non-alphanumeric with spaces, collapse, trim
  const t = s
    .replace(/\+/g, ' plus ')
    .replace(/[-_\/:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // title case words, but keep numbers as-is and uppercase common acronyms
  return t.split(' ').map(w => {
    if (!w) return '';
    if (/^\d+$/.test(w)) return w; // numbers
    if (w.length <= 2) return w.toUpperCase();
    return w[0].toUpperCase() + w.slice(1);
  }).join(' ');
}

function extractTitleFromUrl(url) {
  if (!url) return '';
  try {
    // remove query/hash
    let u = url.split('?')[0].split('#')[0];
    // trim trailing slash
    if (u.endsWith('/')) u = u.slice(0, -1);
    const last = u.split('/').pop() || '';
    // decode and replace dashes/underscores
    const decoded = decodeURIComponent(last.replace(/%20/g, ' '));
    // sometimes last contains file extension - strip
    const noext = decoded.replace(/\.[a-z0-9]+$/i, '');
    // replace sequences like "-n-123" or trailing ids
    const cleaned = noext.replace(/\b(n|no)\b[- ]?\d+$/i, '').replace(/-\d+$/, '').replace(/\b\d{3,}\b/g, '');
    return titleize(cleaned);
  } catch (e) {
    return '';
  }
}

const raw = fs.readFileSync(inPath, 'utf8');
const lines = raw.split(/\r?\n/);
if (lines.length === 0) {
  console.error('empty input');
  process.exit(1);
}

// header is first line
const header = lines[0] || '';
// Support optional BOM and quoted header fields
const cleanHeader = header.replace(/^\uFEFF/, '');
const cols = cleanHeader.split(/\t/).map(c => c.replace(/^"|"$/g, '').trim().toLowerCase());
const titleIdx = cols.indexOf('title');
const urlIdx = cols.indexOf('url');

if (titleIdx === -1 || urlIdx === -1) {
  console.error('could not find title or url columns in header');
  process.exit(1);
}

const outLines = [header];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line) { outLines.push(line); continue; }
  // split by tab but preserve empty fields
  const parts = line.split('\t');
  // ensure length
  while (parts.length < cols.length) parts.push('');
  const urlField = parts[urlIdx] ? parts[urlIdx].replace(/^"|"$/g, '') : '';
  const titleField = parts[titleIdx] ? parts[titleIdx].replace(/^"|"$/g, '') : '';
  if (!titleField || titleField.trim() === '') {
    const derived = extractTitleFromUrl(urlField);
    // wrap in quotes, escape existing quotes
    parts[titleIdx] = derived ? `"${derived.replace(/"/g, '""')}"` : '';
  }
  outLines.push(parts.join('\t'));
}
fs.writeFileSync(outPath, outLines.join('\n'));
console.log('wrote', outPath, 'with', outLines.length-1, 'rows');
