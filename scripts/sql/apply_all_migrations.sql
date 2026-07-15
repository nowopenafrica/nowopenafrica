-- Combined migration script for the NowOpen Supabase project
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Every statement is idempotent, so re-running is safe.
--
-- AFTER running this, make yourself an admin with:
--   UPDATE users SET role = 'admin' WHERE email = 'nowopen2018@gmail.com';

-- ============ 20240601000000_create_users_table.sql ============
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


-- ============ 20240601000100_create_businesses_table.sql ============
/*
  # Create businesses table

  Columns match what the dashboard BusinessForm reads/writes:
  name, description, category, location, phone, website, email,
  image_url, rating, status, user_id (owner).

  Security: public read; owners manage their own rows.
*/

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL,
  location text,
  phone text,
  website text,
  email text,
  rating numeric DEFAULT 0,
  image_url text,
  status text DEFAULT 'open',
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Reconcile with a pre-existing table missing newer columns
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view businesses" ON businesses;
DROP POLICY IF EXISTS "Public can view businesses" ON businesses;
CREATE POLICY "Public can view businesses" ON businesses
  FOR SELECT USING (true);

-- Cast both sides to text so this works whether user_id is uuid or text
DROP POLICY IF EXISTS "Owners can insert businesses" ON businesses;
CREATE POLICY "Owners can insert businesses" ON businesses
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Owners can update businesses" ON businesses;
CREATE POLICY "Owners can update businesses" ON businesses
  FOR UPDATE TO authenticated USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Owners can delete businesses" ON businesses;
CREATE POLICY "Owners can delete businesses" ON businesses
  FOR DELETE TO authenticated USING (auth.uid()::text = user_id::text);


-- ============ 20240601000200_create_advertisements_table.sql ============
/*
  # Create advertisements table (consolidated)

  This replaces the three conflicting historical definitions
  (advertisements / advert / adverts). Columns cover everything the app
  touches: AdvertForm writes title, description, category, location,
  budget, duration, pricing, dimensions, traffic_density, status,
  image_url, user_id, business_id; public pages also read type,
  price_per_day, available_until and awards.

  Note: user_id and business_id are text (not uuid FKs) because the seed
  placements use placeholder ids like 'user_1' / 'business_1'. Owner RLS
  compares against auth.uid() cast to text, so real accounts still only
  manage their own rows.
*/

CREATE TABLE IF NOT EXISTS advertisements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  type text,
  category text,
  location text,
  price_per_day numeric,
  budget numeric,
  duration integer,
  pricing numeric,
  traffic_density text,
  dimensions text,
  available_until timestamptz,
  awards text,
  status text DEFAULT 'active',
  image_url text,
  user_id text,
  business_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Reconcile with any pre-existing variant of the table
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS price_per_day numeric;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS budget numeric;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS duration integer;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS pricing numeric;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS traffic_density text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS dimensions text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS available_until timestamptz;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS awards text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view advertisements" ON advertisements;
DROP POLICY IF EXISTS "Public can view advertisements" ON advertisements;
CREATE POLICY "Public can view advertisements" ON advertisements
  FOR SELECT USING (true);

-- user_id may be text or uuid depending on which historical schema created
-- the table, so both sides are cast to text.
DROP POLICY IF EXISTS "Authenticated users can insert advertisements" ON advertisements;
DROP POLICY IF EXISTS "Owners can insert advertisements" ON advertisements;
CREATE POLICY "Owners can insert advertisements" ON advertisements
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Authenticated users can update their own advertisements" ON advertisements;
DROP POLICY IF EXISTS "Owners can update advertisements" ON advertisements;
CREATE POLICY "Owners can update advertisements" ON advertisements
  FOR UPDATE TO authenticated USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Authenticated users can delete their own advertisements" ON advertisements;
DROP POLICY IF EXISTS "Owners can delete advertisements" ON advertisements;
CREATE POLICY "Owners can delete advertisements" ON advertisements
  FOR DELETE TO authenticated USING (auth.uid()::text = user_id::text);


