-- Restaurant operating system — menu attributes on business_products.
-- A restaurant lists each menu item as a business_products row; these optional
-- columns turn the product grid into a categorised digital menu with daily
-- specials and chef's recommendations. All nullable + additive.

ALTER TABLE public.business_products
  ADD COLUMN IF NOT EXISTS menu_category   text,      -- 'Starters' | 'Mains' | 'Drinks' | 'Desserts' | ...
  ADD COLUMN IF NOT EXISTS is_special      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_recommended  boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_business_products_menu
  ON public.business_products (business_id, menu_category);
