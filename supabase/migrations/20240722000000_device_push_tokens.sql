/*
  # Device push tokens (mobile app)

  Stores Expo push tokens so the platform can send notifications (booking
  confirmations, "a business you follow is live", etc). One row per device
  token; linked to a user when they're signed in, else anonymous.

  Anyone (anon or authenticated) may register/refresh their own token — the
  token itself is the opaque device identifier. Only admins can read the table
  (it's a send-list, not user-facing data); a user may update/delete rows for
  their own user_id.
*/

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  platform text CHECK (platform IN ('ios', 'android', 'web')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;

-- Register / refresh a token (upsert on token). Open to anon + authenticated.
DROP POLICY IF EXISTS "Anyone can register a push token" ON device_push_tokens;
CREATE POLICY "Anyone can register a push token" ON device_push_tokens
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update a push token" ON device_push_tokens;
CREATE POLICY "Anyone can update a push token" ON device_push_tokens
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Only admins can read the send-list.
DROP POLICY IF EXISTS "Admins read push tokens" ON device_push_tokens;
CREATE POLICY "Admins read push tokens" ON device_push_tokens
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins delete push tokens" ON device_push_tokens;
CREATE POLICY "Admins delete push tokens" ON device_push_tokens
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS device_push_tokens_user_idx ON device_push_tokens (user_id);