-- ============ 20240601000300_create_media_services_table.sql ============
/*
  # Create media_services table

  Columns match what MediaForm writes (title, description, service_type,
  pricing, image_url, portfolio_url, rating, user_id) plus the display
  fields the public pages read (pricing_model, delivery_time,
  clients_served, review_count, thumbnail_url, category, reach, status).

  Security: public read; owners manage their own rows.
*/

CREATE TABLE IF NOT EXISTS media_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  service_type text NOT NULL,
  pricing numeric,
  pricing_model text,
  delivery_time text,
  clients_served integer,
  review_count integer,
  equipment text,
  additional_info text,
  portfolio_url text,
  image_url text,
  thumbnail_url text,
  category text,
  reach integer,
  rating numeric DEFAULT 0,
  status text DEFAULT 'open',
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Reconcile with a pre-existing table missing newer columns
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS pricing_model text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS delivery_time text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS clients_served integer;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS review_count integer;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS equipment text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS additional_info text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS portfolio_url text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS reach integer;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE media_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view media services" ON media_services;
DROP POLICY IF EXISTS "Public can view media services" ON media_services;
CREATE POLICY "Public can view media services" ON media_services
  FOR SELECT USING (true);

-- Cast both sides to text so this works whether user_id is uuid or text
DROP POLICY IF EXISTS "Owners can insert media services" ON media_services;
CREATE POLICY "Owners can insert media services" ON media_services
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Owners can update media services" ON media_services;
CREATE POLICY "Owners can update media services" ON media_services
  FOR UPDATE TO authenticated USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Owners can delete media services" ON media_services;
CREATE POLICY "Owners can delete media services" ON media_services
  FOR DELETE TO authenticated USING (auth.uid()::text = user_id::text);


-- ============ 20240701000000_admin_access.sql ============
/*
  # Admin access

  1. Helper
    - `is_admin()` — SECURITY DEFINER check against users.role, safe to use
      inside RLS policies (bypasses RLS on the users table itself, so it
      cannot recurse).

  2. Policies
    - Admins can read, update, and delete every row in users, businesses,
      advertisements, and media_services (and insert content rows).

  3. Promoting an admin
    - There is intentionally no self-service path to become admin. Run:
        UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
      from the Supabase SQL editor.
*/

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- users ---------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all profiles" ON users;
CREATE POLICY "Admins can view all profiles" ON users
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins can update all profiles" ON users;
CREATE POLICY "Admins can update all profiles" ON users
  FOR UPDATE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete profiles" ON users;
CREATE POLICY "Admins can delete profiles" ON users
  FOR DELETE TO authenticated USING (is_admin());

-- businesses ----------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage businesses" ON businesses;
CREATE POLICY "Admins can manage businesses" ON businesses
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- advertisements ------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage advertisements" ON advertisements;
CREATE POLICY "Admins can manage advertisements" ON advertisements
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- media_services ------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage media services" ON media_services;
CREATE POLICY "Admins can manage media services" ON media_services
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());


-- ============ 20240702000000_seed_media_services.sql ============
/*
  # Seed media_services with realistic creative services

  Inserts a starter catalogue of creative services. Guarded so it only runs
  when the table is empty — it will never overwrite or duplicate real data.
*/

INSERT INTO media_services
  (title, service_type, description, pricing, pricing_model, delivery_time, clients_served, review_count, rating, status)
