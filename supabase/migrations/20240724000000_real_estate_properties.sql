-- Real Estate operating system — property attributes on business_products.
-- A Real Estate business lists each property as a business_products row; these
-- optional columns turn a generic product into a rich property listing (beds,
-- baths, area, type, sale/rent, featured). All nullable + additive, so every
-- other category is unaffected and existing rows keep working.

ALTER TABLE public.business_products
  ADD COLUMN IF NOT EXISTS listing_type  text,      -- 'sale' | 'rent' | 'shortlet'
  ADD COLUMN IF NOT EXISTS property_type text,       -- 'Apartment' | 'House' | 'Land' | 'Office' | ...
  ADD COLUMN IF NOT EXISTS bedrooms      integer,
  ADD COLUMN IF NOT EXISTS bathrooms     integer,
  ADD COLUMN IF NOT EXISTS area_sqm      numeric,
  ADD COLUMN IF NOT EXISTS property_location text,
  ADD COLUMN IF NOT EXISTS is_featured   boolean NOT NULL DEFAULT false;

-- Keep listing_type sane when provided (NULL still allowed for non-real-estate).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'business_products_listing_type_check'
  ) THEN
    ALTER TABLE public.business_products
      ADD CONSTRAINT business_products_listing_type_check
      CHECK (listing_type IS NULL OR listing_type IN ('sale', 'rent', 'shortlet'));
  END IF;
END $$;

-- Fast "featured properties" and sale/rent filtering per business.
CREATE INDEX IF NOT EXISTS idx_business_products_featured
  ON public.business_products (business_id, is_featured);
