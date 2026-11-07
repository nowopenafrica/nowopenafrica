-- When two sources disagree, somebody has to choose - and it must be recorded.
--
-- WHAT WAS MISSING, AND WHERE IT ACTUALLY LIVES
--
-- The obvious place to look for a conflict is `business_change_proposals`: a
-- proposal carries `current_value`, `proposed_value`, the source, its
-- confidence and the evidence behind it, so two proposals naming one field
-- with different values reads like a conflict.
--
-- IT CANNOT HAPPEN. `business_change_proposals_active_unique` is a partial
-- unique index on (business_id, field_name) WHERE status = 'pending'. At most
-- ONE proposal per field may be open at a time. A second source disagreeing
-- does not create a rival proposal; its INSERT is rejected by the index.
--
-- WHICH EXPOSES THE REAL DEFECT
--
-- `enrich-business/index.ts` writes that insert as a bare
-- `await db.from(...).insert({...})` - no `.select()`, no error inspected.
-- supabase-js RESOLVES with { error } rather than throwing, so the rejection
-- is discarded. The evidence row written a few lines earlier survives; the
-- proposal does not; nothing is logged and nobody is told. A second source's
-- disagreement disappears in silence. That is fixed alongside this migration.
--
-- SO A CONFLICT IS AN EVIDENCE FACT, NOT A PROPOSAL FACT
--
-- `business_evidence` is the durable record of "source X observed value Y for
-- field F", it has no such uniqueness rule, and it already holds 18,851 rows.
-- Two non-superseded evidence rows for one field with different values IS the
-- conflict, and it is the only representation this schema permits. The view
-- below reads that, which is why it needs no new table: a conflict is not a
-- new fact, it is a shape the existing facts are already in.
--
-- Measured on the live database when this was written: zero conflicted fields.
-- Only Wikidata has ever enriched, and one source cannot disagree with itself.
-- That empty state is honest rather than a fault - this is the machinery that
-- is needed the moment a second source is switched on, which is the whole
-- point of the enrichment network.
--
-- SOURCE AUTHORITY IS PER FIELD, AND THAT IS THE POINT
--
-- An official registry is the strongest voice on a legal name and a weak one
-- on opening hours. A business's own website is the reverse. A single global
-- ranking would get one of those wrong, so the table below is keyed on
-- (field_pattern, source_key) with a wildcard default.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. WHO OUTRANKS WHOM, PER FIELD
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.business_source_authority (
  id            uuid primary key default gen_random_uuid(),

  /*
   * The field this ranking applies to, or '*' for the default order.
   *
   * Matched most-specific-first, so a row for 'opening_hours' beats the
   * wildcard without anybody having to restate the whole ladder.
   */
  field_pattern text not null,

  /** `radar_sources.key`, or one of the pseudo-sources below. */
  source_key    text not null,

  /**
   * Lower wins. Deliberately sparse (10, 20, 30…) so a source can be slotted
   * between two others later without renumbering the table.
   */
  rank          integer not null,

  note          text,
  created_at    timestamptz not null default now(),

  constraint business_source_authority_unique unique (field_pattern, source_key)
);

comment on table public.business_source_authority is
  'Which source wins when two disagree, per field. Lower rank wins. field_pattern "*" is the default ladder; a field-specific row overrides it — an official registry outranks a website on legal name and loses to it on opening hours.';

alter table public.business_source_authority enable row level security;

drop policy if exists business_source_authority_staff_read on public.business_source_authority;
create policy business_source_authority_staff_read on public.business_source_authority
  for select to authenticated using (public.is_staff());

drop policy if exists business_source_authority_admin_write on public.business_source_authority;
create policy business_source_authority_admin_write on public.business_source_authority
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

/*
 * The default ladder, exactly as the product brief sets it out.
 *
 * `owner_confirmed` and `ai_inference` are pseudo-sources: they name a way a
 * value was arrived at rather than a row in radar_sources, and both need a
 * rank — the first because it must outrank everything, the second because it
 * must lose to everything.
 */
insert into public.business_source_authority (field_pattern, source_key, rank, note) values
  ('*', 'owner_confirmed',     10, 'The business said so itself. Nothing outranks this.'),
  ('*', 'official_website',    20, 'The business''s own site, read directly.'),
  ('*', 'business_submission', 25, 'Submitted through a NowOpen form by someone claiming to run it.'),
  ('*', 'opencorporates',      30, 'Corporate registry — strongest on legal identity.'),
  ('*', 'google',              40, 'Licensed provider.'),
  ('*', 'businesslist_ng',     50, 'Directory.'),
  ('*', 'openstreetmap',       60, 'Open data, community-maintained.'),
  ('*', 'wikidata',            65, 'Open structured reference data.'),
  ('*', 'admin_import',        70, 'An administrator''s file — only as good as the file.'),
  ('*', 'public_suggestion',   80, 'A passer-by told us.'),
  ('*', 'ai_inference',        99, 'A model''s guess. Loses to every sourced value.')
