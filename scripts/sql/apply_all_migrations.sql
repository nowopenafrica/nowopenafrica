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

-- Reconcile a legacy NOT NULL `full_name` column (the form stores `name`),
-- which otherwise rejects every signup with a not-null violation.
DO $$
DECLARE col record;
BEGIN
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'waitlist'
      AND is_nullable = 'NO' AND column_default IS NULL
      AND column_name NOT IN ('id', 'email')
  LOOP
    EXECUTE format('ALTER TABLE public.waitlist ALTER COLUMN %I DROP NOT NULL', col.column_name);
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'waitlist' AND column_name = 'full_name'
  ) THEN
    EXECUTE 'UPDATE public.waitlist SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL';
  END IF;
END $$;

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


-- ============ 20240706000000_business_logo.sql ============
/*
  # Business profile photo (logo) separate from cover banner

  `image_url` is used as the wide cover/banner image on the business
  detail page. There was no column for the circular profile photo shown
  overlapping the banner — the detail page already reads `logo_url` for
  it, but the dashboard form had nowhere to write it. This adds the
  column so the two images can be uploaded and stored independently.
*/

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url text;


-- ============ 20240707000000_business_registrations.sql ============
/*
  # Business registrations (Digital Forms lead capture)

  The /digital-forms page collects full business registrations from the
  public (no account needed, like the waitlist). Submissions land here for
  the team to review and convert into real `businesses` rows.

  Security: anyone can INSERT; only admins can read/manage.
*/

CREATE TABLE IF NOT EXISTS business_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  location text NOT NULL,
  phone text,
  email text,
  website text,
  services text,
  service_details text,
  products text,
  product_details text,
  pricing text,
  duration text,
  dimensions text,
  image_url text,
  social_media jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE business_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit a registration" ON business_registrations;
CREATE POLICY "Anyone can submit a registration" ON business_registrations
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view registrations" ON business_registrations;
CREATE POLICY "Admins can view registrations" ON business_registrations
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage registrations" ON business_registrations;
CREATE POLICY "Admins can manage registrations" ON business_registrations
  FOR UPDATE TO authenticated USING (public.is_admin());


-- ============ 20240708000000_payment_intents.sql ============
/*
  # Payment intents (checkout at all levels)

  Records every checkout started on the site — subscriptions from the
  pricing page, placement bookings and creative-service bookings. Before
  live payment keys are configured these are captured as 'lead' rows
  (pre-launch demand with contact details); once Paystack goes live the
  same table tracks 'initiated' → 'paid' via the provider reference.

  Security: anyone can INSERT (guests can start checkout); signed-in users
  can view their own; only admins can read/manage everything.
*/

CREATE TABLE IF NOT EXISTS payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,                -- 'subscription' | 'placement_booking' | 'service_booking'
  item_id text,
  item_title text NOT NULL,
  amount_usd numeric NOT NULL,
  currency text NOT NULL,            -- display/charge currency, e.g. 'NGN'
  amount_local numeric NOT NULL,     -- converted amount at checkout time
  method text,                       -- 'card' | 'mobile_money' | 'bank_transfer' | 'intl_card'
  email text NOT NULL,
  name text,
  status text DEFAULT 'lead',        -- 'lead' | 'initiated' | 'paid' | 'failed'
  provider text,                     -- 'paystack' | 'flutterwave' | 'stripe'
  reference text,                    -- provider transaction reference
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can start a checkout" ON payment_intents;
CREATE POLICY "Anyone can start a checkout" ON payment_intents
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own payment intents" ON payment_intents;
CREATE POLICY "Users can view own payment intents" ON payment_intents
  FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id::text OR public.is_admin());

DROP POLICY IF EXISTS "Admins can manage payment intents" ON payment_intents;
CREATE POLICY "Admins can manage payment intents" ON payment_intents
  FOR UPDATE TO authenticated USING (public.is_admin());


-- ============ 20240709000000_business_content.sql ============
/*
  # Business profile content: services, products, gallery, reviews, enquiries

  Business owners manage their own services/products/gallery from the
  dashboard; signed-in visitors leave reviews (one per business); anyone can
  send an enquiry, which the business owner (and admins) can read.

  businesses.rating is recomputed automatically from reviews by trigger.
*/

CREATE TABLE IF NOT EXISTS business_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price text,                      -- free text: "$500", "From $200/day", "Contact us"
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price text,
  image_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (business_id, user_id)    -- one review per person per business
);

CREATE TABLE IF NOT EXISTS business_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  message text NOT NULL,
  context text,                    -- e.g. the product/service asked about
  created_at timestamptz DEFAULT now()
);
ALTER TABLE business_enquiries ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE business_services  ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_gallery   ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_reviews   ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_enquiries ENABLE ROW LEVEL SECURITY;

-- ── Services / products / gallery: public read, owner (or admin) manages ──
DROP POLICY IF EXISTS "Public can view business services" ON business_services;
CREATE POLICY "Public can view business services" ON business_services
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners manage business services" ON business_services;
CREATE POLICY "Owners manage business services" ON business_services
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())));

DROP POLICY IF EXISTS "Public can view business products" ON business_products;
CREATE POLICY "Public can view business products" ON business_products
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners manage business products" ON business_products;
CREATE POLICY "Owners manage business products" ON business_products
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())));

DROP POLICY IF EXISTS "Public can view business gallery" ON business_gallery;
CREATE POLICY "Public can view business gallery" ON business_gallery
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners manage business gallery" ON business_gallery;
CREATE POLICY "Owners manage business gallery" ON business_gallery
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())));

-- ── Reviews: public read; signed-in users write their own ──
DROP POLICY IF EXISTS "Public can view business reviews" ON business_reviews;
CREATE POLICY "Public can view business reviews" ON business_reviews
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users write own reviews" ON business_reviews;
CREATE POLICY "Users write own reviews" ON business_reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id::text);
DROP POLICY IF EXISTS "Users update own reviews" ON business_reviews;
CREATE POLICY "Users update own reviews" ON business_reviews
  FOR UPDATE TO authenticated USING (auth.uid()::text = user_id::text);
DROP POLICY IF EXISTS "Users or admins delete reviews" ON business_reviews;
CREATE POLICY "Users or admins delete reviews" ON business_reviews
  FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id::text OR public.is_admin());

-- ── Enquiries: anyone sends; only the business owner (or admin) reads ──
DROP POLICY IF EXISTS "Anyone can send an enquiry" ON business_enquiries;
CREATE POLICY "Anyone can send an enquiry" ON business_enquiries
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Owners read own enquiries" ON business_enquiries;
CREATE POLICY "Owners read own enquiries" ON business_enquiries
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())));

-- ── Keep businesses.rating in sync with reviews ──
CREATE OR REPLACE FUNCTION public.refresh_business_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid := COALESCE(NEW.business_id, OLD.business_id);
BEGIN
  UPDATE businesses
  SET rating = COALESCE(
    (SELECT round(avg(rating)::numeric, 1) FROM business_reviews WHERE business_id = target),
    0
  )
  WHERE id = target;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_business_rating ON business_reviews;
CREATE TRIGGER trg_refresh_business_rating
  AFTER INSERT OR UPDATE OR DELETE ON business_reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_business_rating();


-- ============ 20240710000000_waitlist_columns.sql ============
/*
  # Reconcile waitlist columns

  Some projects have an older waitlist table (email/country only) that
  predates the full definition — CREATE TABLE IF NOT EXISTS silently skips
  an existing table, so the newer columns never got added and signups fail
  with "Could not find the 'business_type' column". Add them in place.
*/

ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS business_type text;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS source text DEFAULT 'website';
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS invited boolean DEFAULT false;

-- Make sure the duplicate-email guard and signup policy exist too
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique ON waitlist (lower(email));

-- Reconcile a legacy NOT NULL `full_name` column (the form stores `name`),
-- which otherwise rejects every signup with a not-null violation.
DO $$
DECLARE col record;
BEGIN
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'waitlist'
      AND is_nullable = 'NO' AND column_default IS NULL
      AND column_name NOT IN ('id', 'email')
  LOOP
    EXECUTE format('ALTER TABLE public.waitlist ALTER COLUMN %I DROP NOT NULL', col.column_name);
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'waitlist' AND column_name = 'full_name'
  ) THEN
    EXECUTE 'UPDATE public.waitlist SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL';
  END IF;
END $$;

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can join the waitlist" ON waitlist;
CREATE POLICY "Anyone can join the waitlist" ON waitlist
  FOR INSERT TO anon, authenticated WITH CHECK (true);


-- ============ 20240711000000_registration_onboarding_fields.sql ============
/*
  # Full onboarding fields for business_registrations

  Elaborates the Digital Forms registration into a complete onboarding
  record: operating details (hours, payment methods, service area,
  languages), a separate logo vs cover image, and optional verification
  details (registration number, tax ID, document link) that let the team
  fast-track a business's verified badge without blocking submission.

  All new columns are nullable — existing rows and the public INSERT
  policy from the original migration are unaffected.
*/

ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS year_established integer;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS employee_count text;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS payment_methods text[];
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS service_area text;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS languages text[];
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS business_hours jsonb;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS registration_number text;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS tax_id text;
ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS verification_doc_url text;

/*
  # Business bookings (category-driven request/response workflow)

  One generic table drives bookings/reservations/orders for any business
  category via src/data/categoryFeatures.ts — not a separate schema per
  category. Distinct from payment_intents' 'placement_booking' /
  'service_booking' kinds (those are paid ad/media checkout; this is an
  unpaid customer request that the business owner confirms or declines).
*/

CREATE TABLE IF NOT EXISTS business_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_type text CHECK (item_type IN ('service','product')),
  item_id text,
  item_name text,
  item_price text,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  requested_date date,
  requested_date_end date,
  requested_time time,
  quantity int,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined','cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE business_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can request a booking" ON business_bookings;
CREATE POLICY "Anyone can request a booking" ON business_bookings
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Owners read own bookings" ON business_bookings;
CREATE POLICY "Owners read own bookings" ON business_bookings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())));

DROP POLICY IF EXISTS "Owners update booking status" ON business_bookings;
CREATE POLICY "Owners update booking status" ON business_bookings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())));

-- ── Cart orders (multiple line items), per-module keys, product stock ──
ALTER TABLE business_bookings ADD COLUMN IF NOT EXISTS items jsonb;
ALTER TABLE business_bookings ADD COLUMN IF NOT EXISTS module_key text;
ALTER TABLE business_bookings DROP CONSTRAINT IF EXISTS business_bookings_items_is_array;
ALTER TABLE business_bookings ADD CONSTRAINT business_bookings_items_is_array
  CHECK (items IS NULL OR jsonb_typeof(items) = 'array');

ALTER TABLE business_products ADD COLUMN IF NOT EXISTS stock_quantity int;


-- ════════════════════════════════════════════════════════════════════
-- Migration: 20240716000000_nowopen_live.sql
-- ════════════════════════════════════════════════════════════════════

/*
  # NowOpen Live — premium livestreaming for verified businesses

  Adds the schema behind the new "🔴 Live" section on business profiles:
  owners broadcast from a browser (desktop/mobile camera, WebRTC — signaled
  over Supabase Realtime, no third-party streaming account required), viewers
  watch, chat, get AI captions/translation, and owners see replay + analytics
  afterwards.

  1. business_streams — one row per broadcast (scheduled, live, or ended).
     Only verified businesses may create rows here (enforced in the owner
     policy below) — this is a premium/verified-only feature.
  2. stream_chat_messages — public live chat per stream, owner-moderatable.
  3. stream_captions — persisted caption lines (source language), used for
     live display fallback and replay; live-viewer captions are primarily
     pushed over a Realtime broadcast channel for zero-latency, but are also
     written here so replays and translation-on-demand have something to
     read.
  4. stream_followers — "Notify Me" / "Follow Live" interest capture for
     offline businesses. No email-sending infrastructure is wired up in this
     project yet, so this only *captures* interest — it doesn't dispatch
     notifications on its own.
  5. stream_blocked_senders — lets an owner block a disruptive chat
     participant (by their client-generated session id) from a business's
     streams.
*/

CREATE TABLE IF NOT EXISTS business_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Live now',
  description text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  scheduled_for timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  current_viewers int NOT NULL DEFAULT 0,
  peak_viewers int NOT NULL DEFAULT 0,
  total_viewers int NOT NULL DEFAULT 0,
  chat_message_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stream_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES business_streams(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  sender_session text NOT NULL,
  message text NOT NULL,
  is_owner boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stream_captions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES business_streams(id) ON DELETE CASCADE,
  text text NOT NULL,
  lang text NOT NULL DEFAULT 'en',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stream_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email text,
  session_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (business_id, session_id)
);

