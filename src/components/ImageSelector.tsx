import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageSelectorProps {
  imageOptions: string[];
  selectedImage: string;
  onImageSelect: (imageUrl: string) => void;
  onClose: () => void;
}

export function ImageSelector({ imageOptions, selectedImage, onImageSelect, onClose }: ImageSelectorProps) {
  const [previewErrors, setPreviewErrors] = useState<Set<string>>(new Set());

  const handleImageError = (url: string) => {
    setPreviewErrors(prev => new Set([...prev, url]));
  };

  const handleImageSelect = (url: string) => {
    onImageSelect(url);
  };

  const validImages = imageOptions.filter(url => !previewErrors.has(url));

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
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {validImages.map((imageUrl, index) => (
              <div
                key={imageUrl}
                className={cn(
                  "relative group cursor-pointer rounded-lg border-2 transition-all hover:border-primary",
                  selectedImage === imageUrl ? "border-primary ring-2 ring-primary/20" : "border-border"
                )}
                onClick={() => handleImageSelect(imageUrl)}
              >
                <div className="aspect-square overflow-hidden rounded-md">
                  <img
                    src={imageUrl}
                    alt={`Option ${index + 1}`}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    onError={() => handleImageError(imageUrl)}
                  />
                </div>
                
                {selectedImage === imageUrl && (
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                    <Check className="h-4 w-4" />
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-md" />
              </div>
            ))}
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