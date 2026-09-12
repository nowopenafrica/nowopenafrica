-- ⚠ DO NOT APPLY THIS UNTESTED.
--
-- Unlike the other migrations in this batch, this one REPLACES a live policy on
-- the authentication table. If the WITH CHECK is wrong in any way, users cannot
-- update their own profiles at all — a total regression on a core flow, on the
-- one table where a mistake locks people out rather than degrading gracefully.
--
-- It cannot be rehearsed, because development and production share a single
-- Supabase project (see finding N1 in audits/NOWOPEN_FINAL_REAUDIT.md). There
-- is nowhere to try it that is not production.
--
-- So: apply this only after a staging database exists, or in a transaction that
-- is verified and then committed by hand:
--
--   begin;
--   \i 20260907190000_users_column_guard_policy.sql
--   -- then, as a NON-admin user, confirm a name change still succeeds
--   -- and a role change is rejected
--   commit;   -- or rollback
--
-- The escalation it defends against is not currently exploitable — the trigger
-- holds. This is depth, not a fix, and it is not worth risking sign-in to rush.

-- Defence in depth on the one thing that must never regress: who is an admin.
--
-- WHAT IS ALREADY TRUE
--
-- Role escalation is NOT currently exploitable. The `guard_user_role_column`
-- trigger freezes `NEW.role := OLD.role` for anyone who is neither
-- `service_role` nor already an admin, and `guard_user_plan_columns` does the
-- same for the plan columns. Both were verified present in production, both
-- are SECURITY DEFINER with a pinned search_path, and `is_admin()` reads the
-- role through a definer function that cannot be spoofed by search-path
-- injection. That is a working mitigation and this migration does not replace
-- it.
--
-- WHAT IS THIN
--
-- The mitigation is the ONLY layer. The RLS policy underneath it is:
--
--   UPDATE "Users can update own profile"  USING (auth.uid() = id)
--
-- No WITH CHECK, no column list. In Postgres an UPDATE policy with only USING
-- applies that expression as the check too, so read alone the policy permits
-- `update({ role: 'admin' })` on your own row. Only the trigger stops it.
--
-- Which means a single accident restores a critical vulnerability silently: a
-- migration that recreates `public.users`, a table rebuild, a `DROP TRIGGER`
-- in a cleanup script. There is no test that would fail and nothing in the
-- application would behave differently — the next `update` would simply
-- succeed. For privilege escalation, one layer is not enough.
--
-- WHAT THIS ADDS
--
-- A WITH CHECK on the policy itself, so the database refuses the write rather
-- than quietly discarding the column. Two layers that fail independently.
--
-- A note on behaviour: the trigger SILENTLY reverts a role change (the caller
-- gets a success response and nothing happens), whereas this policy REJECTS
-- the statement. Rejection is the better signal — a client attempting it
-- learns that it is not allowed instead of believing it worked. Since the
-- trigger runs BEFORE the policy's check is evaluated, and it has already
-- reset the value to OLD.role, a legitimate update to other columns still
-- passes. Only a request that reaches the check with a changed role fails.

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- The privileged columns, spelled out. Anyone may edit their own name,
    -- avatar or phone; nobody may promote themselves.
    AND (
      public.is_admin()
      OR (
        role              IS NOT DISTINCT FROM (SELECT u.role              FROM public.users u WHERE u.id = auth.uid())
        AND plan          IS NOT DISTINCT FROM (SELECT u.plan              FROM public.users u WHERE u.id = auth.uid())
        AND plan_status   IS NOT DISTINCT FROM (SELECT u.plan_status       FROM public.users u WHERE u.id = auth.uid())
      )
    )
  );

COMMENT ON POLICY "Users can update own profile" ON public.users IS
  'Own-row updates, with role/plan/plan_status pinned for non-admins. Second layer behind guard_user_role_column and guard_user_plan_columns — the trigger silently reverts, this rejects. Both exist so that dropping one does not silently restore privilege escalation.';
