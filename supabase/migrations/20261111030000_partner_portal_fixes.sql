-- Partner portal: final-review fixes (2026-11-06).
--
-- Follows 20261111010000_partner_portal.sql and 20261111020000_fix_trust_audit_array.sql,
-- both applied and left untouched. CREATE OR REPLACE FUNCTION only, so it is
-- safe to re-run. Each body is the 20261111010000 body with only the change
-- named above it; the guards (SECURITY DEFINER, search_path, auth.role()) are
-- exactly as they were.
--
--   I1  admin_review_placement: approving uses the owner's CURRENT verification.
--       verified -> partner_verified, anything else -> partner_supplied. Before,
--       it always approved to partner_supplied, and media_owner_after_write only
--       promotes on the transition to verified, so a placement approved after
--       its owner was verified stayed partner_supplied for good. This matches
--       admin_decide_claim, including its refusal: an owner whose verification
--       was rejected cannot have a placement approved (ruling, 2026-11-07);
--       rejecting the placement is still allowed.
--   I3  owner_update_placement and owner_record_availability refuse a rejected
--       owner, as owner_create_placement and owner_claim_placement already do.
--   M4  submit_owner_verification: after a rejection, at least one document
--       uploaded after that rejection is needed before resubmitting.
--   M16 owner_update_placement: clearing the price writes no pricing source row,
--       and removes the old one. A pricing source with no price describes nothing.
--
-- Checks: scripts/check-partner-portal.sql (run only after this is applied).

-- ---------------------------------------------------------------------------
-- M4. submit_owner_verification
-- ---------------------------------------------------------------------------

-- Both kinds of document present, then "Under review". Resubmitting after a
-- rejection needs a document uploaded after that rejection: the documents the
-- admin already turned down cannot be sent again as they are. Already
-- submitted or verified is a no-op.
CREATE OR REPLACE FUNCTION public.submit_owner_verification(p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_business     uuid;
  v_verification text;
  v_rejected_at  timestamptz;
BEGIN
  SELECT o.business_id, o.verification INTO v_business, v_verification
    FROM public.media_owners o
   WHERE o.id = p_owner_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Media owner % does not exist', p_owner_id USING errcode = 'P0002';
  END IF;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_business_member(v_business) THEN
    RAISE EXCEPTION 'Only a member of this media owner''s business can submit its documents' USING errcode = '42501';
  END IF;

  IF v_verification IN ('documents_submitted', 'verified') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.media_owner_documents d
                  WHERE d.owner_id = p_owner_id AND d.kind = 'registration') THEN
    RAISE EXCEPTION 'Add your company registration first' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.media_owner_documents d
                  WHERE d.owner_id = p_owner_id AND d.kind IN ('signage_permit', 'rate_card', 'authorisation_letter')) THEN
    RAISE EXCEPTION 'Add one site proof first: a signage permit, a rate card or an authorisation letter'
      USING errcode = '22023';
  END IF;

  -- The rejection's time is its latest audit row: admin_reject_owner writes
  -- media_owner.rejected, and media_owner_after_write writes the status change
  -- for any route to 'rejected'. No audit row at all (an owner rejected before
  -- auditing existed) leaves nothing to compare, so the check is skipped.
  IF v_verification = 'rejected' THEN
    SELECT max(l.created_at) INTO v_rejected_at
      FROM public.audit_log l
     WHERE l.entity_type = 'media_owner'
       AND l.entity_id = p_owner_id::text
       AND (l.action = 'media_owner.rejected'
            OR (l.action = 'media_owner.verification' AND l.detail ->> 'to' = 'rejected'));
    IF v_rejected_at IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.media_owner_documents d
       WHERE d.owner_id = p_owner_id AND d.uploaded_at > v_rejected_at
    ) THEN
      RAISE EXCEPTION 'Upload a new document before resubmitting.' USING errcode = '22023';
    END IF;
  END IF;

  PERFORM set_config('nowopen.owner_write', 'on', true);
  UPDATE public.media_owners SET verification = 'documents_submitted' WHERE id = p_owner_id;
  PERFORM set_config('nowopen.owner_write', 'off', true);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- I3 + M16. owner_update_placement
-- ---------------------------------------------------------------------------

