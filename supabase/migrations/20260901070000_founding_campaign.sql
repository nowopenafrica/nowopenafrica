/*
  # The Founding 1,000 campaign

  A campaign layer over the existing product. It adds configuration, referral
  tracking and one public statistics function — and deliberately adds no second
  authentication, no second onboarding, and no second business table. Every CTA
  on the campaign page routes into flows that already exist.

  ## The counter is server-authoritative and never invented

  campaign_stats() counts real rows. There is no seeded head start and no
  fallback number: when nothing has happened it returns zeros and the page says
  the campaign is opening. A fabricated "742 already joined" shown to the exact
  people being asked to trust the platform is noticed once and remembered.

  It is SECURITY DEFINER and public because the page is public, but it returns
  only aggregates — never a row, a name or an email.

  ## Referrals are counted on activation, not registration

  A referral reaches 'activated' only when the referred person does something
  that means the product worked: kept a business, or created/claimed one.
  Rewarding raw signups rewards throwaway accounts, which is the same mistake
  the Founding programme exists to avoid.

  Activation is written by triggers, never by the client. The client can only
  claim a code; whether that claim ever matures is decided here.

  Re-runnable throughout.
*/

-- ---------------------------------------------------------------- campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  slug              text PRIMARY KEY,
  name              text NOT NULL,
  status            text NOT NULL DEFAULT 'draft',
  starts_at         timestamptz,
  ends_at           timestamptz,
  target_users      integer NOT NULL DEFAULT 1000,
  target_businesses integer NOT NULL DEFAULT 300,
  /* Copy an admin can change without a deploy. Null falls back to the code. */
  hero_headline     text,
  hero_subcopy      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft','scheduled','live','paused','ended'));

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_targets_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_targets_check
  CHECK (target_users > 0 AND target_businesses > 0);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

/* Public read: the page shows the targets and the status. Nothing private. */
DROP POLICY IF EXISTS "Campaigns are public" ON public.campaigns;
CREATE POLICY "Campaigns are public" ON public.campaigns FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage campaigns" ON public.campaigns;
CREATE POLICY "Admins manage campaigns" ON public.campaigns
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

/*
  Ships as 'draft' on purpose.
  Going live is a decision somebody makes, not a side effect of a migration.
*/
INSERT INTO public.campaigns (slug, name, status, target_users, target_businesses)
VALUES ('founding-1000', 'The Founding 1,000', 'draft', 1000, 300)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------ referral code
/*
  A short, stable, shareable code per person.

  Not the user id: a UUID in a WhatsApp message looks like spam and cannot be
  read aloud. Generated on first request and then fixed, so a link already
  shared keeps working forever.
*/
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code
  ON public.users (referral_code) WHERE referral_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.my_referral_code()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; v_uid uuid := auth.uid(); v_try integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;

  SELECT referral_code INTO v_code FROM public.users WHERE id = v_uid;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  /*
     Base32-ish without vowels or look-alikes, so a code cannot spell anything
     unfortunate and 0/O and 1/I cannot be misread off a poster.
  */
  LOOP
    v_try := v_try + 1;
    v_code := upper(
      substr(translate(encode(gen_random_bytes(8), 'base64'), '+/=OIL01AEU', 'XYZ2345678'), 1, 6)
    );
    BEGIN
      UPDATE public.users SET referral_code = v_code WHERE id = v_uid;
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF v_try > 12 THEN RAISE EXCEPTION 'Could not allocate a referral code'; END IF;
    END;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_referral_code() TO authenticated;

-- --------------------------------------------------------------- referrals
CREATE TABLE IF NOT EXISTS public.campaign_referrals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug text NOT NULL REFERENCES public.campaigns(slug) ON DELETE CASCADE,
  referrer_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /* One referrer per referred person, ever — hence the primary-key-like index. */
  referred_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'joined',
  activated_at  timestamptz,
  activation    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_referrals_no_self CHECK (referrer_id <> referred_id)
);

ALTER TABLE public.campaign_referrals DROP CONSTRAINT IF EXISTS campaign_referrals_status_check;
ALTER TABLE public.campaign_referrals ADD CONSTRAINT campaign_referrals_status_check
  CHECK (status IN ('joined','activated','rejected'));

/* A person can be referred once. Later claims lose, rather than stacking. */
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_referrals_referred
  ON public.campaign_referrals (campaign_slug, referred_id);
CREATE INDEX IF NOT EXISTS idx_campaign_referrals_referrer
  ON public.campaign_referrals (referrer_id, status);

ALTER TABLE public.campaign_referrals ENABLE ROW LEVEL SECURITY;

/*
  A person may read the referrals they made — that is their Founding Circle —
  and nothing else. No INSERT or UPDATE policy at all: claiming goes through
  claim_referral() and activation is written by triggers, so a client cannot
  mark its own referral activated.
*/
DROP POLICY IF EXISTS "See referrals you made" ON public.campaign_referrals;
CREATE POLICY "See referrals you made" ON public.campaign_referrals
  FOR SELECT TO authenticated USING (referrer_id = auth.uid() OR public.is_admin());

