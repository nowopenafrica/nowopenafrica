/*
  # Scheduled OpenReels

  An owner can add a reel now and have it appear on the public profile later —
  the same "prepare it when you have time, publish when it lands best" pattern
  the Studio's content planner already encourages.

  `scheduled_for` NULL (the default, and every existing row) means "live now", so
  this is purely additive and changes nothing about what is already published.

  The public read policy is narrowed to hide rows dated in the future. Doing it
  in RLS rather than only in the client is the point: a scheduled reel must not
  be visible to anyone who queries the table directly, and the owner's own
  dashboard keeps seeing it through the owner policy below.
*/

ALTER TABLE public.business_gallery
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

-- Public readers only see what is already due.
DROP POLICY IF EXISTS "Anyone can view business gallery" ON public.business_gallery;
DROP POLICY IF EXISTS "Public can view business gallery" ON public.business_gallery;
DROP POLICY IF EXISTS "Public can view due gallery items" ON public.business_gallery;
CREATE POLICY "Public can view due gallery items" ON public.business_gallery
  FOR SELECT USING (scheduled_for IS NULL OR scheduled_for <= now());

-- Owners keep full sight of their own, including anything still queued.
DROP POLICY IF EXISTS "Owners view own gallery" ON public.business_gallery;
CREATE POLICY "Owners view own gallery" ON public.business_gallery
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_gallery.business_id
        AND b.user_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Ordering the profile feed by publish time needs an index once a business has
-- a real backlog.
CREATE INDEX IF NOT EXISTS idx_business_gallery_scheduled
  ON public.business_gallery (business_id, scheduled_for);
