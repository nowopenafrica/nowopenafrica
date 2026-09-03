/*
  # Feature flags

  The launch audit's smallest open item and the one that makes launch day
  recoverable: if Live, Offers, ordering or AI video misbehaves in front of real
  customers, the choices today are ship a fix under pressure or take the whole
  platform down. A flag turns that into one toggle.

  ## Public read is deliberate

  The app has to know what is switched on before it renders, and there is
  nothing sensitive in "offers are enabled". Making it admin-only would mean
  every visitor waits on an authenticated round trip to find out whether a tab
  exists.

  ## What a flag is NOT

  Not a permission. Turning a flag off hides a surface; it does not protect
  anything. Every authorisation decision stays in RLS, where it cannot be
  bypassed by a client that ignores the flag. A flag is an operational control
  for "this is misbehaving", not a security boundary.

  Re-runnable.
*/

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT true,
  label       text NOT NULL,
  description text,
  /*
     What happens when the flag cannot be read at all — a network failure, a
     cold start, a private window with no connectivity.

     Almost everything defaults ON. A blip must not disable the product; and an
     operator reaching for a kill switch has a working database by definition,
     because they just used the admin console to flip it.

     The exception is anything that spends money or messages a customer. There,
     silence is the safe failure: not sending is recoverable, sending is not.
  */
  default_when_unreachable boolean NOT NULL DEFAULT true,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Feature flags are public" ON public.feature_flags;
CREATE POLICY "Feature flags are public" ON public.feature_flags
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage feature flags" ON public.feature_flags;
CREATE POLICY "Admins manage feature flags" ON public.feature_flags
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

/*
  Every flag ships ON.

  A flag that arrives switched off is indistinguishable from a broken feature,
  and somebody spends an afternoon debugging a toggle. These exist to be turned
  off in an emergency, not to stage a rollout.
*/
INSERT INTO public.feature_flags (key, label, description, default_when_unreachable) VALUES
  ('offers',      'Offers',            'Public offers page and business offer publishing.', true),
  ('keeps',       'Keeps',             'Customers keeping businesses.', true),
  ('live',        'NowOpen Live',      'Live broadcasting from a business profile.', true),
  ('bookings',    'Bookings',          'Booking requests on business profiles.', true),
  ('ordering',    'Ordering',          'Cart and ordering on business profiles.', true),
  ('studio_video','Studio: video',     'Reel, Video and Motion studios. Heaviest bundles on the platform.', true),
  ('ai_director', 'AI Creative Director', 'Model-backed creative generation.', true),
  ('campaigns',   'Campaigns',         'The Founding 1,000 campaign page and referrals.', true),
  ('adverts',     'Advertising',       'Ad placements marketplace.', true),
  -- Spends money or reaches a customer: fails silent, not loud.
  ('outbound_email',    'Outbound email',    'Onboarding and automation email.', false),
  ('outbound_whatsapp', 'Outbound WhatsApp', 'Automation WhatsApp messages.', false),
  ('payments',          'Payments',          'Paystack checkout and subscriptions.', false)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description;

/** Toggle a flag, recording who did it. Admin-gated. */
CREATE OR REPLACE FUNCTION public.set_feature_flag(p_key text, p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  UPDATE public.feature_flags
     SET enabled = p_enabled, updated_by = auth.uid(), updated_at = now()
   WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such flag: %', p_key; END IF;
  RETURN p_enabled;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_feature_flag(text, boolean) TO authenticated;
