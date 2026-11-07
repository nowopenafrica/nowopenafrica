/*
  # Past work on a business profile

  Every profile now carries a tab for work already finished. The word for it
  is chosen by trade in src/data/categoryTabLabels.ts — a photographer has a
  PORTFOLIO, a builder has PROJECTS — but the data is one shape, because the
  thing being described is the same: a job that was done, for somebody, and
  can be shown to the next customer.

  ## Why a table and not more gallery rows

  `business_gallery` is media: a picture or a clip, with a caption. A piece
  of past work is a RECORD that may have pictures — it has a client, a place,
  a date it finished, and a sentence about what the job actually was. Putting
  that in a caption would make it unsearchable and unsortable, and the first
  person to want "show the newest five" would have to parse prose.

  ## Visibility

  Published rows are public, like gallery items. Unpublished ones are the
  owner's drafts and are visible only to them, their members and admins —
  the same four policies `business_gallery` carries, deliberately, so there
  is one rule to understand on this profile rather than two.

  Note what is NOT here: no price, no rating, no testimonial field. A
  testimonial is a claim about what somebody said, and this table has no way
  to verify one. Reviews already exist and are written by the customer.

  Re-runnable.
*/

CREATE TABLE IF NOT EXISTS public.business_projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  title         text NOT NULL,
  /** What the job was, in the owner's own words. */
  summary       text,
  /** Who it was for. Optional: plenty of work cannot name the client. */
  client        text,
  location      text,
  /** When it finished. A date, not a timestamp — nobody needs the hour. */
  completed_on  date,
  /** One cover image, and the rest in `images`. */
  cover_url     text,
  images        jsonb NOT NULL DEFAULT '[]'::jsonb,
  /** A link to the live site, the building, the film. */
  link_url      text,
  tags          text[] NOT NULL DEFAULT '{}',

  /** Owner-controlled ordering; ties fall back to the date. */
  position      integer NOT NULL DEFAULT 0,
  published     boolean NOT NULL DEFAULT true,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_projects IS
  'Finished work shown on a business profile. Labelled Portfolio or Projects by trade — see src/data/categoryTabLabels.ts.';

/* The profile reads "this business, newest first", and nothing else. */
CREATE INDEX IF NOT EXISTS idx_business_projects_profile
  ON public.business_projects (business_id, position, completed_on DESC NULLS LAST, created_at DESC);

ALTER TABLE public.business_projects ENABLE ROW LEVEL SECURITY;

/*
  The same four policies business_gallery carries. Written out rather than
  abbreviated: an owner reading one profile's rules should not have to hold
  two different models in their head.
*/
DROP POLICY IF EXISTS "Public can view published projects" ON public.business_projects;
CREATE POLICY "Public can view published projects"
  ON public.business_projects FOR SELECT
  USING (published);

DROP POLICY IF EXISTS "Owners view own projects" ON public.business_projects;
CREATE POLICY "Owners view own projects"
  ON public.business_projects FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.businesses b
            WHERE b.id = business_projects.business_id AND b.user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "Owners manage own projects" ON public.business_projects;
CREATE POLICY "Owners manage own projects"
  ON public.business_projects FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.businesses b
            WHERE b.id = business_projects.business_id
              AND (b.user_id::text = auth.uid()::text OR is_admin()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.businesses b
            WHERE b.id = business_projects.business_id
              AND (b.user_id::text = auth.uid()::text OR is_admin()))
  );

DROP POLICY IF EXISTS "Members manage business projects" ON public.business_projects;
CREATE POLICY "Members manage business projects"
  ON public.business_projects FOR ALL
  USING (is_business_member(business_id))
  WITH CHECK (is_business_member(business_id));
