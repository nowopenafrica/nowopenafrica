-- Carry the WHOLE profile from a CSV to a published business.
--
-- WHAT WAS BROKEN, AND IT WAS SILENT
--
-- The import path is: file → import_rows.mapped (jsonb, every mapped column)
-- → radar_candidates → businesses. `import_rows.mapped` held everything, and
-- then `import_batch_to_candidates` projected TWELVE keys:
--
--   name, category, city, address, phone, whatsapp, email, website,
--   description, name_key, city_key, domain
--
-- Everything else was read, validated, staged — and dropped. A file supplying
-- a logo, a cover banner, an Instagram handle, opening hours, a tagline or a
-- price list published a business without them, and nothing reported a loss.
-- `logo_url` and `cover_image_url` had been mapped and validated (down to
-- refusing `javascript:` URLs) for a value that could never arrive.
--
-- `businesses` has 72 columns. The importer could fill 11 of them.
--
-- HOW IT WORKS NOW
--
-- `radar_candidates.profile` (jsonb) stages everything that is not already a
-- candidate column, and `radar_publish_candidate` projects a WHITELIST of keys
-- from it into the insert. The whitelist is the security boundary: a mapped
-- column called `role` or `verified` cannot write to a column of that name,
-- because every column is named explicitly in SQL below.
--
-- WHY THE SHAPES ARE ALREADY CANONICAL WHEN THEY ARRIVE
--
-- src/lib/imports/profileFields.ts does the interpreting — "@mamaput" into an
-- Instagram URL, "Est. 1998" into 1998, "Haircut:2500 | Wash:800" into JSON.
-- This migration only does mechanics: split on '|', cast a JSON string, build
-- an object from flat keys. A regex guessing what a human meant does not
-- belong in a migration, where it cannot be tested.
--
-- SERVICES BECOME ROWS, and that is the one non-obvious part: services live in
-- `business_services`, not on the business, so publishing inserts them as
-- rows. Skipped silently when the JSON is absent or malformed — a business
-- that publishes without its price list is recoverable; a publish that fails
-- on a bad cell loses the business.
--
-- SAFETY
--
-- Additive. One new nullable column, two functions replaced. No existing row
-- changes, and a candidate created before this has `profile = '{}'`, which
-- projects to all-NULL and behaves exactly as it does today.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. THE STAGING COLUMN
-- ═══════════════════════════════════════════════════════════════════════

alter table public.radar_candidates
  add column if not exists profile jsonb not null default '{}'::jsonb;

