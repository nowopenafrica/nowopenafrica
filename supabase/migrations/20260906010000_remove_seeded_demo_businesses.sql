/*
  # Remove the 30 seeded demo businesses

  These came from scripts/sql/seed_30_businesses.sql — invented names, invented
  phone numbers, stock photos. They existed to give the booking, cart, menu and
  trust modules something to render while those were being built. That job is
  finished, and the platform is about to be shown to strangers.

  Keeping them is now a direct liability. The most valuable question a visitor
  can ask is "can I trust what NowOpen says about this business?", and today the
  honest answer for every listing on the site is "no, it does not exist". A
  directory with two real businesses beats one with thirty fictional ones the
  week you start asking real owners to trust you.

  IDENTIFIED BY USERNAME, NOT BY A RULE. It would be shorter to delete every row
  with `user_id IS NULL` or `claim_status = 'unclaimed'`, and that is exactly the
  kind of shortcut that deletes a real business the day someone imports one that
  has not been claimed yet. The seed upserts by username; so does this.

  DELIBERATELY NOT DELETED: yemzoarts and nowopen-media-ad-placeements. Both are
  real businesses, owned by real accounts, and both are claimed.

  Checked on live before writing this — nothing referred to the 30:
    offers 0 | reviews 0 | claims 0 | reports 0
  (business_keeps is owner-scoped under RLS, so the child deletes below run
  regardless rather than trusting a count taken as an anonymous reader.)

  Safe to re-run: every statement is a DELETE against a fixed list, so a second
  run removes nothing and errors on nothing.
*/

DO $$
DECLARE
  demo_usernames text[] := ARRAY[
    'sparkleclean-services', 'techhub-electronics', 'golden-gem-jewellers',
    'comfort-living-furniture', 'fresh-market-grocers', 'golden-sands-hotel',
    'serengeti-lodge-suites', 'nomads-nest-shortlets', 'mama-put-kitchen',
    'nyama-choma-grill-house', 'quickbite-express', 'bean-and-batter-cafe',
    'skyline-lounge-bar', 'feast-masters-catering', 'serenity-spa-wellness',
    'kings-cut-barbershop', 'ironcore-fitness-studio', 'wellspring-medical-centre',
    'brightsmile-dental-clinic', 'petcare-veterinary-clinic', 'lens-and-light-studios',
    'elegant-occasions-events', 'safarilink-travel-tours', 'prime-homes-realty',
    'adeyemi-partners-law-firm', 'autofix-garage-servicing', 'urbanstyle-boutique',
    'ankara-threads-fashion-house', 'quickcash-transfer-services',
    'brightpath-learning-centre'
  ];
  demo_ids uuid[];
  removed  int;
BEGIN
  -- Only ever unowned rows. If one of these usernames has since been claimed by
  -- a real owner, it is theirs now and this migration must leave it alone.
  SELECT array_agg(id) INTO demo_ids
  FROM public.businesses
  WHERE username = ANY(demo_usernames)
    AND user_id IS NULL
    AND claim_status IS DISTINCT FROM 'claimed';

  IF demo_ids IS NULL OR array_length(demo_ids, 1) IS NULL THEN
    RAISE NOTICE 'No seeded demo businesses present — nothing to remove.';
    RETURN;
  END IF;

  -- Children first. Guarded by to_regclass because these tables are created by
  -- the seed script rather than by a migration, so a fresh project may not have
  -- them at all.
  IF to_regclass('public.business_services') IS NOT NULL THEN
    DELETE FROM public.business_services WHERE business_id = ANY(demo_ids);
  END IF;
  IF to_regclass('public.business_products') IS NOT NULL THEN
    DELETE FROM public.business_products WHERE business_id = ANY(demo_ids);
  END IF;
  IF to_regclass('public.business_gallery') IS NOT NULL THEN
    DELETE FROM public.business_gallery WHERE business_id = ANY(demo_ids);
  END IF;
  IF to_regclass('public.business_offers') IS NOT NULL THEN
    DELETE FROM public.business_offers WHERE business_id = ANY(demo_ids);
  END IF;
  IF to_regclass('public.business_reviews') IS NOT NULL THEN
    DELETE FROM public.business_reviews WHERE business_id = ANY(demo_ids);
  END IF;
  IF to_regclass('public.business_keeps') IS NOT NULL THEN
    DELETE FROM public.business_keeps WHERE business_id = ANY(demo_ids);
  END IF;
  IF to_regclass('public.business_claims') IS NOT NULL THEN
    DELETE FROM public.business_claims WHERE business_id = ANY(demo_ids);
  END IF;
  IF to_regclass('public.business_reports') IS NOT NULL THEN
    DELETE FROM public.business_reports WHERE business_id = ANY(demo_ids);
  END IF;
  IF to_regclass('public.business_locations') IS NOT NULL THEN
    DELETE FROM public.business_locations WHERE business_id = ANY(demo_ids);
  END IF;
  IF to_regclass('public.business_members') IS NOT NULL THEN
    DELETE FROM public.business_members WHERE business_id = ANY(demo_ids);
  END IF;

  -- Analytics rows are kept. They are a record that a page was viewed, which
  -- remains true; blanking history to make a number look better is the habit
  -- this whole change is meant to end. The business_id simply stops resolving.

  DELETE FROM public.businesses WHERE id = ANY(demo_ids);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RAISE NOTICE 'Removed % seeded demo business(es).', removed;
END $$;

-- Confirm afterwards:
--   SELECT count(*) FILTER (WHERE user_id IS NULL) AS unowned,
--          count(*) AS total
--   FROM public.businesses;
--   -- expect unowned 0, total 2
