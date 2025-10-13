import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { ShoppingCart, Plus, RefreshCw } from 'lucide-react';
import type { GundamModel, GundamGrade } from '@/types/gundam';
import { supabaseAvailable, getSupabase } from '@/utils/supabase';
import { findStaticOffersForModel, offersCacheKey } from '@/utils/offers';

type RecItem = {
  name: string;
  grade: string; // code like 'HG', 'MGSD'
  url: string;   // image url (relative or absolute)
};

type Props = {
  owned: GundamModel[];
  onWishlist: (item: { name: string; grade: GundamGrade; imageUrl?: string }) => void;
  onAdd: (item: { name: string; grade: GundamGrade; imageUrl?: string }) => void;
  filterGrade?: string;
};

const CDN_BASE = 'https://cdn.gunpladb.net/';
function ensureCdn(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return CDN_BASE + url.replace(/^\/+/, '');
}

function gradeLabelFromCode(code: string): GundamGrade {
  const u = (code || '').toUpperCase();
  switch (u) {
    case 'HG': return 'High Grade (HG)';
    case 'RG': return 'Real Grade (RG)';
    case 'MG': return 'Master Grade (MG)';
    case 'PG': return 'Perfect Grade (PG)';
    case 'FM': return 'Full Mechanics (FM)';
    case 'MS': return 'Mega Size (MS)';
    case 'SD': return 'Super Deformed (SD)';
    case 'EG': return 'Entry Grade (EG)';
    case 'FG': return 'First Grade (FG)';
    case 'HIRM': return 'High Resolution Model (HiRM)';
    case 'MGSD': return 'MGSD (MGSD)';
    case 'LM': return 'Limited Model (LM)';
    case 'HY2M': return 'HY2M (HY2M)';
    default: return 'High Grade (HG)';
  }
}

function gradeCodeFromLabel(label?: string): string | undefined {
  if (!label) return undefined;
  const u = label.toUpperCase();
  if (u.includes('MGSD')) return 'MGSD';
  if (u.includes('HIRM')) return 'HIRM';
  if (u.includes('(PG)') || u.includes('PERFECT')) return 'PG';
  if (u.includes('(MG)') || u.includes('MASTER')) return 'MG';
  if (u.includes('(RG)') || u.includes('REAL')) return 'RG';
  if (u.includes('(HG)') || u.includes('HIGH')) return 'HG';
  if (u.includes('(FM)') || u.includes('FULL MECHANICS')) return 'FM';
  if (u.includes('(MS)') || u.includes('MEGA SIZE')) return 'MS';
  if (u.includes('(SD)') || u.includes('SUPER DEFORMED')) return 'SD';
  if (u.includes('(EG)') || u.includes('ENTRY')) return 'EG';
  if (u.includes('(FG)') || u.includes('FIRST')) return 'FG';
  if (u.includes('(LM)')) return 'LM';
  if (u.includes('(HY2M)')) return 'HY2M';
  return undefined;
}

