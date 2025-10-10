import React from 'react';
import { Button } from '@/components/ui/button';
import useAuth from '@/hooks/use-auth';

export default function DiscordLoginButton() {
  const { signedIn, signIn } = useAuth();
  if (signedIn) return null;
  return (
    <Button size="sm" onClick={() => signIn('discord')} aria-label="Sign in with Discord">
      Sign in with Discord
    </Button>
  );
}
