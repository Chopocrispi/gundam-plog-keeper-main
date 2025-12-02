import { createClient } from '@supabase/supabase-js';

// Support both VITE_SUPABASE_* and VITE_PUBLIC_SUPABASE_* naming conventions
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string)
  || (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string)
  || '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)
  || (import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string)
  || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase client requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_PUBLIC_SUPABASE_URL/_ANON_KEY) to be set in your .env.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

export default supabase;
