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
