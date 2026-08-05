-- Beauty & Salon operating system — treatment attributes on business_services.
-- A salon lists each treatment as a business_services row; these optional
-- columns group treatments into a price list and flag home-service options.
-- duration_min / image_url already exist (fitness / hotel migrations).

ALTER TABLE public.business_services
  ADD COLUMN IF NOT EXISTS service_category text,     -- 'Hair' | 'Nails' | 'Makeup' | 'Spa' | 'Barber'
  ADD COLUMN IF NOT EXISTS home_service     boolean NOT NULL DEFAULT false;