export function RecommendedCarousel({ owned, onWishlist, onAdd }: Props) {
  const [items, setItems] = React.useState<RecItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [avgPriceByKey, setAvgPriceByKey] = React.useState<Record<string, number | undefined>>({});

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        if (!supabaseAvailable()) {
          setItems([]);
          setLoading(false);
          return;
        }
        const supabase = getSupabase();
        // Fetch a slice of available models; we'll filter and shuffle client-side
        const { data, error } = await supabase
          .from('gunpla_models')
          .select('name,grade,url')
          .limit(120);
        if (error) {
          console.warn('[recommended] supabase error', error);
          setItems([]);
          setLoading(false);
          return;
        }
        const ownedKey = new Set(owned.map(m => `${(m.name || '').toLowerCase()}|${(m.grade || '').toLowerCase()}`));
        const ownedNames = new Set(owned.map(m => (m.name || '').toLowerCase()));
        const ownedGradeSet = new Set<string>();
        for (const m of owned) {
          const code = gradeCodeFromLabel(m.grade as string);
          if (code) ownedGradeSet.add(code);
        }

        // Build preference weights
        const gradeCounts: Record<string, number> = {};
        for (const m of owned) {
          const code = gradeCodeFromLabel(m.grade as string);
          if (!code) continue;
          gradeCounts[code] = (gradeCounts[code] || 0) + 1;
        }
        const totalGrades = Object.values(gradeCounts).reduce((a, b) => a + b, 0) || 1;
        const gradeWeight: Record<string, number> = {};
        for (const [k, v] of Object.entries(gradeCounts)) gradeWeight[k] = v / totalGrades;

        const candidates = (data || []).filter(r => {
          const label = gradeLabelFromCode(r.grade);
          const key = `${(r.name || '').toLowerCase()}|${label.toLowerCase()}`;
          if (ownedKey.has(key)) return false;
          if (ownedNames.has((r.name || '').toLowerCase())) return false;
          return true;
        }) as Array<{ name: string; grade: string; url: string }>;

        // If the user owns some grades, build a pool accordingly.
        // If one grade dominates the collection, recommend only that dominant grade.
        let pool: Array<{ name: string; grade: string; url: string }> = candidates;
        if (ownedGradeSet.size > 0) {
          let topGradeCode: string | undefined;
          let topCount = 0;
          for (const [code, count] of Object.entries(gradeCounts)) {
            if (count > topCount) { topCount = count; topGradeCode = code; }
          }
          const dominantShare = topCount / (totalGrades || 1);
          if (topGradeCode && dominantShare >= 0.6) {
            pool = candidates.filter(r => (r.grade || '').toUpperCase() === topGradeCode);
          } else {
            pool = candidates.filter(r => ownedGradeSet.has((r.grade || '').toUpperCase()));
          }
          // If the restriction produced no items (e.g., data set lacks that grade), fall back to all candidates
          if (pool.length === 0) {
            pool = candidates;
          }
        }

        const scored = pool.map(r => {
          const code = (r.grade || '').toUpperCase();
          const base = 1;
          const gw = gradeWeight[code] || 0;
          const jitter = Math.random() * 0.2;
          return { r, score: base + gw * 2 + jitter };
        });
        scored.sort((a, b) => b.score - a.score);
        const picked = scored.slice(0, 16).map(({ r }) => ({ name: r.name, grade: r.grade, url: ensureCdn(r.url) }));
        if (!cancelled) setItems(picked);
      } catch (e) {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [owned, refreshNonce]);

  // Compute average prices for current items using static offers index (fast, no live API)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(items.map(async (it) => {
        const grade = gradeLabelFromCode(it.grade);
        const key = offersCacheKey(it.name, grade as GundamGrade, it.url);
        try {
          const offers = await findStaticOffersForModel(it.name, grade as GundamGrade, { imageUrl: it.url });
          const avg = offers && offers.length > 0
            ? Math.round((offers.reduce((a, o) => a + (o.price || 0), 0) / offers.length) * 100) / 100
            : undefined;
          return [key, avg] as const;
        } catch {
          return [key, undefined] as const;
        }
      }));
      if (!cancelled) {
        const next: Record<string, number | undefined> = {};
        for (const [k, v] of entries) next[k] = v;
        setAvgPriceByKey(next);
      }
    })();
    return () => { cancelled = true; };
  }, [items]);
  // Keep showing the last recommendations while a manual refresh is in progress
  if (items.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">Recommended for you</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            title="Refresh recommendations"
            aria-label="Refresh recommendations"
            onClick={() => setRefreshNonce(n => n + 1)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
      <Carousel className="w-full">
        <CarouselContent>
          {items.map((it, idx) => (
            <CarouselItem key={`${it.name}-${idx}`} className="basis-4/5 sm:basis-1/2 md:basis-1/3 lg:basis-1/4">
              <Card className="group overflow-hidden bg-gradient-to-br from-card to-card/80 flex flex-col h-full">
                <CardHeader className="p-0">
                  <div className="relative overflow-hidden rounded-t-xl bg-card">
                    {it.url ? (
                      <img
                        src={it.url}
                        alt={it.name}
                        className="block w-full h-auto align-middle"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.svg'; }}
                      />
                    ) : (
                      <div className="w-full py-8 flex items-center justify-center text-muted-foreground bg-gradient-to-br from-muted/20 to-muted/40">
                        <div className="text-center">
                          <div className="text-4xl mb-2">🤖</div>
                          <div className="text-sm">No Image</div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3 flex-1">
                  <div>
                    <h4 className="font-bold text-base leading-tight line-clamp-2 text-foreground group-hover:text-primary transition-colors">
                      {it.name}
                    </h4>
                    <div className="flex items-center justify-between mt-1">
                      <Badge variant="outline" className="text-xs">
                        {gradeLabelFromCode(it.grade)}
                      </Badge>
                      {(() => {
                        const key = offersCacheKey(it.name, gradeLabelFromCode(it.grade) as GundamGrade, it.url);
                        const avg = avgPriceByKey[key];
                        return (
                          <span className="text-xs text-muted-foreground tabular-nums">{avg != null ? `$${avg.toFixed(2)}` : 'Avg —'}</span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-auto pt-2 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-w-0 h-9 px-2 whitespace-nowrap justify-center hover:bg-accent hover:text-accent-foreground transition-colors"
                      title="Add to Wishlist"
                      aria-label="Add to Wishlist"
                      onClick={() => onWishlist({ name: it.name, grade: gradeLabelFromCode(it.grade), imageUrl: it.url })}
                    >
                      <ShoppingCart className="h-4 w-4 mr-0" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-w-0 h-9 px-2 whitespace-nowrap justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                      title="Add to collection"
                      aria-label="Add to collection"
                      onClick={() => onAdd({ name: it.name, grade: gradeLabelFromCode(it.grade), imageUrl: it.url })}
                    >
                      <Plus className="h-4 w-4 mr-0" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="flex items-center justify-end gap-2 mt-2">
          <CarouselPrevious variant="outline" size="sm" />
          <CarouselNext variant="outline" size="sm" />
        </div>
      </Carousel>
    </div>
  );
}

export default RecommendedCarousel;
