import { useEffect, useState } from 'react';
import type { GundamGrade, Offer } from '@/types/gundam';
import { findOffersForModel, loadOffersIndex } from '@/utils/offers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ShoppingCart } from 'lucide-react';

interface OffersPanelProps {
  name: string;
  grade?: GundamGrade;
  imageUrl?: string;
}

export function OffersPanel({ name, grade, imageUrl }: OffersPanelProps) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [hideDecals, setHideDecals] = useState(true);

  useEffect(() => {
    // Warm the offers index so we can see the network request even before typing
    (async () => {
      try {
        const idx = await loadOffersIndex();
        // eslint-disable-next-line no-console
        console.log('[OffersPanel] index warmed; keys:', Object.keys(idx).length);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!name.trim()) {
      setOffers(null);
      return;
    }
  // eslint-disable-next-line no-console
    console.log('[OffersPanel] lookup for name/grade', { name, grade, imageUrl });
    setLoading(true);
    (async () => {
      const res = await findOffersForModel(name, grade, { imageUrl });
      if (cancelled) return;
      setOffers(res);
      // eslint-disable-next-line no-console
      console.log('[OffersPanel] offers result', { count: res.length, sample: res[0] });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [name, grade, imageUrl]);

  return (
    <Card className="mt-2">
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          Store prices
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/** Controls */}
        <div className="flex items-center gap-3 mb-2 text-xs">
          <label className="inline-flex items-center gap-2 select-none cursor-pointer">
            <input
              type="checkbox"
              className="h-3 w-3"
              checked={hideDecals}
              onChange={(e) => setHideDecals(e.target.checked)}
            />
            Hide decals
          </label>
        </div>
        {loading && <div className="text-sm text-muted-foreground">Looking up sample offers…</div>}
        {/** Apply filter before rendering and for empty-state */}
        {(() => {
          const filtered = (offers || []).filter(o => !hideDecals || !/decal/i.test(o.title));
          if (loading) return null;
          if (!offers || filtered.length === 0) {
            return (
          <div className="text-sm text-muted-foreground">
            No offers found. Try a common name and grade, e.g. "Gundam Aerial" with grade "High Grade (HG)" for the sample data.
          </div>
            );
          }
          return (
          <ul className="divide-y divide-border">
            {filtered.map((o, idx) => (
              <li key={idx} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm whitespace-normal break-words leading-snug">{o.title}</div>
                  <div className="text-xs text-muted-foreground whitespace-normal break-words">
                    {o.store} · <a href={o.url} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">Open <ExternalLink className="h-3 w-3" /></a>
                  </div>
                </div>
                <div className="flex items-start gap-2 shrink-0">
                  {o.availability && (
                    <Badge variant="outline" className="text-xs">
                      {o.availability === 'in_stock' ? 'In stock' : o.availability === 'out_of_stock' ? 'OOS' : 'Unknown'}
                    </Badge>
                  )}
                  <div className="font-semibold text-sm whitespace-nowrap">
                    {o.currency} {o.price.toFixed(2)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          );
        })()}
      </CardContent>
    </Card>
  );
}

export default OffersPanel;
