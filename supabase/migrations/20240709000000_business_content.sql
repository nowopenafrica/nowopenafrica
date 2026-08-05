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
