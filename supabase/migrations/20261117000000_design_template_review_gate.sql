-- # A reviewed score before a template is published
--
-- `design_templates` (20261026130000) let any staff member publish an upload
-- with one click. There was no score anywhere, so nothing stood between an
-- unreviewed layout and the public Create gallery.
--
-- This adds the founder's rule from the Creative Intelligence spec (D3,
-- approved 2026-11-15) to the table itself, so no code path can publish
-- around it:
--
--   published  =>  a review by an admin, decision "approve",
--                  a score of 85 or more on the 100-point rubric,
--                  no critical failures (C1-C13),
--                  and the template has not changed since it was reviewed.
--
-- ## The rubric
--
-- Nine lines, maxima summing to 100: originality 15, art direction 15,
-- typography 15, composition 15, imagery 10, colour 10, brand relevance 10,
-- commercial effectiveness 5, technical execution 5. The reviewer writes the
-- lines; the TOTAL is computed here, never accepted from the browser.
--
-- ## Who reviews
--
-- Only an admin (`is_admin()`), and the reviewer and time are set here from
-- the session, so a review cannot be filed in somebody else's name. Staff
-- who are not admins can still upload and save drafts for review.
--
-- ## Stale reviews
--
-- `review_hash` is md5 of the document at review time. The gate compares it
-- with the document now, so editing a reviewed layout makes it unpublishable
-- until it is reviewed again.
--
-- ## The 71 already live
--
-- On 2026-11-17 production held 71 published rows and no scores. Applying
-- the gate backwards would empty them from the gallery, which is a product
-- decision, not a migration's. They are marked `legacy_listing` and stay
-- listed. The flag can only be cleared: unpublishing one clears it, and
-- nothing can set it again, so a legacy template that comes down goes back
-- up only through a review.
--
-- ## Criticals
--
-- Most criticals are computed in the admin screen (criticalCore.ts) and C10
-- (invented claims) is the reviewer's call; both are recorded in
-- `review_criticals` with the review. The database cannot re-run those
-- checks; it refuses publication while any are recorded. Staff are trusted
-- not to lie to it. The gate is against accidents, not against an admin.
--
-- Re-runnable. Comments are line comments on purpose: block comments nest in
-- Postgres, and a stray close marker in prose has broken a push before.

DROP TRIGGER IF EXISTS design_templates_review_guard ON public.design_templates;

ALTER TABLE public.design_templates
  ADD COLUMN IF NOT EXISTS review_lines     jsonb,
  ADD COLUMN IF NOT EXISTS review_score     smallint,
  ADD COLUMN IF NOT EXISTS review_criticals text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS review_decision  text,
  ADD COLUMN IF NOT EXISTS review_notes     text,
  ADD COLUMN IF NOT EXISTS reviewed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS review_hash      text,
  ADD COLUMN IF NOT EXISTS legacy_listing   boolean NOT NULL DEFAULT false;

ALTER TABLE public.design_templates
  DROP CONSTRAINT IF EXISTS design_templates_review_decision_check;
ALTER TABLE public.design_templates
  ADD CONSTRAINT design_templates_review_decision_check
  CHECK (review_decision IS NULL OR review_decision IN ('approve', 'revise', 'reject'));

-- The grandfathered rows: published before any review could exist.
UPDATE public.design_templates
   SET legacy_listing = true
 WHERE status = 'published' AND review_lines IS NULL AND NOT legacy_listing;

ALTER TABLE public.design_templates DROP CONSTRAINT IF EXISTS design_templates_publish_gate;
ALTER TABLE public.design_templates
  ADD CONSTRAINT design_templates_publish_gate CHECK (
    status <> 'published'
    OR legacy_listing
    OR (
      review_decision = 'approve'
      AND review_score >= 85
      AND cardinality(review_criticals) = 0
      AND reviewed_by IS NOT NULL
      AND review_hash = md5(document::text)
    )
  );

COMMENT ON CONSTRAINT design_templates_publish_gate ON public.design_templates IS
  'Published only with an approved, current review scoring 85+ and no criticals, or as a pre-gate legacy listing.';

