/**
 * Series helpers
 */
const SERIES_TOKEN_MAP: Record<string, string[]> = {
  'Universal Century': ['uc', 'universal', 'unicorn'],
  'SEED': ['seed'],
  'Iron Blooded Orphans': ['ibo', 'ironblood', 'iron-blood'],
  '00': ['gundam00', '00'],
  'WING': ['wing', 'winggundam'],
  'AGE': ['age'],
  'Reconguista': ['reconguista', 'reconguistaing', 'g-reconguista'],
  'Witch from mercury': ['witchfrommercury', 'witch-from-mercury', 'witch', 'mercury'],
  '08TH MS Team': ['08th', '08thms', '08thmsteam', '08th-ms-team'],
  'Build Divers': ['builddivers', 'build-divers', 'builddiversrerise', 'builddivers-rerise'],
  'OTHER': []
};

const CDN_BASE = 'https://cdn.gunpladb.net/';
function toCdnUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return CDN_BASE + pathOrUrl.replace(/^\/+/, '');
}

export function inferSeriesFromFilename(filename: string): string | undefined {
  const ln = filename.toLowerCase();
  for (const [series, tokens] of Object.entries(SERIES_TOKEN_MAP)) {
    for (const t of tokens) {
      if (t && ln.includes(t)) return series;
    }
  }
  return undefined;
}

// Prefer series tokens that appear near the start of the filename (after grade prefix)
export function inferSeriesFromFilenamePrefix(filename: string): string | undefined {
  const ln = filename.toLowerCase();
  // take the first segment before common separators — this is where grade/series prefixes live
  const firstSegment = ln.split(/[-_\s]/)[0] || ln;
  for (const [series, tokens] of Object.entries(SERIES_TOKEN_MAP)) {
    for (const t of tokens) {
      if (!t) continue;
      if (firstSegment.includes(t)) return series;
    }
  }
  return undefined;
}
/**
 * Search Gunpla image filenames by keywords and return full CDN URLs
 */
