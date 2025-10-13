import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { GundamModel } from '@/types/gundam';
import { GundamForm } from '@/components/GundamForm';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: Omit<GundamModel, 'id' | 'createdAt' | 'updatedAt'>) => void;
};

export function BuyDialog({ open, onOpenChange, onAdd }: Props) {
  // Provide a default model that sets buildStatus to 'toBuy' so the form starts in wishlist mode
  const defaultModel = React.useMemo(() => ({
    id: 'temp',
    name: '',
    grade: 'High Grade (HG)',
    series: '',
    buildStatus: 'toBuy',
    createdAt: '',
    updatedAt: '',
  } as unknown as GundamModel), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to Buy list</DialogTitle>
        </DialogHeader>

        <GundamForm
          model={defaultModel}
          onSubmit={(data) => { onAdd(data); onOpenChange(false); }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export default BuyDialog;
