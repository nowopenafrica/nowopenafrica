/*
  # Publishing a candidate carries its Instagram posts into the gallery

  An Instagram extraction stages up to twelve recent post permalinks in
  `radar_candidates.profile->'instagram_recent_posts'`. Until now that key was
  staged, shown to a reviewer, and dropped at publication — it is not on the
  whitelist `radar_publish_candidate` projects onto the business.

  This carries them through as `business_gallery` rows, so approving a
  candidate gives the listing a live Instagram gallery.

  ── WHY A TRIGGER AND NOT AN EDIT TO THE PUBLISH FUNCTION ─────────────────

  `radar_publish_candidate` is three hundred lines that project a whitelist
  onto a new business, and its comment history is the record of which field
  may write where. Appending a block to it would put every one of those fields
  at risk for the sake of one feature, and a wrapper would need the original
  renamed. A trigger on the transition to 'published' touches none of it, and
  catches any other path that publishes a candidate — including a hand-run
  UPDATE during an incident.

  ── LINKS, NOT COPIES, AND WHY THAT MATTERS HERE ──────────────────────────

  Each row stores the PERMALINK, never Meta's `media_url`. That is not a
  limitation worked around; it is the only lawful shape:

    * `media_url` is a signed CDN address that expires within days, so a copied
      gallery would be broken images on a real business's listing inside a
      week;
    * Meta's Platform Terms do not permit storing or re-hosting the media;
    * the photographs belong to the business, which has not claimed this
      listing and has given us nothing.

  A permalink avoids all three. `mediaKindOf()` in src/lib/galleryMedia.ts
  already classifies an instagram.com link as kind 'embed', and
  src/lib/videoEmbeds.ts already turns it into
  `https://www.instagram.com/{p|reel}/{code}/embed`. So it renders through
  Meta's own iframe: always current, attributed to the account, and nothing of
  theirs sitting on our servers.

  ── PROVENANCE ────────────────────────────────────────────────────────────

  Rows land as `source_derived`, not `owner_confirmed`, and carry
  `requires_confirmation = true`. The business did not put these here; we did,
  from its public feed. `content_status` is what every panel reads to tell an
  asserted fact from an owned one.

  Idempotent: re-publishing replaces this source's rows rather than appending a
  second set, and only rows whose `source_type` is 'instagram' are touched, so
  an owner's own uploads are never removed.
*/

create or replace function public.apply_candidate_instagram_gallery()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $function$
DECLARE
  v_posts jsonb;
BEGIN
  /*
   * Only on the transition INTO published, and only when a business actually
   * came out of it. Firing on every update would rewrite the gallery each
   * time a reviewer touched an already-published row.
   */
  IF NEW.status IS DISTINCT FROM 'published' THEN
    RETURN NEW;
  END IF;
  IF NEW.published_business_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'published' AND OLD.published_business_id = NEW.published_business_id THEN
    RETURN NEW;
  END IF;

  v_posts := NEW.profile -> 'instagram_recent_posts';
  IF v_posts IS NULL OR jsonb_typeof(v_posts) <> 'array' THEN
    RETURN NEW;
  END IF;

  -- Replace this source's rows; never touch anything the owner added.
  DELETE FROM public.business_gallery
   WHERE business_id = NEW.published_business_id
     AND source_type = 'instagram';

  INSERT INTO public.business_gallery (
    business_id, image_url, caption,
    content_status, source_type, source_name, source_url,
    requires_confirmation, published
  )
  SELECT
    NEW.published_business_id,
    /*
     * The permalink goes in image_url because that is the column the gallery
     * reads for every kind of item, and mediaKindOf() decides FROM THE URL
     * that this one is an embed rather than an image. No <img> is ever
     * pointed at it.
     */
    btrim(e #>> '{}'),
    /*
     * No caption. The embed renders the account's own words from Instagram,
     * live; copying them here would duplicate somebody's writing into our
     * database for no gain, and age badly the moment they edit the post.
     */
    NULL,
    'source_derived'::public.content_provenance,
    'instagram',
    'Instagram',
    btrim(e #>> '{}'),
    true,
    true
  FROM jsonb_array_elements(v_posts) e
   /*
    * Only real post/reel permalinks. A profile URL, a story link or anything
    * else would render as an empty iframe on a real business's listing.
    */
   WHERE btrim(coalesce(e #>> '{}', '')) ~* '^https?://(www\.)?instagram\.com/(p|reel|tv)/[A-Za-z0-9_-]+'
   LIMIT 12;

  RETURN NEW;
END;
$function$;

comment on function public.apply_candidate_instagram_gallery is
  'On a candidate becoming published, copies its staged Instagram permalinks into business_gallery as source_derived, requires_confirmation rows. Stores LINKS only — Meta''s media_url expires and may not be re-hosted, and the gallery renders instagram.com links through Meta''s own embed iframe.';

drop trigger if exists trg_candidate_instagram_gallery on public.radar_candidates;
create trigger trg_candidate_instagram_gallery
  after update on public.radar_candidates
  for each row
  execute function public.apply_candidate_instagram_gallery();