-- The rubric, in one place on the database side. Mirrored in
-- src/lib/create/templateReview.ts; a test reads this file to keep them equal.
CREATE OR REPLACE FUNCTION public.design_template_rubric()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '{"originality":15,"art_direction":15,"typography":15,"composition":15,"imagery":10,"colour":10,"brand_relevance":10,"commercial":5,"technical":5}'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.design_templates_review_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  rubric   jsonb := public.design_template_rubric();
  k        text;
  v        jsonb;
  total    int := 0;
  code     text;
  reviewed boolean;
BEGIN
  -- Legacy can only ever be lost.
  IF TG_OP = 'INSERT' THEN
    NEW.legacy_listing := false;
  ELSE
    IF NEW.legacy_listing AND NOT OLD.legacy_listing THEN
      RAISE EXCEPTION 'legacy_listing cannot be granted; publish through a review';
    END IF;
    IF OLD.status = 'published' AND NEW.status <> 'published' THEN
      NEW.legacy_listing := false;
    END IF;
  END IF;

  reviewed := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.review_lines IS NOT NULL
    ELSE (NEW.review_lines, NEW.review_decision, NEW.review_criticals, NEW.review_notes)
         IS DISTINCT FROM (OLD.review_lines, OLD.review_decision, OLD.review_criticals, OLD.review_notes)
  END;

  IF NOT reviewed THEN
    -- Computed fields are never written directly.
    IF TG_OP = 'INSERT' THEN
      NEW.review_score := NULL; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.review_hash := NULL;
    ELSE
      NEW.review_score := OLD.review_score; NEW.reviewed_by := OLD.reviewed_by;
      NEW.reviewed_at := OLD.reviewed_at; NEW.review_hash := OLD.review_hash;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can record a template review';
  END IF;

  -- Withdrawing a review.
  IF NEW.review_lines IS NULL THEN
    NEW.review_score := NULL; NEW.review_decision := NULL; NEW.review_criticals := '{}';
    NEW.review_hash := NULL;
    NEW.reviewed_by := auth.uid(); NEW.reviewed_at := now();
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.review_lines) <> 'object' THEN
    RAISE EXCEPTION 'review_lines must be an object of rubric lines';
  END IF;
  FOR k IN SELECT jsonb_object_keys(NEW.review_lines) LOOP
    IF NOT rubric ? k THEN
      RAISE EXCEPTION 'review line "%" is not on the rubric', k;
    END IF;
  END LOOP;
  FOR k IN SELECT jsonb_object_keys(rubric) LOOP
    v := NEW.review_lines -> k;
    IF v IS NULL OR jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) THEN
      RAISE EXCEPTION 'review line "%" needs a whole number', k;
    END IF;
    IF (v #>> '{}')::int < 0 OR (v #>> '{}')::int > (rubric ->> k)::int THEN
      RAISE EXCEPTION 'review line "%" must be 0 to %', k, rubric ->> k;
    END IF;
    total := total + (v #>> '{}')::int;
  END LOOP;

  IF NEW.review_decision IS NULL THEN
    RAISE EXCEPTION 'A review needs a decision: approve, revise or reject';
  END IF;
  FOREACH code IN ARRAY NEW.review_criticals LOOP
    IF code !~ '^C(1[0-3]|[1-9])$' THEN
      RAISE EXCEPTION 'critical "%" is not one of C1 to C13', code;
    END IF;
  END LOOP;

  NEW.review_score := total;
  NEW.review_hash  := md5(NEW.document::text);
  NEW.reviewed_by  := auth.uid();
  NEW.reviewed_at  := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER design_templates_review_guard
  BEFORE INSERT OR UPDATE ON public.design_templates
  FOR EACH ROW EXECUTE FUNCTION public.design_templates_review_guard();

COMMENT ON COLUMN public.design_templates.review_lines IS
  'The reviewer''s nine rubric lines (design_template_rubric()). The total is review_score, computed by the trigger.';
COMMENT ON COLUMN public.design_templates.legacy_listing IS
  'Published before the review gate (2026-11-17). Can only be cleared; unpublishing clears it.';
