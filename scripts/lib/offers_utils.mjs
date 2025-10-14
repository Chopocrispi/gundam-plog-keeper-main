// Utilities to canonicalize offer titles/keys and deduplicate offers
import levenshtein from 'fast-levenshtein';

export function normalizeTitle(s){
  if(!s) return '';
  let t = s.toLowerCase();
  // remove parentheses content
  t = t.replace(/\([^\)]*\)/g,' ');
  // normalize common version tokens like 'ver', 'version', 'v' and following numbers
  t = t.replace(/\bver(?:sion)?\b\.?/g,' ');
  t = t.replace(/\bv\.?\b/gi, ' ');
  // remove standalone numeric version tokens like 3 or 3.0 (but keep ones attached to model tokens like rx-78-2)
  t = t.split(/\s+/).filter(tok => !/^\d+(?:\.\d+)?$/.test(tok)).join(' ');
  return t.replace(/\s+/g,' ').trim();
}

export function canonicalAlnum(s){
  return (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
}

export function extractModelParts(s){
  if(!s) return null;
  const c = canonicalAlnum(s);
  const m = c.match(/rx(\d{2})(\d)?/);
  if(!m) return null;
  const base = `rx${m[1]}`;
  const variant = m[2] || null;
  return { base, variant };
}

export function titleSimilarity(a,b){
  if(!a || !b) return 0;
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if(na === nb) return 1;
  // token overlap
  const sa = new Set(na.split(' ').filter(Boolean));
  const sb = new Set(nb.split(' ').filter(Boolean));
  let common = 0; for(const t of sa) if(sb.has(t)) common++;
  const overlap = common / Math.max(sa.size, sb.size, 1);
  // also incorporate Levenshtein normalized
  const lev = levenshtein.get(na, nb);
  const maxLen = Math.max(na.length, nb.length, 1);
  const levScore = 1 - lev / maxLen;
  // weighted
  return Math.max(0, (overlap * 0.6) + (levScore * 0.4));
}

export function dedupeOffers(offers, opts = {}){
  // offers: array of { store, title, url, price }
  const groups = [];
  // lower default threshold to be more permissive for noisy titles
  const threshold = opts.similarityThreshold || 0.5;
  for(const o of offers){
    let placed = false;
    for(const g of groups){
      // quick model check: if both have identifiable model parts and base differs, skip
      const p1 = extractModelParts(g.representative.title || g.representative.url);
      const p2 = extractModelParts(o.title || o.url);
      if(p1 && p2){
        // if bases differ, skip
        if(p1.base !== p2.base) continue;
        // if both have explicit variant and variants differ, skip grouping
        if(p1.variant && p2.variant && p1.variant !== p2.variant) continue;
      }
      const sim = titleSimilarity(g.representative.title || g.representative.url, o.title || o.url);
      if(sim >= threshold){
        g.items.push(o);
        // update representative: prefer one with price and lower price
        const best = chooseBetter(g.representative, o);
        g.representative = best;
        placed = true;
        break;
      }
    }
    if(!placed){ groups.push({ representative: o, items: [o] }); }
  }
  // return representative offers
  return groups.map(g => ({ ...g.representative, sources: g.items.length }));
}

function chooseBetter(a,b){
  // prefer with price; prefer lower numeric price when both have price
  const pa = a && a.price != null ? Number(a.price) : null;
  const pb = b && b.price != null ? Number(b.price) : null;
  if(pa == null && pb == null) return a; // keep existing
  if(pa == null) return b;
  if(pb == null) return a;
  if(isNaN(pa) || isNaN(pb)) return a;
  return pb < pa ? b : a;
}

export default {
  normalizeTitle, canonicalAlnum, extractModelParts, titleSimilarity, dedupeOffers
};
