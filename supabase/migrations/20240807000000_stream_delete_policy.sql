/*
  # Let owners delete their own live streams regardless of verification

  The original business_streams policy is a single FOR ALL policy gated on the
  business being verified (b.verified = true OR is_admin()). That gate is right
  for *going live*, but it also blocks DELETE — so the owner of an unverified
  business can't remove their own stream records from Stream History.

  Add a dedicated, permissive DELETE policy scoped only to ownership (or admin).
  Permissive policies are OR'd, so this lifts the verified requirement for
  DELETE while leaving the create/update gate intact.
*/

DROP POLICY IF EXISTS "Owners delete their streams" ON public.business_streams;
CREATE POLICY "Owners delete their streams" ON public.business_streams
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id
        AND (b.user_id::text = auth.uid()::text OR public.is_admin())
    )
  );
