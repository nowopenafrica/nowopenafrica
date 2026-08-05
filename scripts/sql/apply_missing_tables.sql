-- Just the tables missing from your database (checked via API on 2026-07-16):
-- payment_intents + the five business content tables.
-- Paste this whole file into the Supabase SQL editor and run it once.

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
  message text NOT NULL,
  context text,                    -- e.g. the product/service asked about
  created_at timestamptz DEFAULT now()
);

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
