-- Server-side queue for Studio's Schedule & Publish.
--
-- The queue used to live entirely in localStorage (see lib/publisher.ts), which
-- meant a "scheduled" post existed in exactly one browser on one device and
-- could only ever go out while that tab happened to be open and looking at the
-- page. Clearing site data lost the schedule. Nothing server-side knew a post
-- was due, so automatic publishing was not possible at all.
--
-- Moving the queue here is what makes `publish-due-posts` able to run on a cron
-- and post on the owner's behalf while nobody is watching.

CREATE TABLE IF NOT EXISTS public.social_scheduled_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- Who queued it. Kept for the audit trail; permission comes from the
  -- business, not from this column, so a colleague can manage the same queue.
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  title          text,
  caption        text,
  hashtags       text,
  channels       text[] NOT NULL DEFAULT '{}',
  -- { name, url, type } — the same shape the publish function stages.
  media          jsonb,

  scheduled_at   timestamptz NOT NULL,

  -- scheduled → publishing → published | failed, or cancelled by the owner.
  -- 'publishing' is a claim marker: the cron sets it before doing any network
  -- work so two overlapping runs cannot post the same row twice.
  status         text NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled','publishing','published','failed','cancelled')),
  attempts       int NOT NULL DEFAULT 0,
  last_error     text,
  -- Per-channel outcome from the last run, for the UI to explain itself.
  results        jsonb,
  published_at   timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- The cron's only query: due, still waiting, not exhausted.
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due
  ON public.social_scheduled_posts (status, scheduled_at)
  WHERE status IN ('scheduled', 'publishing');

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_business
  ON public.social_scheduled_posts (business_id, scheduled_at DESC);

ALTER TABLE public.social_scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Anyone on the business's team may see the queue. Publishing on behalf of a
-- business is a team activity: gating it on businesses.user_id meant a manager
-- could not see, let alone schedule, the posts they were hired to run.
DROP POLICY IF EXISTS "Team reads scheduled posts" ON public.social_scheduled_posts;
CREATE POLICY "Team reads scheduled posts" ON public.social_scheduled_posts
  FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));

-- Writing is narrower than reading: staff can watch the calendar, but only
-- owners, managers and editors put something on it.
DROP POLICY IF EXISTS "Editors queue scheduled posts" ON public.social_scheduled_posts;
CREATE POLICY "Editors queue scheduled posts" ON public.social_scheduled_posts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner','manager','editor']));

DROP POLICY IF EXISTS "Editors update scheduled posts" ON public.social_scheduled_posts;
CREATE POLICY "Editors update scheduled posts" ON public.social_scheduled_posts
  FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner','manager','editor']))
  WITH CHECK (public.has_business_role(business_id, ARRAY['owner','manager','editor']));

DROP POLICY IF EXISTS "Editors delete scheduled posts" ON public.social_scheduled_posts;
CREATE POLICY "Editors delete scheduled posts" ON public.social_scheduled_posts
  FOR DELETE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['owner','manager','editor']));

-- updated_at maintenance.
CREATE OR REPLACE FUNCTION public.touch_scheduled_post()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_scheduled_post ON public.social_scheduled_posts;
CREATE TRIGGER trg_touch_scheduled_post
  BEFORE UPDATE ON public.social_scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_scheduled_post();

-- A client must never be able to mark its own post published, or reset the
-- attempt counter to get around the retry ceiling — those columns belong to
-- the publisher. RLS cannot restrict individual columns, so the trigger keeps
-- them at their stored values for anyone who is not the service role.
CREATE OR REPLACE FUNCTION public.guard_scheduled_post_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- auth.uid() is null for the service role, which is the publisher.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.attempts     := OLD.attempts;
  NEW.published_at := OLD.published_at;
  NEW.results      := OLD.results;
  NEW.last_error   := OLD.last_error;

  -- A person may cancel, or put a failed post back in the queue. They may not
  -- declare it published.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('scheduled', 'cancelled') THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_scheduled_post ON public.social_scheduled_posts;
CREATE TRIGGER trg_guard_scheduled_post
  BEFORE UPDATE ON public.social_scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_scheduled_post_columns();