-- Edit a placement linked to the caller's owner, on the spec section 5 fields
-- only. Any other key is refused, not ignored, so a client bug is loud.
-- Lifecycle is not written: a verified owner editing their price stays
-- partner_verified, and the pricing source row's date moves to today.
-- A rejected owner cannot edit: their partner_supplied placements stay public,
-- and a fresh "partner price, today" from an owner NowOpen turned down would
-- be a claim nobody stands behind.
CREATE OR REPLACE FUNCTION public.owner_update_placement(p_advert_id uuid, p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_allowed      text[] := ARRAY['title', 'description', 'size_spec', 'dimensions', 'rate_amount', 'currency', 'rate_period', 'pricing', 'image_url', 'media_urls', 'city', 'country_code', 'site_address'];
  v_bad          text[];
  v_old          public.advertisements%ROWTYPE;
  v_new          public.advertisements%ROWTYPE;
  v_business     uuid;
  v_verification text;
  v_media        text[];
  v_city         text;
  v_country      text;
  v_location     text;
BEGIN
  SELECT * INTO v_old FROM public.advertisements a WHERE a.id = p_advert_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement % does not exist', p_advert_id USING errcode = 'P0002';
  END IF;
  IF v_old.owner_id IS NULL THEN
    RAISE EXCEPTION 'This placement has no owner yet; claim it first' USING errcode = '42501';
  END IF;
  SELECT o.business_id, o.verification INTO v_business, v_verification
    FROM public.media_owners o WHERE o.id = v_old.owner_id;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_business_member(v_business) THEN
    RAISE EXCEPTION 'Only a member of this placement''s owner can edit it' USING errcode = '42501';
  END IF;
  IF v_verification = 'rejected' THEN
    RAISE EXCEPTION 'Your media-owner account was not approved, so placements can''t be changed. Contact NowOpen.'
      USING errcode = '42501';
  END IF;

  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'Placement details are required' USING errcode = '22023';
  END IF;
  SELECT array_agg(k ORDER BY k) INTO v_bad
    FROM jsonb_object_keys(p) AS k
   WHERE NOT (k = ANY (v_allowed));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'These fields cannot be changed here: %', array_to_string(v_bad, ', ') USING errcode = '42501';
  END IF;

  IF p ? 'title' AND nullif(btrim(p ->> 'title'), '') IS NULL THEN
    RAISE EXCEPTION 'A site name is required' USING errcode = '22023';
  END IF;
  IF p ? 'currency' AND coalesce(upper(btrim(p ->> 'currency')), '') !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a three-letter code such as NGN' USING errcode = '22023';
  END IF;

  -- location is recomposed as "City, Country" whenever the city or the
  -- country changes; it is never taken as a free string. The current city is
  -- the first comma segment of the current location, as Promote reads it.
  v_location := v_old.location;
  IF p ? 'city' OR p ? 'country_code' THEN
    v_city := CASE WHEN p ? 'city' THEN nullif(btrim(p ->> 'city'), '')
                   ELSE nullif(btrim(split_part(coalesce(v_old.location, ''), ',', 1)), '') END;
    v_country := CASE WHEN p ? 'country_code' THEN upper(nullif(btrim(p ->> 'country_code'), ''))
                      ELSE v_old.country_code END;
    IF v_city IS NULL THEN
      RAISE EXCEPTION 'A city is required' USING errcode = '22023';
    END IF;
    IF position(',' IN v_city) > 0 THEN
      RAISE EXCEPTION 'Enter the city on its own; put the street or landmark in the address' USING errcode = '22023';
    END IF;
    IF v_country IS NULL THEN
      RAISE EXCEPTION 'Choose the country' USING errcode = '22023';
    END IF;
    IF public.placement_country_name(v_country) IS NULL THEN
      RAISE EXCEPTION 'NowOpen does not list placements in that country yet' USING errcode = '22023';
    END IF;
    v_location := v_city || ', ' || public.placement_country_name(v_country);
  END IF;

  v_media := CASE WHEN jsonb_typeof(p -> 'media_urls') = 'array'
                  THEN ARRAY(SELECT jsonb_array_elements_text(p -> 'media_urls')) END;
  IF (p ? 'image_url' AND public.is_stock_image_url(p ->> 'image_url'))
     OR EXISTS (SELECT 1 FROM unnest(coalesce(v_media, '{}'::text[])) u WHERE public.is_stock_image_url(u)) THEN
    RAISE EXCEPTION 'Upload a photo of the actual site.' USING errcode = '22023';
  END IF;

  UPDATE public.advertisements a
     SET title         = CASE WHEN p ? 'title' THEN btrim(p ->> 'title') ELSE a.title END,
         description   = CASE WHEN p ? 'description' THEN nullif(btrim(p ->> 'description'), '') ELSE a.description END,
         size_spec     = CASE WHEN p ? 'size_spec'
                              THEN CASE WHEN jsonb_typeof(p -> 'size_spec') = 'object' THEN p -> 'size_spec' END
                              ELSE a.size_spec END,
         dimensions    = CASE WHEN p ? 'dimensions' THEN nullif(btrim(p ->> 'dimensions'), '') ELSE a.dimensions END,
         rate_amount   = CASE WHEN p ? 'rate_amount' THEN nullif(p ->> 'rate_amount', '')::numeric ELSE a.rate_amount END,
         currency      = CASE WHEN p ? 'currency' THEN upper(btrim(p ->> 'currency')) ELSE a.currency END,
         rate_period   = CASE WHEN p ? 'rate_period' THEN nullif(btrim(p ->> 'rate_period'), '') ELSE a.rate_period END,
         pricing       = CASE WHEN p ? 'pricing' THEN nullif(p ->> 'pricing', '')::numeric ELSE a.pricing END,
         image_url     = CASE WHEN p ? 'image_url' THEN nullif(btrim(p ->> 'image_url'), '') ELSE a.image_url END,
         media_urls    = CASE WHEN p ? 'media_urls' THEN v_media ELSE a.media_urls END,
         location      = v_location,
         country_code  = CASE WHEN p ? 'country_code' THEN upper(nullif(btrim(p ->> 'country_code'), '')) ELSE a.country_code END,
         site_address  = CASE WHEN p ? 'site_address' THEN nullif(btrim(p ->> 'site_address'), '') ELSE a.site_address END,
         updated_at    = now()
   WHERE a.id = p_advert_id
  RETURNING a.* INTO v_new;

  -- A price change is a new partner-supplied statement, dated today (Lagos).
  -- placement_field_source holds one row per field, so "a new row" is an
  -- upsert of that row. A cleared price (no rate and no USD figure, the same
  -- test owner_create_placement uses) is not a statement: no row is written
  -- and the old row goes, so no source describes a price that is not there.
  -- The change itself is still audited.
  IF (v_new.rate_amount, v_new.currency, v_new.rate_period, v_new.pricing)
     IS DISTINCT FROM (v_old.rate_amount, v_old.currency, v_old.rate_period, v_old.pricing) THEN
    IF v_new.rate_amount IS NULL AND v_new.pricing IS NULL THEN
      DELETE FROM public.placement_field_source s
       WHERE s.advert_id = p_advert_id AND s.field = 'pricing';
    ELSE
      INSERT INTO public.placement_field_source (advert_id, field, basis, source_label, as_of, recorded_by)
      VALUES (p_advert_id, 'pricing', 'partner_supplied', 'owner rate card', (now() AT TIME ZONE 'Africa/Lagos')::date, auth.uid())
      ON CONFLICT (advert_id, field) DO UPDATE SET basis = 'partner_supplied',
                                                   source_label = EXCLUDED.source_label,
                                                   as_of = (now() AT TIME ZONE 'Africa/Lagos')::date,
                                                   recorded_by = EXCLUDED.recorded_by;
    END IF;

    INSERT INTO public.audit_log (actor_id, actor_email, action, entity_type, entity_id, detail)
    VALUES (auth.uid(), auth.jwt() ->> 'email', 'placement.owner_price', 'advertisement', p_advert_id::text,
            jsonb_build_object(
              'from', jsonb_build_object('rate_amount', v_old.rate_amount, 'currency', v_old.currency,
                                         'rate_period', v_old.rate_period, 'pricing', v_old.pricing),
              'to', jsonb_build_object('rate_amount', v_new.rate_amount, 'currency', v_new.currency,
                                       'rate_period', v_new.rate_period, 'pricing', v_new.pricing),
              'via', coalesce(auth.role(), 'direct')));
  END IF;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- I3. owner_record_availability
-- ---------------------------------------------------------------------------

-- "Available from / to", "Booked until", "Unavailable", "Maintenance". The
-- confirmation names the placement's own owner (placement_availability_stamp
-- refuses any other) and is audited by placement_availability_audit.
-- A rejected owner cannot confirm availability, for the same reason they
-- cannot edit (owner_update_placement).
CREATE OR REPLACE FUNCTION public.owner_record_availability(p_advert_id uuid, p_status text, p_from date, p_to date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner        uuid;
  v_business     uuid;
  v_verification text;
  v_id           uuid;
BEGIN
  SELECT a.owner_id INTO v_owner FROM public.advertisements a WHERE a.id = p_advert_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement % does not exist', p_advert_id USING errcode = 'P0002';
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'This placement has no owner yet; claim it first' USING errcode = '42501';
  END IF;
  SELECT o.business_id, o.verification INTO v_business, v_verification
    FROM public.media_owners o WHERE o.id = v_owner;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_business_member(v_business) THEN
    RAISE EXCEPTION 'Only a member of this placement''s owner can confirm its availability' USING errcode = '42501';
  END IF;
  IF v_verification = 'rejected' THEN
    RAISE EXCEPTION 'Your media-owner account was not approved, so placements can''t be changed. Contact NowOpen.'
      USING errcode = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('available', 'booked', 'unavailable', 'maintenance') THEN
    RAISE EXCEPTION 'Unknown availability %', coalesce(p_status, 'null') USING errcode = '22023';
  END IF;
  IF p_from IS NULL THEN
    RAISE EXCEPTION 'A start date is required' USING errcode = '22023';
  END IF;
  IF p_status = 'booked' AND p_to IS NULL THEN
    RAISE EXCEPTION 'Booked needs an end date' USING errcode = '22023';
  END IF;

  PERFORM set_config('nowopen.owner_write', 'on', true);
  INSERT INTO public.placement_availability (advert_id, status, period_from, period_to, confirmed_by_owner, method)
  VALUES (p_advert_id, p_status, p_from, p_to, v_owner, 'portal')
  RETURNING id INTO v_id;
  PERFORM set_config('nowopen.owner_write', 'off', true);

  RETURN v_id;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- I1. admin_review_placement
-- ---------------------------------------------------------------------------

-- Approve: pending_review -> partner_verified when the owner is verified at
-- the moment of approval, partner_supplied otherwise (the same rule as
-- admin_decide_claim). An owner whose verification was rejected cannot have a
-- placement approved, as a claim of theirs cannot be (ruling, 2026-11-07); the
-- admin rejects the placement instead. Reject: -> rejected, reason required. Both through
-- set_placement_lifecycle, so each decision is ONE audit row carrying its
-- reason. set_placement_lifecycle writes as the admin, and the trust guard
-- still refuses partner_verified unless the linked owner is verified.
CREATE OR REPLACE FUNCTION public.admin_review_placement(p_advert_id uuid, p_approve boolean, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lifecycle    text;
  v_owner        uuid;
  v_verification text;
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can review a placement' USING errcode = '42501';
  END IF;
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Approve or reject' USING errcode = '22023';
  END IF;

  SELECT a.lifecycle, a.owner_id INTO v_lifecycle, v_owner
    FROM public.advertisements a WHERE a.id = p_advert_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Placement % does not exist', p_advert_id USING errcode = 'P0002';
  END IF;
  IF v_lifecycle IS DISTINCT FROM 'pending_review' THEN
    RAISE EXCEPTION 'This placement is not waiting for review (is %)', coalesce(v_lifecycle, 'null') USING errcode = '22023';
  END IF;

  IF p_approve THEN
    SELECT o.verification INTO v_verification FROM public.media_owners o WHERE o.id = v_owner;
    IF v_verification = 'rejected' THEN
      RAISE EXCEPTION 'This owner was not approved. Reject the placement instead.' USING errcode = '22023';
    END IF;
    IF v_verification = 'verified' THEN
      PERFORM public.set_placement_lifecycle(p_advert_id, 'partner_verified',
                                             coalesce(nullif(btrim(p_reason), ''), 'Approved after review'));
    ELSE
      PERFORM public.set_placement_lifecycle(p_advert_id, 'partner_supplied',
                                             coalesce(nullif(btrim(p_reason), ''), 'Approved after review'));
    END IF;
  ELSE
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'A reason is required to reject a placement' USING errcode = '22023';
    END IF;
    PERFORM public.set_placement_lifecycle(p_advert_id, 'rejected', p_reason);
  END IF;
END;
$fn$;

-- Grants, re-asserted (CREATE OR REPLACE keeps them; this makes the file
-- complete on its own). Never anon.
REVOKE ALL ON FUNCTION public.submit_owner_verification(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_update_placement(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_record_availability(uuid, text, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_placement(uuid, boolean, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_owner_verification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_update_placement(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_record_availability(uuid, text, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_placement(uuid, boolean, text) TO authenticated, service_role;
