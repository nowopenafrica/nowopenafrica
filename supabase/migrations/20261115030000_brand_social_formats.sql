-- Brand social: reels, stories and carousels, published directly.
--
-- Each channel version of a post now has a format. 'post' is what everything
-- was until now. 'reel' and 'story' take one video (or one image, for a
-- story); 'carousel' takes 2 to 10 items. brandPublish.ts (formatProblem) is
-- the rule book; the publisher refuses a mismatch with a clear reason.
--
-- pending_container_id: Instagram and Threads process video before it can be
-- published, sometimes for minutes. The publisher keeps the container here and
-- finishes on a later tick instead of uploading the video a second time. Only
-- the publisher (service role) writes it.

ALTER TABLE public.brand_social_variants
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'post'
    CHECK (format IN ('post','reel','story','carousel')),
  ADD COLUMN IF NOT EXISTS pending_container_id text;

-- Carousel items after the first. media_url stays the first item, so every
-- existing reader keeps working.
ALTER TABLE public.brand_social_content
  ADD COLUMN IF NOT EXISTS media_urls text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(media_urls) <= 9);

-- Guard: the container id is the publisher's; a format change after approval
-- is a change to what goes out, so it sends the post back to review.
CREATE OR REPLACE FUNCTION public.guard_brand_social_variant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_status text;
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL OR current_setting('brand_social.trusted', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT status INTO parent_status FROM public.brand_social_content WHERE id = NEW.content_id;
  IF parent_status IN ('sending','sent') THEN
    RAISE EXCEPTION 'This post has already gone to Zoho and cannot be changed here';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.dispatch_status := 'pending'; NEW.attempts := 0; NEW.last_error := NULL;
    NEW.sent_at := NULL; NEW.zoho_reference := NULL; NEW.zoho_confirmed_at := NULL;
    NEW.external_post_id := NULL; NEW.published_url := NULL; NEW.published_at := NULL;
    NEW.verified_at := NULL; NEW.next_attempt_at := NULL; NEW.pending_container_id := NULL;
    IF parent_status = 'approved' THEN
      UPDATE public.brand_social_content SET status = 'in_review' WHERE id = NEW.content_id;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.dispatch_status IN ('sending','sent')
     AND (NEW.caption IS DISTINCT FROM OLD.caption OR NEW.format IS DISTINCT FROM OLD.format) THEN
    RAISE EXCEPTION 'The % version has already gone out and cannot be edited here', OLD.channel;
  END IF;

  NEW.dispatch_status      := OLD.dispatch_status;
  NEW.dispatch_key         := OLD.dispatch_key;
  NEW.attempts             := OLD.attempts;
  NEW.last_error           := OLD.last_error;
  NEW.sent_at              := OLD.sent_at;
  NEW.zoho_reference       := OLD.zoho_reference;
  NEW.zoho_confirmed_at    := OLD.zoho_confirmed_at;
  NEW.external_post_id     := OLD.external_post_id;
  NEW.published_url        := OLD.published_url;
  NEW.published_at         := OLD.published_at;
  NEW.verified_at          := OLD.verified_at;
  NEW.next_attempt_at      := OLD.next_attempt_at;
  NEW.pending_container_id := OLD.pending_container_id;

  IF parent_status = 'approved'
     AND (NEW.caption IS DISTINCT FROM OLD.caption OR NEW.format IS DISTINCT FROM OLD.format) THEN
    UPDATE public.brand_social_content SET status = 'in_review' WHERE id = NEW.content_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Content guard: extra carousel media is part of what was approved, like
-- media_url. Re-create with media_urls in the "changed after approval" list.
CREATE OR REPLACE FUNCTION public.guard_brand_social_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL OR current_setting('brand_social.trusted', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','in_review') THEN NEW.status := 'draft'; END IF;
    NEW.approved_by := NULL; NEW.approved_at := NULL;
    NEW.created_by := auth.uid();
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('sending','sent','failed') THEN
      RAISE EXCEPTION 'Only the dispatcher can mark a post %', NEW.status;
    END IF;
    IF OLD.status IN ('sending','sent') THEN
      RAISE EXCEPTION 'This post has already gone to Zoho and cannot be changed here';
    END IF;
    IF NEW.status = 'approved' THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    ELSE
      NEW.approved_by := NULL; NEW.approved_at := NULL;
    END IF;
  ELSE
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
  END IF;

  IF OLD.status = 'approved' AND NEW.status = 'approved'
     AND (NEW.caption IS DISTINCT FROM OLD.caption OR NEW.media_url IS DISTINCT FROM OLD.media_url
          OR NEW.media_urls IS DISTINCT FROM OLD.media_urls
          OR NEW.destination_url IS DISTINCT FROM OLD.destination_url OR NEW.planned_at IS DISTINCT FROM OLD.planned_at) THEN
    NEW.status := 'in_review'; NEW.approved_by := NULL; NEW.approved_at := NULL;
  END IF;

  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;
