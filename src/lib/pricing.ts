import type { GundamModel, GundamGrade } from '@/types/gundam';
import { STORE_FETCHERS } from '@/lib/stores/providers';

export type PriceQuote = {
  store: string;
  price: number;
  currency: string; // e.g., USD
  url?: string;
};

export interface PriceProvider {
  id: string;
  name: string;
  search: (modelName: string, grade?: GundamGrade) => Promise<PriceQuote | null>;
}

// Simple baseline by grade (rough typical street prices)
const gradeBaselineUSD: Record<string, number> = {
  'High Grade (HG)': 22,
  'Real Grade (RG)': 35,
  'Master Grade (MG)': 55,
  'Perfect Grade (PG)': 200,
  'Full Mechanics (FM)': 50,
  'Super Deformed (SD)': 15,
};

class BaselineProvider implements PriceProvider {
  id = 'baseline';
  name = 'Baseline';
  async search(_modelName: string, grade?: GundamGrade): Promise<PriceQuote | null> {
    const price = grade ? gradeBaselineUSD[grade] : undefined;
    if (!price) return null;
    return { store: this.name, price, currency: 'USD' };
  }
}

class AdjustedBaselineProvider implements PriceProvider {
  id: string;
  name: string;
  factor: number;
  constructor(id: string, name: string, factor: number) {
    this.id = id; this.name = name; this.factor = factor;
  }
  async search(_modelName: string, grade?: GundamGrade): Promise<PriceQuote | null> {
    const base = grade ? gradeBaselineUSD[grade] : undefined;
    if (!base) return null;
    const price = Math.round(base * this.factor);
    return { store: this.name, price, currency: 'USD' };
  }
}

// In the future, add JSON-backed providers that fetch `/store-data/*.json` and match by keywords.

const providers: PriceProvider[] = [
  new BaselineProvider(),
  new AdjustedBaselineProvider('storeA', 'Sample Store A', 0.92),
  new AdjustedBaselineProvider('storeB', 'Sample Store B', 1.08),
];

type CacheEntry = { quotes: PriceQuote[]; ts: number };
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function cacheKey(name: string, grade?: string) {
  return `pricecache:v1:${name.toLowerCase()}|${grade || ''}`;
}

// Convert a quote to USD using a simple, configurable rate for EUR→USD.
// Set VITE_EUR_USD_RATE to override; default is 1.08.
function eurUsdRate(): number {
  const raw = import.meta.env?.VITE_EUR_USD_RATE as unknown as string | undefined;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1.08;
}

function toUSD(price: number, currency: string): number {
  if (currency === 'EUR') return Math.round(price * eurUsdRate() * 100) / 100;
  return price;
}

export async function estimateModelPrice(model: GundamModel): Promise<{ quotes: PriceQuote[]; average: number | null; currency: string } | null> {
  const name = model.name?.trim();
  if (!name) return null;
  const key = cacheKey(name, model.grade);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const entry = JSON.parse(raw) as CacheEntry;
      if (Date.now() - entry.ts < CACHE_TTL_MS) {
        const avgUSD = entry.quotes.length
          ? Math.round((entry.quotes.reduce((a, q) => a + toUSD(q.price, q.currency), 0) / entry.quotes.length) * 100) / 100
          : null;
        return { quotes: entry.quotes, average: avgUSD, currency: 'USD' };
      }
    }
  } catch { /* ignore cache parse */ }

  // Try all real stores first
  const realResults = await Promise.all(
    STORE_FETCHERS.map(async s => {
      const r = await s.fetcher(model);
      return r ? ({ store: s.name, price: r.price, currency: r.currency, url: r.url } as PriceQuote) : null;
    })
  );

  let quotes = realResults.filter(Boolean) as PriceQuote[];
  if (!quotes.length) {
    // Fallback to baselines if no real store hit
    const baselineResults = await Promise.all(
      providers.map(p => p.search(name, model.grade as GundamGrade))
    );
    quotes = baselineResults.filter(Boolean) as PriceQuote[];
  }
  if (!quotes.length) return null;
  // Convert all quotes to USD and average
  const sumUSD = quotes.reduce((a, q) => a + toUSD(q.price, q.currency), 0);
  const average = Math.round((sumUSD / quotes.length) * 100) / 100;

  try { localStorage.setItem(key, JSON.stringify({ quotes, ts: Date.now() } satisfies CacheEntry)); } catch { /* ignore cache set */ }
  return { quotes, average, currency: 'USD' };
}

export async function estimateCollectionValue(models: GundamModel[]): Promise<{ total: number; counted: number; currency: string; perModel: Record<string, number> }>{
  let total = 0; let counted = 0; const perModel: Record<string, number> = {};
  const currency = 'USD';
  for (const m of models) {
    const est = await estimateModelPrice(m);
    const price = est?.average ?? (typeof m.price === 'number' ? m.price : null);
    if (price != null) { total += price; counted += 1; perModel[m.id] = price; }
  }
  return { total, counted, currency, perModel };
}
