import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type ImageOption = string | { url: string; name?: string; grade?: string };
interface ImageSelectorProps {
  imageOptions: ImageOption[];
  selectedImage: string;
  onImageSelect: (imageUrl: string, meta?: { name?: string; grade?: string }) => void;
  onClose: () => void;
}

export function ImageSelector({ imageOptions, selectedImage, onImageSelect, onClose }: ImageSelectorProps) {
  const [previewErrors, setPreviewErrors] = useState<Set<string>>(new Set());

  const handleImageError = (url: string) => {
    setPreviewErrors(prev => new Set([...prev, url]));
  };

  const handleImageSelect = (opt: ImageOption) => {
    const url = typeof opt === 'string' ? opt : opt.url;
    const meta = typeof opt === 'string' ? undefined : { name: opt.name, grade: opt.grade };
    onImageSelect(url, meta);
  };

  const validImages = imageOptions.filter(opt => !previewErrors.has(typeof opt === 'string' ? opt : opt.url));

  if (validImages.length === 0) {
    return null;
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Select Image</h3>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
          
          <div className="max-h-64 overflow-auto p-2">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {validImages.map((opt, index) => {
              const url = typeof opt === 'string' ? opt : opt.url;
              const displayName = typeof opt === 'string' ? undefined : opt.name;
              return (
              <div
                key={url}
                className={cn(
                  "relative group cursor-pointer rounded-lg border-2 transition-all hover:border-primary",
                  selectedImage === url ? "border-primary ring-2 ring-primary/20" : "border-border"
                )}
                onClick={() => handleImageSelect(opt)}
              >
                <div className="aspect-square overflow-hidden rounded-md">
                  <img
                    src={url}
                    alt={`Option ${index + 1}`}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    onError={() => handleImageError(url)}
                  />
                </div>
                
                {selectedImage === url && (
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                    <Check className="h-4 w-4" />
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-md" />
                {displayName && (
                  <div className="mt-1 text-[11px] text-center text-muted-foreground line-clamp-2 px-1">{displayName}</div>
                )}
              </div>
            );})}
            </div>
          </div>
          
          {validImages.length > 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Found {validImages.length} image{validImages.length > 1 ? 's' : ''} - click to select
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}