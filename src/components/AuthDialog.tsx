import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import useAuth from '@/hooks/use-auth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export default function AuthDialog({ open, onOpenChange }: Props) {
  const { signIn, signInWithEmailPassword, signUpWithEmailPassword } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Welcome</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="sign-in" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sign-in">Sign in</TabsTrigger>
            <TabsTrigger value="sign-up">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="sign-in" className="mt-4">
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <Button
                disabled={!email || !password || busy}
                onClick={async () => {
                  setBusy(true);
                  try { await signInWithEmailPassword(email, password); onOpenChange(false); } finally { setBusy(false); }
                }}
                className="w-full"
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
              <div className="h-px bg-border my-1" />
              <Button onClick={() => signIn('google')} className="w-full">Continue with Google</Button>
              <Button onClick={() => signIn('discord')} variant="secondary" className="w-full">Continue with Discord</Button>
            </div>
          </TabsContent>

          <TabsContent value="sign-up" className="mt-4">
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="name">Name (optional)</Label>
                <Input id="name" type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email2">Email</Label>
                <Input id="email2" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password2">Password</Label>
                <Input id="password2" type="password" placeholder="Create a password" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <Button
                disabled={!email || !password || busy}
                onClick={async () => {
                  setBusy(true);
                  try { await signUpWithEmailPassword({ email, password, name }); onOpenChange(false); } finally { setBusy(false); }
                }}
                className="w-full"
              >
                {busy ? 'Creating…' : 'Create account'}
              </Button>
              <div className="h-px bg-border my-1" />
              <Button onClick={() => signIn('google')} className="w-full">Sign up with Google</Button>
              <Button onClick={() => signIn('discord')} variant="secondary" className="w-full">Sign up with Discord</Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