export type GunplaImageMeta = { url: string; name: string; grade?: string };
export async function searchGunplaImagesByKeywords(keywords: string[], grade?: string, series?: string): Promise<GunplaImageMeta[]> {
  // Supabase-backed search. We search the gunpla_models table by name tokens and optional grade,
  // then return the corresponding CDN URLs from the url column.
  const lowerKeywords = keywords.map(k => k.toLowerCase()).filter(Boolean);
  if (lowerKeywords.length === 0) return [];

  // Build ilike patterns for Supabase (PostgREST) — we will do a simple OR across tokens on the client side
  // by making multiple queries if necessary. To keep it efficient, try one broad query using the first token,
  // then filter client-side for all tokens.
  try {
    const { supabaseAvailable, getSupabase } = await import('@/utils/supabase');
    if (!supabaseAvailable()) throw new Error('SUPABASE_DISABLED');
  const supabase = getSupabase();

    // Build ANDed filters: grade = code (if provided) and name ILIKE for each token
    const toCode = (g?: string) => {
      if (!g) return undefined;
      const u = g.toUpperCase();
      if (u.includes('PG')) return 'PG';
      if (u.includes('MG')) return 'MG';
      if (u.includes('RG')) return 'RG';
      if (u.includes('HG')) return 'HG';
      if (u.includes('FM')) return 'FM';
      if (u.includes('EG')) return 'EG';
      if (u.includes('FG')) return 'FG';
      if (u.includes('HIRM')) return 'HiRM';
      if (u.includes('MGSD')) return 'MGSD';
      if (u.includes('LM')) return 'LM';
      if (u.includes('HY2M')) return 'HY2M';
      if (u.includes('SD')) return 'SD';
      if (u.includes('MEGA') || u.includes('MS')) return 'MS';
      if (u.includes('NG')) return 'NG';
      return undefined;
    };
    const gradeCode = toCode(grade);

  let q = supabase.from('gunpla_models').select('url,name,grade');
  if (gradeCode) q = q.eq('grade', gradeCode);
    for (const t of lowerKeywords) q = q.ilike('name', `%${t}%`);
    console.info('[gunpladb][supabase] image search', { grade, gradeCode, tokens: lowerKeywords });
    let { data, error } = await q;
    if (error) {
      console.warn('[supabase] search error (AND query)', { error, tokens: lowerKeywords, gradeCode });
      // continue to try fallback below
    }
  let rows = (data || []) as Array<{ url: string; name: string; grade: string }>;
    console.info('[gunpladb][supabase] image search rows', rows.length);
    if (rows.length === 0 && gradeCode) {
      // retry without grade filter
      console.info('[gunpladb][supabase] retry image search without grade filter');
      let q2 = supabase.from('gunpla_models').select('url,name,grade');
      for (const t of lowerKeywords) q2 = q2.ilike('name', `%${t}%`);
      const r2 = await q2;
      if (!r2.error) rows = (r2.data || []) as Array<{ url: string; name: string; grade: string }>;    
    }
    // If we still have no rows, try a broader OR-based ilike search (matches any token)
    if (rows.length === 0) {
      try {
        const orFilter = lowerKeywords.map(t => `name.ilike.%${t}%`).join(',');
        console.info('[gunpladb][supabase] trying OR fallback', { orFilter, gradeCode });
        let q3 = supabase.from('gunpla_models').select('url,name,grade');
        if (gradeCode) q3 = q3.eq('grade', gradeCode);
        const r3 = await q3.or(orFilter);
        if (r3 && !r3.error) rows = (r3.data || []) as Array<{ url: string; name: string; grade: string }>;
        if (r3?.error) console.warn('[supabase] OR fallback error', r3.error);
      } catch (e) {
        console.warn('[gunpladb] OR fallback failed', e);
      }
    }
    // Enforce strict grade match even after fallback
    if (gradeCode) {
      rows = rows.filter(r => (r.grade || '').toUpperCase() === gradeCode);
    }
    if (series) {
      const want = series.trim().toLowerCase();
      rows = rows.filter(r => {
        const file = r.url.split('/').pop() || r.url;
        const s = inferSeriesFromFilenamePrefix(file) || inferSeriesFromFilename(file) || '';
        return s.toLowerCase() === want;
      });
    }
  return rows.map(r => ({ url: toCdnUrl(r.url), name: r.name, grade: r.grade }));
  } catch (e) {
    if ((e as Error).message !== 'SUPABASE_DISABLED') {
      console.warn('searchGunplaImagesByKeywords fallback due to error:', e);
    }
    if ((e as Error).message === 'SUPABASE_DISABLED') {
      console.warn('[gunpladb] Supabase env not configured; image search disabled');
    }
    // No guessing; without Supabase, return empty.
    return [];
  }
}

import { GunplaDBResponse, GundamGrade } from '@/types/gundam';

// Deprecated: previously we exposed a static GUNPLA_IMAGE_FILENAMES map.
// All lookups now use Supabase table `gunpla_models`.
/**
 * Fetch Gundam images from GunplaDB by trying multiple grade/keyword patterns
 */
