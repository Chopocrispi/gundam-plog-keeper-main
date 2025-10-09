import type { Offer, OffersIndex, GundamGrade } from '@/types/gundam';

// Lightweight client-side offers lookup that reads a static JSON index from /public
// Later this can be swapped for a real API that serves fresh scraped prices.

let cache: OffersIndex | null = null;

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function gradeAbbr(grade?: GundamGrade) {
  if (!grade) return '';
  const g = grade.toLowerCase();
  if (g.includes('high grade')) return 'hg';
  if (g.includes('real grade')) return 'rg';
  if (g.includes('master grade')) return 'mg';
  if (g.includes('perfect grade')) return 'pg';
  if (g.includes('full mechanics')) return 'fm';
  if (g.includes('super deformed')) return 'sd';
  if (g.includes('mega size')) return 'ms';
  return '';
}

export async function loadOffersIndex(): Promise<OffersIndex> {
  if (cache) return cache;
  try {
    const res = await fetch('/offers.sample.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Offers index fetch failed: ${res.status}`);
    const data = (await res.json()) as OffersIndex;
    cache = data;
    return data;
  } catch (e) {
    console.warn('Failed to load offers index', e);
    cache = {};
    return cache;
  }
}

export async function findOffersForModel(name: string, grade?: GundamGrade): Promise<Offer[]> {
  const idx = await loadOffersIndex();
  const q = normalize(`${gradeAbbr(grade)} ${name}`.trim());
  // direct key match first
  let offers = idx[q];
  if (!offers) {
    // fallback: try without grade abbreviation
    offers = idx[normalize(name)] || [];
  }

  // dedupe by store hostname and sort by price asc
  const seen = new Map<string, Offer>();
  for (const o of offers) {
    try {
      const host = new URL(o.url).hostname.replace(/^www\./, '');
      const prev = seen.get(host);
      if (!prev || o.price < prev.price) seen.set(host, o);
    } catch {
      // if URL parsing fails, fallback to store string
      const key = o.store.toLowerCase();
      const prev = seen.get(key);
      if (!prev || o.price < prev.price) seen.set(key, o);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.price - b.price);
}
