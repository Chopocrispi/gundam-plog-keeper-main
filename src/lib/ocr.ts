import Tesseract from 'tesseract.js';
import type { GundamGrade } from '@/types/gundam';
import { searchGunplaImagesByKeywords } from '@/utils/gunpladb';

const PROXY_BASE = ((import.meta as unknown as { env?: { VITE_PROXY_BASE?: string } }).env?.VITE_PROXY_BASE) as string | undefined;

function gradeFromText(t: string): GundamGrade | undefined {
  const u = t.toUpperCase();
  if (/\bHG\b/.test(u) || /HIGH\s*GRADE/.test(u)) return 'High Grade (HG)';
  if (/\bRG\b/.test(u) || /REAL\s*GRADE/.test(u)) return 'Real Grade (RG)';
  if (/\bMG\b/.test(u) || /MASTER\s*GRADE/.test(u)) return 'Master Grade (MG)';
  if (/\bPG\b/.test(u) || /PERFECT\s*GRADE/.test(u)) return 'Perfect Grade (PG)';
  if (/\bFM\b/.test(u) || /FULL\s*MECHANICS/.test(u)) return 'Full Mechanics (FM)';
  if (/\bSD\b/.test(u) || /SUPER\s*DEFORMED/.test(u)) return 'Super Deformed (SD)';
  return undefined;
}

function scaleFromText(t: string): string | undefined {
  const m = t.match(/1\s*\/(\s*\d{2,3})/);
  if (!m) return undefined;
  return `1/${m[1].replace(/\s+/g, '')}`;
}

function modelCodeFromText(t: string): string | undefined {
  // Heuristic for codes like XVX-016, RX-78-2, OZ-XXG01S2 etc.
  const m = t.toUpperCase().match(/\b[A-Z0-9]{2,4}[\-]?[A-Z0-9]{1,4}(?:[A-Z0-9\-]{0,3})\b/);
  return m?.[0];
}

async function toObjectUrl(imageUrl: string): Promise<string> {
  try {
    const url = PROXY_BASE ? `${PROXY_BASE}?url=${encodeURIComponent(imageUrl)}` : imageUrl;
    const resp = await fetch(url);
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  } catch {
    // fallback to raw url
    return imageUrl;
  }
}

function toKeywords(t: string): string[] {
  const stop = new Set(['bandai', 'spirits', 'model', 'plastic', 'gunpla', 'series', 'ver', 'version']);
  return t
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w && w.length > 2 && !stop.has(w));
}

function humanizeFromFilename(url: string): string | undefined {
  try {
    const name = url.split('/').pop() || '';
    const base = name.replace(/\.[^.]+$/, '');
    return base.replace(/[._-]+/g, ' ');
  } catch { return undefined; }
}

export async function identifyFromImageFree(imageUrl: string): Promise<{
  name?: string;
  grade?: GundamGrade;
  scale?: string;
  modelCode?: string;
  candidates?: Array<{ name: string; grade?: GundamGrade; confidence?: number; url?: string }>;
}> {
  const src = await toObjectUrl(imageUrl);
  const { data } = await Tesseract.recognize(src, 'eng');
  const text = data?.text || '';
  const grade = gradeFromText(text);
  const scale = scaleFromText(text);
  const modelCode = modelCodeFromText(text);
  const keywords = toKeywords(text);
  const matches = keywords.length ? searchGunplaImagesByKeywords(keywords, grade) : [];

  const candidates = matches.slice(0, 5).map((u, i) => ({
    name: humanizeFromFilename(u) || 'Unknown kit',
    grade,
    confidence: Math.max(0.2, 1 - i * 0.15),
    url: u,
  }));

  const best = candidates[0];
  return {
    name: best?.name,
    grade,
    scale,
    modelCode,
    candidates,
  };
}
