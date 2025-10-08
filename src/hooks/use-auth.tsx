import React, { createContext, useContext, useEffect, useState } from 'react';
import supabase from '@/lib/supabase';
import { GundamModel } from '@/types/gundam';
import { useToast } from '@/hooks/use-toast';

type User = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

type AuthContextValue = {
  user: User | null;
  signedIn: boolean;
  signIn: () => void;
  signOut: () => void;
};

const STORAGE_KEY = 'gundam:user';
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(payload).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(json);
  } catch (e) {
    console.error('Failed to decode JWT payload', e);
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) as User : null;
    } catch (e) {
      return null;
    }
  });

  // Initialize Supabase auth listener
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const u = session.user;
        setUser({ sub: u.id, email: u.email || undefined, name: u.user_metadata?.full_name || u.user_metadata?.name, picture: u.user_metadata?.avatar_url || u.user_metadata?.picture });
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sub: u.id, email: u.email, name: u.user_metadata?.full_name || u.user_metadata?.name, picture: u.user_metadata?.avatar_url || u.user_metadata?.picture })); } catch (e) {}
        // On first sign in, migrate local models to Supabase
        (async () => {
          try {
            const migratedKey = `gundam:migrated:${u.id}`;
            if (!localStorage.getItem(migratedKey)) {
              const raw = localStorage.getItem('gundam-models');
              if (raw) {
                const parsed: GundamModel[] = JSON.parse(raw);
                // insert into Supabase table 'models' (you must create this table)
                const toInsert = parsed.map(p => ({
                  id: p.id,
                  user_id: u.id,
                  name: p.name,
                  grade: p.grade,
                  series: p.series,
                  scale: p.scale,
                  release_date: p.releaseDate,
                  price: p.price,
                  build_status: p.buildStatus,
                  rating: p.rating,
                  notes: p.notes,
                  image_url: p.imageUrl,
                  purchase_date: p.purchaseDate,
                  completion_date: p.completionDate,
                  created_at: p.createdAt,
                  updated_at: p.updatedAt,
                }));
                const { error } = await supabase.from('models').upsert(toInsert, { onConflict: 'id' });
                if (!error) {
                  localStorage.setItem(migratedKey, '1');
                } else {
                  console.warn('Failed to migrate local models to Supabase', error);
                }
              }
            }
          } catch (e) {
            console.warn('Migration to Supabase failed', e);
          }
        })();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const { toast } = useToast();

  // keep localStorage in sync
  useEffect(() => {
    try {
      if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }, [user]);

  // on mount, try to hydrate user from server session
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/me', { credentials: 'include' });
        if (r.ok) {
          const j = await r.json();
          if (j?.user) {
            setUser({ sub: j.user.id, email: j.user.email, name: j.user.displayName, picture: j.user.avatarUrl });
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(j.user)); } catch (e) {}
          }
        }
      } catch (e) {}
    })();
  }, []);

  const signIn = () => {
    // Use Supabase OAuth for Google sign-in if configured
    const provider = 'google';
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    supabase.auth.signInWithOAuth({ provider, options: { redirectTo } }).then((res) => {
      if (res.error) {
        console.warn('Supabase signInWithOAuth failed', res.error);
        const msg = res.error.message || 'OAuth sign-in failed';
        toast({ title: 'Sign-in failed', description: msg });
      }
    }).catch((err) => {
      console.warn('Supabase signInWithOAuth failed', err);
      toast({ title: 'Sign-in failed', description: err?.message || String(err) });
    });
  };

  const signOut = () => {
    setUser(null);
    supabase.auth.signOut().catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, signedIn: !!user, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default useAuth;