CREATE TABLE IF NOT EXISTS stream_blocked_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (business_id, session_id)
);

ALTER TABLE business_streams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_chat_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_captions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_followers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_blocked_senders  ENABLE ROW LEVEL SECURITY;

-- ── business_streams: public read, verified owner (or admin) manages ──
DROP POLICY IF EXISTS "Public can view streams" ON business_streams;
CREATE POLICY "Public can view streams" ON business_streams
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Verified owners manage streams" ON business_streams;
CREATE POLICY "Verified owners manage streams" ON business_streams
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = business_id
    AND (b.user_id::text = auth.uid()::text OR public.is_admin())
    AND (b.verified = true OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = business_id
    AND (b.user_id::text = auth.uid()::text OR public.is_admin())
    AND (b.verified = true OR public.is_admin())
  ));

-- ── stream_chat_messages: anyone can post/read, owner (or admin) moderates ──
DROP POLICY IF EXISTS "Anyone can view stream chat" ON stream_chat_messages;
CREATE POLICY "Anyone can view stream chat" ON stream_chat_messages
  FOR SELECT USING (true);

-- Blocked senders are rejected at insert time (not just hidden client-side)
-- by checking stream_blocked_senders against NEW.sender_session.
DROP POLICY IF EXISTS "Anyone can post stream chat" ON stream_chat_messages;
CREATE POLICY "Anyone can post stream chat" ON stream_chat_messages
  FOR INSERT TO anon, authenticated WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM stream_blocked_senders bs
      JOIN business_streams s ON s.business_id = bs.business_id
      WHERE s.id = stream_id AND bs.session_id = sender_session
    )
  );

DROP POLICY IF EXISTS "Owners moderate stream chat" ON stream_chat_messages;
CREATE POLICY "Owners moderate stream chat" ON stream_chat_messages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM business_streams s JOIN businesses b ON b.id = s.business_id
    WHERE s.id = stream_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM business_streams s JOIN businesses b ON b.id = s.business_id
    WHERE s.id = stream_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));

DROP POLICY IF EXISTS "Owners delete stream chat" ON stream_chat_messages;
CREATE POLICY "Owners delete stream chat" ON stream_chat_messages
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM business_streams s JOIN businesses b ON b.id = s.business_id
    WHERE s.id = stream_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));

-- ── stream_captions: public read, verified owner writes while broadcasting ──
DROP POLICY IF EXISTS "Public can view captions" ON stream_captions;
CREATE POLICY "Public can view captions" ON stream_captions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners write captions" ON stream_captions;
CREATE POLICY "Owners write captions" ON stream_captions
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM business_streams s JOIN businesses b ON b.id = s.business_id
    WHERE s.id = stream_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));

-- ── stream_followers: anyone can follow, only the owner (or admin) reads (contains emails) ──
DROP POLICY IF EXISTS "Anyone can follow a business" ON stream_followers;
CREATE POLICY "Anyone can follow a business" ON stream_followers
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Owners read followers" ON stream_followers;
CREATE POLICY "Owners read followers" ON stream_followers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = business_id
    AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));

-- ── stream_blocked_senders: owner-only, both ways ──
DROP POLICY IF EXISTS "Owners manage blocklist" ON stream_blocked_senders;
CREATE POLICY "Owners manage blocklist" ON stream_blocked_senders
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = business_id
    AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = business_id
    AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));

-- Keep business_streams.chat_message_count in sync so dashboard analytics
-- don't need a separate count(*) query per stream.
CREATE OR REPLACE FUNCTION public.bump_stream_chat_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE business_streams SET chat_message_count = chat_message_count + 1 WHERE id = NEW.stream_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_stream_chat_count ON stream_chat_messages;
CREATE TRIGGER trg_bump_stream_chat_count
  AFTER INSERT ON stream_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_stream_chat_count();

-- ════════════════════════════════════════════════════════════════════
-- Migration: 20240717000000_input_length_limits.sql
-- ════════════════════════════════════════════════════════════════════

/*
  # Input length limits on public-insertable text fields

  Every text/textarea in the app already caps input length client-side, but
  that's UX only — a direct REST call (bypassing the frontend entirely) can
  still stuff an arbitrarily large payload into any of these unbounded
  `text`/`jsonb` columns, since nothing in RLS constrains value *size*, only
  *access*. This adds DB-level CHECK constraints so oversized rows are
  rejected outright, regardless of how the insert was made — the same
  defense-in-depth idea as the existing
  `business_bookings_items_is_array` constraint.

  Limits are generous (well above any legitimate use) rather than tight,
  since the goal is stopping abuse/storage-bloat, not restricting real input.
*/

-- ── business_enquiries ──
ALTER TABLE business_enquiries DROP CONSTRAINT IF EXISTS business_enquiries_length_limits;
ALTER TABLE business_enquiries ADD CONSTRAINT business_enquiries_length_limits CHECK (
  char_length(name) <= 200
  AND char_length(email) <= 320
  AND (phone IS NULL OR char_length(phone) <= 30)
  AND char_length(message) <= 5000
  AND (context IS NULL OR char_length(context) <= 300)
);

-- ── business_reviews ──
ALTER TABLE business_reviews DROP CONSTRAINT IF EXISTS business_reviews_length_limits;
ALTER TABLE business_reviews ADD CONSTRAINT business_reviews_length_limits CHECK (
  char_length(author_name) <= 200
  AND (comment IS NULL OR char_length(comment) <= 2000)
);

-- ── business_bookings ──
ALTER TABLE business_bookings DROP CONSTRAINT IF EXISTS business_bookings_length_limits;
ALTER TABLE business_bookings ADD CONSTRAINT business_bookings_length_limits CHECK (
  char_length(customer_name) <= 200
  AND char_length(customer_email) <= 320
  AND (customer_phone IS NULL OR char_length(customer_phone) <= 30)
  AND (notes IS NULL OR char_length(notes) <= 2000)
  AND (item_name IS NULL OR char_length(item_name) <= 300)
  AND (item_price IS NULL OR char_length(item_price) <= 100)
  AND (items IS NULL OR octet_length(items::text) <= 20000)
);

-- ── business_streams (owner-authenticated, but cheap defense-in-depth) ──
ALTER TABLE business_streams DROP CONSTRAINT IF EXISTS business_streams_length_limits;
ALTER TABLE business_streams ADD CONSTRAINT business_streams_length_limits CHECK (
  char_length(title) <= 200
  AND (description IS NULL OR char_length(description) <= 2000)
);

-- ── stream_chat_messages ──
ALTER TABLE stream_chat_messages DROP CONSTRAINT IF EXISTS stream_chat_messages_length_limits;
ALTER TABLE stream_chat_messages ADD CONSTRAINT stream_chat_messages_length_limits CHECK (
  char_length(sender_name) <= 100
  AND char_length(message) <= 500
);

-- ── stream_captions ──
ALTER TABLE stream_captions DROP CONSTRAINT IF EXISTS stream_captions_length_limits;
ALTER TABLE stream_captions ADD CONSTRAINT stream_captions_length_limits CHECK (
  char_length(text) <= 1000
);

-- ── stream_followers ──
ALTER TABLE stream_followers DROP CONSTRAINT IF EXISTS stream_followers_length_limits;
ALTER TABLE stream_followers ADD CONSTRAINT stream_followers_length_limits CHECK (
  email IS NULL OR char_length(email) <= 320
);

-- ════════════════════════════════════════════════════════════════════
-- Migration: 20240718000000_payment_verification.sql
-- ════════════════════════════════════════════════════════════════════

/*
  # Payment verification support

  Backs the two new edge functions that close the gap already flagged in
  lib/payments.ts: "the client callback alone is not proof of payment."

  - verify-payment: called right after Paystack's inline widget reports
    success, for instant UI feedback. Verifies server-side with the SECRET
    key before trusting it.
  - paystack-webhook: Paystack's own async notification (charge.success /
    charge.failed) — the real source of truth, since it fires even if the
    browser tab closes before the client-side callback would.

  Both run with the service role (bypassing RLS entirely, by design — they
  are trusted server-side code, not user requests), so no new RLS policy is
  needed here. This migration only adds bookkeeping columns.
*/

ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- Which path last touched a row — useful when debugging a mismatch between
-- the client-verify pass and the webhook.
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS verified_via text CHECK (verified_via IS NULL OR verified_via IN ('client', 'webhook'));

CREATE INDEX IF NOT EXISTS payment_intents_reference_idx ON payment_intents (reference);

-- ════════════════════════════════════════════════════════════════════
-- Migration: 20240719000000_signup_phone.sql
-- ════════════════════════════════════════════════════════════════════

/*
  # Capture phone number at signup

  users.phone already existed (editable from the Profile page) but was never
  populated at signup time. The registration form now collects it and passes
  it through Supabase Auth's signUp `options.data`, so this just teaches the
  existing handle_new_user() trigger to copy it into the profile row like it
  already does for `role`.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, role, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'business'),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Migration: 20240720000000_advert_media_functional.sql
-- ════════════════════════════════════════════════════════════════════

/*
  # Make Advert & Media detail pages functional

  1. platform_enquiries — generic enquiry capture for listings that aren't
     tied to a business profile (ad placements, media/creative services).
     Same anyone-can-insert / admin-can-read shape as business_enquiries,
     just not scoped to a single business_id. Replaces the dead
     `mailto:hello@nowopen.africa` links that never landed anywhere trackable.

  2. media_reviews — real reviews backing media_services.rating /
     review_count, which were previously just static seed numbers with no
     way for a customer to actually leave one. Mirrors business_reviews
     exactly, including the rating-refresh trigger.
*/

CREATE TABLE IF NOT EXISTS platform_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('advert', 'media_service', 'platform')),
  item_id text NOT NULL,
  item_title text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE platform_enquiries DROP CONSTRAINT IF EXISTS platform_enquiries_length_limits;
ALTER TABLE platform_enquiries ADD CONSTRAINT platform_enquiries_length_limits CHECK (
  char_length(name) <= 200
  AND char_length(email) <= 320
  AND (phone IS NULL OR char_length(phone) <= 30)
  AND char_length(message) <= 5000
  AND char_length(item_title) <= 300
);

ALTER TABLE platform_enquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can send a platform enquiry" ON platform_enquiries;
CREATE POLICY "Anyone can send a platform enquiry" ON platform_enquiries
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view platform enquiries" ON platform_enquiries;
CREATE POLICY "Admins can view platform enquiries" ON platform_enquiries
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS media_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_service_id uuid NOT NULL REFERENCES media_services(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (media_service_id, user_id)
);

ALTER TABLE media_reviews DROP CONSTRAINT IF EXISTS media_reviews_length_limits;
ALTER TABLE media_reviews ADD CONSTRAINT media_reviews_length_limits CHECK (
  char_length(author_name) <= 200
  AND (comment IS NULL OR char_length(comment) <= 2000)
);

ALTER TABLE media_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view media reviews" ON media_reviews;
CREATE POLICY "Public can view media reviews" ON media_reviews
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Signed-in users manage own media review" ON media_reviews;
CREATE POLICY "Signed-in users manage own media review" ON media_reviews
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.refresh_media_service_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid := COALESCE(NEW.media_service_id, OLD.media_service_id);
BEGIN
  UPDATE media_services
  SET rating = COALESCE((SELECT round(avg(rating)::numeric, 1) FROM media_reviews WHERE media_service_id = target), 0),
      review_count = (SELECT count(*) FROM media_reviews WHERE media_service_id = target)
  WHERE id = target;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_media_service_rating ON media_reviews;
CREATE TRIGGER trg_refresh_media_service_rating
  AFTER INSERT OR UPDATE OR DELETE ON media_reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_media_service_rating();

-- ════════════════════════════════════════════════════════════════════
-- Migration: 20240721000000_admin_backend_coverage.sql
-- ════════════════════════════════════════════════════════════════════

/*
  # Full admin backend coverage

  The admin panel only ever covered users/businesses/adverts/media —
  bookings, checkout attempts, waitlist signups, public registration-form
  submissions, and advert/media enquiries were all invisible to admins (or,
  for platform_enquiries, invisible to *everyone* — there was no owner
  dashboard for it either). Read access already existed for most of these;
  what's missing is the ability to actually manage them (update status,
  delete spam/test rows) — this migration closes that gap.
*/

-- business_registrations: had admin SELECT only — add UPDATE (status
-- workflow: new -> contacted -> approved/rejected) and DELETE.
DROP POLICY IF EXISTS "Admins can update registrations" ON business_registrations;
CREATE POLICY "Admins can update registrations" ON business_registrations
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete registrations" ON business_registrations;
CREATE POLICY "Admins can delete registrations" ON business_registrations
  FOR DELETE TO authenticated USING (public.is_admin());

