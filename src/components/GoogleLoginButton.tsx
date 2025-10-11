import React from 'react';
import { Button } from '@/components/ui/button';
import useAuth from '@/hooks/use-auth';

export function GoogleLoginButton() {
  const { user, signedIn, signIn, signOut } = useAuth();

  if (!signedIn) {
    return (
      <Button size="sm" onClick={() => signIn()}>Sign in with Google</Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 max-w-full">
      {user?.picture && <img src={user.picture} className="h-6 w-6 rounded-full" alt={user?.name} />}
      <div className="text-sm whitespace-normal break-words leading-tight max-w-[52vw] sm:max-w-none">
        {user?.name || user?.email}
      </div>
      <Button className="shrink-0" variant="outline" size="sm" onClick={() => signOut()}>
        Sign out
      </Button>
    </div>
  );
}

export default GoogleLoginButton;
