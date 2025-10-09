import type { GundamGrade } from '@/types/gundam';

export type VisionCandidate = {
  name: string;
  grade?: GundamGrade;
  confidence?: number;
};

export type VisionIdentifyResult = {
  name?: string;
  grade?: GundamGrade;
  scale?: string;
  modelCode?: string;
  candidates?: VisionCandidate[];
};

export type MerchantOffer = {
  title: string;
  url: string;
  price?: number;
  currency?: string;
  source?: string;
};

const DEBUG = ((import.meta as unknown as { env?: { VITE_DEBUG_VISION?: string } }).env?.VITE_DEBUG_VISION) === 'true';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function identifyFromImage(imageUrl: string): Promise<VisionIdentifyResult> {
  if (DEBUG) console.debug('[vision] identify ->', imageUrl);
  return postJson<VisionIdentifyResult>('/api/vision/identify', { imageUrl });
}

export async function searchOffersForImage(imageUrl: string): Promise<MerchantOffer[]> {
  if (DEBUG) console.debug('[vision] offers ->', imageUrl);
  return postJson<MerchantOffer[]>('/api/vision/search', { imageUrl });
}
