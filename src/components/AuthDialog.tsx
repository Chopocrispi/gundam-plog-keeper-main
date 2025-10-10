import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import useAuth from '@/hooks/use-auth';
import { Input } from '@/components/ui/input';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export default function AuthDialog({ open, onOpenChange }: Props) {
  const { signIn, signInWithEmail } = useAuth();
  const [email, setEmail] = React.useState('');
  const [sending, setSending] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign in</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <div className="grid gap-2 mb-2">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <Button
              disabled={!email || sending}
              onClick={async () => {
                try {
                  setSending(true);
                  await signInWithEmail(email);
                  onOpenChange(false);
                } finally {
                  setSending(false);
                }
              }}
              className="w-full"
            >
              {sending ? 'Sending…' : 'Continue with Email'}
            </Button>
          </div>
          <Button onClick={() => signIn('google')} className="w-full">Continue with Google</Button>
          <Button onClick={() => signIn('discord')} variant="secondary" className="w-full">Continue with Discord</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