-- payment_intents: admin already has UPDATE — add DELETE for cleaning up
-- test/duplicate/abandoned checkout rows.
DROP POLICY IF EXISTS "Admins can delete payment intents" ON payment_intents;
CREATE POLICY "Admins can delete payment intents" ON payment_intents
  FOR DELETE TO authenticated USING (public.is_admin());

-- platform_enquiries: admin already has SELECT — add DELETE.
DROP POLICY IF EXISTS "Admins can delete platform enquiries" ON platform_enquiries;
CREATE POLICY "Admins can delete platform enquiries" ON platform_enquiries
  FOR DELETE TO authenticated USING (public.is_admin());

-- business_bookings: owners (or admins, via the existing OR public.is_admin()
-- clause) can already read/update — add an admin-only DELETE, which never
-- existed for anyone on this table.
DROP POLICY IF EXISTS "Admins can delete bookings" ON business_bookings;
CREATE POLICY "Admins can delete bookings" ON business_bookings
  FOR DELETE TO authenticated USING (public.is_admin());


-- ===== 20240722000000_device_push_tokens.sql =====
/*
  # Device push tokens (mobile app)

  Stores Expo push tokens so the platform can send notifications (booking
  confirmations, "a business you follow is live", etc). One row per device
  token; linked to a user when they're signed in, else anonymous.

  Anyone (anon or authenticated) may register/refresh their own token — the
  token itself is the opaque device identifier. Only admins can read the table
  (it's a send-list, not user-facing data); a user may update/delete rows for
  their own user_id.
*/

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  platform text CHECK (platform IN ('ios', 'android', 'web')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

-- Register / refresh a token (upsert on token). Open to anon + authenticated.
DROP POLICY IF EXISTS "Anyone can register a push token" ON device_push_tokens;
CREATE POLICY "Anyone can register a push token" ON device_push_tokens
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update a push token" ON device_push_tokens;
CREATE POLICY "Anyone can update a push token" ON device_push_tokens
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Only admins can read the send-list.
DROP POLICY IF EXISTS "Admins read push tokens" ON device_push_tokens;
CREATE POLICY "Admins read push tokens" ON device_push_tokens
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins delete push tokens" ON device_push_tokens;
CREATE POLICY "Admins delete push tokens" ON device_push_tokens
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS device_push_tokens_user_idx ON device_push_tokens (user_id);


-- ===== 20240723000000_favorites.sql =====
/*
  # Favorites / saved items (mobile app)

  Lets a signed-in user save businesses, ad placements and creative services to
  a personal "Saved" list. Polymorphic (item_type + item_id, matching the
  payment_intents / business_bookings precedent) so one table covers all three.
  Users see and manage only their own rows.
*/

CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('business', 'advert', 'media_service')),
  item_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, item_type, item_id)
);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Owners manage their own favorites; nobody else can read them.
DROP POLICY IF EXISTS "Users read own favorites" ON favorites;
CREATE POLICY "Users read own favorites" ON favorites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users add own favorites" ON favorites;
CREATE POLICY "Users add own favorites" ON favorites
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users remove own favorites" ON favorites;
CREATE POLICY "Users remove own favorites" ON favorites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS favorites_user_idx ON favorites (user_id);

-- ============================================================================
-- 20240724000000_real_estate_properties.sql
-- Real Estate operating system — property attributes on business_products.
-- ============================================================================
ALTER TABLE public.business_products
  ADD COLUMN IF NOT EXISTS listing_type      text,
  ADD COLUMN IF NOT EXISTS property_type     text,
  ADD COLUMN IF NOT EXISTS bedrooms          integer,
  ADD COLUMN IF NOT EXISTS bathrooms         integer,
  ADD COLUMN IF NOT EXISTS area_sqm          numeric,
  ADD COLUMN IF NOT EXISTS property_location text,
  ADD COLUMN IF NOT EXISTS is_featured       boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_products_listing_type_check') THEN
    ALTER TABLE public.business_products
      ADD CONSTRAINT business_products_listing_type_check
      CHECK (listing_type IS NULL OR listing_type IN ('sale', 'rent', 'shortlet'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_business_products_featured
  ON public.business_products (business_id, is_featured);

-- ============================================================================
-- 20240725000000_restaurant_menu.sql
-- Restaurant operating system — menu attributes on business_products.
-- ============================================================================
ALTER TABLE public.business_products
  ADD COLUMN IF NOT EXISTS menu_category  text,
  ADD COLUMN IF NOT EXISTS is_special     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_business_products_menu
  ON public.business_products (business_id, menu_category);

-- ============================================================================
-- 20240726000000_hotel_rooms.sql
-- Hotel operating system — room attributes on business_services.
-- ============================================================================
ALTER TABLE public.business_services
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS capacity  integer,
  ADD COLUMN IF NOT EXISTS amenities text;

-- ============================================================================
-- 20240727000000_car_dealership.sql
-- Car Dealership operating system — vehicle attributes on business_products.
-- ============================================================================
ALTER TABLE public.business_products
  ADD COLUMN IF NOT EXISTS vehicle_make  text,
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS vehicle_year  integer,
  ADD COLUMN IF NOT EXISTS mileage_km    integer,
  ADD COLUMN IF NOT EXISTS fuel_type     text,
  ADD COLUMN IF NOT EXISTS transmission  text,
  ADD COLUMN IF NOT EXISTS vin           text,
  ADD COLUMN IF NOT EXISTS vehicle_condition text;

-- ============================================================================
-- 20240728000000_pharmacy.sql
-- Pharmacy operating system — medicine attributes on business_products.
-- ============================================================================
ALTER TABLE public.business_products
  ADD COLUMN IF NOT EXISTS med_category         text,
  ADD COLUMN IF NOT EXISTS requires_prescription boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pack_size            text;

CREATE INDEX IF NOT EXISTS idx_business_products_med
  ON public.business_products (business_id, med_category);

-- ============================================================================
-- 20240729000000_fitness.sql
-- Fitness operating system — class/membership attributes on business_services.
-- ============================================================================
ALTER TABLE public.business_services
  ADD COLUMN IF NOT EXISTS session_kind   text,
  ADD COLUMN IF NOT EXISTS class_level    text,
  ADD COLUMN IF NOT EXISTS class_schedule text,
  ADD COLUMN IF NOT EXISTS instructor     text,
  ADD COLUMN IF NOT EXISTS duration_min   integer;

-- ============================================================================
-- 20240730000000_beauty_salon.sql
-- Beauty & Salon operating system — treatment attributes on business_services.
-- ============================================================================
ALTER TABLE public.business_services
  ADD COLUMN IF NOT EXISTS service_category text,
  ADD COLUMN IF NOT EXISTS home_service     boolean NOT NULL DEFAULT false;

-- ============================================================================
-- 20240731000000_health.sql
-- Health operating system — telemedicine flag on business_services.
-- ============================================================================
ALTER TABLE public.business_services
  ADD COLUMN IF NOT EXISTS is_telemedicine boolean NOT NULL DEFAULT false;

-- ============================================================================
-- 20240801000000_fashion.sql
-- Fashion operating system — apparel attributes on business_products.
-- ============================================================================
ALTER TABLE public.business_products
  ADD COLUMN IF NOT EXISTS fashion_category text,
  ADD COLUMN IF NOT EXISTS sizes            text,
  ADD COLUMN IF NOT EXISTS fabric           text;

CREATE INDEX IF NOT EXISTS idx_business_products_fashion
  ON public.business_products (business_id, fashion_category);

-- ============================================================================
-- 20240802000000_education.sql
-- Education operating system — online flag on business_services.
-- ============================================================================
ALTER TABLE public.business_services
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;

-- ============================================================================
-- 20240803000000_retail_agriculture.sql
-- Retail & Agriculture — catalogue attributes on business_products.
-- ============================================================================
ALTER TABLE public.business_products
  ADD COLUMN IF NOT EXISTS product_category text,
  ADD COLUMN IF NOT EXISTS unit             text;

CREATE INDEX IF NOT EXISTS idx_business_products_product_category
  ON public.business_products (business_id, product_category);

-- ============================================================================
-- 20240804000000_subscriptions.sql
-- Subscriptions & plan provisioning: plan columns on users (free Starter by
-- default), subscriptions table, and a trigger that stops users self-upgrading.
-- ============================================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan               text NOT NULL DEFAULT 'starter';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS creative_plan      text NOT NULL DEFAULT 'creative-starter';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan_status        text NOT NULL DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan_billing_cycle text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan_renews_at     timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan_updated_at    timestamptz DEFAULT now();

UPDATE public.users SET plan = 'starter'                   WHERE plan IS NULL;
UPDATE public.users SET creative_plan = 'creative-starter' WHERE creative_plan IS NULL;
UPDATE public.users SET plan_status = 'active'             WHERE plan_status IS NULL;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  kind           text NOT NULL DEFAULT 'business',
  tier           text NOT NULL,
  billing_cycle  text,
  status         text NOT NULL DEFAULT 'active',
  amount_usd     numeric,
  currency       text,
  payment_reference text,
  current_period_start timestamptz DEFAULT now(),
  current_period_end   timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_ref  ON public.subscriptions (payment_reference);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read their subscriptions" ON public.subscriptions;
CREATE POLICY "Owners read their subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins manage subscriptions" ON public.subscriptions;
CREATE POLICY "Admins manage subscriptions" ON public.subscriptions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.guard_user_plan_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.plan               := OLD.plan;
    NEW.creative_plan      := OLD.creative_plan;
    NEW.plan_status        := OLD.plan_status;
    NEW.plan_billing_cycle := OLD.plan_billing_cycle;
    NEW.plan_renews_at     := OLD.plan_renews_at;
    NEW.plan_updated_at    := OLD.plan_updated_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_user_plan_columns ON public.users;
CREATE TRIGGER guard_user_plan_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_plan_columns();

-- ============================================================================
-- 20240805000000_new_registration_trial.sql
-- 3-month all-access (Business Pro) trial for every NEW business registration.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := COALESCE(NEW.raw_user_meta_data->>'role', 'business');
  v_is_business boolean := v_role <> 'media_service';
BEGIN
  INSERT INTO public.users (
    id, email, role, phone,
    plan, plan_status, plan_billing_cycle, plan_renews_at, plan_updated_at
  )
  VALUES (
    NEW.id, NEW.email, v_role, NEW.raw_user_meta_data->>'phone',
    CASE WHEN v_is_business THEN 'business-pro' ELSE 'starter' END,
    CASE WHEN v_is_business THEN 'trialing'     ELSE 'active'  END,
    CASE WHEN v_is_business THEN 'trial'        ELSE NULL      END,
    CASE WHEN v_is_business THEN now() + interval '3 months'   ELSE NULL END,
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 20240806000000_business_enabled_modules.sql
-- Owner-selectable booking modules per business (NULL = all, legacy default).
-- ============================================================================
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS enabled_modules text[];
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS secondary_categories text[];

-- ============================================================================
-- 20240807000000_stream_delete_policy.sql
-- Owners can delete their own live streams regardless of business verification.
-- ============================================================================
DROP POLICY IF EXISTS "Owners delete their streams" ON public.business_streams;
CREATE POLICY "Owners delete their streams" ON public.business_streams
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id
        AND (b.user_id::text = auth.uid()::text OR public.is_admin())
    )
  );

-- ============================================================================
-- 20240808000000_trust_and_verification.sql
-- Business trust tiers + verification signals + verification_documents +
-- private verification-docs bucket + guard trigger (owners can't self-verify).
-- ============================================================================
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS email_verified        boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS phone_verified        boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS id_verified           boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS registration_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS address_verified      boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS documents_reviewed    boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS onsite_verified       boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS verification_tier      text    NOT NULL DEFAULT 'none';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS trust_score            integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.verification_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  doc_type    text NOT NULL,
  file_url    text,
  file_path   text,
  status      text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_docs_business ON public.verification_documents (business_id, status);
ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage their verification docs" ON public.verification_documents;
CREATE POLICY "Owners manage their verification docs" ON public.verification_documents
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.user_id::text = auth.uid()::text))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.user_id::text = auth.uid()::text));
DROP POLICY IF EXISTS "Admins manage verification docs" ON public.verification_documents;
CREATE POLICY "Admins manage verification docs" ON public.verification_documents
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES ('verification-docs', 'verification-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Owners upload verification docs" ON storage.objects;
CREATE POLICY "Owners upload verification docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Owners read own verification docs" ON storage.objects;
CREATE POLICY "Owners read own verification docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
DROP POLICY IF EXISTS "Owners delete own verification docs" ON storage.objects;
CREATE POLICY "Owners delete own verification docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'verification-docs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

CREATE OR REPLACE FUNCTION public.guard_business_verification_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
    NEW.verified              := OLD.verified;
    NEW.email_verified        := OLD.email_verified;
    NEW.phone_verified        := OLD.phone_verified;
    NEW.id_verified           := OLD.id_verified;
    NEW.registration_verified := OLD.registration_verified;
    NEW.address_verified      := OLD.address_verified;
    NEW.documents_reviewed    := OLD.documents_reviewed;
    NEW.onsite_verified       := OLD.onsite_verified;
    NEW.verification_tier     := OLD.verification_tier;
    NEW.trust_score           := OLD.trust_score;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_business_verification_columns ON public.businesses;
CREATE TRIGGER guard_business_verification_columns
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_verification_columns();

-- ============================================================================
-- 20240809000000_deletion_requests.sql
-- Owner→admin deletion approval workflow.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  entity_label text,
  reason       text,
  status       text NOT NULL DEFAULT 'pending',
  reviewed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON public.deletion_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_owner  ON public.deletion_requests (requester_id);
CREATE UNIQUE INDEX IF NOT EXISTS deletion_requests_pending_unique
  ON public.deletion_requests (entity_type, entity_id) WHERE status = 'pending';
ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners create deletion requests" ON public.deletion_requests;
CREATE POLICY "Owners create deletion requests" ON public.deletion_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);
DROP POLICY IF EXISTS "Owners read their deletion requests" ON public.deletion_requests;
CREATE POLICY "Owners read their deletion requests" ON public.deletion_requests
  FOR SELECT TO authenticated USING (auth.uid() = requester_id OR public.is_admin());
