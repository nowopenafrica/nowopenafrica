/*
  # Project stories

  A portfolio row used to be a cover, a sentence and a date. That is enough to
  list work and not enough to show it: the projects a customer remembers are
  the ones that explain what the problem was, what was made, and what happened
  next.

  This extends `business_projects` rather than creating a second portfolio
  system. Existing rows keep every column they had; the new columns default to
  empty, so every current project remains a valid project and its id remains
  its public identity until a slug is written.

  ## What is stored

  - `sections` is the story: an ordered jsonb array of typed blocks (text,
    image, gallery, split, video, quote, timeline, before/after, results,
    specifications, link). It is validated and normalised by
    src/lib/projectStory.ts on read and write. No HTML is accepted.
  - `details` holds the optional facts (industry, services, duration, team,
    tools, project URL).
  - `results` holds outcomes the owner states. The public page labels them as
    reported by the business, because nothing here verifies them.
  - `slug` is the shareable URL segment under /work/. Unique when present.
  - `featured` lets an owner choose the cover project without changing order.

  ## Visibility

  The existing four policies are unchanged. Published rows are public;
  unpublished rows are the owner's drafts. A slug on a draft is not a public
  URL: every public read filters `published = true`.

  Re-runnable.
*/

ALTER TABLE public.business_projects
  ADD COLUMN IF NOT EXISTS slug             text,
  ADD COLUMN IF NOT EXISTS category         text,
  ADD COLUMN IF NOT EXISTS cover_video_url  text,
  ADD COLUMN IF NOT EXISTS featured         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sections         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS details          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS results          jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS seo_title        text,
  ADD COLUMN IF NOT EXISTS seo_description  text;

COMMENT ON COLUMN public.business_projects.sections IS
  'Ordered story blocks. Normalised by src/lib/projectStory.ts; no HTML is accepted.';
COMMENT ON COLUMN public.business_projects.results IS
  'Outcomes reported by the business, not independently verified.';
COMMENT ON COLUMN public.business_projects.slug IS
  'Public URL segment under /work/. Null on rows that predate project stories; those use their id.';

/*
  A slug is unique when it exists. Two projects may both be untitled drafts,
  so the index is partial rather than a plain UNIQUE.
*/
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_projects_slug
  ON public.business_projects (lower(slug))
  WHERE slug IS NOT NULL AND slug <> '';

/* The overview reads featured first, then the owner's order. */
CREATE INDEX IF NOT EXISTS idx_business_projects_featured
  ON public.business_projects (business_id, featured DESC, position, completed_on DESC NULLS LAST);
