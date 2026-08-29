/*
  # Scope push-token updates to the owning user (C5)

  The original policy let any caller holding the public anon key — which ships
  in the JS bundle — PATCH every row in the table (USING true), redirecting all
  platform push notifications to an attacker-controlled device.

  Registration stays open (the token itself is the opaque device identifier),
  but updates now require an authenticated session acting on a row it owns
  (user_id = auth.uid()). Anonymous devices register a fresh token by INSERT —
  token is UNIQUE, so re-registering the same token is a no-op — and linking a
  token to a signed-in account is an authenticated UPDATE of the owner's own
  row. Mobile clients that need an idempotent upsert for anonymous devices
  should do it through an edge function using the service role.
*/

DROP POLICY IF EXISTS "Anyone can update a push token" ON device_push_tokens;
-- The new name has to be dropped too, or re-running this aborts with
-- `42710: policy … already exists` and every later statement is skipped.
DROP POLICY IF EXISTS "Users update their own push token" ON device_push_tokens;
CREATE POLICY "Users update their own push token" ON device_push_tokens
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
