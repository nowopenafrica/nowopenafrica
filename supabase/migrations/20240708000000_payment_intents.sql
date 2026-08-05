/*
  # Payment intents (checkout at all levels)

  Records every checkout started on the site — subscriptions from the
  pricing page, placement bookings and creative-service bookings. Before
  live payment keys are configured these are captured as 'lead' rows
  (pre-launch demand with contact details); once Paystack goes live the
  same table tracks 'initiated' → 'paid' via the provider reference.

  Security: anyone can INSERT (guests can start checkout); signed-in users
  can view their own; only admins can read/manage everything.
*/

CREATE TABLE IF NOT EXISTS payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,                -- 'subscription' | 'placement_booking' | 'service_booking'
  item_id text,
  item_title text NOT NULL,
  amount_usd numeric NOT NULL,
  currency text NOT NULL,            -- display/charge currency, e.g. 'NGN'
  amount_local numeric NOT NULL,     -- converted amount at checkout time
  method text,                       -- 'card' | 'mobile_money' | 'bank_transfer' | 'intl_card'
  email text NOT NULL,
  name text,
  status text DEFAULT 'lead',        -- 'lead' | 'initiated' | 'paid' | 'failed'
  provider text,                     -- 'paystack' | 'flutterwave' | 'stripe'
  reference text,                    -- provider transaction reference
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can start a checkout" ON payment_intents;
CREATE POLICY "Anyone can start a checkout" ON payment_intents
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own payment intents" ON payment_intents;
CREATE POLICY "Users can view own payment intents" ON payment_intents
  FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id::text OR public.is_admin());

DROP POLICY IF EXISTS "Admins can manage payment intents" ON payment_intents;
CREATE POLICY "Admins can manage payment intents" ON payment_intents
  FOR UPDATE TO authenticated USING (public.is_admin());
