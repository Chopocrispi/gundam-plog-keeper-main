import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { GundamModel, GundamGrade, BuildStatus } from '@/types/gundam';
import { fetchGundamImages, searchGunplaImagesByKeywords } from '@/utils/gunpladb';
import { supabaseAvailable } from '@/utils/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Star, Search, Loader2, Grid } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ImageSelector } from '@/components/ImageSelector';
// OffersPanel was moved to a separate dialog; no longer used here

type Props = {
  model?: GundamModel | null;
  onSubmit: (data: Omit<GundamModel, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
  /** When true, hides the Build Status selector (useful for Buy flow). */
  hideBuildStatus?: boolean;
};

export const GundamForm = ({ model, onSubmit, onCancel, hideBuildStatus = false }: Props) => {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [formData, setFormData] = useState(() => ({
    name: model?.name || '',
    series: model?.series || '',
    grade: (model?.grade as GundamGrade) || 'High Grade (HG)',
    buildStatus: (model?.buildStatus as BuildStatus) || 'Unbuilt',
    imageUrl: model?.imageUrl || '',
    notes: model?.notes || '',
  }));

  const [isSearchingImage, setIsSearchingImage] = useState(false);
  const [imageOptions, setImageOptions] = useState<Array<string | { url: string; name?: string; grade?: string }>>([]);
  const [showImageSelector, setShowImageSelector] = useState(false);
  const latestSearchRef = useRef(0);
  // series is now free-text; user types it manually

  useEffect(() => {
    if (model) {
      setFormData({
        name: model.name || '',
        series: model.series || '',
        grade: (model.grade as GundamGrade) || 'High Grade (HG)',
        buildStatus: (model.buildStatus as BuildStatus) || 'Unbuilt',
        imageUrl: model.imageUrl || '',
        notes: model.notes || '',
      });
    }
  }, [model]);

  // ...existing code...

  const handleManualImageSearch = useCallback(async (opts?: { autoOpen?: boolean }) => {
    const mySearchId = ++latestSearchRef.current;
    if (!formData.name.trim()) {
      // silently ignore if name is empty
      return;
    }

    // If Supabase isn't configured in the environment, skip the search and inform the user.
    if (!supabaseAvailable()) {
      toast({ title: 'Image search disabled', description: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable model image search.', variant: 'default' });
      return;
    }

    setIsSearchingImage(true);
    try {
    // Try the existing fetch-based guesser first (do not include series)
    const result = await fetchGundamImages(formData.name, formData.grade as GundamGrade);
      if (mySearchId !== latestSearchRef.current) return; // stale
      if (result.success && result.imageOptions && result.imageOptions.length > 0) {
        // Populate options; optionally auto-open grid on background lookups
        setImageOptions(result.imageOptions);
        if (opts?.autoOpen) {
          setShowImageSelector(true);
        }
        if (mySearchId === latestSearchRef.current) setIsSearchingImage(false);
        return;
      }

      // Fallback: search the local filename list by keywords
      // Remove grade and generic tokens so we don't over-constrain the match
      const stop = new Set([
        'hg','rg','mg','pg','fm','sd','ms','eg','fg','hirm','mgsd','lm','hy2m',
        'high','real','master','perfect','full','mechanics','mega','size','super','deformed','grade',
        'gundam','mobile','suit'
      ]);
      const rawTokens = formData.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ');
      const keywords = rawTokens.filter(w => w.length > 1 && !stop.has(w));

  const metas = await searchGunplaImagesByKeywords(keywords, formData.grade);
      if (mySearchId !== latestSearchRef.current) return; // stale
      if (metas.length > 0) {
        // Populate options; optionally auto-open grid on background lookups
        setImageOptions(metas);
        if (opts?.autoOpen) {
          setShowImageSelector(true);
        }
      } else {
        // no toast on not found
      }
      if (mySearchId === latestSearchRef.current) setIsSearchingImage(false);
    } catch (error) {
      // no toast on error; fail silently
      console.error('Manual image search error:', error);
      if (mySearchId === latestSearchRef.current) setIsSearchingImage(false);
    }
    // Only clear searching state if this is still the latest search (fallback safety)
    if (mySearchId === latestSearchRef.current) setIsSearchingImage(false);
  }, [formData, toast]);

  // Debounce: trigger image search when name or grade change, but only once after 600ms
  useEffect(() => {
    const name = formData.name.trim();
    if (!name) return;
    const handle = setTimeout(() => {
      void handleManualImageSearch({ autoOpen: true });
    }, 600);
    return () => clearTimeout(handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.name, formData.grade]);

  // Note: series no longer triggers image search; image lookups are based on model name (and grade).

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formData.name.trim()) {
      toast({ title: 'Validation', description: 'Model name is required.', variant: 'destructive' });
      return;
    }

    onSubmit({
      name: formData.name,
      series: formData.series,
      grade: formData.grade as GundamGrade,
      buildStatus: formData.buildStatus as BuildStatus,
      imageUrl: formData.imageUrl,
      notes: formData.notes,
    });
  };

  return (
  <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <Label>{t('form.name')}</Label>
          <Input value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} />
        </div>
        <div>
            <Label>{t('form.series')}</Label>
            <Input value={formData.series} onChange={e => setFormData(prev => ({ ...prev, series: e.target.value }))} placeholder="Type series (e.g. UC, SEED, IBO)" />
        </div>
        <div>
          <Label>{t('form.grade')}</Label>
          <Select value={formData.grade} onValueChange={v => setFormData(prev => ({ ...prev, grade: v as GundamGrade }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="High Grade (HG)">High Grade (HG)</SelectItem>
              <SelectItem value="Real Grade (RG)">Real Grade (RG)</SelectItem>
              <SelectItem value="Master Grade (MG)">Master Grade (MG)</SelectItem>
              <SelectItem value="Perfect Grade (PG)">Perfect Grade (PG)</SelectItem>
              <SelectItem value="Full Mechanics (FM)">Full Mechanics (FM)</SelectItem>
              <SelectItem value="Mega Size (MS)">Mega Size (MS)</SelectItem>
              <SelectItem value="Super Deformed (SD)">Super Deformed (SD)</SelectItem>
              <SelectItem value="Entry Grade (EG)">Entry Grade (EG)</SelectItem>
              <SelectItem value="First Grade (FG)">First Grade (FG)</SelectItem>
              <SelectItem value="High Resolution Model (HiRM)">High Resolution Model (HiRM)</SelectItem>
              <SelectItem value="MGSD (MGSD)">MGSD (MGSD)</SelectItem>
              <SelectItem value="Limited Model (LM)">Limited Model (LM)</SelectItem>
              <SelectItem value="HY2M (HY2M)">HY2M (HY2M)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {!hideBuildStatus && (
        <div>
          <Label>{t('form.buildStatus')}</Label>
          <Select value={formData.buildStatus} onValueChange={v => setFormData(prev => ({ ...prev, buildStatus: v as BuildStatus }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Unbuilt">Unbuilt</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Built">Built</SelectItem>
              <SelectItem value="Painted">Painted</SelectItem>
              <SelectItem value="Customized">Customized</SelectItem>
              <SelectItem value="toBuy">Wishlist</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
  <Label>{t('form.notes')}</Label>
        <Textarea value={formData.notes} onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))} />
      </div>

  {/* Offers moved out of the edit form into its own dialog triggered from the card */}

      <div>
  <Label>{t('form.image')}</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            className="h-9 w-9 sm:h-10 sm:w-10"
            onClick={async () => {
              // If we don't have options yet and have a name, search first
              if (!isSearchingImage && imageOptions.length === 0 && formData.name.trim()) {
                await handleManualImageSearch({ autoOpen: false });
              }
              setShowImageSelector(true);
            }}
          >
            <Grid />
          </Button>
          {formData.imageUrl && (
            <img src={formData.imageUrl} alt="selected" className="h-12 w-12 object-cover rounded" />
          )}
          {isSearchingImage && <Loader2 className="animate-spin" />}
        </div>
        {imageOptions.length > 0 && showImageSelector && (
          <div className="mt-2">
            <ImageSelector
              imageOptions={imageOptions}
              selectedImage={formData.imageUrl}
              onImageSelect={(url, meta) => {
                setFormData(prev => ({
                  ...prev,
                  imageUrl: url,
                  name: meta?.name ? meta.name : prev.name,
                }));
              }}
              onClose={() => { setShowImageSelector(false); setImageOptions([]); }}
            />
          </div>
        )}
        {showImageSelector && imageOptions.length === 0 && !isSearchingImage && (
          <div className="mt-2">
            <div className="w-full max-w-4xl mx-auto p-4 rounded bg-slate-800 text-sm text-muted-foreground">
              {supabaseAvailable()
                ? 'No images found for that model. Try refining the name or changing the grade.'
                : 'Image search is disabled — Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable.'}
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => { setShowImageSelector(false); setImageOptions([]); }}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
  <Button variant="outline" type="button" onClick={onCancel}>{t('form.cancel')}</Button>
  <Button type="submit">{t('form.save')}</Button>
      </div>
    </form>
  );
};

export default GundamForm;