SELECT * FROM (VALUES
  ('Lens & Light Photography — Product Shoots', 'Photography', 'Studio product photography for e-commerce and catalogues. Includes 20 retouched images, white background and lifestyle setups.', 350::numeric, 'per shoot', '5 days', 140, 62, 4.8::numeric, 'open'),
  ('Kalahari Films — Brand Video Production', 'Videography', 'Full-service brand films and TV commercials: scripting, shooting, colour grading and sound design. 30-90 second final cuts.', 2500, 'per project', '21 days', 85, 41, 4.9, 'open'),
  ('Sable Studio — Logo & Brand Identity', 'Branding', 'Complete identity package: logo suite, colour system, typography, brand guidelines PDF and social media kit.', 800, 'per project', '14 days', 210, 98, 4.7, 'open'),
  ('Ubuntu Digital — Social Media Management', 'Social Media Management', 'Monthly content calendar, 20 designed posts, community management and a performance report across Instagram, X and TikTok.', 450, 'per month', 'ongoing', 96, 54, 4.6, 'open'),
  ('Baobab Motion — 2D Explainer Animation', 'Animation', 'Animated explainer videos with script, storyboard, voice-over and custom illustration. Up to 90 seconds.', 1200, 'per video', '18 days', 58, 33, 4.8, 'open'),
  ('Sahara Sound — Radio Jingle & Audio Ads', 'Audio Production', 'Catchy radio jingles and audio spots in English, French, Swahili or Pidgin. Includes composition, voice talent and mastering.', 300, 'per spot', '7 days', 175, 80, 4.5, 'open'),
  ('Nairobi Drone Collective — Aerial Coverage', 'Drone Photography', 'Licensed drone pilots for real estate, events and documentaries. 4K footage plus edited highlight reel.', 550, 'per day', '5 days', 64, 29, 4.7, 'open'),
  ('Accra Creative Lab — Web & Landing Page Design', 'Web Design', 'Conversion-focused landing pages and small business sites. Design in Figma, responsive build, basic SEO setup.', 950, 'per site', '14 days', 120, 66, 4.6, 'open'),
  ('Jollof Post — Video Editing & Colour Grading', 'Video Editing', 'Post-production for creators and agencies: multi-cam editing, motion titles, colour grading and delivery in all aspect ratios.', 200, 'per minute of output', '4 days', 230, 112, 4.8, 'open'),
  ('Kigali Sessions — Podcast Production', 'Podcast Production', 'End-to-end podcast production: recording, editing, show notes, cover art and distribution to all platforms.', 180, 'per episode', '3 days', 44, 21, 4.9, 'open'),
  ('Zebra Ink — Print & Packaging Design', 'Graphic Design', 'Flyers, billboards, product packaging and print-ready artwork with supplier liaison for CMYK production.', 260, 'per design', '6 days', 190, 87, 4.5, 'open'),
  ('Lagos Wedding Stories — Event Coverage', 'Event Photography', 'Weddings, launches and conferences covered by a two-person crew. 300+ edited photos and a same-week highlight video.', 700, 'per event', '10 days', 155, 74, 4.7, 'open'),
  ('Savanna UX — Mobile App UI/UX Design', 'UI/UX Design', 'User research, wireframes and polished UI kits for iOS and Android apps, delivered as developer-ready Figma files.', 1500, 'per project', '21 days', 39, 18, 4.8, 'open'),
  ('AfroBeat Visuals — Music Video Production', 'Videography', 'Concept-to-delivery music videos with location scouting, styling, cinematography and VFX-ready editing.', 3000, 'per video', '30 days', 47, 25, 4.6, 'open'),
  ('Cape Copy Co. — Copywriting & Content', 'Content Creation', 'Website copy, ad scripts, blog articles and product descriptions written for African audiences in EN/FR/PT.', 120, 'per 1000 words', '3 days', 260, 130, 4.7, 'open'),
  ('Kampala Motion — Logo Animation & Stingers', 'Motion Graphics', 'Animated logos, lower thirds and broadcast stingers for TV stations, YouTubers and event screens.', 240, 'per animation', '5 days', 91, 45, 4.6, 'open'),
  ('Dakar Retouch — Photo Editing & Restoration', 'Photo Editing', 'High-end retouching, background removal, colour correction and old photo restoration with 48-hour rush option.', 15, 'per image', '2 days', 340, 150, 4.5, 'open'),
  ('Joburg Influence — Influencer Campaign Management', 'Influencer Marketing', 'Campaign strategy, creator sourcing, content approval and reporting across African influencer networks.', 1000, 'per campaign', '30 days', 52, 27, 4.4, 'open')
) AS seed(title, service_type, description, pricing, pricing_model, delivery_time, clients_served, review_count, rating, status)
WHERE NOT EXISTS (SELECT 1 FROM media_services);


