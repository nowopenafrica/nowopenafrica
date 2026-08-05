-- Retail & Agriculture operating systems — catalogue attributes on
-- business_products. product_category groups items into aisles/departments
-- (retail) or produce types (agriculture); unit captures pricing units like
-- "per kg" / "per crate" that meat shops, markets and farms rely on.
-- is_featured (from the real-estate migration) doubles as a "flash sale / fresh"
-- flag. All nullable + additive.

ALTER TABLE public.business_products
  ADD COLUMN IF NOT EXISTS product_category text,   -- aisle / department / produce type
  ADD COLUMN IF NOT EXISTS unit             text;   -- 'per kg' | 'per crate' | 'each' | ...

CREATE INDEX IF NOT EXISTS idx_business_products_product_category
  ON public.business_products (business_id, product_category);
