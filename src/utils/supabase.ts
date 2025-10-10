// Lightweight Supabase client singleton for browser-side queries
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  const anon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) {
    throw new Error('Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  client = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { 'x-client-info': 'gundam-plog-keeper' } },
  });
  return client;
}

export type GunplaModelRow = {
  id: number;
  url: string;
  name: string;
  grade: string;
  created_at?: string;
};
