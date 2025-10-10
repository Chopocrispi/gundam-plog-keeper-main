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
export async function searchGunplaImagesByKeywords(keywords: string[], grade?: string, series?: string): Promise<string[]> {
  // Supabase-backed search. We search the gunpla_models table by name tokens and optional grade,
  // then return the corresponding CDN URLs from the url column.
  const lowerKeywords = keywords.map(k => k.toLowerCase()).filter(Boolean);
  if (lowerKeywords.length === 0) return [];

  // Build ilike patterns for Supabase (PostgREST) — we will do a simple OR across tokens on the client side
  // by making multiple queries if necessary. To keep it efficient, try one broad query using the first token,
  // then filter client-side for all tokens.
  try {
    const { getSupabase } = await import('@/utils/supabase');
    const supabase = getSupabase();

    // Start with first token to reduce row count, then filter on client
    const first = lowerKeywords[0];
    let q = supabase
      .from('gunpla_models')
      .select('url,name,grade')
      .ilike('name', `%${first}%`);
    if (grade) {
      const g = grade.toLowerCase();
      const ors: string[] = [];
      if (g.includes('high') || g.includes('hg')) ors.push("grade.ilike.%HG%", "grade.ilike.%High Grade%");
      if (g.includes('real') || g.includes('rg')) ors.push("grade.ilike.%RG%", "grade.ilike.%Real Grade%");
      if (g.includes('master') || g.includes('mg')) ors.push("grade.ilike.%MG%", "grade.ilike.%Master Grade%");
      if (g.includes('perfect') || g.includes('pg')) ors.push("grade.ilike.%PG%", "grade.ilike.%Perfect Grade%");
      if (g.includes('full') || g.includes('fm')) ors.push("grade.ilike.%FM%", "grade.ilike.%Full Mechanics%");
      if (g.includes('super') || g.includes('sd')) ors.push("grade.ilike.%SD%", "grade.ilike.%Super Deformed%");
      if (ors.length) {
        q = q.or(ors.join(','));
      }
    }
    const { data, error } = await q;
    if (error) {
      console.warn('[supabase] search error', error);
      return [];
    }
    const rows = (data || []) as Array<{ url: string; name: string; grade: string }>;
    // Client-side ensure that all tokens are present in name
    const filtered = rows.filter(r => {
      const n = r.name.toLowerCase();
      return lowerKeywords.every(k => n.includes(k));
    });

    // Optionally filter by series tokens inferred from URL if provided
    let finalRows = filtered;
    if (series) {
      const want = series.trim().toLowerCase();
      finalRows = filtered.filter(r => {
        const file = r.url.split('/').pop() || r.url;
        const s = inferSeriesFromFilenamePrefix(file) || inferSeriesFromFilename(file) || '';
        return s.toLowerCase() === want;
      });
    }
    return finalRows.map(r => r.url);
  } catch (e) {
    console.warn('searchGunplaImagesByKeywords fallback due to error:', e);
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
): Promise<GunplaDBResponse & { imageOptions?: string[] }> {
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
      const { getSupabase } = await import('@/utils/supabase');
      const supabase = getSupabase();
      const first = keywords[0] || cleanName;
      let q = supabase
        .from('gunpla_models')
        .select('url,name,grade')
        .ilike('name', `%${first}%`);
      if (grade) {
        const g = grade.toLowerCase();
        const ors: string[] = [];
        if (g.includes('high') || g.includes('hg')) ors.push("grade.ilike.%HG%", "grade.ilike.%High Grade%");
        if (g.includes('real') || g.includes('rg')) ors.push("grade.ilike.%RG%", "grade.ilike.%Real Grade%");
        if (g.includes('master') || g.includes('mg')) ors.push("grade.ilike.%MG%", "grade.ilike.%Master Grade%");
        if (g.includes('perfect') || g.includes('pg')) ors.push("grade.ilike.%PG%", "grade.ilike.%Perfect Grade%");
        if (g.includes('full') || g.includes('fm')) ors.push("grade.ilike.%FM%", "grade.ilike.%Full Mechanics%");
        if (g.includes('super') || g.includes('sd')) ors.push("grade.ilike.%SD%", "grade.ilike.%Super Deformed%");
        if (ors.length) {
          q = q.or(ors.join(','));
        }
      }
      const { data, error } = await q;
      if (!error) {
        const rows = (data || []) as Array<{ url: string; name: string; grade: string }>;
        // ensure all tokens present
        let filtered = rows.filter(r => keywords.every(k => r.name.toLowerCase().includes(k)));
        if (series) {
          const want = series.trim().toLowerCase();
          filtered = filtered.filter(r => {
            const file = r.url.split('/').pop() || r.url;
            const s = inferSeriesFromFilenamePrefix(file) || inferSeriesFromFilename(file) || '';
            return s.toLowerCase() === want;
          });
        }
        const urls = filtered.map(r => r.url);
        if (urls.length > 0) {
          return {
            success: true,
            imageUrl: urls[0],
            imageOptions: Array.from(new Set(urls)).slice(0, 20),
          };
        }
      }
    } catch (e) {
      // non-fatal; fall through to pattern guesses
      console.warn('[gunpladb] Supabase lookup failed, falling back to pattern search', e);
    }

    // Grade → prefixes
    const gradeMap: Record<string, string[]> = {
      'High Grade (HG)': ['HG', 'HGUC', 'HGHGUC'],
      'Full Mechanics (FM)': ['FM', 'Full-Mechanics', 'FullMechanics'],
      'Real Grade (RG)': ['RG'],
      'Master Grade (MG)': ['MG'],
      'Perfect Grade (PG)': ['PG'],
      'Super Deformed (SD)': ['SD'],
      'No Grade': ['NG'],
      'Other': ['HG', 'RG', 'MG']
    };

    const gradePrefixes = grade ? gradeMap[grade] || ['HG'] : ['HG', 'RG', 'MG', 'PG'];

    // Generate possible URLs
    const possibleUrls: string[] = [];
    for (const gradePrefix of gradePrefixes) {
      for (const keyword of keywords) {
        const patterns = [
          `${gradePrefix}${keyword.toUpperCase()}`,
          `${gradePrefix}-${keyword.toUpperCase()}`,
          `${gradePrefix}${keyword.charAt(0).toUpperCase() + keyword.slice(1)}`,
          `${gradePrefix}UC-${keyword.toUpperCase()}`,
          `${gradePrefix}IBO-${keyword.toUpperCase()}`,
          `${gradePrefix}SEED-${keyword.toUpperCase()}`,
          `${gradePrefix}00-${keyword.toUpperCase()}`,
          `${gradePrefix}W-${keyword.toUpperCase()}`
        ];

        for (const pattern of patterns) {
          possibleUrls.push(`https://cdn.gunpladb.net/${pattern}.jpg`);
        }
      }

      // Try combined keywords
      if (keywords.length > 1) {
        const combinedKeyword = keywords.join('');
        possibleUrls.push(`https://cdn.gunpladb.net/${gradePrefix}${combinedKeyword.toUpperCase()}.jpg`);
        possibleUrls.push(`https://cdn.gunpladb.net/${gradePrefix}-${combinedKeyword.toUpperCase()}.jpg`);
      }
    }

    // Deduplicate
    const uniqueUrls = [...new Set(possibleUrls)];

    // Validate URLs (limit 20 checks) - if series provided, prioritize URLs that contain any
    // of the series tokens defined in SERIES_TOKEN_MAP for that series. This avoids
    // accidental cross-matching on short substrings.
    const validUrls: string[] = [];
    const seen = new Set<string>();
    let prioritized: string[] = uniqueUrls;
    if (series) {
      const wantedKey = Object.keys(SERIES_TOKEN_MAP).find(k => k.toLowerCase() === series.trim().toLowerCase());
      const tokens = wantedKey ? (SERIES_TOKEN_MAP[wantedKey] || []) : [];
      const normTokens = tokens.map(t => t.toLowerCase()).filter(Boolean);
      if (normTokens.length > 0) {
        const withSeries = uniqueUrls.filter(u => normTokens.some(t => u.toLowerCase().includes(t)));
        const withoutSeries = uniqueUrls.filter(u => !normTokens.some(t => u.toLowerCase().includes(t)));
        prioritized = [...withSeries, ...withoutSeries];
      }
    }

    for (const url of prioritized) {
      if (seen.has(url)) continue;
      seen.add(url);
      const isValid = await validateImageUrl(url);
      if (isValid) validUrls.push(url);
      if (validUrls.length >= 20) break;
    }

    if (validUrls.length > 0) {
      return {
        success: true,
        imageUrl: validUrls[0],
        imageOptions: validUrls
      };
    }

    // Fallback patterns
    const fallbackPatterns = [
      `HGHGUC-${modelName.replace(/\s+/g, '').toUpperCase()}`,
      `RG${modelName.replace(/\s+/g, '').toUpperCase()}`,
      `MG${modelName.replace(/\s+/g, '').toUpperCase()}`
    ];

    for (const pattern of fallbackPatterns) {
      const fallbackUrl = `https://cdn.gunpladb.net/${pattern}.jpg`;
      const isValid = await validateImageUrl(fallbackUrl);
      if (isValid) {
        return { success: true, imageUrl: fallbackUrl };
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