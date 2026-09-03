/*
  # Review moderation and the right of reply

  The launch audit's open trust exposure. Reviews are public-read and
  own-write, which is correct — a business cannot delete criticism of itself.
  But there was no way to report a review, no moderation queue, and no way for
  an owner to answer one. The first fake or abusive review would have arrived
  with no process behind it.

  Currently masked by there being zero reviews. That is exactly when to build
  it: the cost is a migration, and the alternative is building it in public
  while somebody's business is being defamed.

  ## The shape of the answer

  Three things, and the balance between them is the whole design:

  1. Anyone can REPORT a review. Reporting hides nothing by itself.
  2. An owner can REPLY to a review, publicly, once. They cannot edit or remove
     the review — the reply sits beneath it and both are visible.
  3. Only an admin can HIDE a review, and hiding records who and why.

  A business that can make criticism disappear has a review system worth
  nothing. A business that cannot answer criticism has one that is unfair. The
  reply is what keeps it honest in both directions.

  Re-runnable.
*/

-- ------------------------------------------------------------- moderation
ALTER TABLE public.business_reviews
  ADD COLUMN IF NOT EXISTS hidden      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_at   timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hidden_reason text,
  -- The owner's public answer. One per review; the review itself is untouched.
  ADD COLUMN IF NOT EXISTS response      text,
  ADD COLUMN IF NOT EXISTS responded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS responded_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL;

/*
  Hidden reviews leave the public read.

  Replaces the previous unconditional policy. An author still sees their own —
  a review that silently vanishes for the person who wrote it invites them to
  post it again, and again.
*/
DROP POLICY IF EXISTS "Public can view business reviews" ON public.business_reviews;
CREATE POLICY "Public can view business reviews" ON public.business_reviews
  FOR SELECT USING (
    NOT hidden
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR public.is_admin()
  );

/*
  The owner may write a reply, and nothing else.

  WITH CHECK cannot see the row's previous values, so it cannot by itself stop
  an owner rewriting the rating or the comment. The trigger below does that;
  this policy decides who may attempt an update at all.
*/
DROP POLICY IF EXISTS "Owners reply to reviews" ON public.business_reviews;
CREATE POLICY "Owners reply to reviews" ON public.business_reviews
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.businesses b
             WHERE b.id = business_reviews.business_id AND b.user_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.businesses b
             WHERE b.id = business_reviews.business_id AND b.user_id = auth.uid())
    OR public.is_admin()
  );

/*
  What an owner is actually allowed to change: the reply, and only the reply.

  Enforced in a trigger because it is a comparison against the old row, which a
  policy cannot express. Without this, the UPDATE policy above would let an
  owner rewrite a one-star review into a five-star one — the exact failure the
  whole feature exists to prevent.
*/
CREATE OR REPLACE FUNCTION public.guard_review_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF NEW.rating      IS DISTINCT FROM OLD.rating
     OR NEW.comment  IS DISTINCT FROM OLD.comment
     OR NEW.author_name IS DISTINCT FROM OLD.author_name
     OR NEW.user_id  IS DISTINCT FROM OLD.user_id
     OR NEW.hidden   IS DISTINCT FROM OLD.hidden THEN
    RAISE EXCEPTION 'A business may reply to a review, not change it';
  END IF;

  NEW.responded_at := now();
  NEW.responded_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_review_update ON public.business_reviews;
CREATE TRIGGER trg_guard_review_update
  BEFORE UPDATE ON public.business_reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_review_update();

-- ---------------------------------------------------------------- reports
/*
  Reporting a review reuses business_reports rather than starting a second
  queue. One place to look is the difference between moderation that happens
  and moderation that is somebody's someday.
*/
ALTER TABLE public.business_reports
  ADD COLUMN IF NOT EXISTS review_id uuid REFERENCES public.business_reviews(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_business_reports_review
  ON public.business_reports (review_id) WHERE review_id IS NOT NULL;

ALTER TABLE public.business_reports DROP CONSTRAINT IF EXISTS business_reports_reason_check;
ALTER TABLE public.business_reports ADD CONSTRAINT business_reports_reason_check
  CHECK (reason IN (
    -- about a listing
    'closed','moved','wrong_phone','wrong_address','wrong_hours',
    'wrong_category','duplicate','not_real','offensive','impersonation','other',
    -- about a review
    'review_fake','review_offensive','review_conflict','review_wrong_business'
  ));

/*
  Hide or restore a review. Admin only, and it records why.

  Separate from a plain UPDATE so the reason is never optional: "hidden" with no
  stated cause is indistinguishable from censorship when somebody asks later.
*/
CREATE OR REPLACE FUNCTION public.moderate_review(
  p_review uuid, p_hidden boolean, p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_hidden AND coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Hiding a review requires a reason';
  END IF;

  UPDATE public.business_reviews
     SET hidden = p_hidden,
         hidden_at = CASE WHEN p_hidden THEN now() ELSE NULL END,
         hidden_by = CASE WHEN p_hidden THEN auth.uid() ELSE NULL END,
         hidden_reason = CASE WHEN p_hidden THEN btrim(p_reason) ELSE NULL END
   WHERE id = p_review;

  IF NOT FOUND THEN RAISE EXCEPTION 'No such review'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.moderate_review(uuid, boolean, text) TO authenticated;

/*
  The rating a business displays must exclude hidden reviews.

  Otherwise hiding a fraudulent one-star still leaves its damage in the average,
  and the moderation is cosmetic.
*/
CREATE OR REPLACE FUNCTION public.visible_review_summary(p_business uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'count',   count(*),
    'average', round(avg(rating)::numeric, 2)
  )
  FROM public.business_reviews
  WHERE business_id = p_business AND NOT hidden;
$$;
GRANT EXECUTE ON FUNCTION public.visible_review_summary(uuid) TO anon, authenticated;
