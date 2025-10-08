import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { GundamModel, GundamGrade, BuildStatus } from '@/types/gundam';
import { fetchGundamImages, searchGunplaImagesByKeywords } from '@/utils/gunpladb';
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

type Props = {
  model?: GundamModel | null;
  onSubmit: (data: Omit<GundamModel, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
};

export const GundamForm = ({ model, onSubmit, onCancel }: Props) => {
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
  const [imageOptions, setImageOptions] = useState<string[]>([]);
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

  const handleManualImageSearch = useCallback(async () => {
    const mySearchId = ++latestSearchRef.current;
    if (!formData.name.trim()) {
      // silently ignore if name is empty
      return;
    }

    setIsSearchingImage(true);
    try {
    // Try the existing fetch-based guesser first (do not include series)
    const result = await fetchGundamImages(formData.name, formData.grade as GundamGrade);
      if (mySearchId !== latestSearchRef.current) return; // stale
      if (result.success && result.imageUrl) {
        setFormData(prev => ({ ...prev, imageUrl: result.imageUrl! }));
        if (result.imageOptions && result.imageOptions.length > 1) {
          setImageOptions(result.imageOptions);
          setShowImageSelector(true);
          // no toast
        } else {
          // no toast
        }
        return;
      }

      // Fallback: search the local filename list by keywords
      const keywords = formData.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(w => w.length > 1);

    const urls = searchGunplaImagesByKeywords(keywords, formData.grade);
      if (mySearchId !== latestSearchRef.current) return; // stale
      if (urls.length > 0) {
        setFormData(prev => ({ ...prev, imageUrl: urls[0] }));
        if (urls.length > 1) {
          setImageOptions(urls);
          setShowImageSelector(true);
          // no toast
        } else {
          // no toast
        }
      } else {
        // no toast on not found
      }
    } catch (error) {
      // no toast on error; fail silently
      console.error('Manual image search error:', error);
    }
    // Only clear searching state if this is still the latest search
    if (mySearchId === latestSearchRef.current) setIsSearchingImage(false);
  }, [formData, toast]);

  // Debounce: trigger image search when name or grade change, but only once after 600ms
  useEffect(() => {
    const name = formData.name.trim();
    if (!name) return;
    const handle = setTimeout(() => {
      void handleManualImageSearch();
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <SelectItem value="Super Deformed (SD)">Super Deformed (SD)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

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
          </SelectContent>
        </Select>
      </div>

      <div>
  <Label>{t('form.notes')}</Label>
        <Textarea value={formData.notes} onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))} />
      </div>

      <div>
  <Label>{t('form.image')}</Label>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => setShowImageSelector(prev => !prev)}>
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
              onImageSelect={url => setFormData(prev => ({ ...prev, imageUrl: url }))}
              onClose={() => { setShowImageSelector(false); setImageOptions([]); }}
            />
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