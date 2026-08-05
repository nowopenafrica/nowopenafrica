/*
  # Full admin backend coverage

  The admin panel only ever covered users/businesses/adverts/media —
  bookings, checkout attempts, waitlist signups, public registration-form
  submissions, and advert/media enquiries were all invisible to admins (or,
  for platform_enquiries, invisible to *everyone* — there was no owner
  dashboard for it either). Read access already existed for most of these;
  what's missing is the ability to actually manage them (update status,
  delete spam/test rows) — this migration closes that gap.
*/

-- business_registrations: had admin SELECT only — add UPDATE (status
-- workflow: new -> contacted -> approved/rejected) and DELETE.
DROP POLICY IF EXISTS "Admins can update registrations" ON business_registrations;
CREATE POLICY "Admins can update registrations" ON business_registrations
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete registrations" ON business_registrations;
CREATE POLICY "Admins can delete registrations" ON business_registrations
  FOR DELETE TO authenticated USING (public.is_admin());

-- payment_intents: admin already has UPDATE — add DELETE for cleaning up
-- test/duplicate/abandoned checkout rows.
DROP POLICY IF EXISTS "Admins can delete payment intents" ON payment_intents;
CREATE POLICY "Admins can delete payment intents" ON payment_intents
  FOR DELETE TO authenticated USING (public.is_admin());

-- platform_enquiries: admin already has SELECT — add DELETE.
DROP POLICY IF EXISTS "Admins can delete platform enquiries" ON platform_enquiries;
CREATE POLICY "Admins can delete platform enquiries" ON platform_enquiries
  FOR DELETE TO authenticated USING (public.is_admin());

-- business_bookings: owners (or admins, via the existing OR public.is_admin()
-- clause) can already read/update — add an admin-only DELETE, which never
-- existed for anyone on this table.
DROP POLICY IF EXISTS "Admins can delete bookings" ON business_bookings;
CREATE POLICY "Admins can delete bookings" ON business_bookings
  FOR DELETE TO authenticated USING (public.is_admin());
