export type Offer = {
  title: string;
  url: string;
  price: number;
  currency: string; // 'USD' | 'EUR' | ...
  source?: string;
};

const DEBUG = ((import.meta as unknown as { env?: { VITE_DEBUG_PRICING?: string } }).env?.VITE_DEBUG_PRICING) === 'true';
const PROXY_BASE = ((import.meta as unknown as { env?: { VITE_PROXY_BASE?: string } }).env?.VITE_PROXY_BASE) as string | undefined;
const SEARCH_ENDPOINT = ((import.meta as unknown as { env?: { VITE_MERCHANT_SEARCH_ENDPOINT?: string } }).env?.VITE_MERCHANT_SEARCH_ENDPOINT) as string | undefined;
const EUR_USD_RATE = Number(((import.meta as unknown as { env?: { VITE_EUR_USD_RATE?: string } }).env?.VITE_EUR_USD_RATE)) || 1.08;

export async function searchOffersByImage(imageUrl: string): Promise<{ offers: Offer[]; averageUSD: number | null }> {
  if (!imageUrl) return { offers: [], averageUSD: null };
  const endpoint =
    SEARCH_ENDPOINT?.replace(/\/$/, '') || (PROXY_BASE ? PROXY_BASE.replace(/\/$/, '') + '/visualsearch' : '');
  if (!endpoint) throw new Error('No merchant search endpoint configured. Set VITE_MERCHANT_SEARCH_ENDPOINT or VITE_PROXY_BASE to a server that exposes /visualsearch.');

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl }),
      mode: 'cors',
    });
    if (!res.ok) throw new Error(`search status ${res.status}`);
    const data = (await res.json()) as { offers?: Offer[] };
    const offers = Array.isArray(data.offers) ? data.offers.filter(validOffer) : [];
    const averageUSD = computeAverageUSD(offers);
    if (DEBUG) console.debug('[visualsearch] offers', offers, 'avgUSD', averageUSD);
    return { offers, averageUSD };
  } catch (e) {
    if (DEBUG) console.debug('[visualsearch] error', e);
    return { offers: [], averageUSD: null };
  }
}

function validOffer(o: any): o is Offer {
  return o && typeof o.url === 'string' && typeof o.title === 'string' && typeof o.price === 'number' && !!o.currency;
}

export function computeAverageUSD(offers: Offer[]): number | null {
  const pricesUSD: number[] = [];
  for (const o of offers) {
    const usd = toUSD(o.price, o.currency);
    if (usd != null && isFinite(usd)) pricesUSD.push(usd);
  }
  if (pricesUSD.length === 0) return null;
  const sum = pricesUSD.reduce((a, b) => a + b, 0);
  return Math.round((sum / pricesUSD.length) * 100) / 100;
}

function toUSD(amount: number, currency: string): number | null {
  const curr = currency.toUpperCase();
  if (curr === 'USD' || curr === '$') return amount;
  if (curr === 'EUR' || curr === '€') return amount * EUR_USD_RATE;
  // Fallback: if unknown currency, skip
  return null;
}