DROP POLICY IF EXISTS "Admins manage deletion requests" ON public.deletion_requests;
CREATE POLICY "Admins manage deletion requests" ON public.deletion_requests
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================================
-- 20240810000000_business_members.sql
-- Team roles & RBAC: business_members + membership helpers + additive member RLS.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.business_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email text,
  role          text NOT NULL DEFAULT 'staff',
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz DEFAULT now(),
  UNIQUE (business_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_business_members_user ON public.business_members (user_id, status);
CREATE INDEX IF NOT EXISTS idx_business_members_biz  ON public.business_members (business_id);
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage team" ON public.business_members;
CREATE POLICY "Owners manage team" ON public.business_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())));
DROP POLICY IF EXISTS "Members read own membership" ON public.business_members;
CREATE POLICY "Members read own membership" ON public.business_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_business_member(biz uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = biz AND b.user_id::text = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = biz AND m.user_id = auth.uid() AND m.status = 'active')
    OR public.is_admin();
$$;
CREATE OR REPLACE FUNCTION public.has_business_role(biz uuid, roles text[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = biz AND b.user_id::text = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = biz AND m.user_id = auth.uid() AND m.status = 'active' AND m.role = ANY(roles))
    OR public.is_admin();
$$;

DROP POLICY IF EXISTS "Members manage business services" ON public.business_services;
CREATE POLICY "Members manage business services" ON public.business_services
  FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
DROP POLICY IF EXISTS "Members manage business products" ON public.business_products;
CREATE POLICY "Members manage business products" ON public.business_products
  FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
DROP POLICY IF EXISTS "Members manage business gallery" ON public.business_gallery;
CREATE POLICY "Members manage business gallery" ON public.business_gallery
  FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
DROP POLICY IF EXISTS "Members manage business bookings" ON public.business_bookings;
CREATE POLICY "Members manage business bookings" ON public.business_bookings
  FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

CREATE OR REPLACE FUNCTION public.invite_business_member(biz uuid, member_email text, member_role text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; owns boolean; owner_id uuid;
BEGIN
  SELECT b.user_id INTO owner_id FROM public.businesses b WHERE b.id = biz;
  owns := (owner_id::text = auth.uid()::text) OR public.is_admin();
  IF NOT owns THEN RETURN 'forbidden'; END IF;
  SELECT id INTO target FROM public.users WHERE lower(email) = lower(trim(member_email)) LIMIT 1;
  IF target IS NULL THEN RETURN 'no_user'; END IF;
  IF target = owner_id THEN RETURN 'is_owner'; END IF;
  INSERT INTO public.business_members (business_id, user_id, invited_email, role, status)
  VALUES (biz, target, lower(trim(member_email)), member_role, 'active')
  ON CONFLICT (business_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', invited_email = EXCLUDED.invited_email;
  RETURN 'added';
END;
$$;

-- ============================================================================
-- 20240811000000_account_security.sql
-- login_events (per-user sign-in history) + audit_log (admin actions).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.login_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event      text NOT NULL DEFAULT 'sign_in',
  user_agent text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_events_user ON public.login_events (user_id, created_at DESC);
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own login events" ON public.login_events;
CREATE POLICY "Users read own login events" ON public.login_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users record own login events" ON public.login_events;
CREATE POLICY "Users record own login events" ON public.login_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action      text NOT NULL,
  entity_type text,
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log (created_at DESC);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read audit log" ON public.audit_log;
CREATE POLICY "Admins read audit log" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins write audit log" ON public.audit_log;
CREATE POLICY "Admins write audit log" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND actor_id = auth.uid());

-- ===========================================================================
-- 20240812000000_onboarding_deliveries.sql
-- Ledger for the automatic welcome-pack email + WhatsApp (send-onboarding fn),
-- so deliveries are de-duplicated and never double-sent.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text,
  phone           text,
  email_status    text NOT NULL DEFAULT 'skipped',
  whatsapp_status text NOT NULL DEFAULT 'skipped',
  created_at      timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_deliveries_user
  ON public.onboarding_deliveries (user_id);
ALTER TABLE public.onboarding_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own onboarding delivery" ON public.onboarding_deliveries;
CREATE POLICY "Users read own onboarding delivery" ON public.onboarding_deliveries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins read onboarding deliveries" ON public.onboarding_deliveries;
CREATE POLICY "Admins read onboarding deliveries" ON public.onboarding_deliveries
  FOR SELECT TO authenticated USING (public.is_admin());

-- ===========================================================================
-- 20240813000000_admin_plan_and_notifications.sql
-- Let admins change user plans (relax the plan-column guard) + notifications.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.guard_user_plan_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
    NEW.plan               := OLD.plan;
    NEW.creative_plan      := OLD.creative_plan;
    NEW.plan_status        := OLD.plan_status;
    NEW.plan_billing_cycle := OLD.plan_billing_cycle;
    NEW.plan_renews_at     := OLD.plan_renews_at;
    NEW.plan_updated_at    := OLD.plan_updated_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text,
  type       text NOT NULL DEFAULT 'info',
  link       text,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own notifications" ON public.notifications;
CREATE POLICY "Read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS "Update own notifications" ON public.notifications;
CREATE POLICY "Update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS "Create notifications" ON public.notifications;
CREATE POLICY "Create notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() OR auth.uid() = user_id);
DROP POLICY IF EXISTS "Delete own notifications" ON public.notifications;
CREATE POLICY "Delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- ===========================================================================
-- 20240814000000_automation.sql
-- Ledger for the merchant automation engine (run-automations edge function):
-- de-dupes booking reminders, review requests, trial nudges, low-stock alerts.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.automation_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  ref_id      text NOT NULL,
  business_id uuid,
  detail      jsonb,
  created_at  timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_log_kind_ref
  ON public.automation_log (kind, ref_id);
ALTER TABLE public.automation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read automation log" ON public.automation_log;
CREATE POLICY "Admins read automation log" ON public.automation_log
  FOR SELECT TO authenticated USING (public.is_admin());

-- ===========================================================================
-- 20240815000000_social_publish.sql
-- Social publishing connections (real OAuth): tokens held server-side only,
-- one-time handshakes, idempotent publish log, and a public media staging bucket.
-- ===========================================================================
/*
  # Social publishing connections (real OAuth)

  Backing store for the Studio's Schedule & Publish tool so it can post to
  Instagram, Facebook, LinkedIn, X and TikTok for real instead of simulating
  delivery.

  Three tables:
    - social_connections   OAuth tokens + account metadata per (business, channel).
    - social_auth_pending  One-time OAuth handshake records (nonce, PKCE
                           verifier) so the provider callback can complete a
                           login that started with an authenticated request.
    - social_publish_log   What actually got posted where, keyed by (job, channel)
                           so a publish is idempotent and auditable.

  Security model: RLS is ON with no owner-facing policies — only the service
  role (the social-auth / social-publish edge functions) can touch the tables,
  so OAuth access tokens can never be read from the browser. Owners see their
  connection metadata through the security-definer get_my_social_connections().
*/

-- ---------------------------------------------------------------------------
-- 1. OAuth connections
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.social_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider IN ('instagram','facebook','linkedin','x','tiktok')),
  -- Platform-side id of the account/page (Instagram business account id,
  -- Facebook page id, LinkedIn person id, X user id, TikTok open_id).
  account_id        text NOT NULL,
  -- Display name / handle for the UI.
  account_name      text,
  -- Tokens. Never exposed to the client. Stored plaintext at rest for now;
  -- encrypt at the column level (e.g. pgsodium) before go-live.
  access_token      text NOT NULL,
  refresh_token     text,
  token_expires_at  timestamptz,
  scope             text,
  -- Provider-specific snapshot (avatar url, page token, ...).
  meta              jsonb,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (business_id, provider, account_id)
);

CREATE INDEX IF NOT EXISTS idx_social_connections_owner
  ON public.social_connections (business_id, user_id);

CREATE INDEX IF NOT EXISTS idx_social_connections_provider
  ON public.social_connections (provider);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: tokens are only ever read/written with the service
-- role from the edge functions.

-- Owners list their own connections (metadata only, never tokens) through a
-- security-definer helper so the browser never touches the table directly.
CREATE OR REPLACE FUNCTION public.get_my_social_connections()
RETURNS TABLE (
  business_id   uuid,
  provider      text,
  account_id    text,
  account_name  text,
  connected_at  timestamptz
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT sc.business_id, sc.provider, sc.account_id, sc.account_name, sc.created_at
  FROM public.social_connections sc
  WHERE sc.user_id = auth.uid()
  ORDER BY sc.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_social_connections() TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_social_connections_touch ON public.social_connections;
CREATE TRIGGER trg_social_connections_touch
  BEFORE UPDATE ON public.social_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. One-time OAuth handshake records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.social_auth_pending (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text NOT NULL,
  business_id      uuid NOT NULL,
  user_id          uuid NOT NULL,
  nonce            text NOT NULL UNIQUE,
  -- PKCE code verifier (X requires PKCE). Deleted once the callback completes.
  code_verifier    text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.social_auth_pending ENABLE ROW LEVEL SECURITY;
-- Service role only, same as above.

CREATE INDEX IF NOT EXISTS idx_social_auth_pending_nonce
  ON public.social_auth_pending (nonce);

-- Handshakes older than 10 minutes can never complete — sweep them lazily on
-- every new handshake.
CREATE OR REPLACE FUNCTION public.prune_social_auth_pending()
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  DELETE FROM public.social_auth_pending
  WHERE created_at < now() - interval '10 minutes';
$$;

GRANT EXECUTE ON FUNCTION public.prune_social_auth_pending() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Publish log (idempotency + audit)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.social_publish_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL,
  user_id       uuid,
  job_id        text NOT NULL,          -- client-side queue job id
  channel       text NOT NULL,          -- instagram | facebook | linkedin | x | tiktok
  status        text NOT NULL,          -- ok | error | simulated
  external_id   text,                   -- platform post id when available
  message       text,
  error         text,
  simulated     boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (job_id, channel)
);

ALTER TABLE public.social_publish_log ENABLE ROW LEVEL SECURITY;

-- Service role writes; owners can read their own publish history.
DROP POLICY IF EXISTS "Owners read publish log" ON public.social_publish_log;
CREATE POLICY "Owners read publish log" ON public.social_publish_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read publish log" ON public.social_publish_log;
CREATE POLICY "Admins read publish log" ON public.social_publish_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Public staging bucket for post media
-- ---------------------------------------------------------------------------

-- Posts are attached as data URLs in the browser; the social-publish function
-- stages them here (service role) to hand each platform a public image_url.
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-media', 'social-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view social media staging" ON storage.objects;
CREATE POLICY "Public can view social media staging" ON storage.objects
  FOR SELECT USING (bucket_id = 'social-media');


-- ===== 20260808000000_device_push_tokens_scoped_update.sql =====
-- Scope push-token updates to the owning user (C5). Previously any caller with
-- the public anon key could PATCH every row; now only an authenticated user may
-- update their own row. Registration stays open — the token is the opaque
-- device identifier. Full rationale in supabase/migrations/.
DROP POLICY IF EXISTS "Anyone can update a push token" ON device_push_tokens;
CREATE POLICY "Users update their own push token" ON device_push_tokens
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- ===== 20260808010000_os_workforce.sql =====
-- NowOpen OS: orgs + workforce directory. Internal-first: admins read/write.
-- Seeds the NowOpen Africa org and the AI team roster.
CREATE TABLE IF NOT EXISTS os_orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE os_orgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read orgs" ON os_orgs;
CREATE POLICY "Admins read orgs" ON os_orgs
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS os_workforce (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('human', 'ai')),
  name text NOT NULL,
  title text NOT NULL,
  department text NOT NULL CHECK (department IN (
    'Founder Office', 'Strategy & BI', 'Marketing & Growth', 'Social Media',
    'Communications & PR', 'Creative & Brand', 'Production', 'Post Production',
    'Sales & Business Development', 'Operations', 'Finance',
    'Product & Engineering', 'Customer Success', 'Trust & Safety'
  )),
  status text NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'working', 'waiting', 'blocked', 'awaiting-approval',
    'off-schedule', 'error', 'clocked-in', 'in-meeting', 'on-break',
    'away', 'clocked-out'
  )),
  current_work text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_key text,
  kpis jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, name)
);

