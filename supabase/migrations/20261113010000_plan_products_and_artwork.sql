/*
  Promote step 2: a media-plan line can hold a NowOpen product, and artwork.

  Until now every line in ad_campaign_placements pointed at an advertisement
  (a third-party placement). A plan can now also carry a NowOpen product from
  revenue_products, so a line holds exactly one of the two.

  ## price_basis 'fixed' is not 'quoted'

  'quoted' means a media owner gave a figure for a placement. 'fixed' means the
  price is NowOpen's own list price for a product, frozen into price_minor (NGN
  kobo) when the line was added. Treating one as the other would let a published
  list price pass as a negotiated quote, or the reverse, so they stay distinct.

  ## Artwork

  artwork_url keeps its name but now holds a storage PATH in the private bucket
  plan-artwork, not a public URL. Object path is
  uid / campaign id / line id - safe name, so the first folder is the owner.
  artwork_design_id optionally links the design_projects row the artwork came
  from. artwork_width and artwork_height record the pixel size that was
  measured, never a guess.

  Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS before re-adding.
*/

-- 1. A line holds a placement OR a product ------------------------------------

ALTER TABLE public.ad_campaign_placements ALTER COLUMN advert_id DROP NOT NULL;

ALTER TABLE public.ad_campaign_placements
  ADD COLUMN IF NOT EXISTS product_id uuid
    REFERENCES public.revenue_products(id) ON DELETE CASCADE;

ALTER TABLE public.ad_campaign_placements
  DROP CONSTRAINT IF EXISTS ad_campaign_placements_one_item;
ALTER TABLE public.ad_campaign_placements
  ADD CONSTRAINT ad_campaign_placements_one_item
  CHECK (num_nonnulls(advert_id, product_id) = 1);

-- NULLs are distinct in a unique constraint, so the existing
-- UNIQUE (campaign_id, advert_id) keeps working for placements.
ALTER TABLE public.ad_campaign_placements
  DROP CONSTRAINT IF EXISTS ad_campaign_placements_campaign_id_product_id_key;
ALTER TABLE public.ad_campaign_placements
  ADD CONSTRAINT ad_campaign_placements_campaign_id_product_id_key
  UNIQUE (campaign_id, product_id);

-- 2. Frozen product price (kobo) and the 'fixed' basis ------------------------

ALTER TABLE public.ad_campaign_placements
  ADD COLUMN IF NOT EXISTS price_minor bigint;
ALTER TABLE public.ad_campaign_placements
  DROP CONSTRAINT IF EXISTS ad_campaign_placements_price_minor_check;
ALTER TABLE public.ad_campaign_placements
  ADD CONSTRAINT ad_campaign_placements_price_minor_check
  CHECK (price_minor IS NULL OR price_minor >= 0);

ALTER TABLE public.ad_campaign_placements
  DROP CONSTRAINT IF EXISTS ad_campaign_placements_price_basis_check;
ALTER TABLE public.ad_campaign_placements
  ADD CONSTRAINT ad_campaign_placements_price_basis_check
  CHECK (price_basis IN ('indicative', 'quoted', 'unpriced', 'fixed'));

-- A fixed price is only meaningful on a product line that carries its price.
ALTER TABLE public.ad_campaign_placements
  DROP CONSTRAINT IF EXISTS ad_campaign_placements_fixed_is_product;
ALTER TABLE public.ad_campaign_placements
  ADD CONSTRAINT ad_campaign_placements_fixed_is_product
  CHECK (price_basis <> 'fixed' OR (product_id IS NOT NULL AND price_minor IS NOT NULL));

-- 3. Artwork columns ----------------------------------------------------------

ALTER TABLE public.ad_campaign_placements
  ADD COLUMN IF NOT EXISTS artwork_design_id uuid
    REFERENCES public.design_projects(id) ON DELETE SET NULL;
ALTER TABLE public.ad_campaign_placements
  ADD COLUMN IF NOT EXISTS artwork_width integer;
ALTER TABLE public.ad_campaign_placements
  ADD COLUMN IF NOT EXISTS artwork_height integer;

ALTER TABLE public.ad_campaign_placements
  DROP CONSTRAINT IF EXISTS ad_campaign_placements_artwork_width_check;
ALTER TABLE public.ad_campaign_placements
  ADD CONSTRAINT ad_campaign_placements_artwork_width_check
  CHECK (artwork_width IS NULL OR artwork_width > 0);
ALTER TABLE public.ad_campaign_placements
  DROP CONSTRAINT IF EXISTS ad_campaign_placements_artwork_height_check;
ALTER TABLE public.ad_campaign_placements
  ADD CONSTRAINT ad_campaign_placements_artwork_height_check
  CHECK (artwork_height IS NULL OR artwork_height > 0);

-- 4. Private artwork bucket ---------------------------------------------------
-- If this INSERT is blocked by the project's storage permissions, create a
-- PRIVATE bucket named "plan-artwork" in Dashboard - Storage instead, with a
-- 25MB limit and the MIME list below, then add the object policies by hand.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'plan-artwork', 'plan-artwork', false, 26214400,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The first folder of the object path is the owner's user id.
DROP POLICY IF EXISTS "plan_artwork_owner_insert" ON storage.objects;
CREATE POLICY "plan_artwork_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'plan-artwork'
              AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "plan_artwork_owner_select" ON storage.objects;
CREATE POLICY "plan_artwork_owner_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'plan-artwork'
         AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "plan_artwork_owner_delete" ON storage.objects;
CREATE POLICY "plan_artwork_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'plan-artwork'
         AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "plan_artwork_staff_select" ON storage.objects;
CREATE POLICY "plan_artwork_staff_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'plan-artwork' AND public.is_staff());

-- Replacing artwork uploads with upsert, which needs UPDATE.
DROP POLICY IF EXISTS "plan_artwork_owner_update" ON storage.objects;
CREATE POLICY "plan_artwork_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'plan-artwork'
         AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'plan-artwork'
              AND (storage.foldername(name))[1] = auth.uid()::text);
