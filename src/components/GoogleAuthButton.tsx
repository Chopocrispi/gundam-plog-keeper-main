import React from 'react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';

export function GoogleAuthButton() {
  const { user, signedIn, signIn, signOut } = useAuth();

  if (!signedIn) {
    return (
      <Button onClick={() => signIn()} size="sm">
        Sign in with Google
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {user?.picture && (
        <Avatar>
          <img src={user.picture} alt={user.name || 'User'} />
        </Avatar>
      )}
      <div className="text-sm">{user?.name || user?.email}</div>
      <Button variant="outline" size="sm" onClick={() => signOut()}>Sign out</Button>
    </div>
  );
}

export default GoogleAuthButton;