ALTER TABLE os_workforce ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read workforce" ON os_workforce;
CREATE POLICY "Admins read workforce" ON os_workforce
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write workforce" ON os_workforce;
CREATE POLICY "Admins write workforce" ON os_workforce
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update workforce" ON os_workforce;
CREATE POLICY "Admins update workforce" ON os_workforce
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete workforce" ON os_workforce;
CREATE POLICY "Admins delete workforce" ON os_workforce
  FOR DELETE TO authenticated USING (public.is_admin());

INSERT INTO os_orgs (id, slug, name)
VALUES ('00000000-0000-4000-8000-00000000a001', 'nowopen-africa', 'NowOpen Africa')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO os_workforce (org_id, kind, name, title, department, status, agent_key, current_work)
VALUES
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Chief of Staff', 'Chief of Staff', 'Founder Office', 'active', 'chief-of-staff', 'Synthesizes the daily brief for the founder; tracks priorities, blockers and approvals.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Strategy Director', 'Strategy Director', 'Strategy & BI', 'active', 'strategy-director', 'Watches the market and the five launch KPIs; drafts the quarterly plan.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Research Analyst', 'Research Analyst', 'Strategy & BI', 'active', 'research-analyst', 'Gathers market and competitor intelligence for the strategy and growth teams.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Growth Director', 'Growth Director', 'Marketing & Growth', 'active', 'growth-director', 'Plans acquisition experiments that move profile impressions, signups and leads.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'SEO Manager', 'SEO Manager', 'Marketing & Growth', 'active', 'seo-manager', 'Owns discoverability: on-page SEO, sitemaps and search console feedback.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Social Director', 'Social Director', 'Social Media', 'active', 'social-director', 'Runs the content calendar and publishing across every NowOpen channel.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Content Manager', 'Content Manager', 'Social Media', 'active', 'content-manager', 'Turns briefs into posts, series and engagement; keeps every channel on voice.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Communications Director', 'Communications Director', 'Communications & PR', 'active', 'comms-director', 'Drafts announcements and press material; anything public goes through human approval.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Creative Director', 'Creative Director', 'Creative & Brand', 'active', 'creative-director', 'Owns the NowOpen look: campaign concepts, design direction and the design system.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Copywriter', 'Copywriter', 'Creative & Brand', 'active', 'copywriter', 'Writes marketing, landing-page, email and campaign copy in the NowOpen voice.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Production Manager', 'Production Manager', 'Production', 'active', 'production-manager', 'Turns concepts into scripts, storyboards, shot lists and production plans.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Post Supervisor', 'Post Supervisor', 'Post Production', 'active', 'post-supervisor', 'Checks every video before delivery: captions, ratio versions, colour and sound.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Sales Director', 'Sales Director', 'Sales & Business Development', 'active', 'sales-director', 'Scores prospects, prepares proposals and tracks the partnership pipeline.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Operations Director', 'Operations Director', 'Operations', 'active', 'operations-director', 'Runs daily operations: SOPs, vendors, service delivery and internal workflows.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Finance Analyst', 'Finance Analyst', 'Finance', 'active', 'finance-analyst', 'Tracks revenue, expenses and cash flow; prepares monthly finance reporting for approval.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Product Manager', 'Product Manager', 'Product & Engineering', 'active', 'product-manager', 'Owns the roadmap, gathers feedback and keeps launches on track.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Customer Success Manager', 'Customer Success Manager', 'Customer Success', 'active', 'customer-success-manager', 'Onboards businesses and watches for drop-off; nudges owners before they churn.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Trust & Safety Agent', 'Trust & Safety Agent', 'Trust & Safety', 'active', 'trust-safety-agent', 'Reviews verification and flags suspicious activity; enforcement escalates to a human.')
ON CONFLICT (org_id, name) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_workforce_org_idx ON os_workforce (org_id);
CREATE INDEX IF NOT EXISTS os_workforce_department_idx ON os_workforce (org_id, department);


-- ===== 20260808020000_os_work.sql =====
-- OS-2: projects, tasks and goals assigned to the team. Admin-only, seeded
-- with the first NowOpen work items (the ones that move the five launch KPIs).
CREATE TABLE IF NOT EXISTS os_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('project', 'task', 'goal')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'waiting', 'blocked', 'done', 'cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  department text NOT NULL CHECK (department IN (
    'Founder Office', 'Strategy & BI', 'Marketing & Growth', 'Social Media',
    'Communications & PR', 'Creative & Brand', 'Production', 'Post Production',
    'Sales & Business Development', 'Operations', 'Finance',
    'Product & Engineering', 'Customer Success', 'Trust & Safety'
  )),
  assignee_id uuid REFERENCES os_workforce(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, title)
);

ALTER TABLE os_work_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read work items" ON os_work_items;
CREATE POLICY "Admins read work items" ON os_work_items
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write work items" ON os_work_items;
CREATE POLICY "Admins write work items" ON os_work_items
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update work items" ON os_work_items;
CREATE POLICY "Admins update work items" ON os_work_items
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete work items" ON os_work_items;
CREATE POLICY "Admins delete work items" ON os_work_items
  FOR DELETE TO authenticated USING (public.is_admin());

INSERT INTO os_work_items (org_id, kind, title, status, priority, department, assignee_id, due_at, description)
SELECT o.id, s.kind, s.title, s.status, s.priority, s.department, w.id, s.due_at, s.description
FROM (VALUES
  ('project', 'Africa is NowOpen — campaign build', 'in_progress', 'high', 'Marketing & Growth', 'growth-director', now() + interval '10 days', 'Landing page, creative assets, ads and launch email for the platform campaign.'),
  ('task', 'August social content calendar', 'in_progress', 'medium', 'Social Media', 'social-director', now() + interval '5 days', 'Calendar, captions and scheduled posts across every NowOpen channel.'),
  ('project', 'Ship the OS work layer', 'todo', 'high', 'Product & Engineering', 'product-manager', now() + interval '21 days', 'Projects, tasks and goals assigned to the team — this board.'),
  ('task', 'Draft Q3 strategy brief', 'blocked', 'high', 'Strategy & BI', 'strategy-director', now() + interval '3 days', 'Blocked on market data from the Research Analyst.'),
  ('goal', 'Verify 10 new businesses this week', 'in_progress', 'high', 'Trust & Safety', 'trust-safety-agent', now() + interval '7 days', 'Trust metric: verification turnaround stays under 24 hours.'),
  ('task', 'Monthly finance report', 'waiting', 'medium', 'Finance', 'finance-analyst', now() + interval '12 days', 'Revenue, expenses and cash flow summary for human approval.')
) AS s(kind, title, status, priority, department, agent_key, due_at, description)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
JOIN os_workforce w ON w.org_id = o.id AND w.agent_key = s.agent_key
ON CONFLICT (org_id, title) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_work_items_org_idx ON os_work_items (org_id, status);
CREATE INDEX IF NOT EXISTS os_work_items_assignee_idx ON os_work_items (org_id, assignee_id);

-- ===== 20260808030000_os_approvals.sql =====
-- OS-3: approvals hub — agent-finished work queued for a human to sign off.
-- One decision per work item; the admin console moves the work item and the
-- requesting agent back onto the ledger when a decision is made.
CREATE TABLE IF NOT EXISTS os_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  work_item_id uuid NOT NULL REFERENCES os_work_items(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES os_workforce(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_note text,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, work_item_id)
);

-- OS-14: reject-with-note — an existing database picks up the new column too.
ALTER TABLE os_approvals ADD COLUMN IF NOT EXISTS decision_note text;

ALTER TABLE os_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read approvals" ON os_approvals;
CREATE POLICY "Admins read approvals" ON os_approvals
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write approvals" ON os_approvals;
CREATE POLICY "Admins write approvals" ON os_approvals
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update approvals" ON os_approvals;
CREATE POLICY "Admins update approvals" ON os_approvals
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete approvals" ON os_approvals;
CREATE POLICY "Admins delete approvals" ON os_approvals
  FOR DELETE TO authenticated USING (public.is_admin());

INSERT INTO os_approvals (org_id, work_item_id, requested_by, reason)
SELECT o.id, w.id, w.assignee_id, a.reason
FROM (VALUES
  ('Monthly finance report', 'Revenue, expenses and cash flow summary for human approval.'),
  ('Draft Q3 strategy brief', 'Strategy must be signed off before it becomes the quarterly plan.'),
  ('August social content calendar', 'Public posts go live only after a human approves the calendar.')
) AS a(title, reason)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
JOIN os_work_items w ON w.org_id = o.id AND w.title = a.title
ON CONFLICT (org_id, work_item_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_approvals_org_idx ON os_approvals (org_id, status);
CREATE INDEX IF NOT EXISTS os_approvals_work_item_idx ON os_approvals (org_id, work_item_id);

-- ====================================================================
-- OS-4 appended below
-- ====================================================================

-- OS-4 — the knowledge base sync: every SOP the team follows lives in one
-- table, and human sign-offs recorded on os_approvals are written back here
-- as 'decision' docs so approved work becomes institutional memory.
-- Same tenant shape as the rest of the OS. Seeds are the 14 SOPs the Internal
-- Knowledge Base section used to hardcode; the section now reads them live
-- and falls back to its bundled copy only when the DB is unreachable.

CREATE TABLE IF NOT EXISTS os_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('Brand', 'Engineering', 'Marketing', 'Design', 'Growth', 'Legal', 'Finance', 'Support')),
  title text NOT NULL,
  summary text NOT NULL,
  body text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  -- 'sop' = the standing playbooks, 'decision' = a sign-off synced from
  -- os_approvals, 'manual' = written by an admin.
  source text NOT NULL DEFAULT 'sop' CHECK (source IN ('sop', 'decision', 'manual')),
  -- For 'decision' docs: the work item that was approved or sent back.
  linked_work_item_id uuid REFERENCES os_work_items(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, title)
);

ALTER TABLE os_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read knowledge" ON os_knowledge;
CREATE POLICY "Admins read knowledge" ON os_knowledge
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write knowledge" ON os_knowledge;
CREATE POLICY "Admins write knowledge" ON os_knowledge
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update knowledge" ON os_knowledge;
CREATE POLICY "Admins update knowledge" ON os_knowledge
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete knowledge" ON os_knowledge;
CREATE POLICY "Admins delete knowledge" ON os_knowledge
  FOR DELETE TO authenticated USING (public.is_admin());