on conflict (field_pattern, source_key) do nothing;

/*
 * Field-specific overrides, where the default ladder would be wrong.
 *
 * A registry knows the legal name and knows nothing about when the shop opens.
 * A map knows where the door is and not what the company is called on paper.
 */
insert into public.business_source_authority (field_pattern, source_key, rank, note) values
  ('name',          'opencorporates',  15, 'Legal name: the registry is the authority, above even the website.'),
  ('opening_hours', 'official_website', 15, 'Hours: the business''s own site beats any aggregator.'),
  ('opening_hours', 'opencorporates',   90, 'A registry has no idea when the doors open.'),
  ('address',       'openstreetmap',    35, 'Where the door physically is: a map outranks a directory.'),
  ('phone',         'official_website', 15, 'A number published by the business itself.'),
  ('email',         'official_website', 15, 'An address published by the business itself.')
on conflict (field_pattern, source_key) do nothing;

/**
 * Rank a source for a field. Lower wins; an unranked source sorts last.
 */
create or replace function public.source_authority_rank(p_field text, p_source text)
returns integer
language sql
stable
set search_path to 'public'
as $fn$
  select coalesce(
    (select rank from public.business_source_authority
      where field_pattern = p_field and source_key = p_source),
    (select rank from public.business_source_authority
      where field_pattern = '*' and source_key = p_source),
    /*
     * A source nobody has ranked sorts BELOW everything ranked, rather than
     * above. An unranked source is one nobody has thought about, and the
     * rest of this system treats "nobody has decided" as the weak answer.
     */
    500
  );
$fn$;


-- ═════════════════════════════════════════════════════════════════════
-- 2. THE CONFLICTS THEMSELVES - a view over evidence, not a copy
-- ═════════════════════════════════════════════════════════════════════

/*
 * A field is in conflict when two or more live (non-superseded) evidence rows
 * name it with values that differ from one another.
 *
 * Note `distinct_values > 1` rather than `count(*) > 1`: two sources that
 * independently agree are corroboration, which is the opposite of a conflict
 * and should never reach a human.
 *
 * `current_value` comes from `to_jsonb(b) ->> field_name` because the field is
 * only known at runtime. It reads whatever column the evidence names and
 * yields NULL for a name that is not a column - which is the right answer.
 */
drop view if exists public.business_field_conflicts;

create view public.business_field_conflicts as
select
  e.business_id,
  e.field_name,
  b.name                                       as business_name,
  to_jsonb(b) ->> e.field_name                 as current_value,
  count(*)::int                                as evidence_count,
  count(distinct e.field_value)::int           as distinct_values,
  bool_or(b.claimed_at is not null)            as business_claimed,
  jsonb_agg(
    jsonb_build_object(
      'evidence_id',  e.id,
      'value',        e.field_value,
      'source',       e.source_id,
      'source_url',   e.source_url,
      'confidence',   e.confidence,
      'method',       e.extraction_method,
      'by_ai',        e.generated_by_ai,
      'authority',    public.source_authority_rank(e.field_name, e.source_id),
      'observed_at',  e.observed_at
    )
    order by public.source_authority_rank(e.field_name, e.source_id),
             e.observed_at desc,
             e.confidence desc
  )                                            as candidates,
  min(e.observed_at)                           as first_seen
from public.business_evidence e
join public.businesses b on b.id = e.business_id
where e.superseded_at is null
group by e.business_id, e.field_name, b.id, b.name
having count(distinct e.field_value) > 1;

comment on view public.business_field_conflicts is
  'Fields where two or more live evidence rows disagree. Candidates are ordered by source authority for that field, then freshness, then confidence - the first entry is the recommendation, never the decision.';

-- ═════════════════════════════════════════════════════════════════════
-- 3. RESOLUTION
-- ═════════════════════════════════════════════════════════════════════

/**
 * Resolve a conflict by choosing one evidence row.
 *
 * The choice is applied through `apply_business_change_proposal`, the SAME
 * path a staff approval already takes - so the claimed-profile guard, the
 * writable-field allowlist and the evidence re-check all apply unchanged. A
 * conflict resolution is not a second way to write a business.
 *
 * The applier refuses anything not already `approved`, so the proposal is
 * inserted approved: this IS the approval, made by an admin, recorded with the
 * rivals it beat. The losing evidence is superseded rather than deleted -
 * "Wikidata said +234 809 and we did not believe it" is exactly the history a
 * correction request needs, and `superseded_at` is how this schema already
 * says "no longer current" without losing the record.
 */
