Supabase setup
---------------

This project can optionally use Supabase for authentication and per-user model storage.

1. Create a Supabase project at https://app.supabase.com
2. In the project settings, get the Project URL and anon public key. Add them to your .env as:

VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

3. Create a table named `models` with the following columns (SQL):

CREATE TABLE public.models (
	id text PRIMARY KEY,
	user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
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
	created_at timestamptz,
	updated_at timestamptz
);

4. In Supabase -> Authentication -> Settings, enable Google provider and configure the OAuth client.

5. Run the app and sign in. The client will migrate local models to Supabase on first sign-in.

Database migration (create `models` table)
-----------------------------------------

I included a SQL migration file at `supabase/create_models_table.sql` that:
- creates the `models` table
- enables Row Level Security (RLS)
- adds a policy so users may only access their own rows
- creates a trigger to update `updated_at`

To apply it:
1. Open your Supabase project → SQL → New query
2. Paste the contents of `supabase/create_models_table.sql` (or upload the file)
3. Run the query. You should see a success message.

Verify:
- In Supabase GUI, go to Table Editor → public → models and confirm columns exist.
- In Authentication → Policies, confirm the policy "Allow users to manage their own models" is present.

If you prefer I can run a minimal test query using the anon key (you can paste the response here) to confirm the table exists.


