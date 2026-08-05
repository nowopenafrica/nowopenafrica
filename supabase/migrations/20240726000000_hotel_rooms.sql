-- Hotel operating system — room attributes on business_services.
-- A hotel lists each room type as a business_services row; these optional
-- columns turn a plain service into a bookable room (photo, capacity,
-- amenities). image_url is generally useful for any service, so it's added
-- broadly. All nullable + additive.

ALTER TABLE public.business_services
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS capacity  integer,
  ADD COLUMN IF NOT EXISTS amenities text;   -- comma-separated, e.g. "AC, Wi-Fi, Breakfast"
