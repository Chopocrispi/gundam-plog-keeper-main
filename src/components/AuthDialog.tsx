import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import useAuth from '@/hooks/use-auth';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export default function AuthDialog({ open, onOpenChange }: Props) {
  const { signIn } = useAuth();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign in</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Button onClick={() => signIn('google')} className="w-full">Continue with Google</Button>
          <Button onClick={() => signIn('discord')} variant="secondary" className="w-full">Continue with Discord</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
