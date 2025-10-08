-- Supabase schema: create `models` table for per-user Gunpla models
-- Run this in the Supabase SQL editor (SQL -> New query) for your project.

BEGIN;

-- Create table
CREATE TABLE IF NOT EXISTS public.models (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  grade text,
  series text,
  scale text,
  release_date text,
  price numeric,
  build_status text,
  rating int,
  notes text,
  image_url text,
  purchase_date text,
  completion_date text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;

-- Policy: allow authenticated users to operate only on their own rows
CREATE POLICY "Allow users to manage their own models" ON public.models
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function: set updated_at on update
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to update updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.models
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMIT;