-- Seed: the 14 SOPs the Internal Knowledge Base section renders by default.
-- Idempotent — re-running on an existing install leaves admin-written docs alone.
INSERT INTO os_knowledge (org_id, category, title, summary, body, tags)
SELECT o.id, s.category, s.title, s.summary, s.body, s.tags
FROM (VALUES
  ('Brand', 'Brand voice', 'How NowOpen talks — friendly, concrete, never corporate.', ARRAY[
    'Write like a helpful colleague: short sentences, plain words, no jargon.',
    'Lead with the concrete benefit, then the detail.',
    'Use "you" for the business owner and "we" for NowOpen.',
    'One emoji max in social copy; none in product UI.'], ARRAY['voice', 'copy', 'tone']),
  ('Brand', 'Logo & mark usage', 'The mark, clearspace and when to use the gradient.', ARRAY[
    'The NowOpen mark is the single source of truth — never redraw or recolor it.',
    'Keep clearspace of half the mark height on every side.',
    'Use the purple→blue gradient for primary surfaces and CTAs.',
    'On dark backgrounds use the white mark; on light, the full-color mark.'], ARRAY['logo', 'mark', 'usage']),
  ('Engineering', 'Deploy checklist', 'What to run before shipping any change.', ARRAY[
    'Run tsc --noEmit and the full test suite — both must be green.',
    'Smoke-check the touched routes on the dev server.',
    'Update the Launch Control board with the checklist status.',
    'Draft release notes in the same PR.'], ARRAY['deploy', 'qa', 'release']),
  ('Engineering', 'Local-first data rules', 'Why some data lives in localStorage and how to scan it.', ARRAY[
    'Per-business Studio tools write to nowopen_publisher_*, nowopen_videos_*, nowopen_campaigns_* keys.',
    'The admin Creator scans those via scanPipelineLocal so the internal views always reflect real activity.',
    'New local stores must keep the nowopen_ prefix and be JSON.'], ARRAY['localstorage', 'data', 'pipeline']),
  ('Marketing', 'Campaign launch playbook', 'The 7-day run-up to any platform campaign.', ARRAY[
    'Day 1: choose the industry packs from the Video Template Library.',
    'Day 2: create assets in the Creative Studio.',
    'Day 3: publish the first teaser post.',
    'Day 5: email the list and open the marketplace.',
    'Day 7: go live and track in the Analytics War Room.'], ARRAY['campaign', 'launch', 'playbook']),
  ('Marketing', 'The content cadence', 'The weekly posting rhythm we recommend businesses.', ARRAY[
    'Post 3x a week: one offer, one proof (photo/review), one story.',
    'Schedule a week ahead so nothing goes dark on weekends.',
    'Every post carries a hook in the first two words.'], ARRAY['content', 'cadence', 'social']),
  ('Design', 'Design tokens', 'Where colours, type and spacing live.', ARRAY[
    'The Design System section is the living source of truth — update it, not a screenshot.',
    'Spacing runs on the 4px grid; 8–24px for most gaps.',
    'Cards use a 1px border; modals use shadow-lg.'], ARRAY['design', 'tokens', 'styleguide']),
  ('Design', 'Template standards', 'What every template card must include.', ARRAY[
    'An emoji, a tier (free/pro), duration in days and channels.',
    'A one-sentence description that sells the outcome.',
    'A colour palette pulled from the industry data, never hardcoded.'], ARRAY['templates', 'standards']),
  ('Growth', 'Onboarding review', 'The approval queue SOP.', ARRAY[
    'Check verification docs, registrations and enquiries daily.',
    'Approve businesses whose docs match their profile category.',
    'Escalate anything that looks like fraud to the trust channel.'], ARRAY['onboarding', 'approval', 'sop']),
  ('Growth', 'Partnership pipeline', 'How we move a partner from proposal to active.', ARRAY[
    'Proposal: agree the shared goal in one sentence.',
    'Negotiation: scope, timing and who owns what.',
    'Active: launch a campaign pack together and track it.',
    'Alumni: keep warm — alumni partners re-engage fastest.'], ARRAY['partners', 'crm', 'pipeline']),
  ('Legal', 'Privacy & data handling', 'What the team may store and share.', ARRAY[
    'Never paste customer data into external AI tools.',
    'Only the admin console may read full user records.',
    'Platform enquiries are visible to admins only (RLS).'], ARRAY['privacy', 'legal', 'data']),
  ('Finance', 'Reading the revenue board', 'What the Command Center money numbers mean.', ARRAY[
    'Revenue today = paid payment_intents created today.',
    'Pending = unpaid intents, not revenue yet.',
    'Currency is stored per intent — always show the local symbol.'], ARRAY['revenue', 'finance', 'dashboard']),
  ('Support', 'Enquiry first response', 'The SLA and tone for every platform enquiry.', ARRAY[
    'Reply within 4 working hours.',
    'Open with their name and what they asked about.',
    'Answer in the same channel they used, then log to Community Management.'], ARRAY['support', 'enquiry', 'sla']),
  ('Support', 'Verification support', 'Helping a business through the verified badge.', ARRAY[
    'Walk them through the required documents one by one.',
    'Explain the badge improves search and trust signals.',
    'If a doc is rejected, tell them exactly why and what to resubmit.'], ARRAY['support', 'verification'])
) AS s(category, title, summary, body, tags)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
ON CONFLICT (org_id, title) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_knowledge_org_idx ON os_knowledge (org_id, category);
CREATE INDEX IF NOT EXISTS os_knowledge_source_idx ON os_knowledge (org_id, source);


-- ====================================================================
-- OS-6 appended below
-- ====================================================================

-- OS-6 — launch control: every feature launch on one board. A launch carries
-- the standard checklist (design, QA, marketing, videos, emails, docs, release
-- notes, rollout) as a boolean array that admins tick off, and its status is
-- derived from those ticks — never stored, so the board is always honest.
-- Same tenant shape as the rest of the OS. The 3 rows the section used to
-- hardcode are seeded here; the section reads them live and falls back to its
-- bundled copy only when the DB is unreachable.

CREATE TABLE IF NOT EXISTS os_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  area text NOT NULL DEFAULT 'Unassigned',
  target text NOT NULL DEFAULT 'TBA',
  -- One boolean per checklist item, in the same order as LAUNCH_CHECKLIST.
  checklist_done boolean[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, name)
);

ALTER TABLE os_launches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read launches" ON os_launches;
CREATE POLICY "Admins read launches" ON os_launches
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write launches" ON os_launches;
CREATE POLICY "Admins write launches" ON os_launches
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update launches" ON os_launches;
CREATE POLICY "Admins update launches" ON os_launches
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete launches" ON os_launches;
CREATE POLICY "Admins delete launches" ON os_launches
  FOR DELETE TO authenticated USING (public.is_admin());

-- Seed: the launches Launch Control used to hardcode. Idempotent.
INSERT INTO os_launches (org_id, name, area, target, checklist_done)
SELECT o.id, s.name, s.area, s.target, s.checklist_done
FROM (VALUES
  ('AI Video Studio', 'Product · Media', 'Aug 2026', ARRAY[true, true, true, true, true, true, true]),
  ('Verified Badge', 'Trust & Safety', 'Mar 2026', ARRAY[true, true, true, true, true, true, true]),
  ('Restaurant Week 2026', 'Growth · Campaigns', 'Sep 2026', ARRAY[true, false, false, false, false, false, false])
) AS s(name, area, target, checklist_done)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
ON CONFLICT (org_id, name) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_launches_org_idx ON os_launches (org_id, created_at);


-- OS-7 — os_partners

-- OS-7 — partnership CRM: investors, media, government, creators, agencies,
-- sponsors and universities moved through a proposal → negotiation → active →
-- alumni pipeline. Stage is stored as the truth here (a partner moves when a
-- deal actually moves), and the summary counts are derived from it. Same
-- tenant shape as the rest of the OS. The rows the section used to keep in
-- localStorage are seeded; the section reads them live and falls back to its
-- bundled copy only when the DB is unreachable.

CREATE TABLE IF NOT EXISTS os_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  note text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'Proposal'
    CHECK (stage IN ('Proposal', 'Negotiation', 'Active', 'Alumni')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, name),
  CONSTRAINT os_partners_type_check
    CHECK (type IN ('Investor', 'Media', 'Government', 'Creator', 'Agency', 'Sponsor', 'University'))
);

ALTER TABLE os_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read partners" ON os_partners;
CREATE POLICY "Admins read partners" ON os_partners
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write partners" ON os_partners;
CREATE POLICY "Admins write partners" ON os_partners
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update partners" ON os_partners;
CREATE POLICY "Admins update partners" ON os_partners
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete partners" ON os_partners;
CREATE POLICY "Admins delete partners" ON os_partners
  FOR DELETE TO authenticated USING (public.is_admin());

-- Seed: the partnership pipeline, one partner per stage so the board reads
-- like a real funnel. Idempotent.
INSERT INTO os_partners (org_id, name, type, note, stage)
SELECT o.id, s.name, s.type, s.note, s.stage
FROM (VALUES
  ('Aurora Growth Fund', 'Investor', 'Late-stage funding conversations for the Creator Studio.', 'Proposal'),
  ('TechCabal', 'Media', 'Co-announce the Restaurant Week 2026 launch together.', 'Negotiation'),
  ('Lagos Business School', 'University', 'Creator economy case study — joint research sprint.', 'Active'),
  ('Magnet Agency', 'Agency', 'Past campaigns with our creator network.', 'Alumni')
) AS s(name, type, note, stage)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
ON CONFLICT (org_id, name) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_partners_org_idx ON os_partners (org_id, stage, created_at);

-- OS-9 — os_press

-- OS-9 — press room: the news timeline as a live press-and-coverage ledger.
-- A press item is a press release or a piece of coverage, with the outlet,
-- its status (draft / scheduled / published) and when it went live. The three
-- stories the section used to hardcode are seeded here, tied to the same real
-- launches that sit on os_launches. Same tenant shape as the rest of the OS;
-- the section reads them live and falls back to its bundled copy only when
-- the DB is unreachable.

CREATE TABLE IF NOT EXISTS os_press (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  headline text NOT NULL,
  outlet text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'release'
    CHECK (kind IN ('release', 'coverage')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published')),
  published_at timestamptz,
  url text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, headline)
);

ALTER TABLE os_press ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read press" ON os_press;
CREATE POLICY "Admins read press" ON os_press
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write press" ON os_press;
CREATE POLICY "Admins write press" ON os_press
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update press" ON os_press;
CREATE POLICY "Admins update press" ON os_press
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete press" ON os_press;
CREATE POLICY "Admins delete press" ON os_press
  FOR DELETE TO authenticated USING (public.is_admin());

-- Seed: the stories the press room used to hardcode, matching the launches
-- already on os_launches. Idempotent.
INSERT INTO os_press (org_id, headline, outlet, kind, status, published_at, url, summary)
SELECT o.id, s.headline, s.outlet, s.kind, s.status, s.published_at, s.url, s.summary
FROM (VALUES
  ('NowOpen Africa launches the AI Video Studio', 'NowOpen Africa', 'release', 'published', '2026-08-01T09:00:00Z', 'https://www.nowopen.africa/press/ai-video-studio', 'Businesses now turn one idea into a full video campaign — script, voiceover, captions and export — without leaving the platform.'),
  ('Restaurant Week returns for its biggest run', 'Restaurant Week', 'coverage', 'published', '2026-06-15T09:00:00Z', 'https://www.nowopen.africa/press/restaurant-week-2026', 'Hundreds of restaurants across Nigeria served record footfall through the platform''s launch-week playbook.'),
  ('Verified badge rolls out nationwide', 'NowOpen Africa', 'release', 'published', '2026-03-10T09:00:00Z', 'https://www.nowopen.africa/press/verified-badge', 'Document-based verification now protects the trusted signal behind every NowOpen profile.')
) AS s(headline, outlet, kind, status, published_at, url, summary)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
ON CONFLICT (org_id, headline) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_press_org_idx ON os_press (org_id, status, published_at);

-- OS-10 — campaign factory: platform-wide campaigns as a live ledger.
-- A platform campaign (Africa is NowOpen, Restaurant Week, Tailor Week) moves
-- through idea → planning → in_build → live → wrapped, with its focus, audience,
-- channels and run window. Same tenant shape as the rest of the OS; the section
-- reads them live and falls back to its bundled seed only when the DB is
-- unreachable. Performance is derived from real platform data, never seeded.

CREATE TABLE IF NOT EXISTS os_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  focus text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  channels text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea', 'planning', 'in_build', 'live', 'wrapped')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, slug)
);

ALTER TABLE os_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read campaigns" ON os_campaigns;
CREATE POLICY "Admins read campaigns" ON os_campaigns
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write campaigns" ON os_campaigns;
CREATE POLICY "Admins write campaigns" ON os_campaigns
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update campaigns" ON os_campaigns;
CREATE POLICY "Admins update campaigns" ON os_campaigns
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete campaigns" ON os_campaigns;
CREATE POLICY "Admins delete campaigns" ON os_campaigns
  FOR DELETE TO authenticated USING (public.is_admin());

