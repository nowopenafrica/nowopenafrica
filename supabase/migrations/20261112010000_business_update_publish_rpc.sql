/*
  # Business Updates: publish on the server's clock

  Follows 20261110010000_business_updates.sql.

  "Publish now" used to send the phone's own time as published_at. A phone
  five minutes slow was refused ("That time has already passed"), so its owner
  could never post immediately; one running ten minutes fast stored a
  scheduled update while the screen said it was live, and shifted the whole
  24 hours.

  publish_business_update(p_id, p_at) sets published_at to p_at, or to the
  server's now() when p_at is null. It is SECURITY INVOKER on purpose: the
  caller's own RLS decides whether they may touch the row, and the lifecycle
  guard trigger still checks every rule (no re-publishing, 14-day window,
  content, offer). It adds no power anyone did not already have; it only
  takes the clock out of the client's hands.

  Re-runnable.
*/

CREATE OR REPLACE FUNCTION public.publish_business_update(p_id uuid, p_at timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.business_updates
  SET published_at = coalesce(p_at, now())
  WHERE id = p_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  -- Zero rows means RLS hid it or it does not exist; say so instead of "done".
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'You cannot post this update.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_business_update(uuid, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.publish_business_update(uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.publish_business_update(uuid, timestamptz) IS
  'Publishes or schedules a business update. Null p_at = the server''s now(). Invoker rights: RLS and the guard trigger apply.';
