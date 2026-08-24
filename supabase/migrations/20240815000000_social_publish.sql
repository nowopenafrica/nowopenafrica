/*
  # Social publishing connections (real OAuth)

  Backing store for the Studio's Schedule & Publish tool so it can post to
  Instagram, Facebook, LinkedIn, X and TikTok for real instead of simulating
  delivery.

  Three tables:
    - social_connections   OAuth tokens + account metadata per (business, channel).
    - social_auth_pending  One-time OAuth handshake records (nonce, PKCE
                           verifier) so the provider callback can complete a
                           login that started with an authenticated request.
    - social_publish_log   What actually got posted where, keyed by (job, channel)
                           so a publish is idempotent and auditable.

  Security model: RLS is ON with no owner-facing policies — only the service
  role (the social-auth / social-publish edge functions) can touch the tables,
  so OAuth access tokens can never be read from the browser. Owners see their
  connection metadata through the security-definer get_my_social_connections().
*/

-- ---------------------------------------------------------------------------
-- 1. OAuth connections
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.social_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider IN ('instagram','facebook','linkedin','x','tiktok')),
  -- Platform-side id of the account/page (Instagram business account id,
  -- Facebook page id, LinkedIn person id, X user id, TikTok open_id).
  account_id        text NOT NULL,
  -- Display name / handle for the UI.
  account_name      text,
  -- Tokens. Never exposed to the client, and encrypted at rest by
  -- functions/_shared/tokenCrypto.ts (AES-256-GCM, keyed by SOCIAL_TOKEN_KEY).
  -- See 20260825010000_social_security_hardening.sql.
  access_token      text NOT NULL,
  refresh_token     text,
  token_expires_at  timestamptz,
  scope             text,
  -- Provider-specific snapshot (avatar url, page token, ...).
  meta              jsonb,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (business_id, provider, account_id)
);

CREATE INDEX IF NOT EXISTS idx_social_connections_owner
  ON public.social_connections (business_id, user_id);

CREATE INDEX IF NOT EXISTS idx_social_connections_provider
  ON public.social_connections (provider);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: tokens are only ever read/written with the service
-- role from the edge functions.

-- Owners list their own connections (metadata only, never tokens) through a
-- security-definer helper so the browser never touches the table directly.
CREATE OR REPLACE FUNCTION public.get_my_social_connections()
RETURNS TABLE (
  business_id   uuid,
  provider      text,
  account_id    text,
  account_name  text,
  connected_at  timestamptz
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT sc.business_id, sc.provider, sc.account_id, sc.account_name, sc.created_at
  FROM public.social_connections sc
  WHERE sc.user_id = auth.uid()
  ORDER BY sc.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_social_connections() TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_social_connections_touch ON public.social_connections;
CREATE TRIGGER trg_social_connections_touch
  BEFORE UPDATE ON public.social_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. One-time OAuth handshake records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.social_auth_pending (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text NOT NULL,
  business_id      uuid NOT NULL,
  user_id          uuid NOT NULL,
  nonce            text NOT NULL UNIQUE,
  -- PKCE code verifier (X requires PKCE). Deleted once the callback completes.
  code_verifier    text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.social_auth_pending ENABLE ROW LEVEL SECURITY;
-- Service role only, same as above.

CREATE INDEX IF NOT EXISTS idx_social_auth_pending_nonce
  ON public.social_auth_pending (nonce);

-- Handshakes older than 10 minutes can never complete — sweep them lazily on
-- every new handshake.
CREATE OR REPLACE FUNCTION public.prune_social_auth_pending()
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  DELETE FROM public.social_auth_pending
  WHERE created_at < now() - interval '10 minutes';
$$;

GRANT EXECUTE ON FUNCTION public.prune_social_auth_pending() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Publish log (idempotency + audit)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.social_publish_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL,
  user_id       uuid,
  job_id        text NOT NULL,          -- client-side queue job id
  channel       text NOT NULL,          -- instagram | facebook | linkedin | x | tiktok
  status        text NOT NULL,          -- ok | error | simulated
  external_id   text,                   -- platform post id when available
  message       text,
  error         text,
  simulated     boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (job_id, channel)
);

ALTER TABLE public.social_publish_log ENABLE ROW LEVEL SECURITY;

-- Service role writes; owners can read their own publish history.
DROP POLICY IF EXISTS "Owners read publish log" ON public.social_publish_log;
CREATE POLICY "Owners read publish log" ON public.social_publish_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read publish log" ON public.social_publish_log;
CREATE POLICY "Admins read publish log" ON public.social_publish_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Public staging bucket for post media
-- ---------------------------------------------------------------------------

-- Posts are attached as data URLs in the browser; the social-publish function
-- stages them here (service role) to hand each platform a public image_url.
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-media', 'social-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view social media staging" ON storage.objects;
CREATE POLICY "Public can view social media staging" ON storage.objects
  FOR SELECT USING (bucket_id = 'social-media');
