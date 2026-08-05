-- Fashion operating system — apparel attributes on business_products.
-- A fashion brand lists each item as a business_products row; these optional
-- columns turn the product grid into a catalogue with size options, fabric and
-- collections. is_featured (from the real-estate migration) doubles as the
-- "new collection" flag. All nullable + additive.

ALTER TABLE public.business_products
  ADD COLUMN IF NOT EXISTS fashion_category text,   -- 'Women' | 'Men' | 'Kids' | 'Accessories' | ...
  ADD COLUMN IF NOT EXISTS sizes            text,   -- comma-separated, e.g. 'S,M,L,XL'
  ADD COLUMN IF NOT EXISTS fabric           text;

CREATE INDEX IF NOT EXISTS idx_business_products_fashion
  ON public.business_products (business_id, fashion_category);
