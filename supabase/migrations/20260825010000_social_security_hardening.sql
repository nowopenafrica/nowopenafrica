-- Security hardening for the social integration.

-- ---------------------------------------------------------------------------
-- 1. Pin search_path on the two SECURITY DEFINER functions that were missing it
-- ---------------------------------------------------------------------------
--
-- A SECURITY DEFINER function runs with the privileges of its owner. Without a
-- pinned search_path, the schemas it resolves unqualified names against are
-- whatever the CALLER has set — so anyone able to create an object in a schema
-- earlier in that path can have their version called with owner privileges.
-- Every other definer function in this project already pins it; these two were
-- the exceptions.

-- Also widened from "connections I personally made" to "connections belonging
-- to a business I am on the team of". Publishing is now authorised by
-- has_business_role, so listing had to match: a manager who could post through
-- an account could not see that the account was connected, which reads as the
-- integration being broken.
CREATE OR REPLACE FUNCTION public.get_my_social_connections()
RETURNS TABLE (
  business_id   uuid,
  provider      text,
  account_id    text,
  account_name  text,
  connected_at  timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT sc.business_id, sc.provider, sc.account_id, sc.account_name, sc.created_at
  FROM public.social_connections sc
  WHERE public.is_business_member(sc.business_id)
  ORDER BY sc.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_social_connections() TO authenticated;

-- Tokens are never selected here, and must never be: this function is the only
-- route the browser has to the connections table.

CREATE OR REPLACE FUNCTION public.prune_social_auth_pending()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  -- Body unchanged from the original migration. social_auth_pending has no
  -- expires_at column — the handshake window is derived from created_at.
  DELETE FROM public.social_auth_pending
  WHERE created_at < now() - interval '10 minutes';
$$;

-- ---------------------------------------------------------------------------
-- 2. Record that tokens are now encrypted at rest
-- ---------------------------------------------------------------------------
--
-- The columns hold an AES-256-GCM envelope ("v1:<iv>:<ciphertext>") produced by
-- functions/_shared/tokenCrypto.ts, keyed by the SOCIAL_TOKEN_KEY secret. RLS
-- keeps this table away from the API; the envelope keeps it out of a leaked
-- backup or a snapshot handed to a contractor. Rows written before the key was
-- configured stay readable as plaintext and are re-wrapped on next write.

COMMENT ON COLUMN public.social_connections.access_token IS
  'AES-256-GCM envelope (v1:iv:ciphertext) when SOCIAL_TOKEN_KEY is set; legacy rows may be plaintext. Never expose to a client.';
COMMENT ON COLUMN public.social_connections.refresh_token IS
  'AES-256-GCM envelope (v1:iv:ciphertext) when SOCIAL_TOKEN_KEY is set; legacy rows may be plaintext. Never expose to a client.';