create or replace function public.resolve_field_conflict(
  p_evidence uuid,
  p_note     text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_ev       record;
  v_current  text;
  v_proposal uuid;
  v_applied  boolean := false;
  v_losers   int;
  v_same     boolean;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select * into v_ev from public.business_evidence where id = p_evidence;
  if not found then
    raise exception 'No such evidence row';
  end if;
  if v_ev.superseded_at is not null then
    raise exception 'That evidence was already superseded on %', v_ev.superseded_at;
  end if;

  select to_jsonb(b) ->> v_ev.field_name into v_current
    from public.businesses b where b.id = v_ev.business_id;

  v_same := v_current is not distinct from v_ev.field_value;

  /*
   * Supersede the rivals first. Only one open proposal per field is permitted,
   * so the losers must be out of the way before anything is written - and when
   * the chosen value already matches the row, this is the entire job.
   */
  update public.business_evidence
     set superseded_at = now()
   where business_id   = v_ev.business_id
     and field_name    = v_ev.field_name
     and superseded_at is null
     and id           <> p_evidence;

  get diagnostics v_losers = row_count;

  if not v_same then
    -- The partial unique index permits exactly one open proposal per field,
    -- and this decision replaces whatever was open.
    update public.business_change_proposals
       set status      = 'superseded',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           note        = coalesce(note || ' · ', '') || 'superseded by conflict resolution'
     where business_id = v_ev.business_id
       and field_name  = v_ev.field_name
       and status      = 'pending';

    insert into public.business_change_proposals
      (business_id, field_name, current_value, proposed_value, source_id,
       source_url, confidence, extraction_method, evidence_id, reason, status,
       reviewed_by, reviewed_at)
    values
      (v_ev.business_id, v_ev.field_name, v_current, v_ev.field_value,
       v_ev.source_id, v_ev.source_url, v_ev.confidence, v_ev.extraction_method,
       v_ev.id,
       'Chosen by an administrator over ' || v_losers || ' rival source(s).',
       'approved', auth.uid(), now())
    returning id into v_proposal;

    -- Re-checks the staff gate and the evidence for itself, then writes.
    v_applied := public.apply_business_change_proposal(v_proposal);

    if p_note is not null and btrim(p_note) <> '' then
      update public.business_change_proposals
         set note = coalesce(note || ' · ', '') || p_note
       where id = v_proposal;
    end if;
  end if;

  return jsonb_build_object(
    'applied',      v_applied,
    'proposal',     v_proposal,
    'field',        v_ev.field_name,
    'value',        v_ev.field_value,
    'source',       v_ev.source_id,
    'superseded',   v_losers,
    'already_held', v_same
  );
end;
$fn$;

comment on function public.resolve_field_conflict is
  'Choose one evidence row for a contested field: applies it through the normal staff path (so the claimed-profile guard and the field allowlist still hold) and supersedes the rival evidence rather than deleting it. A no-op write when the chosen value is already what the business holds.';

/**
 * Reject every rival for a contested field and keep what the business holds.
 *
 * The answer "none of these sources is right, leave the business alone" has to
 * be expressible, or an operator's only way to clear a bad conflict is to
 * accept one of its bad values.
 *
 * Evidence matching the CURRENT value is deliberately left live: it is the
 * provenance of the value being kept, and superseding it would leave the
 * business holding a value that nothing on file supports.
 */
create or replace function public.dismiss_field_conflict(
  p_business uuid,
  p_field    text,
  p_note     text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_current text;
  v_count   int;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select to_jsonb(b) ->> p_field into v_current
    from public.businesses b where b.id = p_business;

  update public.business_evidence
     set superseded_at = now()
   where business_id   = p_business
     and field_name    = p_field
     and superseded_at is null
     and field_value  is distinct from v_current;

  get diagnostics v_count = row_count;

  update public.business_change_proposals
     set status      = 'rejected',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         note        = coalesce(p_note, 'Conflict dismissed; existing value kept.')
   where business_id = p_business
     and field_name  = p_field
     and status      = 'pending';

  return v_count;
end;
$fn$;

comment on function public.dismiss_field_conflict is
  'Reject every rival for a contested field and keep the current value. The "none of these is right" answer, without having to accept one of them. Evidence supporting the kept value stays live.';

-- ═════════════════════════════════════════════════════════════════════
-- 4. GRANTS - the same discipline the apply path already uses
-- ═════════════════════════════════════════════════════════════════════

revoke all on function public.resolve_field_conflict(uuid, text) from public;
grant execute on function public.resolve_field_conflict(uuid, text) to authenticated;

revoke all on function public.dismiss_field_conflict(uuid, text, text) from public;
grant execute on function public.dismiss_field_conflict(uuid, text, text) to authenticated;

revoke all on function public.source_authority_rank(text, text) from public;
grant execute on function public.source_authority_rank(text, text) to authenticated;

-- The view reads evidence and businesses, both of which staff already read.
-- RLS on those tables still applies to every row it returns.
grant select on public.business_field_conflicts to authenticated;
