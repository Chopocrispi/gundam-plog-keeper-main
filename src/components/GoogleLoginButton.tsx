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
    <div className="flex items-center gap-2 w-full min-w-0 flex-nowrap overflow-hidden">
      {user?.picture && <img src={user.picture} className="h-6 w-6 rounded-full" alt={user?.name} />}
      <div
        className="text-sm truncate flex-1 min-w-0 overflow-hidden"
        title={(user?.name || user?.email) ?? undefined}
      >
        {user?.name || user?.email}
      </div>
      <Button className="shrink-0" variant="outline" size="sm" onClick={() => signOut()}>
        Sign out
      </Button>
    </div>
  );
}

export default GoogleLoginButton;
