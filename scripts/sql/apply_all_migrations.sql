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
