import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Loader2, Search } from 'lucide-react';
import { fetchGundamImages, searchGunplaImagesByKeywords } from '@/utils/gunpladb';
import type { GundamGrade } from '@/types/gundam';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: { name: string; grade: GundamGrade; series?: string; imageUrl?: string }) => void;
};

export function BuyDialog({ open, onOpenChange, onAdd }: Props) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<GundamGrade>('High Grade (HG)');
  const [series, setSeries] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const latestRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setName('');
      setSeries('');
      setImages([]);
      setSelected(undefined);
      setGrade('High Grade (HG)');
    }
  }, [open]);

  const canAdd = name.trim().length > 0;

  const handleManualImageSearch = useCallback(async () => {
    const modelName = name.trim();
    if (!modelName) return;
    const mySearchId = ++latestRef.current;
    setIsSearching(true);
    try {
      // Primary: structured image fetch (grade-aware)
      const result = await fetchGundamImages(modelName, grade);
      if (mySearchId !== latestRef.current) return; // stale
      if (result.success && result.imageOptions && result.imageOptions.length > 0) {
        setImages(result.imageOptions);
        if (mySearchId === latestRef.current) setIsSearching(false);
        return;
      }

      // Fallback: keyword search similar to Add form
      const stop = new Set([
        'hg','rg','mg','pg','fm','sd','ms','eg','fg','hirm','mgsd','lm','hy2m',
        'high','real','master','perfect','full','mechanics','mega','size','super','deformed','grade',
        'gundam','mobile','suit'
      ]);
      const rawTokens = modelName
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ');
      const keywords = rawTokens.filter(w => w.length > 1 && !stop.has(w));

      const urls = await searchGunplaImagesByKeywords(keywords, grade);
      if (mySearchId !== latestRef.current) return; // stale
      setImages(urls);
      if (mySearchId === latestRef.current) setIsSearching(false);
    } catch (e) {
      // fail silently; mirror Add form behavior
      if (mySearchId === latestRef.current) {
        setImages([]);
        setIsSearching(false);
      }
    }
  }, [name, grade]);

  // Debounced auto-search on name/grade change (match Add form behavior)
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const handle = setTimeout(() => {
      void handleManualImageSearch();
    }, 600);
    return () => clearTimeout(handle);
  }, [name, grade, handleManualImageSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add to Buy list</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="block text-sm mb-1">Kit name</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. RX-78-2 Gundam Ver. 3.0"
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm mb-1">Grade</label>
              <Select value={grade} onValueChange={(v) => setGrade(v as GundamGrade)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High Grade (HG)">High Grade (HG)</SelectItem>
                  <SelectItem value="Real Grade (RG)">Real Grade (RG)</SelectItem>
                  <SelectItem value="Master Grade (MG)">Master Grade (MG)</SelectItem>
                  <SelectItem value="Perfect Grade (PG)">Perfect Grade (PG)</SelectItem>
                  <SelectItem value="Super Deformed (SD)">Super Deformed (SD)</SelectItem>
                  <SelectItem value="Full Mechanics (FM)">Full Mechanics (FM)</SelectItem>
                  <SelectItem value="Entry Grade (EG)">Entry Grade (EG)</SelectItem>
                  <SelectItem value="First Grade (FG)">First Grade (FG)</SelectItem>
                  <SelectItem value="High Resolution Model (HiRM)">High Resolution Model (HiRM)</SelectItem>
                  <SelectItem value="MGSD (MGSD)">MGSD (MGSD)</SelectItem>
                  <SelectItem value="Limited Model (LM)">Limited Model (LM)</SelectItem>
                  <SelectItem value="HY2M (HY2M)">HY2M (HY2M)</SelectItem>
                  <SelectItem value="Mega Size (MS)">Mega Size (MS)</SelectItem>
                  <SelectItem value="No Grade">No Grade</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Button onClick={() => void handleManualImageSearch()} disabled={!name.trim() || isSearching} className="w-full">
                {isSearching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Search image
              </Button>
            </div>
          </div>

          {images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {images.map((url) => (
                <button
                  key={url}
                  className={`relative rounded-md overflow-hidden border ${selected === url ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelected(url)}
                >
                  <img src={url} alt="option" className="w-full h-auto" />
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={!canAdd}
              onClick={() => {
                if (!canAdd) return;
                onAdd({ name: name.trim(), grade, series: series || undefined, imageUrl: selected });
                onOpenChange(false);
              }}
            >
              Add to Buy list
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default BuyDialog;