comment on column public.radar_candidates.profile is
  'Everything a source supplied that is not already a candidate column — socials, tagline, hours, services, FAQs. radar_publish_candidate projects a whitelist of these keys into businesses; keys outside it are ignored.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. STAGE IT
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.import_batch_to_candidates(p_batch uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE b record; n integer := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;

  SELECT * INTO b FROM public.import_batches WHERE id = p_batch;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such batch'; END IF;
  IF b.dataset <> 'businesses' THEN
    RAISE EXCEPTION 'Only the businesses dataset publishes to candidates so far';
  END IF;
  IF b.status = 'rolled_back' THEN RAISE EXCEPTION 'That batch was rolled back'; END IF;

  -- The source gate, once more, at the moment of ingestion.
  IF NOT EXISTS (SELECT 1 FROM public.radar_sources WHERE key = 'admin_import' AND active) THEN
    RAISE EXCEPTION 'The admin_import source is not authorised';
  END IF;

  WITH ins AS (
    INSERT INTO public.radar_candidates (
      source_key, source_record_id, source_url, name, category, city, address,
      phone, whatsapp, email, website, description,
      name_key, city_key, phone_e164, domain, confidence, status, submitted_by,
      profile
    )
    SELECT
      'admin_import',
      b.reference || ':' || r.line_no,
      b.source_url,
      r.mapped->>'name', r.mapped->>'category', r.mapped->>'city', r.mapped->>'address',
      r.mapped->>'phone', r.mapped->>'whatsapp', r.mapped->>'email', r.mapped->>'website',
      r.mapped->>'description',
      r.mapped->>'nameKey', r.mapped->>'cityKey', r.mapped->>'phone', r.mapped->>'domain',
      coalesce(r.confidence, 0),
      'review',
      b.uploaded_by,
      /*
       * Everything ELSE the file carried. Subtracting the keys that are
       * already columns keeps one value in one place — a candidate whose
       * `phone` column and `profile->>'phone'` disagreed would be a bug
       * nobody could reason about.
       */
      coalesce(r.mapped, '{}'::jsonb)
        - 'name' - 'category' - 'city' - 'address'
        - 'phone' - 'whatsapp' - 'email' - 'website' - 'description'
        - 'nameKey' - 'cityKey' - 'domain'
    FROM public.import_rows r
    WHERE r.batch_id = p_batch
      AND r.status IN ('valid','review')
      AND r.mapped ? 'name'
    ON CONFLICT (source_key, source_record_id) WHERE source_record_id IS NOT NULL
      DO NOTHING
    RETURNING id, source_record_id
  )
  UPDATE public.import_rows r
     SET status = 'imported', candidate_id = ins.id
    FROM ins
   WHERE r.batch_id = p_batch
     AND ins.source_record_id = b.reference || ':' || r.line_no;

  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.import_batches
     SET status = 'completed', created_rows = n, approved_by = auth.uid(), approved_at = now()
   WHERE id = p_batch;

  RETURN n;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. HELPERS THE PUBLISH USES
-- ═══════════════════════════════════════════════════════════════════════

/*
 * A pipe-delimited profile value as a jsonb array of strings.
 *
 * NULL rather than '[]' when there is nothing, so a caller can tell "no list
 * was supplied" from "an empty list was supplied". The columns these feed are
 * NOT NULL with a '[]' default, so the publish coalesces — see there.
 */
create or replace function public.profile_list(p_profile jsonb, p_key text)
returns jsonb
language sql
immutable
set search_path to 'public'
as $fn$
  select case
    when coalesce(btrim(p_profile->>p_key), '') = '' then null
    else (
      select case when count(*) = 0 then null else jsonb_agg(t.v order by t.ord) end
        from (
          select btrim(v) as v, ord
            from unnest(string_to_array(p_profile->>p_key, '|')) with ordinality as u(v, ord)
        ) t
       where t.v <> ''
    )
  end;
$fn$;

/*
 * A JSON string in the profile, as jsonb — or NULL if it is not valid JSON.
 *
 * Wrapped in an exception handler because a malformed cell must not take the
 * publish down with it. The business matters more than its FAQ list.
 */
create or replace function public.profile_json(p_profile jsonb, p_key text)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $fn$
declare v text := p_profile->>p_key;
begin
  if coalesce(btrim(v), '') = '' then return null; end if;
  begin
    return v::jsonb;
  exception when others then
    return null;
  end;
end;
$fn$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. PUBLISH IT ALL
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.radar_publish_candidate(p_candidate uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
-- `c` is the candidate ROWTYPE, not a generic record: record_publish_evidence
-- takes a radar_candidates row, and a generic record cannot be cast to it.
DECLARE c public.radar_candidates%rowtype; s record; v_id uuid; v_slug text; v_services jsonb; v_year int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;

  SELECT * INTO c FROM public.radar_candidates WHERE id = p_candidate;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such candidate'; END IF;
  IF c.published_business_id IS NOT NULL THEN RETURN c.published_business_id; END IF;
  IF c.status = 'rejected' THEN RAISE EXCEPTION 'That candidate was rejected'; END IF;

  -- The source gate again, at the last possible moment. Rights can be revoked
  -- between discovery and publication.
  SELECT * INTO s FROM public.radar_sources WHERE key = c.source_key;
  IF NOT FOUND OR NOT s.active THEN
    RAISE EXCEPTION 'Source % is not authorised for publication', c.source_key;
  END IF;

  v_slug := regexp_replace(lower(btrim(c.name)), '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  IF v_slug = '' THEN v_slug := 'business'; END IF;
  -- Slugs are unique; append the candidate id fragment when taken.
  IF EXISTS (SELECT 1 FROM public.businesses WHERE username = v_slug) THEN
    v_slug := v_slug || '-' || substr(replace(p_candidate::text, '-', ''), 1, 6);
  END IF;

  -- A year outside 1800..now is a typo, and years_in_business renders it as a
  -- credential on the public page. The importer checks this too; so does this,
  -- because candidates also arrive from owner submissions.
  v_year := nullif(regexp_replace(coalesce(c.profile->>'founded_year', ''), '\D', '', 'g'), '')::int;
  IF v_year IS NOT NULL AND (v_year < 1800 OR v_year > extract(year from now())::int) THEN
    v_year := NULL;
  END IF;

  INSERT INTO public.businesses (
    name, category, location, address, description, phone, whatsapp, email, website,
    username, external_id,
    data_status, claim_status, verification_status, lifecycle_status,
    source_name, source_url, source_record_id, source_license, source_imported_at,
    -- The profile, projected from radar_candidates.profile by whitelist.
    logo_url, image_url, opening_hours,
    tagline, about, story, mission, vision,
    subcategory, business_type, employees, service_area, timezone, founded_year,
    social_links, core_values, why_us, languages, payment_methods, faqs,
    secondary_categories
  ) VALUES (
    c.name, coalesce(c.category, 'Other'), c.city, c.address, c.description,
    c.phone, c.whatsapp, c.email, c.website,
    v_slug, c.source_key || ':' || coalesce(c.source_record_id, p_candidate::text),
    CASE WHEN c.source_key IN ('business_submission','public_suggestion') THEN 'submitted' ELSE 'imported_authorized' END,
    'unclaimed', 'unverified', 'active',
    s.name, c.source_url, c.source_record_id, s.licence, now(),

    nullif(btrim(coalesce(c.profile->>'logo_url', '')), ''),
    -- The banner. `businesses` has no cover_image_url; image_url IS the cover.
    nullif(btrim(coalesce(c.profile->>'cover_image_url', c.profile->>'image_url', '')), ''),
    nullif(btrim(coalesce(c.profile->>'opening_hours', c.profile->>'hours', '')), ''),

    nullif(btrim(coalesce(c.profile->>'tagline', '')), ''),
    nullif(btrim(coalesce(c.profile->>'about', '')), ''),
    nullif(btrim(coalesce(c.profile->>'story', '')), ''),
    nullif(btrim(coalesce(c.profile->>'mission', '')), ''),
    nullif(btrim(coalesce(c.profile->>'vision', '')), ''),

    nullif(btrim(coalesce(c.profile->>'subcategory', '')), ''),
    nullif(btrim(coalesce(c.profile->>'business_type', '')), ''),
    nullif(btrim(coalesce(c.profile->>'employees', '')), ''),
    nullif(btrim(coalesce(c.profile->>'service_area', '')), ''),
    nullif(btrim(coalesce(c.profile->>'timezone', '')), ''),
    v_year,

    /*
     * social_links is an OBJECT keyed by platform, because that is what
     * socialEntries() in businessProfile.ts reads. strip_nulls so a business
     * with only Instagram gets {"instagram": …} rather than five nulls the
     * page would iterate over.
     */
    jsonb_strip_nulls(jsonb_build_object(
      'instagram', c.profile->>'instagram',
      'facebook',  c.profile->>'facebook',
      'twitter',   c.profile->>'twitter',
      'tiktok',    c.profile->>'tiktok',
      'linkedin',  c.profile->>'linkedin',
      'youtube',   c.profile->>'youtube'
    )),

    /*
     * COALESCED TO THE COLUMN DEFAULT, not left NULL.
     *
     * These six are NOT NULL with a `'[]'` / `'{}'` default, and passing an
     * explicit NULL overrides a default rather than falling back to it — the
     * first version of this migration did exactly that and every publish of a
     * candidate with no `why_us` failed on the not-null constraint. Caught by
     * the end-to-end test before it reached anybody.
     */
    coalesce(public.profile_list(c.profile, 'core_values'), '[]'::jsonb),
    coalesce(public.profile_list(c.profile, 'why_us'), '[]'::jsonb),
    coalesce(public.profile_list(c.profile, 'languages'), '[]'::jsonb),
    coalesce(public.profile_list(c.profile, 'payment_methods'), '[]'::jsonb),
    coalesce(public.profile_json(c.profile, 'faqs_json'), '[]'::jsonb),

    -- text[], not jsonb: secondary_categories is a Postgres array column.
    CASE
      WHEN coalesce(btrim(c.profile->>'secondary_categories'), '') = '' THEN NULL
      ELSE string_to_array(c.profile->>'secondary_categories', '|')
    END
  )
  RETURNING id INTO v_id;

  /*
   * Services are ROWS, so they land after the insert.
   *
   * Nothing here can fail the publish: a malformed services cell yields NULL
   * from profile_json and this block does nothing. A business without its
   * price list is recoverable; a publish that refuses the business is not.
   */
  v_services := public.profile_json(c.profile, 'services_json');
  IF v_services IS NOT NULL AND jsonb_typeof(v_services) = 'array' THEN
    INSERT INTO public.business_services (business_id, name, price, description)
    SELECT v_id,
           btrim(e->>'name'),
           nullif(btrim(coalesce(e->>'price', '')), ''),
           nullif(btrim(coalesce(e->>'description', '')), '')
      FROM jsonb_array_elements(v_services) e
     WHERE coalesce(btrim(e->>'name'), '') <> ''
     LIMIT 40;
  END IF;

  /*
   * §8 — record where each published field came from.
   *
   * Added by 20260908220000. Kept here, inside the publish, because that is
   * the only moment the source, the candidate and the new business id are all
   * in hand — after this the link between "this phone number" and "that file"
   * is not recoverable.
   */
  -- `radar_sources` carries no URL of its own (key, name, kind, licence,
  -- rights), so the candidate's own source_url is the only one there is.
  PERFORM public.record_publish_evidence(v_id, c, c.source_url);

  UPDATE public.radar_candidates
     SET status = 'published', published_business_id = v_id,
         reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_candidate;

  RETURN v_id;
END;
$function$;

comment on function public.radar_publish_candidate is
  'Publishes a reviewed candidate as an unclaimed listing, carrying the whole profile — socials, tagline, hours, banner, FAQs and services (as business_services rows). Projects radar_candidates.profile by an explicit whitelist: a mapped column cannot write to a business column merely by being named after it.';
