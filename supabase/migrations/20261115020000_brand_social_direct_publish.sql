-- Brand social: publish approved posts straight to Meta at their planned time.
--
-- Found 2026-11-15: none of the 52 posts planned 30 Oct to 14 Nov reached
-- Facebook or Instagram. Both Zoho files were downloaded and never uploaded,
-- and the Zoho Flow route is still broken on Zoho's side. Meanwhile the
-- stored Meta system-user token (never expires) already holds
-- pages_manage_posts with CREATE_CONTENT on the NowOpen Page, so Facebook can
-- be posted to directly, with no Zoho in the way.
--
-- Rules, unchanged from the rest of brand social:
--   * Only an APPROVED post with a recorded approver is published.
--   * Nothing is published until the founder switches direct publishing on.
--   * A post is never published late by more than the grace window: a post
--     planned for yesterday morning is not posted at midnight.
--   * Only the publisher (service role) moves a channel to sending / sent /
--     failed; the existing guard triggers already enforce that.
--
-- Each channel picks its route. 'zoho' keeps today's path (Zoho file / Flow).
-- 'meta_direct' is published by brand-social-publish. Only Facebook is moved
-- here: Instagram also needs instagram_content_publish on the token, which it
-- does not have yet.

ALTER TABLE public.brand_social_channels
  ADD COLUMN IF NOT EXISTS publish_route text NOT NULL DEFAULT 'zoho'
    CHECK (publish_route IN ('zoho','meta_direct')),
  ADD COLUMN IF NOT EXISTS external_account_id text;

UPDATE public.brand_social_channels
   SET publish_route = 'meta_direct', external_account_id = '269966327004474'
 WHERE id = 'facebook' AND external_account_id IS NULL;
UPDATE public.brand_social_channels
   SET external_account_id = '17841406090696222'
 WHERE id = 'instagram' AND external_account_id IS NULL;

ALTER TABLE public.brand_social_variants
  ADD COLUMN IF NOT EXISTS external_post_id text,
  ADD COLUMN IF NOT EXISTS published_url text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_brand_social_variants_due
  ON public.brand_social_variants (dispatch_status, channel, next_attempt_at);

ALTER TABLE public.brand_social_settings
  ADD COLUMN IF NOT EXISTS direct_publish_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS direct_publish_grace_minutes int NOT NULL DEFAULT 120
    CHECK (direct_publish_grace_minutes BETWEEN 10 AND 1440),
  ADD COLUMN IF NOT EXISTS direct_publish_last_tick timestamptz,
  ADD COLUMN IF NOT EXISTS direct_publish_last_result jsonb;

-- The guard keeps people from touching the publisher's fields. Extend it to the
-- new ones, and stop a caption edit on a channel that has already gone out:
-- what is on Facebook cannot be changed from here, so the record must not
-- pretend otherwise.
CREATE OR REPLACE FUNCTION public.guard_brand_social_variant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_status text;
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL OR current_setting('brand_social.trusted', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT status INTO parent_status FROM public.brand_social_content WHERE id = NEW.content_id;
  IF parent_status IN ('sending','sent') THEN
    RAISE EXCEPTION 'This post has already gone to Zoho and cannot be changed here';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.dispatch_status := 'pending'; NEW.attempts := 0; NEW.last_error := NULL;
    NEW.sent_at := NULL; NEW.zoho_reference := NULL; NEW.zoho_confirmed_at := NULL;
    NEW.external_post_id := NULL; NEW.published_url := NULL; NEW.published_at := NULL;
    NEW.verified_at := NULL; NEW.next_attempt_at := NULL;
    IF parent_status = 'approved' THEN
      UPDATE public.brand_social_content SET status = 'in_review' WHERE id = NEW.content_id;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.dispatch_status IN ('sending','sent') AND NEW.caption IS DISTINCT FROM OLD.caption THEN
    RAISE EXCEPTION 'The % version has already gone out and cannot be edited here', OLD.channel;
  END IF;

  NEW.dispatch_status   := OLD.dispatch_status;
  NEW.dispatch_key      := OLD.dispatch_key;
  NEW.attempts          := OLD.attempts;
  NEW.last_error        := OLD.last_error;
  NEW.sent_at           := OLD.sent_at;
  NEW.zoho_reference    := OLD.zoho_reference;
  NEW.zoho_confirmed_at := OLD.zoho_confirmed_at;
  NEW.external_post_id  := OLD.external_post_id;
  NEW.published_url     := OLD.published_url;
  NEW.published_at      := OLD.published_at;
  NEW.verified_at       := OLD.verified_at;
  NEW.next_attempt_at   := OLD.next_attempt_at;

  IF parent_status = 'approved' AND NEW.caption IS DISTINCT FROM OLD.caption THEN
    UPDATE public.brand_social_content SET status = 'in_review' WHERE id = NEW.content_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Record the published link in the audit trail too.
CREATE OR REPLACE FUNCTION public.audit_brand_social_variant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.dispatch_status IS DISTINCT FROM OLD.dispatch_status
     OR NEW.zoho_confirmed_at IS DISTINCT FROM OLD.zoho_confirmed_at
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    INSERT INTO public.brand_social_audit (content_id, variant_id, action, actor, detail)
    VALUES (NEW.content_id, NEW.id,
            CASE WHEN NEW.zoho_confirmed_at IS DISTINCT FROM OLD.zoho_confirmed_at THEN 'zoho_confirmed'
                 WHEN NEW.verified_at IS DISTINCT FROM OLD.verified_at AND NEW.dispatch_status IS NOT DISTINCT FROM OLD.dispatch_status THEN 'publish_verified'
                 ELSE 'dispatch_' || NEW.dispatch_status END,
            auth.uid(),
            jsonb_build_object('channel', NEW.channel, 'error', NEW.last_error, 'zoho_reference', NEW.zoho_reference,
                               'external_post_id', NEW.external_post_id, 'published_url', NEW.published_url));
  END IF;
  RETURN NEW;
END;
$$;

-- Every five minutes. Fails closed and quietly without the secret, like the
-- other ticks; the function refuses without it as well, and does nothing at
-- all while direct publishing is switched off.
CREATE OR REPLACE FUNCTION public.tick_brand_social_publish()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text; v_anon text; v_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.brand_social_settings WHERE direct_publish_enabled) THEN
    RETURN NULL;
  END IF;
  SELECT value INTO v_key  FROM public.private_config WHERE key = 'automation_secret';
  SELECT value INTO v_anon FROM public.private_config WHERE key = 'anon_key';
  IF v_key IS NULL THEN
    RAISE NOTICE 'tick_brand_social_publish: automation_secret not configured.';
    RETURN NULL;
  END IF;
  SELECT net.http_post(
    url     := 'https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/brand-social-publish',
    body    := '{"action":"tick"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-automation-key', v_key
    ),
    timeout_milliseconds := 55000
  ) INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.tick_brand_social_publish() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('nowopen-brand-social-publish')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nowopen-brand-social-publish');
SELECT cron.schedule('nowopen-brand-social-publish', '*/5 * * * *',
  $cron$select public.tick_brand_social_publish();$cron$);
