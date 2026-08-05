-- Pharmacy operating system — medicine attributes on business_products.
-- A pharmacy lists each medicine as a business_products row; these optional
-- columns turn the product grid into a categorised medicine catalogue with
-- prescription flags. All nullable + additive.

ALTER TABLE public.business_products
  ADD COLUMN IF NOT EXISTS med_category         text,     -- 'Pain Relief' | 'Antibiotics' | 'Vitamins' | ...
  ADD COLUMN IF NOT EXISTS requires_prescription boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pack_size            text;     -- 'Pack of 20 tablets' | '100ml syrup' | ...

CREATE INDEX IF NOT EXISTS idx_business_products_med
  ON public.business_products (business_id, med_category);
