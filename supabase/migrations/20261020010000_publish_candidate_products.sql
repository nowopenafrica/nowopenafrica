/*
  # Publishing a candidate carries its confirmed products

  `radar_publish_candidate` creates `business_services` rows from
  `profile->'services_json'` but has no equivalent for products — verified
  against the live function: projects_services true, projects_products false.

  So the manual extractor has been staging product names under `products_seen`,
  a key the publish whitelist does not know, precisely BECAUSE there was
  nowhere for them to go. The names reached a reviewer's eye and stopped there,
  and a listing for a shop came out with no products on it.

  This adds the missing half, as a trigger on the transition into 'published'
  — the same shape as the Instagram gallery trigger and for the same reason:
  the publish function is three hundred lines whose comment history records
  which field may write where, and appending to it risks all of them for one
  feature.

  ── NAMES ONLY, AND WHY ───────────────────────────────────────────────────

  `business_products` has columns for price, stock, description and images.
  None are written here.

  A price read from a social caption is true the week it was posted and
  misleading afterwards, and this platform's rule is that it does not publish
  prices it cannot stand behind. A description is the owner's writing. An
  image, for an Instagram source, is a URL that expires within days.

  So a product arrives as a name a human confirmed, on a listing the owner has
  not claimed, and the owner fills in the rest when they claim it. A name with
  no price is honest; a stale price is not.
*/

create or replace function public.apply_candidate_products()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $function$
DECLARE
  v_products jsonb;
BEGIN
  /*
   * Only on the transition INTO published, and only when a business came out
   * of it. Firing on every update would duplicate the list each time a
   * reviewer touched an already-published row.
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

  v_products := public.profile_json(NEW.profile, 'products_json');
  IF v_products IS NULL OR jsonb_typeof(v_products) <> 'array' THEN
    RETURN NEW;
  END IF;

  /*
   * Nothing here may fail the publish. A malformed products cell yields NULL
   * from profile_json and the block above returns: a business without its
   * product list is recoverable, a publish that refuses the business is not.
   * That is the rule the services block already follows.
   *
   * Replace OUR rows, never the owner's.
   *
   * Caught by the dry-run: without this, re-publishing a candidate inserted
   * the list a second time and the listing showed every product twice.
   * Deleting all products for the business would have been worse — it would
   * wipe what an owner added after claiming — so this is scoped by
   * source_type, exactly as the Instagram gallery trigger is.
   */
  DELETE FROM public.business_products
   WHERE business_id = NEW.published_business_id
     AND source_type = 'candidate_extraction';

  INSERT INTO public.business_products (
    business_id, name,
    content_status, source_type, source_name, source_url,
    requires_confirmation, published
  )
  SELECT NEW.published_business_id, btrim(e->>'name'),
         /*
          * Ours, not the owner's: an extraction asserted this, a person
          * confirmed it, and the owner has never seen it. `content_status` is
          * what every panel reads to tell an asserted fact from an owned one.
          */
         'source_derived'::public.content_provenance,
         'candidate_extraction',
         coalesce(nullif(btrim(NEW.source_key), ''), 'extraction'),
         NEW.source_url,
         true,
         true
    FROM jsonb_array_elements(v_products) e
   WHERE coalesce(btrim(e->>'name'), '') <> ''
     /*
      * A product name, not a paragraph. Something longer came from prose that
      * was mistaken for a list, and publishing it would read as nonsense on
      * the listing.
      */
     AND length(btrim(e->>'name')) <= 80
   LIMIT 40;

  RETURN NEW;
END;
$function$;

comment on function public.apply_candidate_products is
  'On a candidate becoming published, creates business_products rows from profile->''products_json''. NAMES ONLY: a price read from a caption goes stale, a description is the owner''s writing, and an Instagram image URL expires within days.';

drop trigger if exists trg_candidate_products on public.radar_candidates;
create trigger trg_candidate_products
  after update on public.radar_candidates
  for each row
  execute function public.apply_candidate_products();
