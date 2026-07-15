/*
  # Create users (profile) table

  1. New Tables
    - `users` — one profile row per auth.users account
      - `id` (uuid, primary key, references auth.users)
      - `email` (text)
      - `role` (text, 'business' | 'media_service' | 'admin')
      - profile fields: name, bio, location, website, phone,
        profile_image_url, cover_image_url, skills, experience,
        education, awards, services

  2. Security
    - Enable RLS; users can view/insert/update their own profile

  3. Automation
    - Trigger on auth.users creates the profile row automatically on signup,
      so the client never has to insert it (which would fail under RLS
      before email confirmation).
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  role text DEFAULT 'business',
  name text,
  bio text,
  location text,
  website text,
  phone text,
  profile_image_url text,
  cover_image_url text,
  skills text,
  experience text,
  education text,
  awards text,
  services text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Reconcile with a pre-existing users table created by hand
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text DEFAULT 'business';
ALTER TABLE users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS experience text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS education text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS awards text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS services text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create the profile row when an account is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'business')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profile rows for accounts created before this table existed
INSERT INTO public.users (id, email, role)
SELECT id, email, COALESCE(raw_user_meta_data->>'role', 'business')
FROM auth.users
ON CONFLICT (id) DO NOTHING;