-- Seed: the platform campaigns the section promised in its blurb, mirroring
-- the Restaurant Week 2026 launch already on os_launches. Idempotent.
INSERT INTO os_campaigns (org_id, slug, name, focus, audience, channels, status, starts_at, ends_at)
SELECT o.id, s.slug, s.name, s.focus, s.audience, s.channels, s.status, s.starts_at, s.ends_at
FROM (VALUES
  ('africa-is-nowopen', 'Africa is NowOpen', 'Open every African business on the map', 'Business owners across Africa', ARRAY['Social', 'Email', 'SMS', 'Press'], 'live', '2026-01-15T09:00:00Z', NULL),
  ('restaurant-week-2026', 'Restaurant Week 2026', 'The biggest restaurant run of the year', 'Restaurants in Nigeria', ARRAY['Social', 'WhatsApp', 'Email'], 'in_build', '2026-09-14T09:00:00Z', '2026-09-20T09:00:00Z'),
  ('tailor-week-2026', 'Tailor Week', 'Fashion and tailoring, platform-wide', 'Fashion businesses', ARRAY['Social', 'Email'], 'planning', '2026-11-02T09:00:00Z', NULL)
) AS s(slug, name, focus, audience, channels, status, starts_at, ends_at)
JOIN os_orgs o ON o.slug = 'nowopen-africa'
ON CONFLICT (org_id, slug) DO NOTHING;

CREATE INDEX IF NOT EXISTS os_campaigns_org_idx ON os_campaigns (org_id, status, starts_at);

-- ===== 20260808070000_os_snapshots.sql =====
-- NowOpen OS: snapshot history. Rows are derived — the health score and the raw
-- count of every ledger at a point in time, written by the OS views each time
-- they load. Never seeded; history only ever records what the ledgers said.
CREATE TABLE IF NOT EXISTS os_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  health integer NOT NULL CHECK (health >= 0 AND health <= 100),
  ledgers jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, snapshot_date)
);

ALTER TABLE os_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read snapshots" ON os_snapshots;
CREATE POLICY "Admins read snapshots" ON os_snapshots
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write snapshots" ON os_snapshots;
CREATE POLICY "Admins write snapshots" ON os_snapshots
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update snapshots" ON os_snapshots;
CREATE POLICY "Admins update snapshots" ON os_snapshots
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete snapshots" ON os_snapshots;
CREATE POLICY "Admins delete snapshots" ON os_snapshots
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS os_snapshots_org_date_idx ON os_snapshots (org_id, snapshot_date);

-- ===== 20260808080000_os_org_model_20.sql =====
-- OS-15: the org grows from 14 to 20 departments, and six new AI agents join
-- the roster. Widening an inline CHECK on an existing table means dropping and
-- recreating the constraint — safe and idempotent because it re-asserts the
-- full allowed set each time. New agents mirror AI_ROSTER_SEED in src/lib.
ALTER TABLE os_workforce DROP CONSTRAINT IF EXISTS os_workforce_department_check;
ALTER TABLE os_workforce ADD CONSTRAINT os_workforce_department_check CHECK (department IN (
  'Founder Office', 'Strategy & BI', 'Marketing & Growth', 'Social Media',
  'Communications & PR', 'Creative & Brand', 'Production', 'Post Production',
  'Sales & Business Development', 'Operations', 'Finance',
  'Product & Engineering', 'Customer Success', 'Trust & Safety',
  'Email & Customer Communications', 'Community & Culture', 'Partnerships',
  'Product Design', 'Motion Design', 'Data & Analytics'
));

ALTER TABLE os_work_items DROP CONSTRAINT IF EXISTS os_work_items_department_check;
ALTER TABLE os_work_items ADD CONSTRAINT os_work_items_department_check CHECK (department IN (
  'Founder Office', 'Strategy & BI', 'Marketing & Growth', 'Social Media',
  'Communications & PR', 'Creative & Brand', 'Production', 'Post Production',
  'Sales & Business Development', 'Operations', 'Finance',
  'Product & Engineering', 'Customer Success', 'Trust & Safety',
  'Email & Customer Communications', 'Community & Culture', 'Partnerships',
  'Product Design', 'Motion Design', 'Data & Analytics'
));

INSERT INTO os_workforce (org_id, kind, name, title, department, status, agent_key, current_work)
VALUES
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Email Marketing Manager', 'Email Marketing Manager', 'Email & Customer Communications', 'active', 'email-marketing-manager', 'Writes, segments and schedules retention email and newsletters; measures opens and clicks.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Community Manager', 'Community Manager', 'Community & Culture', 'active', 'community-manager', 'Runs events, keeps the community calendar and turns member feedback into action.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Partnerships Manager', 'Partnerships Manager', 'Partnerships', 'active', 'partnerships-manager', 'Scores partnership leads and prepares sponsorship, media and university proposals.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Product Designer', 'Product Designer', 'Product Design', 'active', 'product-designer', 'Designs product flows, screens and prototypes against the design system.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Motion Designer', 'Motion Designer', 'Motion Design', 'active', 'motion-designer', 'Builds Lottie animations, motion posters and kinetic typography.'),
  ((SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'), 'ai', 'Data Analyst', 'Data Analyst', 'Data & Analytics', 'active', 'data-analyst', 'Turns funnels, retention and revenue numbers into recommendations.')
ON CONFLICT (org_id, name) DO NOTHING;

-- ===== 20260808090000_os_hierarchy.sql =====
-- OS-17: reporting lines for the org chart. Adds reports_to to os_workforce and
-- wires the planned AI team to it, mirroring REPORTING_TREE in
-- src/lib/hierarchy.ts (founder-directors, directors own their specialists).
-- Permissions (L0-L5) are derived in the app from digital job descriptions, so
-- this migration only persists the reporting edge. Idempotent: the UPDATE only
-- touches rows that don't have a manager yet.
ALTER TABLE os_workforce ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES os_workforce(id) ON DELETE SET NULL;

UPDATE os_workforce AS agent
SET reports_to = manager.id
FROM os_orgs o
JOIN os_workforce manager ON manager.org_id = o.id
WHERE o.slug = 'nowopen-africa'
  AND agent.org_id = o.id
  AND agent.reports_to IS NULL
  AND (
    (agent.agent_key = 'research-analyst' AND manager.agent_key = 'strategy-director') OR
    (agent.agent_key = 'data-analyst' AND manager.agent_key = 'strategy-director') OR
    (agent.agent_key = 'seo-manager' AND manager.agent_key = 'growth-director') OR
    (agent.agent_key = 'social-director' AND manager.agent_key = 'growth-director') OR
    (agent.agent_key = 'email-marketing-manager' AND manager.agent_key = 'growth-director') OR
    (agent.agent_key = 'content-manager' AND manager.agent_key = 'social-director') OR
    (agent.agent_key = 'copywriter' AND manager.agent_key = 'creative-director') OR
    (agent.agent_key = 'production-manager' AND manager.agent_key = 'creative-director') OR
    (agent.agent_key = 'product-designer' AND manager.agent_key = 'creative-director') OR
    (agent.agent_key = 'motion-designer' AND manager.agent_key = 'creative-director') OR
    (agent.agent_key = 'post-supervisor' AND manager.agent_key = 'production-manager') OR
    (agent.agent_key = 'partnerships-manager' AND manager.agent_key = 'sales-director') OR
    (agent.agent_key = 'customer-success-manager' AND manager.agent_key = 'operations-director') OR
    (agent.agent_key = 'trust-safety-agent' AND manager.agent_key = 'operations-director') OR
    (agent.agent_key = 'community-manager' AND manager.agent_key = 'operations-director')
  );

-- ===== 20260808100000_os_onboarding.sql =====
-- OS-20: the Onboarding Command Center backing table. One row per NowOpen
-- Relationship Profile (employee, partner, volunteer, creative, ...), tracking
-- which journey steps are genuinely done, which agreements are signed and which
-- access scopes were granted. Status (invited / in-progress / awaiting
-- signature / blocked / completed) is NEVER stored — it is derived in the app
-- from these columns against the journey in src/lib/relationships.ts. Mirrors
-- ONBOARDING_SEED in src/lib/onboardingProfiles.ts. Idempotent; seeded rows use
-- fixed ids and conflict on (org_id, email).
CREATE TABLE IF NOT EXISTS os_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN (
    'employee', 'partner', 'volunteer', 'creative', 'agency',
    'production-partner', 'strategic-collaborator', 'investor',
    'media-partner', 'technology-partner', 'other'
  )),
  department text,
  role text,
  country text,
  manager text,
  account_manager text,
  steps_completed jsonb DEFAULT '[]'::jsonb,
  signed_agreements jsonb DEFAULT '[]'::jsonb,
  access_grants jsonb DEFAULT '[]'::jsonb,
  blocked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, email)
);

ALTER TABLE os_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read onboarding" ON os_onboarding;
CREATE POLICY "Admins read onboarding" ON os_onboarding
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write onboarding" ON os_onboarding;
CREATE POLICY "Admins write onboarding" ON os_onboarding
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update onboarding" ON os_onboarding;
CREATE POLICY "Admins update onboarding" ON os_onboarding
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete onboarding" ON os_onboarding;
CREATE POLICY "Admins delete onboarding" ON os_onboarding
  FOR DELETE TO authenticated USING (public.is_admin());

INSERT INTO os_onboarding
  (id, org_id, full_name, email, relationship, department, role, country,
   steps_completed, signed_agreements, access_grants, created_at)
VALUES
  ('50000000-0000-4000-8000-000000000001',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'Adeyemi Odunaiike', 'founder@nowopen.africa', 'employee', 'Executive', 'Founder & CEO', 'Nigeria',
   '["personal-information","professional-information","department","role","emergency-contact","employment-documents","nda","ip-confidentiality","code-of-conduct","policies","signature","account-setup","orientation"]'::jsonb,
   '["NDA","Confidentiality","IP agreement","Code of conduct"]'::jsonb,
   '["Founder Command Center","Company OS","Strategy","Creative Studio"]'::jsonb,
   '2026-05-01T09:00:00Z'),
  ('50000000-0000-4000-8000-000000000002',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'Chukwu Emeka', 'chukwu@nowopen.africa', 'employee', 'Creative & Brand', 'Motion Designer', 'Nigeria',
   '["personal-information","professional-information","department","role","employment-documents","nda","ip-confidentiality","code-of-conduct","policies","orientation"]'::jsonb,
   '["NDA","IP agreement","Code of conduct"]'::jsonb,
   '["Creative","Motion Design","Creative Studio","Brand Library"]'::jsonb,
   '2026-08-01T09:00:00Z'),
  ('50000000-0000-4000-8000-000000000003',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'Meatclub Nigeria', 'ops@meatclub.ng', 'partner', 'Partnerships', 'Strategic / Business partner', 'Nigeria',
   '["company-information","representative","partnership-type","business-verification","partnership-proposal","nda"]'::jsonb,
   '["NDA"]'::jsonb,
   '["Partner portal"]'::jsonb,
   '2026-08-03T09:00:00Z'),
  ('50000000-0000-4000-8000-000000000004',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'Zainab Bello', 'zainab.b@example.com', 'volunteer', NULL, NULL, 'Nigeria',
   '["personal-information","skills-interests","availability","location","volunteer-agreement"]'::jsonb,
   '["Volunteer agreement"]'::jsonb,
   '[]'::jsonb,
   '2026-08-06T09:00:00Z'),
  ('50000000-0000-4000-8000-000000000005',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'Lagos Tech Studio', 'hello@lagostech.studio', 'creative', NULL, NULL, 'Nigeria',
   '["personal-information","creative-briefing","portfolio","nda"]'::jsonb,
   '["NDA"]'::jsonb,
   '["Creative workspace"]'::jsonb,
   '2026-08-07T09:00:00Z'),
  ('50000000-0000-4000-8000-000000000006',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'Kofi Mensah', 'kofi@example.com', 'volunteer', NULL, NULL, 'Ghana',
   '["personal-information","skills-interests","availability","location","volunteer-agreement","nda-confidentiality","code-of-conduct","consent","orientation"]'::jsonb,
   '["Volunteer agreement","NDA / confidentiality"]'::jsonb,
   '["Community portal","Volunteer workspace"]'::jsonb,
   '2026-07-15T09:00:00Z'),
  ('50000000-0000-4000-8000-000000000007',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'Atlas Capital', 'invest@atlascap.co', 'investor', NULL, NULL, 'United Kingdom',
   '["contact-information","investor-type","fund-information"]'::jsonb,
   '[]'::jsonb,
   '[]'::jsonb,
   '2026-08-08T09:00:00Z'),
  ('50000000-0000-4000-8000-000000000008',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'Nairobi Media House', 'news@nairobi.media', 'media-partner', NULL, NULL, 'Kenya',
   '["media-information","outlet-details","reach-audience"]'::jsonb,
   '[]'::jsonb,
   '[]'::jsonb,
   '2026-08-04T09:00:00Z')
ON CONFLICT (org_id, email) DO NOTHING;

-- OS-20: mark the seeded media partner blocked so the command center has a
-- genuine stuck case, matching the ONBOARDING_SEED row.
UPDATE os_onboarding
SET blocked_at = '2026-08-08T12:00:00Z', updated_at = now()
WHERE email = 'news@nairobi.media' AND blocked_at IS NULL;

