import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { ShoppingCart, Plus } from 'lucide-react';
import type { GundamModel, GundamGrade } from '@/types/gundam';
import { supabaseAvailable, getSupabase } from '@/utils/supabase';

type RecItem = {
  name: string;
  grade: string; // code like 'HG', 'MGSD'
  url: string;   // image url (relative or absolute)
};

type Props = {
  owned: GundamModel[];
  onWishlist: (item: { name: string; grade: GundamGrade; imageUrl?: string }) => void;
  onAdd: (item: { name: string; grade: GundamGrade; imageUrl?: string }) => void;
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

export function RecommendedCarousel({ owned, onWishlist, onAdd }: Props) {
  const [items, setItems] = React.useState<RecItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
        const candidates = (data || []).filter(r => {
          const label = gradeLabelFromCode(r.grade);
          const key = `${(r.name || '').toLowerCase()}|${label.toLowerCase()}`;
          return !ownedKey.has(key);
        }) as Array<{ name: string; grade: string; url: string }>;
        // Shuffle and take first 16
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        const picked = candidates.slice(0, 16).map(r => ({ name: r.name, grade: r.grade, url: ensureCdn(r.url) }));
        if (!cancelled) setItems(picked);
      } catch (e) {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [owned]);

  if (loading || items.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">Recommended for you</h3>
      </div>
      <Carousel className="w-full">
        <CarouselContent>
          {items.map((it, idx) => (
            <CarouselItem key={`${it.name}-${idx}`} className="basis-3/5 sm:basis-1/3 md:basis-1/4 lg:basis-1/6 xl:basis-[12.5%] 2xl:basis-[10%]">
              <Card className="group overflow-hidden bg-gradient-to-br from-card to-card/80 flex flex-col h-full">
                <CardHeader className="p-0">
                  <div className="relative overflow-hidden rounded-t-xl bg-card">
                    {it.url ? (
                      <img src={it.url} alt={it.name} className="block w-full h-auto align-middle" onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }} />
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
                <CardContent className="p-3 space-y-2 flex-1">
                  <div>
                    <h4 className="font-semibold text-sm leading-tight line-clamp-2 text-foreground group-hover:text-primary transition-colors">
                      {it.name}
                    </h4>
                    <div className="flex items-center justify-between mt-1">
                      <Badge variant="outline" className="text-[10px]">
                        {gradeLabelFromCode(it.grade)}
                      </Badge>
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
                      <ShoppingCart className="h-3.5 w-3.5 mr-0" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-w-0 h-9 px-2 whitespace-nowrap justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                      title="Add to collection"
                      aria-label="Add to collection"
                      onClick={() => onAdd({ name: it.name, grade: gradeLabelFromCode(it.grade), imageUrl: it.url })}
                    >
                      <Plus className="h-3.5 w-3.5 mr-0" />
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
