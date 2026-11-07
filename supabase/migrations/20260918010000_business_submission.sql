-- One shareable link that anyone can use to put a business on NowOpen.
--
-- WHAT THIS IS NOT
--
-- It is not a second business-creation system. The dashboard already creates
-- businesses, `radar_candidates` already queues unverified ones, `business_members`
-- already models representation, `business_claims` already models ownership, and
-- `businesses` already carries the full status model (profile_state, claim_status,
-- verification_status, lifecycle_status). All of that is reused unchanged.
--
-- THREE THINGS THE SCHEMA COULD NOT ALREADY SAY
--
-- 1. WHO IS SUBMITTING, AND ON WHAT BASIS. `data_status` says how the data
--    arrived (submitted, user_created, admin_curated). It cannot say whether the
--    person typing owns the business, works for it, or merely likes it. Those
--    carry completely different trust consequences, so `submission_type` is added.
--
-- 2. WHAT THEY AGREED TO. A public form that publishes a business must record the
--    consent that permitted it — including the media-rights confirmation — in a
--    form that survives the session. `business_submission_consents` does that.
--
-- 3. WHAT THEY HAD TYPED BEFORE BEING ASKED TO SIGN IN. A seven-step form behind
--    an auth gate loses everything at the gate unless the draft is stored
--    server-side. `business_submission_drafts` does that, one per user.
--
-- WHY A SECURITY DEFINER FUNCTION AND NOT A CLIENT INSERT
--
-- Four requirements are impossible from the browser, and every one of them is
-- load-bearing for a link designed to be pasted into WhatsApp:
--
--   * `profile_state` DEFAULTS TO 'published'. A client insert that forgets the
--     column publishes instantly. The function always states it.
--   * RLS on `businesses` is `WITH CHECK (auth.uid() = user_id)`, so a
--     RECOMMENDATION — where the submitter is explicitly NOT the owner — cannot
--     be inserted by the submitter at all. It must become a radar_candidate.
--   * Rate limiting and idempotency cannot be enforced by something the
--     submitter controls.
--   * Business, membership, consent, provenance and audit must land together or
--     not at all.
--
-- PUBLISHING IS DELIBERATELY NOT AUTOMATIC
--
-- `is_listable` is `lifecycle_status <> 'suspended' AND (data_status <>
-- 'synthetic_unverified' OR claim_status = 'claimed')` — it is NOT gated on
-- `listing_score`. A thin or hostile submission would therefore appear in the
-- directory, just unindexed. So public submissions land `ready_for_review`.
-- `site_settings.public_submission_autopublish` can change that in one row when
-- someone decides the moderation load is worth trading; the default is the
-- cautious answer because the directory's trustworthiness is the whole asset.
-- The dashboard's own create path is untouched.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. WHO SUBMITTED, AND ON WHAT BASIS
-- ═══════════════════════════════════════════════════════════════════════

alter table public.businesses
  add column if not exists submission_type text;

comment on column public.businesses.submission_type is
  'How this row entered NowOpen and on whose authority: owner, representative, recommendation, admin_import, discovery_engine. Distinct from data_status, which says how the DATA arrived rather than who vouched for it. NULL on rows that predate the public submission route.';

alter table public.businesses drop constraint if exists businesses_submission_type_check;
alter table public.businesses add constraint businesses_submission_type_check
  check (submission_type is null or submission_type in (
    'owner',            -- the person says they run it
    'representative',   -- employee, agency, brand manager
    'recommendation',   -- a customer or passer-by (never reaches this table)
    'admin_import',
    'discovery_engine'
  ));

-- Campaign attribution, kept deliberately coarse. `source` is already a closed
-- vocabulary in src/lib/acquisition.ts; campaign is a free slug. Neither may
-- carry personal data — the brief is explicit and so is this comment.
alter table public.businesses
  add column if not exists submission_source   text,
  add column if not exists submission_campaign text;