export async function fetchGundamImages(
  modelName: string,
  grade?: GundamGrade,
  series?: string
): Promise<GunplaDBResponse & { imageOptions?: GunplaImageMeta[] }> {
  try {
    // Clean and normalize the model name
    const cleanName = modelName
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // Extract keywords (min length = 2 to include short model names like 'ZZ')
  const keywords = cleanName.split(' ').filter(word => word.length > 1);

    // First, try Supabase table lookup for exact images
    try {
    const { supabaseAvailable, getSupabase } = await import('@/utils/supabase');
      if (!supabaseAvailable()) throw new Error('SUPABASE_DISABLED');
  const supabase = getSupabase();

      const toCode = (g?: string) => {
        if (!g) return undefined;
        const u = g.toUpperCase();
        if (u.includes('PG')) return 'PG';
        if (u.includes('MG')) return 'MG';
        if (u.includes('RG')) return 'RG';
        if (u.includes('HG')) return 'HG';
        if (u.includes('FM')) return 'FM';
        if (u.includes('EG')) return 'EG';
        if (u.includes('FG')) return 'FG';
        if (u.includes('HIRM')) return 'HiRM';
        if (u.includes('MGSD')) return 'MGSD';
        if (u.includes('LM')) return 'LM';
        if (u.includes('HY2M')) return 'HY2M';
        if (u.includes('SD')) return 'SD';
        if (u.includes('MEGA') || u.includes('MS')) return 'MS';
        if (u.includes('NG')) return 'NG';
        return undefined;
      };
      const gradeCode = toCode(grade);

  let q = supabase.from('gunpla_models').select('url,name,grade');
  if (gradeCode) q = q.eq('grade', gradeCode);
      for (const t of keywords) q = q.ilike('name', `%${t}%`);
      console.info('[gunpladb][supabase] fetch images', { modelName, grade, gradeCode, tokens: keywords });
      let { data, error } = await q;
      if (!error) {
        let rows = (data || []) as Array<{ url: string; name: string; grade: string }>;
        console.info('[gunpladb][supabase] fetch images rows', rows.length);
        if (rows.length === 0 && gradeCode) {
          console.info('[gunpladb][supabase] retry fetch images without grade filter');
          let q2 = supabase.from('gunpla_models').select('url,name,grade');
          for (const t of keywords) q2 = q2.ilike('name', `%${t}%`);
          const r2 = await q2;
          if (!r2.error) rows = (r2.data || []) as Array<{ url: string; name: string; grade: string }>;
        }
        // OR-based fallback: match any token instead of all tokens
        if (rows.length === 0) {
          try {
            const orFilter = keywords.map(t => `name.ilike.%${t}%`).join(',');
            console.info('[gunpladb][supabase] trying OR fallback for fetch images', { orFilter, gradeCode });
            let q3 = supabase.from('gunpla_models').select('url,name,grade');
            if (gradeCode) q3 = q3.eq('grade', gradeCode);
            const r3 = await q3.or(orFilter);
            if (r3 && !r3.error) rows = (r3.data || []) as Array<{ url: string; name: string; grade: string }>;
            if (r3?.error) console.warn('[supabase] OR fallback error (fetch images)', r3.error);
          } catch (e) {
            console.warn('[gunpladb] OR fallback failed (fetch images)', e);
          }
        }
        // Enforce strict grade match even after fallback
        if (gradeCode) {
          rows = rows.filter(r => (r.grade || '').toUpperCase() === gradeCode);
        }
        if (series) {
          const want = series.trim().toLowerCase();
          rows = rows.filter(r => {
            const file = r.url.split('/').pop() || r.url;
            const s = inferSeriesFromFilenamePrefix(file) || inferSeriesFromFilename(file) || '';
            return s.toLowerCase() === want;
          });
        }
        const metas: GunplaImageMeta[] = rows.map(r => ({ url: toCdnUrl(r.url), name: r.name, grade: r.grade }));
        const urls = metas.map(m => m.url);
        if (urls.length > 0) {
          return {
            success: true,
            imageUrl: urls[0],
            imageOptions: metas,
          };
        }
      }
    } catch (e) {
      // non-fatal; fall through to pattern guesses
      if ((e as Error).message !== 'SUPABASE_DISABLED') {
        console.warn('[gunpladb] Supabase lookup failed, falling back to pattern search', e);
      }
    }

  return { success: false, error: 'No images found for this model and grade combination' };
  } catch (error) {
    console.error('Error fetching Gundam image:', error);
    return { success: false, error: 'Failed to fetch image from GunplaDB' };
  }
}

/**
 * Legacy wrapper for backward compatibility
 */
export async function fetchGundamImage(modelName: string): Promise<GunplaDBResponse> {
  const result = await fetchGundamImages(modelName);
  return {
    success: result.success,
    imageUrl: result.imageUrl,
    error: result.error
  };
}

/**
 * Validate that an image URL is accessible
 */
export async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}