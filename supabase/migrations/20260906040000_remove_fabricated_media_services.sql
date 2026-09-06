/*
  # Remove the 30 fabricated creative services

  Same decision as the 30 seeded businesses, and a clearer case.

  Measured on live:

    media_services   30 rows, 0 with an owner account
    with a rating    30 of 30, up to 4.9
    with reviews     30 of 30, up to 150
    clients_served   30 of 30, up to 340
    media_reviews    0 rows

  So every one of them advertises a rating, a review count and a number of
  clients served, and there is not one actual review anywhere in the database.
  The names match the deleted business seed — Kalahari Films, Sable Studio,
  Ubuntu Digital, and Lens & Light Photography, which was also one of the thirty
  businesses removed in 20260906010000.

  This is fabricated social proof, live on the homepage's Creative Services tab
  and on /media: invented companies with invented ratings, invented reviews and
  invented customers. It is the single most damaging category of made-up data on
  the platform, because a rating is the thing a visitor uses to choose.

  ## Why `user_id IS NULL` is a safe rule HERE

  For businesses it was not, and that migration matched on usernames instead —
  an imported listing can legitimately have no owner yet, waiting to be claimed.

  A creative service is different: it is an offer to do paid work. With no
  provider account behind it there is nobody to accept the job, so an unowned
  row cannot become real by being claimed — it can only mislead. Every row this
  removes is one a customer could have tried to hire.

  Safe to re-run: a DELETE that matches nothing the second time.
*/

DO $$
DECLARE removed int; kept int;
BEGIN
  -- Children first, though there are none today; a foreign key would abort the
  -- delete rather than cascade, and this file must not need a second edit.
  IF to_regclass('public.media_reviews') IS NOT NULL THEN
    DELETE FROM public.media_reviews
     WHERE media_service_id IN (SELECT id FROM public.media_services WHERE user_id IS NULL);
  END IF;

  DELETE FROM public.media_services WHERE user_id IS NULL;
  GET DIAGNOSTICS removed = ROW_COUNT;

  SELECT count(*) INTO kept FROM public.media_services;
  RAISE NOTICE 'Removed % fabricated creative service(s); % remain, all with an owner.', removed, kept;
END $$;

/*
  DELIBERATELY NOT TOUCHED: public.advertisements (97 rows).

  Those are real-world placement locations — "Mega Board, 6th October Bridge,
  Cairo", "Terminal 3 Lightbox Series, Cairo International" — across 42 cities,
  all priced, none carrying a rating, review count, award or invented owner.
  They assert nothing false about any person or company, they are maintained by
  scripts with their own checker in the verify suite, and selling placements is
  what NowOpen Media actually does. Deleting a founder's product catalogue
  because it shares one property with fabricated data (no owner row) would be
  the same careless rule this project has avoided twice now.

  What WAS wrong about them was the copy: /adverts claimed "verified placements"
  and /adverts/:id claimed "Every placement is verified on-site before it's
  listed". Nobody has inspected 97 billboards. Both are fixed in the same commit
  as this migration.
*/

-- Confirm afterwards:
--   SELECT count(*) FROM public.media_services;              -- expect 0
--   SELECT count(*) FROM public.advertisements;              -- expect 97
