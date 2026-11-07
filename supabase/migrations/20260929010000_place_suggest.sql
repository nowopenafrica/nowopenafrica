-- Place suggestions for the "Where?" box.
--
-- ── WHY NOT JUST CALL search_suggest AND KEEP THE PLACES ─────────────────
--
-- search_suggest runs seven CTEs — businesses, services, products, places,
-- categories, adverts, media — and a location box would throw six of them away.
-- That is most of a 70ms query spent on rows nobody asked for, on every
-- keystroke.
--
-- ── WHY IT CARRIES A COUNT ───────────────────────────────────────────────
--
-- MEASURED 2026-09-17: 278 distinct places across 3,141 listable businesses,
-- and the distribution is steep — Lagos has hundreds, most places have one or
-- two. "Lekki · 5 businesses" tells somebody what they are about to get; a bare
-- "Lekki" invites them to filter a directory down to nothing and conclude the
-- platform is empty.
--
-- ── WHAT IT DELIBERATELY WILL NOT SUGGEST ────────────────────────────────
--
-- A place with no listings. The app ships a curated list of 87 African cities
-- for the cases this cannot answer, and the component shows those separately
-- and says they have nothing yet — rather than mixing them in, where they look
-- like results and lead to an empty page.
--
-- SECURITY INVOKER, like search_suggest: RLS applies as it does on the pages,
-- and `is_listable` / `profile_state` are still filtered explicitly so an admin
-- is not offered places a customer cannot reach.

drop function if exists public.place_suggest(text, integer);

create or replace function public.place_suggest(
  q text,
  max_rows integer default 6
)
returns table (
  label text,
  hits bigint,
  score real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with ok as (
    -- Two-character floor, same as search_suggest. One character matches most
    -- of the directory and answers nothing.
    select btrim(q) as term where length(btrim(coalesce(q, ''))) >= 2
  )
  select
    b.location as label,
    count(*)::bigint as hits,
    max(public.suggest_score(b.location, o.term)) as score
  from public.businesses b cross join ok o
  where b.is_listable
    and b.profile_state = 'published'
    and coalesce(btrim(b.location), '') <> ''
    and (b.location ilike '%' || o.term || '%' or b.location % o.term)
  group by b.location
  having max(public.suggest_score(b.location, o.term)) >= 20
  -- Count second: between two places matching equally well, the one with more
  -- listings is the more useful answer.
  order by max(public.suggest_score(b.location, o.term)) desc, count(*) desc, b.location asc
  limit greatest(1, max_rows)
$$;

comment on function public.place_suggest(text, integer) is
  'Places that actually have listings, with how many. SECURITY INVOKER — RLS applies.';

grant execute on function public.place_suggest(text, integer) to anon, authenticated;
