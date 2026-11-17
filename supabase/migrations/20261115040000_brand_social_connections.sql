-- Brand social: NowOpen Africa's own X, LinkedIn, TikTok and YouTube accounts,
-- connected by OAuth and published to directly.
--
-- Meta (Facebook, Instagram) uses the stored system-user token and Threads its
-- own token, so they are not here. Everything else is: one row per provider,
-- connected by an admin through social-auth's brand mode.
--
-- Tokens are encrypted by functions/_shared/tokenCrypto.ts before they reach a
-- row, and brand mode refuses to connect at all while SOCIAL_TOKEN_KEY is unset.
-- No policies: only the service role reads or writes this table. Admins see
-- metadata (never tokens) through brand_social_connection_status().

CREATE TABLE IF NOT EXISTS public.brand_social_connections (
  provider         text PRIMARY KEY CHECK (provider IN ('x','linkedin','tiktok','youtube')),
  account_id       text NOT NULL,
  account_name     text,
  access_token     text NOT NULL,
  refresh_token    text,
  token_expires_at timestamptz,
  scope            text,
  meta             jsonb,
  connected_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at     timestamptz NOT NULL DEFAULT now(),
  refreshed_at     timestamptz,
  last_error       text
);
ALTER TABLE public.brand_social_connections ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.brand_social_connection_status()
RETURNS TABLE (provider text, account_id text, account_name text, token_expires_at timestamptz,
               scope text, connected_at timestamptz, refreshed_at timestamptz, last_error text, has_refresh boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.provider, c.account_id, c.account_name, c.token_expires_at, c.scope, c.connected_at, c.refreshed_at,
         c.last_error, c.refresh_token IS NOT NULL
    FROM public.brand_social_connections c
   WHERE public.is_admin();
$$;
REVOKE ALL ON FUNCTION public.brand_social_connection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_social_connection_status() TO authenticated;

-- Admins may disconnect (delete the row) without seeing the token.
CREATE OR REPLACE FUNCTION public.brand_social_disconnect(p_provider text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  DELETE FROM public.brand_social_connections WHERE provider = p_provider;
  -- A channel that published through this account goes back to Zoho, so the
  -- publisher never tries a connection that no longer exists.
  UPDATE public.brand_social_channels SET publish_route = 'zoho'
   WHERE publish_route = 'direct'
     AND ((p_provider = 'linkedin' AND id IN ('linkedin_company','linkedin_profile')) OR id = p_provider);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.brand_social_disconnect(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_social_disconnect(text) TO authenticated;

-- 'direct' = published by brand-social-publish with an OAuth connection above.
ALTER TABLE public.brand_social_channels DROP CONSTRAINT IF EXISTS brand_social_channels_publish_route_check;
ALTER TABLE public.brand_social_channels ADD CONSTRAINT brand_social_channels_publish_route_check
  CHECK (publish_route IN ('zoho','meta_direct','direct'));

-- Switching a channel to 'direct' needs a live connection for it; switching
-- back to Zoho is always allowed. Enforced here so the screen is not the authority.
CREATE OR REPLACE FUNCTION public.guard_brand_social_channel_route()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE needed text;
BEGIN
  IF NEW.publish_route = 'direct' AND NEW.publish_route IS DISTINCT FROM OLD.publish_route THEN
    needed := CASE WHEN NEW.id IN ('linkedin_company','linkedin_profile') THEN 'linkedin' ELSE NEW.id END;
    IF NOT EXISTS (SELECT 1 FROM public.brand_social_connections WHERE provider = needed) THEN
      RAISE EXCEPTION 'Connect % first: there is no account to publish with.', needed;
    END IF;
    IF NEW.id = 'linkedin_company' AND coalesce(NEW.external_account_id, '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Enter the LinkedIn company page id (numbers only) before publishing to it directly.';
    END IF;
  END IF;
  IF NEW.publish_route = 'meta_direct' AND NEW.id NOT IN ('facebook','instagram','threads') THEN
    RAISE EXCEPTION 'Only Facebook, Instagram and Threads publish through Meta.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_brand_social_channel_route ON public.brand_social_channels;
CREATE TRIGGER trg_guard_brand_social_channel_route
  BEFORE UPDATE ON public.brand_social_channels
  FOR EACH ROW EXECUTE FUNCTION public.guard_brand_social_channel_route();
