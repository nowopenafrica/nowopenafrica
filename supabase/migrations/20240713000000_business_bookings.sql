/*
  # Business bookings (category-driven request/response workflow)

  One generic table drives bookings/reservations/orders for any business
  category via src/data/categoryFeatures.ts — not a separate schema per
  category. Distinct from payment_intents' 'placement_booking' /
  'service_booking' kinds (those are paid ad/media checkout; this is an
  unpaid customer request that the business owner confirms or declines).

  Security: anyone can submit a request; only the business owner (or admin)
  can read requests or change their status.
*/

CREATE TABLE IF NOT EXISTS business_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_type text CHECK (item_type IN ('service','product')),
  item_id text,               -- business_services.id or business_products.id; no FK (polymorphic, matches payment_intents.item_id)
  item_name text,             -- snapshot at booking time (survives item edits/deletion)
  item_price text,            -- snapshot at booking time
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  requested_date date,
  requested_date_end date,    -- only used for date-range categories (e.g. Hotel & Lodging)
  requested_time time,
  quantity int,               -- meaning varies per category config: guests / party size / nights / units
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined','cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE business_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can request a booking" ON business_bookings;
CREATE POLICY "Anyone can request a booking" ON business_bookings
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Owners read own bookings" ON business_bookings;
CREATE POLICY "Owners read own bookings" ON business_bookings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())));

DROP POLICY IF EXISTS "Owners update booking status" ON business_bookings;
CREATE POLICY "Owners update booking status" ON business_bookings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_id
                 AND (b.user_id::text = auth.uid()::text OR public.is_admin())));