comment on column public.businesses.submission_campaign is
  'Campaign slug from ?campaign=. Never a user identifier: attribution answers "which flyer worked", not "who is this".';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. THE DRAFT — so the auth gate does not eat the form
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.business_submission_drafts (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  step        integer not null default 0,
  source      text,
  campaign    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.business_submission_drafts is
  'One in-progress /add-business submission per user. Server-side so that signing in mid-form does not discard it, and so a phone that dies at step 5 can resume on a laptop.';

alter table public.business_submission_drafts enable row level security;

drop policy if exists business_submission_drafts_own on public.business_submission_drafts;
create policy business_submission_drafts_own on public.business_submission_drafts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Staff never need to read a half-typed draft, and it may contain a personal
-- phone number the submitter has not yet chosen to publish. No staff policy.

-- ═══════════════════════════════════════════════════════════════════════
-- 3. WHAT THEY AGREED TO
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.business_submission_consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  business_id     uuid references public.businesses(id) on delete set null,
  candidate_id    uuid,
  submission_type text not null,

  /*
   * Each consent is stored as its own boolean rather than one "agreed: true",
   * because they are separate promises and a dispute will be about exactly one
   * of them — most often the media rights.
   */
  accuracy_confirmed      boolean not null default false,
  review_understood       boolean not null default false,
  ownership_not_implied   boolean not null default false,
  terms_accepted          boolean not null default false,
  media_rights_confirmed  boolean not null default false,

  /** The exact wording shown, so a later dispute is about a known text. */
  consent_text_version    text not null default 'v1',
  created_at              timestamptz not null default now()
);

comment on table public.business_submission_consents is
  'The consents a submitter gave, one column per promise, with the wording version they were shown. Written in the same transaction as the business so a published profile always has the permission that allowed it.';

alter table public.business_submission_consents enable row level security;

drop policy if exists business_submission_consents_own on public.business_submission_consents;
create policy business_submission_consents_own on public.business_submission_consents
  for select to authenticated using (user_id = auth.uid());

drop policy if exists business_submission_consents_staff on public.business_submission_consents;
create policy business_submission_consents_staff on public.business_submission_consents
  for select to authenticated using (public.is_staff());

-- Writes happen only inside submit_business(). No insert policy: the function is
-- SECURITY DEFINER and nothing else has any business writing a consent record.