-- ============ 20240703000000_create_waitlist_table.sql ============
/*
  # Create waitlist table

  Stores launch waitlist signups from the public /waitlist page.

  Security:
  - Anyone (including anonymous visitors) can INSERT — that's the point of a
    public waitlist form. Duplicate emails are rejected by a unique index.
  - Only admins can read, update, or delete entries.
*/

CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text NOT NULL,
  business_type text,
  country text,
  source text DEFAULT 'website',
  invited boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique ON waitlist (lower(email));

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can join the waitlist" ON waitlist;
CREATE POLICY "Anyone can join the waitlist" ON waitlist
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view waitlist" ON waitlist;
CREATE POLICY "Admins can view waitlist" ON waitlist
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins can update waitlist" ON waitlist;
CREATE POLICY "Admins can update waitlist" ON waitlist
  FOR UPDATE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete waitlist" ON waitlist;
CREATE POLICY "Admins can delete waitlist" ON waitlist
  FOR DELETE TO authenticated USING (is_admin());


-- ============ 20240704000000_business_usernames_and_storage.sql ============
/*
  # Business usernames + image storage

  1. Usernames
    - Adds a unique `username` (slug) to businesses so each business gets a
      friendly URL: nowopenafrica.com/business/<username>
    - Backfills usernames for existing rows from the business name;
      duplicate names get a short id suffix.

  2. Storage
    - Creates a public `business-images` bucket for profile photo uploads.
    - Anyone can view images; authenticated users can upload; only the
      uploader can replace or delete their files.
    - If the storage policies error in your project (permissions on
      storage.objects vary), create the same policies from
      Dashboard → Storage → business-images → Policies instead.
*/

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS businesses_username_unique
  ON businesses (lower(username));

-- Backfill: slugify the name; add a short id suffix on duplicates
WITH candidates AS (
  SELECT
    id,
    trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))) AS slug,
    row_number() OVER (
      PARTITION BY trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')))
      ORDER BY created_at
    ) AS rn
  FROM businesses
  WHERE username IS NULL
)
UPDATE businesses b
SET username = CASE WHEN c.rn = 1 THEN c.slug ELSE c.slug || '-' || left(b.id::text, 4) END
FROM candidates c
WHERE b.id = c.id AND c.slug <> '';

-- Storage bucket for business profile photos (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-images', 'business-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view business images" ON storage.objects;
CREATE POLICY "Public can view business images" ON storage.objects
  FOR SELECT USING (bucket_id = 'business-images');

DROP POLICY IF EXISTS "Authenticated can upload business images" ON storage.objects;
CREATE POLICY "Authenticated can upload business images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'business-images');

DROP POLICY IF EXISTS "Owners can update business images" ON storage.objects;
CREATE POLICY "Owners can update business images" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'business-images' AND owner = auth.uid());

DROP POLICY IF EXISTS "Owners can delete business images" ON storage.objects;
CREATE POLICY "Owners can delete business images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'business-images' AND owner = auth.uid());


-- ============ 20240705000000_business_verified.sql ============
/*
  # Business verified badge (premium)

  Adds a `verified` flag to businesses. Verification is granted by admins
  (or automatically for paid plans once billing is wired up) — users cannot
  set it themselves, because the existing owner UPDATE policy is column-blind
  but the admin dashboard is the only place the toggle is exposed.

  For stronger enforcement you can revoke owner UPDATE on this column via a
  trigger, but that's optional; the UI does not offer self-verification.
*/

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;

-- Prevent a business owner from flipping their own `verified` flag while
-- still letting admins (who bypass this via the is_admin() policy) do so.
CREATE OR REPLACE FUNCTION public.guard_business_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.verified IS DISTINCT FROM OLD.verified AND NOT public.is_admin() THEN
    NEW.verified := OLD.verified;  -- silently ignore owner attempts to change it
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_business_verified ON businesses;
CREATE TRIGGER trg_guard_business_verified
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_verified();
