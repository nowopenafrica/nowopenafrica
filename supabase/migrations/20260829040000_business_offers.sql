/*
  # Offers

  The last piece of the loop. Keep already sends promotions, and the composer
  in Studio can write one by hand — but there was nowhere to PUT an offer, so
  Discover had no Offers surface (the nav tab was removed rather than shipped
  pointing at an empty page) and a promotion vanished the moment its
  notification was read.

  An offer is a row with a life: it starts, it ends, and it stops being true.
  That is why this is a table and not another jsonb column on businesses —
  unlike the story fields, offers ARE queried across businesses ("what is on
  this weekend?"), and they expire, which means the database has to be able to
  filter them by time.

  THE TRIGGER IS THE POINT

  Publishing an offer notifies everyone who keeps that business and asked for
  promotions, through the same notify_keepers throttle as everything else. An
  offer nobody hears about is a poster in a locked room.

  Re-runnable: IF NOT EXISTS throughout, policies dropped before create.
*/

CREATE TABLE IF NOT EXISTS public.business_offers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  /* The headline number, kept as text: "20% OFF", "Buy 2 get 1", "₦5,000 off".
     A numeric percent could not express most real African retail offers. */
  headline    text,
  code        text,
  image_url   text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_offers_business ON public.business_offers (business_id, created_at DESC);
-- Discover asks "what is running now?" across every business, so the filter
-- that answers it gets its own index.
CREATE INDEX IF NOT EXISTS idx_business_offers_live ON public.business_offers (active, ends_at);

ALTER TABLE public.business_offers ENABLE ROW LEVEL SECURITY;

/*
  Read: anyone, but only offers that are actually on.

  Expiry is enforced HERE rather than in the app. A closing date that only the
  frontend respects is a discount the business is still legally offering to
  anyone who calls the API directly.
*/
DROP POLICY IF EXISTS "Public can view running offers" ON public.business_offers;
CREATE POLICY "Public can view running offers" ON public.business_offers
  FOR SELECT
  USING (
    active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >= now())
  );

DROP POLICY IF EXISTS "Owners manage their offers" ON public.business_offers;
CREATE POLICY "Owners manage their offers" ON public.business_offers
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())
  ));

/*
  Tell the people who keep this business.

  Guarded and swallowing its own errors, for the same reason as the other keep
  triggers: it runs inside the owner's transaction, and a failed notification
  must never roll back the offer that caused it.
*/
CREATE OR REPLACE FUNCTION public.keep_notify_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_slug text;
BEGIN
  -- A draft, or one that has already ended, is not news.
  IF NOT NEW.active THEN RETURN NEW; END IF;
  IF NEW.ends_at IS NOT NULL AND NEW.ends_at < now() THEN RETURN NEW; END IF;

  BEGIN
    SELECT b.name, coalesce(b.username, b.id::text) INTO v_name, v_slug
    FROM public.businesses b WHERE b.id = NEW.business_id;
    PERFORM public.notify_keepers(
      NEW.business_id, 'promotions',
      coalesce(nullif(NEW.headline, ''), 'New offer') || ' at ' || v_name,
      NEW.title, '/' || v_slug);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'keep notify (offer) failed for %: %', NEW.business_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_offer ON public.business_offers;
CREATE TRIGGER trg_keep_offer
  AFTER INSERT ON public.business_offers
  FOR EACH ROW EXECUTE FUNCTION public.keep_notify_offer();