create index if not exists business_submission_consents_business
  on public.business_submission_consents (business_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. THE MODERATION SWITCH
-- ═══════════════════════════════════════════════════════════════════════

insert into public.site_settings (key, value)
values ('public_submission_autopublish', 'false')
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. DUPLICATE CHECK — advisory, and readable before submitting
-- ═══════════════════════════════════════════════════════════════════════

/**
 * Candidate matches for a name/phone/website, so the form can say "we may
 * already have this" BEFORE the user fills in six more steps.
 *
 * Deliberately cheap and deliberately generous: it is a prompt for a human, not
 * a decision. The authoritative check runs again inside submit_business().
 *
 * SECURITY DEFINER only to keep the query off the client's RLS path; it returns
 * nothing that `Public can view businesses` does not already expose.
 */
create or replace function public.find_business_matches(
  p_name    text,
  p_phone   text default null,
  p_website text default null,
  p_limit   integer default 5
)
returns table (
  id            uuid,
  name          text,
  username      text,
  location      text,
  category      text,
  image_url     text,
  claim_status  text,
  match_reason  text
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with needle as (
    select
      lower(btrim(coalesce(p_name, '')))                              as n,
      -- Digits only: "+234 801 234 5678" and "0801-234-5678" are one number.
      nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '') as ph,
      -- Host only, so a path or a www. prefix does not hide a match.
      nullif(lower(regexp_replace(regexp_replace(coalesce(p_website, ''),
        '^https?://', ''), '^www\.', '')), '')                        as wsite
  )
  select b.id, b.name, b.username, b.location, b.category, b.image_url, b.claim_status,
    case
      when needle.ph is not null
       and regexp_replace(coalesce(b.phone, ''), '[^0-9]', '', 'g') = needle.ph
        then 'same phone number'
      when needle.wsite is not null
       and lower(regexp_replace(regexp_replace(coalesce(b.website, ''),
             '^https?://', ''), '^www\.', '')) like needle.wsite || '%'
        then 'same website'
      else 'similar name'
    end as match_reason
  from public.businesses b, needle
  where b.is_listable
    and b.removal_status = 'none'
    and (
      (needle.n <> '' and lower(b.name) = needle.n)
      or (needle.n <> '' and lower(b.name) like needle.n || '%')
      or (needle.ph is not null
          and regexp_replace(coalesce(b.phone, ''), '[^0-9]', '', 'g') = needle.ph)
      or (needle.wsite is not null
          and lower(regexp_replace(regexp_replace(coalesce(b.website, ''),
                '^https?://', ''), '^www\.', '')) like needle.wsite || '%')
    )
  order by
    -- Phone and website are identity; a name prefix is only a hint.
    case when needle.ph is not null
          and regexp_replace(coalesce(b.phone, ''), '[^0-9]', '', 'g') = needle.ph
         then 0 else 1 end,
    case when lower(b.name) = needle.n then 0 else 1 end,
    b.listing_score desc
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$fn$;

comment on function public.find_business_matches is
  'Possible existing profiles for a name/phone/website. Advisory only — shown to the submitter so they can claim instead of duplicating. Returns only already-public fields.';

-- ═══════════════════════════════════════════════════════════════════════
-- 6. THE SUBMISSION ITSELF
-- ═══════════════════════════════════════════════════════════════════════

/**
 * Create a business (or a review candidate) from the public /add-business form.
 *
 * THE ONE WRITE PATH for public submissions. Everything that must be true at
 * once is true here or nothing happens:
 *
 *   * the caller is authenticated (auth.uid(), not a client claim)
 *   * they have not flooded the queue
 *   * the same submission twice in a row is the same row, not two
 *   * `profile_state` is stated explicitly, never inherited from the default
 *   * a RECOMMENDATION creates NO business and NO ownership, because the
 *     submitter has not claimed to own anything
 *   * consent is recorded alongside whatever it permitted
 *
 * p_payload carries the form. It is read field by field — never splatted into
 * the row — so a crafted extra key cannot set `verified`, `trust_score`,
 * `claim_status` or anything else the form has no business setting.
 */
create or replace function public.submit_business(
  p_payload         jsonb,
  p_submission_type text,
  p_consents        jsonb,
  p_idempotency_key text default null,
  p_source          text default null,
  p_campaign        text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_user       uuid := auth.uid();
  v_name       text;
  v_username   text;
  v_recent     int;
  v_existing   uuid;
  v_business   uuid;
  v_candidate  uuid;
  v_publish    boolean;
  v_state      text;
  v_key        text;
  v_relation   text;
begin
  -- 1. AUTHENTICATION. Never the client's word for it.
  if v_user is null then
    raise exception 'You must be signed in to submit a business'
      using errcode = '42501';
  end if;

  if p_submission_type not in ('owner', 'representative', 'recommendation') then
    raise exception 'Unknown submission type: %', p_submission_type;
  end if;

  /*
   * 2. IDEMPOTENCY, checked BEFORE validation and before any write.
   *
   * A retry is a retry. The first call already validated the payload and
   * created the row, so a second call carrying the same key must return that
   * row whatever it now contains -- a phone that resent on a flaky connection
   * may not be sending an identical body. Validating first would reject the
   * retry and leave the caller believing the submission failed when it did not.
   *
   * It is a pure read and the key is scoped to `user_id = auth.uid()`, so it
   * cannot be used to discover anyone else's submissions.
   */
  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  if v_key is not null then
    select id into v_existing
      from public.businesses
     where user_id = v_user
       and source_record_id = 'submit:' || v_key
     limit 1;
    if v_existing is not null then
      return jsonb_build_object(
        'business_id', v_existing,
        'duplicate_of_submission', true,
        'status', 'already_submitted',
        'username', (select username from public.businesses where id = v_existing));
    end if;
  end if;

  v_name := btrim(coalesce(p_payload->>'name', ''));
  if length(v_name) < 2 then
    raise exception 'A business name is required';
  end if;
  if length(v_name) > 160 then
    raise exception 'That business name is too long';
  end if;

  /*
   * `category` is NOT NULL on businesses with no default. Refusing here with a
   * sentence a person can act on beats surfacing a constraint violation that
   * names a column the submitter has never heard of. Recommendations are exempt:
   * they land in radar_candidates, where category is optional, because someone
   * recommending a shop they like should not have to classify it.
   */
  if p_submission_type <> 'recommendation'
     and btrim(coalesce(p_payload->>'category', '')) = '' then
    raise exception 'Choose a category so customers can find this business';
  end if;

  -- 4. CONSENT. The form can render whatever it likes; these must be true.
  if not coalesce((p_consents->>'accuracy_confirmed')::boolean, false)
     or not coalesce((p_consents->>'terms_accepted')::boolean, false) then
    raise exception 'The accuracy and terms confirmations are required';
  end if;

  /*
   * A recommendation must positively acknowledge that it is NOT a claim of
   * ownership. Requiring it here rather than trusting the UI means the sentence
   * cannot be quietly dropped from the form later.
   */
  if p_submission_type = 'recommendation'
     and not coalesce((p_consents->>'ownership_not_implied')::boolean, false) then
    raise exception 'A recommendation must confirm that it does not claim ownership';
  end if;

  -- Media rights are only meaningful when media was actually attached.
  if (coalesce(p_payload->>'logo_url', '') <> '' or coalesce(p_payload->>'image_url', '') <> '')
     and not coalesce((p_consents->>'media_rights_confirmed')::boolean, false) then
    raise exception 'Confirm you have the rights to the images you attached';
  end if;

  -- 5. RATE LIMIT. Generous enough for an agency onboarding a client list,
  --    tight enough that a script is not a directory.
  select count(*) into v_recent
    from public.businesses
   where user_id = v_user
     and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'That is a lot of businesses in one hour. Please contact us so we can help you add them properly.'
      using errcode = '53400';
  end if;

  -- ─────────────────────────────────────────────────────────────────────
  -- RECOMMENDATION: no business, no ownership, no shortcut.
  --
  -- RLS on `businesses` requires auth.uid() = user_id for an insert, so the
  -- submitter of a business they do not own cannot create one even if this
  -- function wanted to. It goes to the queue a human already reads.
  -- ─────────────────────────────────────────────────────────────────────
  if p_submission_type = 'recommendation' then
    insert into public.radar_candidates (
      source_key, name, category, city, address, phone, whatsapp, email, website,
      confidence, status, decision_reason, source_url
    ) values (
      'public_suggestion',
      v_name,
      nullif(btrim(coalesce(p_payload->>'category', '')), ''),
      nullif(btrim(coalesce(p_payload->>'city', '')), ''),
      nullif(btrim(coalesce(p_payload->>'address', '')), ''),
      nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
      nullif(btrim(coalesce(p_payload->>'whatsapp', '')), ''),
      nullif(btrim(coalesce(p_payload->>'email', '')), ''),
      nullif(btrim(coalesce(p_payload->>'website', '')), ''),
      0,          -- nobody has verified anything
      'pending',
      'Recommended through /add-business by a signed-in user who does not claim ownership.',
      nullif(btrim(coalesce(p_payload->>'google_maps_url', '')), '')
    )
    returning id into v_candidate;

    insert into public.business_submission_consents (
      user_id, candidate_id, submission_type,
      accuracy_confirmed, review_understood, ownership_not_implied,
      terms_accepted, media_rights_confirmed
    ) values (
      v_user, v_candidate, p_submission_type,
      true, coalesce((p_consents->>'review_understood')::boolean, false), true,
      true, coalesce((p_consents->>'media_rights_confirmed')::boolean, false)
    );

    insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
    values (v_user, 'business_recommended', 'radar_candidate', v_candidate::text,
            jsonb_build_object('name', v_name, 'source', p_source, 'campaign', p_campaign));

    delete from public.business_submission_drafts where user_id = v_user;

    return jsonb_build_object(
      'candidate_id', v_candidate,
      'business_id', null,
      'submission_type', p_submission_type,
      'status', 'pending_review');
  end if;

  -- ─────────────────────────────────────────────────────────────────────
  -- OWNER / REPRESENTATIVE: a real business row.
  -- ─────────────────────────────────────────────────────────────────────

  -- 5. USERNAME. Generated here, not trusted from the client, because it
  --    decides a public URL at the site root.
  v_username := lower(regexp_replace(coalesce(nullif(btrim(p_payload->>'username'), ''), v_name),
                                     '[^a-zA-Z0-9]+', '-', 'g'));
  v_username := btrim(regexp_replace(v_username, '(^-+|-+$)', '', 'g'), '-');
  if v_username = '' then v_username := 'business'; end if;
  v_username := left(v_username, 40);

  /*
   * Usernames live at the site root, so a generated one may not collide with a
   * route. A business genuinely called "Add Business" would otherwise be handed
   * /add-business and break the very page that created it. Kept in step with
   * RESERVED in middleware.ts and RESERVED_USERNAMES in BusinessForm.tsx.
   */
  if v_username in (
    'add-business', 'join', 'admin', 'adverts', 'advert', 'api', 'app',
    'business', 'businesses', 'contact', 'dashboard', 'digital-forms', 'edit',
    'help', 'home', 'login', 'media', 'new', 'pricing', 'profile', 'register',
    'settings', 'signup', 'support', 'terms', 'privacy', 'waitlist', 'www',
    'discover', 'nearby', 'offers', 'open-now', 'keeps', 'send-business',
    'nominate', 'founding', 'platform', 'os', 'forms', 'security', 'studio'
  ) then
    v_username := v_username || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);
  end if;

  -- Suffix until free. `businesses.username` is the site-root namespace, so a
  -- collision is a wrong page, not a cosmetic problem.
  if exists (select 1 from public.businesses where lower(username) = v_username) then
    v_username := v_username || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  -- 6. PUBLISH OR REVIEW. Stated, never defaulted.
  select coalesce(value, 'false') = 'true' into v_publish
    from public.site_settings where key = 'public_submission_autopublish';
  v_state := case when coalesce(v_publish, false) then 'published' else 'ready_for_review' end;

  insert into public.businesses (
    user_id, name, username, description, about, tagline, category, subcategory,
    business_type, location, address,
    phone, whatsapp, email, website, social_links, logo_url, image_url,
    opening_hours, service_area, languages, founded_year,
    submission_type, submission_source, submission_campaign,
    data_status, claim_status, verification_status, profile_state,
    lifecycle_status, data_confidence,
    source_name, source_record_id, source_imported_at
  ) values (
    v_user,
    v_name,
    v_username,
    nullif(btrim(coalesce(p_payload->>'description', '')), ''),
    nullif(btrim(coalesce(p_payload->>'about', '')), ''),
    nullif(btrim(coalesce(p_payload->>'tagline', '')), ''),
    nullif(btrim(coalesce(p_payload->>'category', '')), ''),
    nullif(btrim(coalesce(p_payload->>'subcategory', '')), ''),
    nullif(btrim(coalesce(p_payload->>'business_type', '')), ''),
    nullif(btrim(coalesce(p_payload->>'location', '')), ''),
    nullif(btrim(coalesce(p_payload->>'address', '')), ''),
    nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
    nullif(btrim(coalesce(p_payload->>'whatsapp', '')), ''),
    nullif(btrim(coalesce(p_payload->>'email', '')), ''),
    nullif(btrim(coalesce(p_payload->>'website', '')), ''),
    coalesce(p_payload->'social_links', '{}'::jsonb),
    nullif(btrim(coalesce(p_payload->>'logo_url', '')), ''),
    nullif(btrim(coalesce(p_payload->>'image_url', '')), ''),
    nullif(btrim(coalesce(p_payload->>'opening_hours', '')), ''),
    nullif(btrim(coalesce(p_payload->>'service_area', '')), ''),
    -- jsonb on this table, not text: an array of language names.
    coalesce(p_payload->'languages', '[]'::jsonb),
    nullif(p_payload->>'founded_year', '')::int,
    p_submission_type,
    nullif(btrim(coalesce(p_source, '')), ''),
    nullif(btrim(coalesce(p_campaign, '')), ''),
    'submitted',
    /*
     * NOT 'claimed'. The person said they own it; nobody has checked. That is
     * exactly what claim_pending means, and it is why the profile shows no
     * verified badge until verification actually happens.
     */
    'claim_pending',
    'unverified',
    v_state,
    case when coalesce((p_payload->>'temporarily_closed')::boolean, false)
         then 'temporarily_closed' else 'active' end,
    'unconfirmed',
    'public_submission',
    case when v_key is not null then 'submit:' || v_key else null end,
    now()
  )
  returning id into v_business;

  -- 7. THE DECLARED RELATIONSHIP, recorded rather than assumed.
  v_relation := nullif(btrim(coalesce(p_payload->>'relationship', '')), '');
  if p_submission_type = 'representative' then
    insert into public.business_members (business_id, user_id, role, status)
    values (v_business, v_user, coalesce(v_relation, 'representative'), 'pending');
  end if;

  -- 8. A CLAIM REQUEST, so the existing review queue picks this up rather than
  --    a second parallel queue being invented for the same question.
  insert into public.business_claims (business_id, user_id, contact, evidence, status, note)
  values (
    v_business, v_user,
    nullif(btrim(coalesce(p_payload->>'email', p_payload->>'phone', '')), ''),
    -- `evidence` is TEXT on this table, so the structure is serialised rather
    -- than stored as jsonb. Still machine-readable, still one column.
    jsonb_build_object(
      'submission_type', p_submission_type,
      'relationship', v_relation,
      'declared_at', now())::text,
    'pending',
    case p_submission_type
      when 'owner' then 'Submitted through /add-business as the owner.'
      else 'Submitted through /add-business as a representative: ' || coalesce(v_relation, 'unspecified')
    end
  );

  insert into public.business_submission_consents (
    user_id, business_id, submission_type,
    accuracy_confirmed, review_understood, ownership_not_implied,
    terms_accepted, media_rights_confirmed
  ) values (
    v_user, v_business, p_submission_type,
    true,
    coalesce((p_consents->>'review_understood')::boolean, false),
    coalesce((p_consents->>'ownership_not_implied')::boolean, false),
    true,
    coalesce((p_consents->>'media_rights_confirmed')::boolean, false)
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (v_user, 'business_submitted', 'business', v_business::text,
          jsonb_build_object(
            'submission_type', p_submission_type,
            'profile_state', v_state,
            'source', p_source,
            'campaign', p_campaign));

  delete from public.business_submission_drafts where user_id = v_user;

  return jsonb_build_object(
    'business_id',     v_business,
    'username',        v_username,
    'submission_type', p_submission_type,
    'profile_state',   v_state,
    'claim_status',    'claim_pending',
    'status',          case when v_state = 'published' then 'published' else 'pending_review' end);
end;
$fn$;

comment on function public.submit_business is
  'The single write path for the public /add-business form. Authenticates, rate-limits, de-duplicates by idempotency key, states profile_state explicitly rather than inheriting the published default, records consent and audit, and routes a recommendation to radar_candidates because a submitter who does not own a business may not create one.';

-- ═══════════════════════════════════════════════════════════════════════
-- 7. GRANTS
-- ═══════════════════════════════════════════════════════════════════════

revoke all on function public.submit_business(jsonb, text, jsonb, text, text, text) from public;
grant execute on function public.submit_business(jsonb, text, jsonb, text, text, text) to authenticated;

-- Anonymous visitors may check for an existing profile before signing up: that
-- is the whole point of offering "claim it" instead of "create a duplicate",
-- and it returns only fields the directory already shows publicly.
revoke all on function public.find_business_matches(text, text, text, integer) from public;
grant execute on function public.find_business_matches(text, text, text, integer) to anon, authenticated;
