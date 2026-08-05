-- Car Dealership operating system — vehicle attributes on business_products.
-- A dealership lists each vehicle as a business_products row; these optional
-- columns turn a generic product into a rich vehicle listing. All nullable +
-- additive, so other categories are unaffected.

ALTER TABLE public.business_products
  ADD COLUMN IF NOT EXISTS vehicle_make  text,
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS vehicle_year  integer,
  ADD COLUMN IF NOT EXISTS mileage_km    integer,
  ADD COLUMN IF NOT EXISTS fuel_type     text,   -- Petrol | Diesel | Hybrid | Electric
  ADD COLUMN IF NOT EXISTS transmission  text,   -- Automatic | Manual
  ADD COLUMN IF NOT EXISTS vin           text,
  ADD COLUMN IF NOT EXISTS vehicle_condition text; -- New | Foreign Used | Nigerian Used