-- ===== 20260808110000_os_documents.sql =====
-- OS-21: the Document Centre. A template is drafted into a real document for a
-- counterparty (party details + clause list), and the status (draft / sent /
-- signed / declined / expired) is only written when someone acts on it — the
-- app never guesses. Mirrors AGREEMENT_TEMPLATES, buildDocument and
-- DOCUMENTS_SEED in src/lib/documents.ts. Idempotent; seeded rows use fixed
-- ids and conflict on (org_id, counterparty_email, title).
CREATE TABLE IF NOT EXISTS os_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  template_id text NOT NULL,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('nda', 'agreement', 'policy', 'letter')),
  counterparty_name text NOT NULL,
  counterparty_email text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN (
    'employee', 'partner', 'volunteer', 'creative', 'agency',
    'production-partner', 'strategic-collaborator', 'investor',
    'media-partner', 'technology-partner', 'other'
  )),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'sent', 'signed', 'declined', 'expired'
  )),
  effective_date date,
  sent_at timestamptz,
  signed_at timestamptz,
  clauses jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, counterparty_email, title)
);

ALTER TABLE os_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read documents" ON os_documents;
CREATE POLICY "Admins read documents" ON os_documents
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write documents" ON os_documents;
CREATE POLICY "Admins write documents" ON os_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update documents" ON os_documents;
CREATE POLICY "Admins update documents" ON os_documents
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete documents" ON os_documents;
CREATE POLICY "Admins delete documents" ON os_documents
  FOR DELETE TO authenticated USING (public.is_admin());

INSERT INTO os_documents
  (id, org_id, template_id, title, kind, counterparty_name, counterparty_email,
   relationship, status, effective_date, sent_at, signed_at, clauses, created_at)
VALUES
  ('60000000-0000-4000-8000-000000000001',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'nda', 'Mutual Non-Disclosure Agreement — Chukwu Emeka', 'nda',
   'Chukwu Emeka', 'chukwu@nowopen.africa', 'employee', 'signed', '2026-08-01',
   '2026-08-01T10:00:00Z', '2026-08-01T14:00:00Z',
   '["Definition of Confidential Information","Obligations of the Receiving Party","Permitted disclosures","Term and survival","Return or destruction","Governing law (Nigeria)"]'::jsonb,
   '2026-08-01T09:00:00Z'),
  ('60000000-0000-4000-8000-000000000002',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'employment-agreement', 'Employment Agreement — Chukwu Emeka', 'agreement',
   'Chukwu Emeka', 'chukwu@nowopen.africa', 'employee', 'sent', '2026-08-01',
   '2026-08-01T10:00:00Z', NULL,
   '["Role and duties","Compensation and benefits","Working hours","Confidentiality and IP","Termination and notice","Governing law (Nigeria)"]'::jsonb,
   '2026-08-01T09:00:00Z'),
  ('60000000-0000-4000-8000-000000000003',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'nda', 'Mutual Non-Disclosure Agreement — Meatclub Nigeria', 'nda',
   'Meatclub Nigeria', 'ops@meatclub.ng', 'partner', 'signed', '2026-08-03',
   '2026-08-03T09:00:00Z', '2026-08-03T16:30:00Z',
   '["Definition of Confidential Information","Obligations of the Receiving Party","Permitted disclosures","Term and survival","Return or destruction","Governing law (Nigeria)"]'::jsonb,
   '2026-08-03T08:00:00Z'),
  ('60000000-0000-4000-8000-000000000004',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'partnership-agreement', 'Partnership Agreement — Meatclub Nigeria', 'agreement',
   'Meatclub Nigeria', 'ops@meatclub.ng', 'partner', 'draft', '2026-08-03',
   NULL, NULL,
   '["Purpose of the partnership","Role and responsibilities","Brand and marketing","Reporting and reviews","Term and renewal","Governing law (Nigeria)"]'::jsonb,
   '2026-08-03T08:00:00Z'),
  ('60000000-0000-4000-8000-000000000005',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'volunteer-agreement', 'Volunteer Agreement — Kofi Mensah', 'agreement',
   'Kofi Mensah', 'kofi@example.com', 'volunteer', 'signed', '2026-07-15',
   '2026-07-15T09:00:00Z', '2026-07-15T12:00:00Z',
   '["Role and commitment","Guidance and supervision","Confidentiality","Safeguarding and conduct","Ending the arrangement","Governing law (Nigeria)"]'::jsonb,
   '2026-07-15T08:00:00Z'),
  ('60000000-0000-4000-8000-000000000006',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'creative-agreement', 'Creative Collaboration Agreement — Lagos Tech Studio', 'agreement',
   'Lagos Tech Studio', 'hello@lagostech.studio', 'creative', 'sent', '2026-08-07',
   '2026-08-07T11:00:00Z', NULL,
   '["Scope of work","Deliverables and standards","Fees and payment","Intellectual property","Confidentiality","Governing law (Nigeria)"]'::jsonb,
   '2026-08-07T10:00:00Z'),
  ('60000000-0000-4000-8000-000000000007',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'nda', 'Mutual Non-Disclosure Agreement — Atlas Capital', 'nda',
   'Atlas Capital', 'invest@atlascap.co', 'investor', 'draft', '2026-08-08',
   NULL, NULL,
   '["Definition of Confidential Information","Obligations of the Receiving Party","Permitted disclosures","Term and survival","Return or destruction","Governing law (Nigeria)"]'::jsonb,
   '2026-08-08T09:00:00Z')
ON CONFLICT (org_id, counterparty_email, title) DO NOTHING;

-- ===== 20260808120000_os_signatures.sql =====
-- OS-22: the Signing Vault. One row per captured signature — who signed, which
-- document, when and how (manual / digital). A "sent" document in os_documents
-- IS the signing request; completing a signature here is what moves it to
-- signed in the app. Provisioning (OS-20 access grants) is derived in the app
-- from os_documents + os_onboarding, never stored here. Idempotent; seeded
-- rows reference the fixed os_documents seed ids.
CREATE TABLE IF NOT EXISTS os_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES os_documents(id) ON DELETE CASCADE,
  document_title text NOT NULL,
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  method text NOT NULL CHECK (method IN ('manual', 'digital')),
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE os_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read signatures" ON os_signatures;
CREATE POLICY "Admins read signatures" ON os_signatures
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write signatures" ON os_signatures;
CREATE POLICY "Admins write signatures" ON os_signatures
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update signatures" ON os_signatures;
CREATE POLICY "Admins update signatures" ON os_signatures
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete signatures" ON os_signatures;
CREATE POLICY "Admins delete signatures" ON os_signatures
  FOR DELETE TO authenticated USING (public.is_admin());

INSERT INTO os_signatures
  (id, org_id, document_id, document_title, signer_name, signer_email, method, signed_at, created_at)
VALUES
  ('70000000-0000-4000-8000-000000000001',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   '60000000-0000-4000-8000-000000000001',
   'Mutual Non-Disclosure Agreement — Chukwu Emeka',
   'Chukwu Emeka', 'chukwu@nowopen.africa', 'manual',
   '2026-08-01T14:00:00Z', '2026-08-01T14:00:00Z'),
  ('70000000-0000-4000-8000-000000000002',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   '60000000-0000-4000-8000-000000000003',
   'Mutual Non-Disclosure Agreement — Meatclub Nigeria',
   'Meatclub Nigeria', 'ops@meatclub.ng', 'digital',
   '2026-08-03T16:30:00Z', '2026-08-03T16:30:00Z'),
  ('70000000-0000-4000-8000-000000000003',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   '60000000-0000-4000-8000-000000000005',
   'Volunteer Agreement — Kofi Mensah',
   'Kofi Mensah', 'kofi@example.com', 'digital',
   '2026-07-15T12:00:00Z', '2026-07-15T12:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- ===== 20260813090000_os_form_applications.sql =====
-- OS-23: the Universal Forms Hub. ONE public URL (/forms) serves every
-- relationship journey via a schema-driven form engine. Submissions land here
-- as rows - never one table per relationship type. Reads are admin-only; the
-- public route is insert-only (a public applicant can submit, but applicant
-- records are never exposed through public SELECTs). References are random and
-- unguessable so they cannot be enumerated. Mirrors src/lib/formsEngine.ts.
-- Idempotent; seeded rows use fixed ids and conflict on id.
CREATE TABLE IF NOT EXISTS os_form_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES os_orgs(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  relationship text NOT NULL CHECK (relationship IN (
    'employee', 'intern', 'volunteer', 'partner', 'collaborator',
    'business', 'advisor', 'media', 'other'
  )),
  applicant_name text NOT NULL,
  email text NOT NULL,
  country text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'screening', 'under-review', 'interview', 'documents', 'agreement',
    'approved', 'onboarding', 'active', 'archived',
    'qualification', 'discussion', 'proposal', 'nda'
  )),
  source text,
  answers jsonb DEFAULT '{}'::jsonb,
  consent boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  submitted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE os_form_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read applications" ON os_form_applications;
CREATE POLICY "Admins read applications" ON os_form_applications
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Public submit applications" ON os_form_applications;
CREATE POLICY "Public submit applications" ON os_form_applications
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins update applications" ON os_form_applications;
CREATE POLICY "Admins update applications" ON os_form_applications
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete applications" ON os_form_applications;
CREATE POLICY "Admins delete applications" ON os_form_applications
  FOR DELETE TO authenticated USING (public.is_admin());

INSERT INTO os_form_applications
  (id, org_id, reference, relationship, applicant_name, email, country,
   status, source, answers, consent, consent_at, submitted_at)
VALUES
  ('80000000-0000-4000-8000-000000000001',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'NOW-EMP-2026-8K2MZ4', 'employee', 'Chukwu Emeka', 'chukwu@nowopen.africa',
   'Nigeria', 'approved', 'linkedin',
   '{"desired_role":"Senior Motion Designer","desired_department":"Creative & Brand"}'::jsonb,
   true, '2026-08-01T09:15:00Z', '2026-08-01T09:15:00Z'),
  ('80000000-0000-4000-8000-000000000002',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'NOW-INT-2026-4QX7A9', 'intern', 'Ada Obi', 'ada@nowopen.africa',
   'Nigeria', 'new', 'university',
   '{"institution":"University of Lagos","course":"Computer Science"}'::jsonb,
   true, '2026-08-12T14:00:00Z', '2026-08-12T14:00:00Z'),
  ('80000000-0000-4000-8000-000000000003',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'NOW-VOL-2026-9MNP3B', 'volunteer', 'Kofi Mensah', 'kofi@example.com',
   'Ghana', 'onboarding', NULL,
   '{"contribution_areas":["Community","Events"]}'::jsonb,
   true, '2026-07-15T10:30:00Z', '2026-07-15T10:30:00Z'),
  ('80000000-0000-4000-8000-000000000004',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'NOW-PTR-2026-2JKL8C', 'partner', 'Meatclub Nigeria', 'ops@meatclub.ng',
   'Nigeria', 'agreement', 'referral',
   '{"partnership_type":["Business"],"proposal":"Restaurant discovery distribution"}'::jsonb,
   true, '2026-08-03T11:00:00Z', '2026-08-03T11:00:00Z'),
  ('80000000-0000-4000-8000-000000000005',
   (SELECT id FROM os_orgs WHERE slug = 'nowopen-africa'),
   'NOW-MED-2026-6TRV2D', 'media', 'Nairobi Media House', 'news@nairobi.media',
   'Kenya', 'discussion', 'event',
   '{"platform":["Newsletter","LinkedIn"],"audience_size":"40k"}'::jsonb,
   true, '2026-08-10T08:45:00Z', '2026-08-10T08:45:00Z')
ON CONFLICT (id) DO NOTHING;

-- ===== 20260814090000_os_form_applications_review.sql =====
-- OS-24: Applications Review — the admin side of the Forms Hub. Adds the
-- reviewer decision columns to os_form_applications so an admin can advance an
-- application honestly (status + updated_at) and record a rejection (archived
-- + rejected + decision_note). Idempotent and safe on existing rows; the
-- admin-only RLS from the OS-23 migration already covers UPDATE.
ALTER TABLE os_form_applications
  ADD COLUMN IF NOT EXISTS rejected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS decision_note text;

-- ===== 20260815090000_os_onboarding_handoff.sql =====
-- OS-25: Onboarding handoff — an approved application in Applications Review
-- can be onboarded into a real relationship profile on os_onboarding. The
-- source_reference column keeps that handoff traceable back to the
-- os_form_applications row it came from. Idempotent; the UNIQUE (org_id, email)
-- constraint already refuses duplicate onboards.
ALTER TABLE os_onboarding
  ADD COLUMN IF NOT EXISTS source_reference text;
