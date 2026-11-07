-- Universal search suggestions: one query across everything NowOpen publishes.
--
-- ── WHY THIS IS SERVER-SIDE ──────────────────────────────────────────────
--
-- MEASURED ON PRODUCTION, 2026-09-17:
--
--   listable businesses                3,141
--   published services                22,085
--   published products                 2,807
--   advertisements                        97
--   media services                        18
--   distinct places                      278
--   distinct categories                   41
--
-- The component that was written for this — GlobalSearchInput — builds its
-- index in the browser with `.limit(300)` per table. So it could match 300 of
-- 3,141 businesses and none of the 22,085 services, and a visitor searching for
-- a real listing outside that slice is told, with complete confidence, that it
-- does not exist. (It is also imported by nothing, so today it matches zero.)
--
-- Shipping the whole corpus to the browser is not the fix either: it is
-- megabytes per visit for a dropdown. So the matching happens where the data
-- is, indexed, and only the handful of rows shown travel.
--
-- ── SECURITY INVOKER, DELIBERATELY ───────────────────────────────────────
--
-- This runs as the caller, so RLS applies exactly as it does on the pages
-- themselves. A SECURITY DEFINER search would be a hole that returns unlisted
-- rows through a dropdown, which is the least visible place to leak them.
--
-- `businesses` is then filtered EXPLICITLY on is_listable + profile_state as
-- well, for the reason Businesses.tsx records: RLS also lets an admin see their
-- own unlisted rows, so an admin would get suggestions a customer cannot reach
-- and nothing would say which were which.
--
-- ── WHAT A SUGGESTION IS ─────────────────────────────────────────────────
--
-- Two kinds, and the difference matters:
--
--   an ENTITY  — one business, advert or media service; the href is its page.
--   a TERM     — a service, product, place or category; the href is a filtered
--                list. "Diagnostic tests" is offered by ~1,600 businesses and
--                is not a page, so it resolves to the businesses offering it.
--
-- Nothing here invents a suggestion. Every row returned is a row that exists.

-- ── Indexes ──────────────────────────────────────────────────────────────
--
-- Trigram, because these are typo-and-substring searches ("pharm", "resturant")
-- rather than the word searches a tsvector is for. Partial where the public
-- filter is fixed, so the index holds only rows a visitor can reach.
--
-- THE OPERATOR MATTERS, NOT JUST THE INDEX. The first version of this wrote
-- `similarity(lower(name), lower(q)) > 0.35` and measured a SEQ SCAN over all
-- 22,085 service rows — 18,107 of them removed by filter — because a function
-- call cannot use a GIN index. `name % q` is the indexable form of the same
-- test. The index existed and read as if it were working; only the plan said
-- otherwise.
--
-- `%` uses pg_trgm.similarity_threshold (0.3 by default) rather than a
-- per-branch number, which is the price of being index-backed and worth it.

create index if not exists idx_businesses_name_trgm
  on public.businesses using gin (name public.gin_trgm_ops);
create index if not exists idx_businesses_location_trgm
  on public.businesses using gin (location public.gin_trgm_ops);
create index if not exists idx_businesses_category_trgm
  on public.businesses using gin (category public.gin_trgm_ops);

create index if not exists idx_business_services_name_trgm
  on public.business_services using gin (name public.gin_trgm_ops)
  where published;
create index if not exists idx_business_products_name_trgm
  on public.business_products using gin (name public.gin_trgm_ops)
  where published;

create index if not exists idx_advertisements_title_trgm
  on public.advertisements using gin (title public.gin_trgm_ops);
create index if not exists idx_media_services_title_trgm
  on public.media_services using gin (title public.gin_trgm_ops);

-- ── Scoring ──────────────────────────────────────────────────────────────

/**
 * How well `label` answers `q`, 0–100.
 *
 * Ordered by what a person typing means, not by string distance:
 *
 *   100  it is the thing they typed
 *    80  it starts with what they typed        "pharm" -> "Pharmacy"
 *    60  a WORD in it starts with it           "kola"  -> "Ade Kola Stores"
 *    40  it contains it somewhere
 *   <40  trigram similarity — the typo tier    "resturant" -> "Restaurant"
 *
 * The word-prefix tier is the one that earns its keep in this directory: most
 * business names here begin with a founder's name or an initialism, so a plain
 * prefix match finds almost nothing a person actually searches for.
 */
create or replace function public.suggest_score(label text, q text)
returns real
language sql
immutable
parallel safe
as $$
  select case
    when label is null or q is null then 0::real
    when lower(label) = lower(q) then 100::real
    when label ilike q || '%' then 80::real
    when label ilike '% ' || q || '%' then 60::real
    when label ilike '%' || q || '%' then 40::real
    else least(39::real, (public.similarity(lower(label), lower(q)) * 100)::real)
  end
$$;

-- ── The suggester ────────────────────────────────────────────────────────

drop function if exists public.search_suggest(text, integer, integer);

