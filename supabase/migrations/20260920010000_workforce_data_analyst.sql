-- Staffing the one unscheduled role that has real data to work with — and
-- telling the truth about the five that do not.
--
-- WHAT WAS MEASURED (2026-09-14)
--
-- 24 agents sit in `os_workforce`, all with an `agent_key`. Only 18 had a
-- `workforce_schedule` row. Of those 18, fourteen had been failing every run
-- for days with `No rules are defined for "<key>"` — not because the rules were
-- missing from the repository, but because `_shared/agents.ts` is bundled into
-- the edge function at DEPLOY time and `run-workforce` had not been redeployed
-- since those fourteen were written. Redeploying fixed all fourteen; they now
-- report real counts.
--
-- That left six with no schedule at all: community-manager, data-analyst,
-- email-marketing-manager, motion-designer, partnerships-manager and
-- product-designer. All six read `status = 'active'` in the directory while
-- doing nothing whatsoever, which is precisely the "roster entry looks staffed
-- forever" failure the runner's own comment warns about.
--
-- WHY ONLY ONE OF THE SIX IS BEING STAFFED
--
-- An agent reports counted facts. Five of the six have almost nothing to count:
--
--   stream_followers  0     onboarding_deliveries  0
--   stream_chat       0     os_partners            4
--   business_reviews  1     product design         (no data source at all)
--
-- Writing rules for those would mean inventing work to look busy, and a
-- fabricated finding is worse than an empty queue because somebody acts on it.
-- They are marked `off-schedule` instead — an existing, honest value in the
-- status vocabulary meaning "in the roster, not automated yet".
--
-- `data-analyst` is different: `analytics_events` holds 43,698 rows, and the
-- known problem with that table is QUALITY, not volume. An agent that watches
-- the junk rate is genuinely useful, and it is the one role here whose job is
-- exactly that watching.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. THE FACTS THE DATA ANALYST COUNTS
-- ═══════════════════════════════════════════════════════════════════════

/*
 * The existing function is RENAMED rather than rewritten, and the new one
 * delegates to it.
 *
 * It is 14KB of per-agent CASE branches, each verified against live counts.
 * Reproducing all of that to append one branch would put every other agent's
 * facts at risk for the sake of a sixth role. The rename is done once and
 * guarded, so re-running this migration is safe.
 */
do $rename$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'workforce_facts_for')
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = '_workforce_facts_base') then
    alter function public.workforce_facts_for(text) rename to _workforce_facts_base;
  end if;
end
$rename$;

create or replace function public.workforce_facts_for(p_agent_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_base jsonb;
begin
  -- Delegate everything already defined.
  v_base := public._workforce_facts_base(p_agent_key);
  if v_base is not null and v_base <> '{}'::jsonb then
    return v_base;
  end if;

  if p_agent_key = 'data-analyst' then
    return (select jsonb_build_object(
      'events_total',      (select count(*) from public.analytics_events),
      'events_7d',         (select count(*) from public.analytics_events
                             where created_at > now() - interval '7 days'),
      'events_24h',        (select count(*) from public.analytics_events
                             where created_at > now() - interval '24 hours'),
      /*
       * "Junk" means an event with no business attached AND no session — a row
       * that cannot be attributed to anything and therefore cannot answer a
       * question. This is the measure that matters: the table's problem has
       * always been that most of it says nothing, not that it is small.
       */
      'unattributed_7d',   (select count(*) from public.analytics_events
                             where created_at > now() - interval '7 days'
                               and business_id is null
                               and coalesce(nullif(btrim(coalesce(session_id,'')),''), null) is null),
      'distinct_events_7d',(select count(distinct name) from public.analytics_events
                             where created_at > now() - interval '7 days'),
      'business_events_7d',(select count(*) from public.analytics_events
                             where created_at > now() - interval '7 days'
                               and business_id is not null)
    ));
  end if;

  return '{}'::jsonb;
end;
$fn$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. PUT THE DATA ANALYST ON THE CLOCK
-- ═══════════════════════════════════════════════════════════════════════

/*
 * Daily. Analytics quality is a trend, not an incident — checking it hourly
 * would produce 24 identical findings a day and teach whoever reads the digest
 * to skip it.
 */
insert into public.workforce_schedule (agent_key, enabled, interval_min, notes)
values ('data-analyst', true, 1440, 'Watches analytics volume and the share of events that cannot be attributed to anything.')
on conflict (agent_key) do update
  set enabled = excluded.enabled,
      interval_min = excluded.interval_min,
      notes = excluded.notes;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. TELL THE TRUTH ABOUT THE REST
-- ═══════════════════════════════════════════════════════════════════════

/*
 * `off-schedule` already exists in the status vocabulary (src/lib/workforce.ts)
 * and renders as "Off schedule". It is the accurate word: these roles are
 * defined and staffable, and nothing automated is running for them.
 *
 * Deliberately NOT 'error' — nothing is broken — and deliberately not left at
 * 'active', which is the same word the working agents use and would make the
 * directory unreadable as a measure of what is actually running.
 */
update public.os_workforce
   set status = 'off-schedule',
       updated_at = now()
 where agent_key in (
   'community-manager',
   'email-marketing-manager',
   'motion-designer',
   'partnerships-manager',
   'product-designer'
 )
   and status <> 'off-schedule';

-- The data analyst is now automated like the rest.
update public.os_workforce
   set status = 'active', updated_at = now()
 where agent_key = 'data-analyst' and status <> 'active';
