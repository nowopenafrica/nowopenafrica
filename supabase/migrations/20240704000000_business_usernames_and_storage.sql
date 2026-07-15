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