/*
  Claim a referral code.

  Called once, just after the referred person authenticates. Everything that
  could be lied about is settled here: that the code exists, that it is not
  their own, that they have not already been referred, and that they are new
  enough for the claim to be plausible.
*/
CREATE OR REPLACE FUNCTION public.claim_referral(p_code text, p_campaign text DEFAULT 'founding-1000')
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_referrer uuid; v_created timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF p_code IS NULL OR btrim(p_code) = '' THEN RETURN 'no-code'; END IF;

  SELECT id INTO v_referrer FROM public.users
   WHERE referral_code = upper(btrim(p_code));
  IF v_referrer IS NULL THEN RETURN 'unknown-code'; END IF;
  IF v_referrer = v_uid THEN RETURN 'self-referral'; END IF;

  /*
    Only a genuinely new account may be attributed. Without this, anybody could
    paste a code months later and hand the referrer a credit for a user who was
    already here.
  */
  SELECT created_at INTO v_created FROM auth.users WHERE id = v_uid;
  IF v_created IS NOT NULL AND v_created < now() - interval '7 days' THEN
    RETURN 'too-late';
  END IF;

  INSERT INTO public.campaign_referrals (campaign_slug, referrer_id, referred_id)
  VALUES (p_campaign, v_referrer, v_uid)
  ON CONFLICT (campaign_slug, referred_id) DO NOTHING;

  RETURN 'joined';
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_referral(text,text) TO authenticated;

/*
  Activation, written only by the database.

  The definition of a meaningful action: the referred person kept a business, or
  created/claimed one. Both are the product working, and neither can be faked by
  registering.
*/
CREATE OR REPLACE FUNCTION public.activate_referral(p_user uuid, p_reason text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.campaign_referrals
     SET status = 'activated', activated_at = now(), activation = p_reason
   WHERE referred_id = p_user AND status = 'joined';
$$;

CREATE OR REPLACE FUNCTION public.trg_referral_activate_keep()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.activate_referral(NEW.user_id, 'kept a business');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_referral_on_keep ON public.business_keeps;
CREATE TRIGGER trg_referral_on_keep
  AFTER INSERT ON public.business_keeps
  FOR EACH ROW EXECUTE FUNCTION public.trg_referral_activate_keep();

CREATE OR REPLACE FUNCTION public.trg_referral_activate_business()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.activate_referral(NEW.user_id, 'added or claimed a business');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_referral_on_business ON public.businesses;
CREATE TRIGGER trg_referral_on_business
  AFTER INSERT OR UPDATE OF user_id ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.trg_referral_activate_business();

/** A person's own Founding Circle: counts only, no names. */
CREATE OR REPLACE FUNCTION public.my_founding_circle(p_campaign text DEFAULT 'founding-1000')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT jsonb_build_object(
    'invited',   count(*),
    'activated', count(*) FILTER (WHERE status = 'activated')
  ) INTO r
    FROM public.campaign_referrals
   WHERE campaign_slug = p_campaign AND referrer_id = v_uid;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_founding_circle(text) TO authenticated;

-- ------------------------------------------------------------------- stats
/*
  The campaign counter.

  Aggregates only, and every one of them counted rather than stored — so the
  page cannot drift from the database, and there is nothing to forget to
  update. Public because the campaign page is public.

  `businesses` counts publicly listable businesses, which is what a visitor can
  actually find. Counting the hidden prospect shells would inflate the number
  with listings nobody can reach.
*/
CREATE OR REPLACE FUNCTION public.campaign_stats(p_campaign text DEFAULT 'founding-1000')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; r jsonb;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE slug = p_campaign;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'slug',              c.slug,
    'name',              c.name,
    'status',            c.status,
    'starts_at',         c.starts_at,
    'ends_at',           c.ends_at,
    'target_users',      c.target_users,
    'target_businesses', c.target_businesses,
    'hero_headline',     c.hero_headline,
    'hero_subcopy',      c.hero_subcopy,
    'users',             (SELECT count(*) FROM public.users),
    'businesses',        (SELECT count(*) FROM public.businesses WHERE is_listable),
    'claimed',           (SELECT count(*) FROM public.businesses WHERE claim_status = 'claimed'),
    'founding',          (SELECT count(*) FROM public.founding_members),
    'cities',            (SELECT count(DISTINCT lower(btrim(location)))
                            FROM public.businesses
                           WHERE is_listable AND coalesce(btrim(location),'') <> ''),
    'categories',        (SELECT count(DISTINCT lower(btrim(category)))
                            FROM public.businesses
                           WHERE is_listable AND coalesce(btrim(category),'') <> ''),
    'offers',            (SELECT count(*) FROM public.business_offers
                           WHERE coalesce(active, true)
                             AND (starts_at IS NULL OR starts_at <= now())
                             AND (ends_at   IS NULL OR ends_at   >= now()))
  ) INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.campaign_stats(text) TO anon, authenticated;