/**
 * Suggestions across every kind of thing NowOpen publishes.
 *
 * `per_kind` caps each kind so one does not crowd out the rest — without it a
 * query like "care" returns twelve services and no businesses, because there
 * are seven times more service rows than business rows. The dropdown is a
 * sample of what exists, not a ranking of everything.
 */
create or replace function public.search_suggest(
  q text,
  per_kind integer default 4,
  max_total integer default 16
)
returns table (
  kind text,
  label text,
  sublabel text,
  href text,
  score real,
  hits bigint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with input as (
    -- One character matches most of the directory and answers nothing, so the
    -- floor is two. Trimmed here rather than trusted to every caller.
    select nullif(btrim(q), '') as term
  ),
  ok as (select term from input where length(term) >= 2),

  -- ── Businesses ─────────────────────────────────────────────────────────
  biz as (
    select
      'business'::text as kind,
      b.name as label,
      nullif(concat_ws(' · ', b.category, b.location), '') as sublabel,
      case when coalesce(btrim(b.username), '') <> ''
           then '/' || b.username
           else '/businesses/' || b.id::text end as href,
      greatest(
        public.suggest_score(b.name, o.term),
        -- Half weight: a place or category match is a reason to show the
        -- business, but never a better answer than its own name matching.
        public.suggest_score(b.category, o.term) * 0.5,
        public.suggest_score(b.location, o.term) * 0.5
      ) as score,
      1::bigint as hits
    from public.businesses b cross join ok o
    where b.is_listable
      and b.profile_state = 'published'
      and (
        b.name ilike '%' || o.term || '%'
        or b.category ilike '%' || o.term || '%'
        or b.location ilike '%' || o.term || '%'
        or b.name % o.term
      )
  ),

  -- ── Services, as TERMS ──────────────────────────────────────────────────
  --
  -- Grouped by name on purpose. "Diagnostic tests" is a row on ~1,600
  -- businesses; listing it 1,600 times is not a suggestion, and picking one
  -- arbitrary clinic to represent it would be a recommendation nobody made.
  -- One row, a count, and a link to the businesses offering it.
  svc as (
    select
      'service'::text as kind,
      s.name as label,
      count(distinct s.business_id)::text || ' ' ||
        case when count(distinct s.business_id) = 1 then 'business offers this' else 'businesses offer this' end as sublabel,
      '/businesses?service=' || replace(replace(s.name, '&', '%26'), '#', '%23') as href,
      max(public.suggest_score(s.name, o.term)) as score,
      -- DISTINCT BUSINESSES, not rows. A business can list the same service
      -- twice, and "1,708 businesses offer this" leading to a page of 1,707 is
      -- the platform miscounting itself in public.
      count(distinct s.business_id)::bigint as hits
    from public.business_services s
    join public.businesses b on b.id = s.business_id
    cross join ok o
    where s.published
      and b.is_listable and b.profile_state = 'published'
      and (s.name ilike '%' || o.term || '%'
           or s.name % o.term)
    group by s.name
  ),

  -- ── Products, as TERMS ─────────────────────────────────────────────────
  prod as (
    select
      'product'::text as kind,
      p.name as label,
      count(distinct p.business_id)::text || ' ' ||
        case when count(distinct p.business_id) = 1 then 'business lists this' else 'businesses list this' end as sublabel,
      '/businesses?product=' || replace(replace(p.name, '&', '%26'), '#', '%23') as href,
      max(public.suggest_score(p.name, o.term)) as score,
      count(distinct p.business_id)::bigint as hits
    from public.business_products p
    join public.businesses b on b.id = p.business_id
    cross join ok o
    where p.published
      and b.is_listable and b.profile_state = 'published'
      and (p.name ilike '%' || o.term || '%'
           or p.name % o.term)
    group by p.name
  ),

  -- ── Places, as TERMS ───────────────────────────────────────────────────
  --
  -- Only places that HAVE listings. A suggestion for a town with nothing in it
  -- sends someone to an empty page, which reads as a broken directory rather
  -- than an honest gap.
  place as (
    select
      'place'::text as kind,
      b.location as label,
      count(*)::text || ' ' ||
        case when count(*) = 1 then 'business' else 'businesses' end as sublabel,
      '/businesses?location=' || replace(replace(b.location, '&', '%26'), '#', '%23') as href,
      max(public.suggest_score(b.location, o.term)) as score,
      count(*)::bigint as hits
    from public.businesses b cross join ok o
    where b.is_listable and b.profile_state = 'published'
      and coalesce(btrim(b.location), '') <> ''
      and (b.location ilike '%' || o.term || '%'
           or b.location % o.term)
    group by b.location
  ),

  -- ── Categories, as TERMS ───────────────────────────────────────────────
  cat as (
    select
      'category'::text as kind,
      b.category as label,
      count(*)::text || ' ' ||
        case when count(*) = 1 then 'business' else 'businesses' end as sublabel,
      '/businesses?category=' || replace(replace(b.category, '&', '%26'), '#', '%23') as href,
      max(public.suggest_score(b.category, o.term)) as score,
      count(*)::bigint as hits
    from public.businesses b cross join ok o
    where b.is_listable and b.profile_state = 'published'
      and coalesce(btrim(b.category), '') <> ''
      and (b.category ilike '%' || o.term || '%'
           or b.category % o.term)
    group by b.category
  ),

  -- ── Adverts and media ──────────────────────────────────────────────────
  --
  -- No explicit status filter: RLS decides what is visible on /adverts and
  -- /media, and this must answer the same question those pages do rather than
  -- a second, drifting one of its own.
  adv as (
    select
      'advert'::text as kind,
      a.title as label,
      nullif(concat_ws(' · ', a.category, a.location), '') as sublabel,
      '/adverts/' || a.id::text as href,
      greatest(
        public.suggest_score(a.title, o.term),
        public.suggest_score(a.category, o.term) * 0.5
      ) as score,
      1::bigint as hits
    from public.advertisements a cross join ok o
    where a.title ilike '%' || o.term || '%'
       or a.category ilike '%' || o.term || '%'
  ),
  med as (
    select
      'media'::text as kind,
      m.title as label,
      m.service_type as sublabel,
      '/media/' || m.id::text as href,
      greatest(
        public.suggest_score(m.title, o.term),
        public.suggest_score(m.service_type, o.term) * 0.5
      ) as score,
      1::bigint as hits
    from public.media_services m cross join ok o
    where m.title ilike '%' || o.term || '%'
       or m.service_type ilike '%' || o.term || '%'
  ),

  everything as (
    select * from biz
    union all select * from svc
    union all select * from prod
    union all select * from place
    union all select * from cat
    union all select * from adv
    union all select * from med
  ),
  ranked as (
    select e.*,
           row_number() over (
             partition by e.kind
             -- `hits` breaks ties: between two equally-well-matching services,
             -- the one more businesses actually offer is the more useful answer.
             order by e.score desc, e.hits desc, e.label asc
           ) as rank_in_kind
      from everything e
     where e.score >= 20
  )
  select r.kind, r.label, r.sublabel, r.href, r.score, r.hits
    from ranked r
   where r.rank_in_kind <= greatest(1, per_kind)
   order by r.score desc, r.hits desc, r.label asc
   limit greatest(1, max_total)
$$;

comment on function public.search_suggest(text, integer, integer) is
  'Universal search suggestions across businesses, services, products, places, categories, adverts and media. SECURITY INVOKER — RLS applies.';

grant execute on function public.suggest_score(text, text) to anon, authenticated;
grant execute on function public.search_suggest(text, integer, integer) to anon, authenticated;

-- ── Businesses offering a service or product ─────────────────────────────

drop function if exists public.businesses_offering(text, text);

/**
 * The business ids that offer a given service or product name.
 *
 * This is what makes a service suggestion lead anywhere. /businesses filters on
 * name, description and category only — so before this, picking "Diagnostic
 * tests" from the dropdown would have run a text search for that phrase across
 * business NAMES and returned nothing at all, which is the worst possible
 * outcome for a suggestion the platform itself offered.
 *
 * ── ONE ARRAY, NOT 1,708 ROWS ─────────────────────────────────────────
 *
 * MEASURED IN THE BROWSER, 2026-09-17. The first version returned a SET of
 * ids, and "Diagnostic tests" — which the dropdown correctly advertises as
 * 1,708 businesses — filtered the directory down to exactly 1,000.
 *
 * PostgREST truncates every response at 1,000 rows, silently and with no
 * error. So 708 real businesses that offer the service were invisible, on a
 * page reached by clicking a number that said 1,708. Nothing failed; the
 * directory simply lied about its own contents.
 *
 * Returning ONE row holding a uuid[] puts the whole answer inside a single
 * row, where no row cap can reach it. 1,708 uuids is about 61KB — smaller than
 * one of the photographs already on the page.
 *
 * Ids rather than rows, still: the page already holds the businesses it is
 * showing, and re-fetching them through a second shape would give two
 * definitions of what a listing is.
 */
create or replace function public.businesses_offering(
  offering_name text,
  offering_kind text default 'service'
)
returns uuid[]
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select coalesce(array_agg(distinct m.business_id), array[]::uuid[])
    from (
      select s.business_id
        from public.business_services s
        join public.businesses b on b.id = s.business_id
       where offering_kind = 'service'
         and s.published
         and b.is_listable and b.profile_state = 'published'
         and lower(btrim(s.name)) = lower(btrim(offering_name))
      union all
      select p.business_id
        from public.business_products p
        join public.businesses b on b.id = p.business_id
       where offering_kind = 'product'
         and p.published
         and b.is_listable and b.profile_state = 'published'
         and lower(btrim(p.name)) = lower(btrim(offering_name))
    ) m
$$;

grant execute on function public.businesses_offering(text, text) to anon, authenticated;
