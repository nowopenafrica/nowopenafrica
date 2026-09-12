-- AI Command Center — the internal AI operating layer.
--
-- This is Phase 1 of the NowOpen AI layer: an authenticated, tool-enabled AI
-- workspace for staff inside the Admin Creator. It does not replace the OS
-- ledgers (`os_workforce`, `os_work_items`, `os_approvals`, `workforce_runs`),
-- which keep modelling team assignments, work items and sign-offs. It adds only
-- what genuinely does not exist anywhere else:
--
--   ai_sessions   — one workspace per conversational session, the unit the UI
--                   shows in its rail and the thing `session_id` everywhere
--                   else hangs off. No other table models a threaded admin/AI
--                   conversation.
--
--   ai_messages   — the stream itself: user prompts, assistant replies, and the
--                   discrete `tool` steps between them (so the UI can render a
--                   tool card per real execution, never fake progress).
--
--   ai_tool_calls — the ledger of every tool the AI ran: which tool, which
--                   args (with a stable hash for change detection), the risk
--                   class the policy engine assigned, whether it was read-only,
--                   its status, result and duration. This is the audit trail an
--                   approval engine needs to be answerable at all.
--
--   ai_approvals  — write-tool decisions. Kept separate from `os_approvals`
--                   deliberately: os_approvals routes through work items and
--                   has a different lifecycle (accept sends the item back for
--                   refinement). A risky AI write is a smaller, tighter event
--                   with its own evidence chain. Phase 1 registers writes as
--                   "prepared, not executed" (LEVEL 2 PREPARE) — the table is
--                   ready for Phase 2's execution.
--
--   ai_tasks      — the queue a multi-step run can fan out into, with honest
--                   statuses. `workforce_runs` records the cron worker's runs;
--                   this is the ad-hoc queue for what the person at the console
--                   asks for.
--
-- AUTONOMY. The default is LEVEL 2 (PREPARE): everything a run can do right
-- now is read-only, every result is evidence for a recommendation, and no tool
-- changes platform data. The `ai_tool_calls.read_only` + `risk` columns make
-- that provable per row, not just asserted in the UI.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. SESSIONS
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  summary jsonb not null default '{}'::jsonb,
  agent_ids text[] not null default '{}',
  autonomy_level int not null default 2,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_sessions is
  'AI Command Center. One conversational workspace per session. admin_id is the operator; autonomy_level is fixed at LEVEL 2 PREPARE for Phase 1 so no session can silently escalate what the AI may do.';

comment on column public.ai_sessions.autonomy_level is
  '0 OBSERVE / 1 RECOMMEND / 2 PREPARE. Phase 1 ships at 2: writes exist only as registered, unexecuted plans.';

-- The rail query — an admin's sessions, newest first. Also how a session is
-- tied to the person who opened it.
create index if not exists ai_sessions_admin
  on public.ai_sessions (admin_id, updated_at desc);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. MESSAGES
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'step', 'tool', 'system')),
  agent text,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.ai_messages is
  'The stream of one AI session: user prompts, assistant replies and the discrete tool steps between them. `tool` rows point at ai_tool_calls so the UI can render each execution honestly.';

create index if not exists ai_messages_session on public.ai_messages (session_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. TOOL CALLS — the evidence each AI action keeps
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.ai_sessions(id) on delete cascade,
  admin_id uuid references public.users(id) on delete set null,
  tool_name text not null,
  args jsonb not null default '{}'::jsonb,
  args_hash text not null,
  risk text not null check (risk in ('READ', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  read_only boolean not null default true,
  status text not null default 'planned'
    check (status in ('planned', 'approved', 'denied', 'executed', 'failed', 'cancelled')),
  approval_id uuid,
  result jsonb,
  error text,
  duration_ms int,
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

comment on table public.ai_tool_calls is
  'Ledger of every tool the AI ran or planned: tool, args, args hash (so an approval is tied to the exact payload it approved), risk class from the policy engine, read-only flag, and the status/lifecycle. This is what makes the approval engine auditable — every row is either planned, decided, executed or failed, never just "happened".';

comment on column public.ai_tool_calls.args_hash is
  'Stable SHA-256 over the JSON args. An approval checks the hash so approving payload A cannot authorise payload B with the same tool.';

create index if not exists ai_tool_calls_session on public.ai_tool_calls (session_id, created_at);
create index if not exists ai_tool_calls_admin on public.ai_tool_calls (admin_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. APPROVALS — the decision record
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.ai_approvals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.ai_sessions(id) on delete cascade,
  admin_id uuid not null references public.users(id) on delete cascade,
  tool_name text not null,
  args jsonb not null default '{}'::jsonb,
  args_hash text not null,
  risk text not null check (risk in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  reason jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  note text,
  tool_call_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.ai_approvals is
  'A write-tool decision. Every row records what was going to run, the exact args (hashed), the risk class, why the AI wanted it, and the human verdict. Phase 1 (LEVEL 2 PREPARE) leaves all rows pending/prepared — execution arrives with Phase 2 write tools.';

create index if not exists ai_approvals_pending on public.ai_approvals (status, created_at asc)
  where status = 'pending';
create index if not exists ai_approvals_session on public.ai_approvals (session_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. TASKS — the ad-hoc run queue
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.ai_sessions(id) on delete cascade,
  admin_id uuid not null references public.users(id) on delete cascade,
  agent text,
  task text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  priority int not null default 0,
  error text,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

comment on table public.ai_tasks is
  'The queue a multi-step AI run can fan out into, with honest statuses. Distinct from workforce_runs: that table records the cron worker, this one records what the person at the console asked the AI to do.';

create index if not exists ai_tasks_admin on public.ai_tasks (admin_id, created_at desc);
create index if not exists ai_tasks_open on public.ai_tasks (status, priority desc, created_at asc)
  where status in ('queued', 'running', 'waiting_approval');

-- ═══════════════════════════════════════════════════════════════════════
-- 6. RLS — staff only, everywhere
-- ═══════════════════════════════════════════════════════════════════════

alter table public.ai_sessions enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_tool_calls enable row level security;
alter table public.ai_approvals enable row level security;
alter table public.ai_tasks enable row level security;

-- Staff-only, mirroring the claimreach and os_* ledgers. `is_staff()` is
-- SECURITY DEFINER and reads the users table without being filtered by its own
-- RLS, so only a genuine admin/editor passes. Nobody can grant themselves
-- access by inserting — all five tables demand WITH CHECK (is_staff()).
drop policy if exists ai_sessions_staff on public.ai_sessions;
create policy ai_sessions_staff on public.ai_sessions
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists ai_messages_staff on public.ai_messages;
create policy ai_messages_staff on public.ai_messages
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists ai_tool_calls_staff on public.ai_tool_calls;
create policy ai_tool_calls_staff on public.ai_tool_calls
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists ai_approvals_staff on public.ai_approvals;
create policy ai_approvals_staff on public.ai_approvals
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists ai_tasks_staff on public.ai_tasks;
create policy ai_tasks_staff on public.ai_tasks
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ═══════════════════════════════════════════════════════════════════════
-- 7. SECURITY SENTINEL — the RLS scan the AI reports on
-- ═══════════════════════════════════════════════════════════════════════
--
-- The Security Sentinel agent cannot answer "is our RLS still protecting us?"
-- from PostgREST, because pg_catalog is not exposed as a table. This function
-- is the one honest answer: it scans pg_policies for every table we care about
-- and reports, per table, which of the two guard functions protects it.
--
-- SECURITY DEFINER so it sees the catalogue; the is_staff() check means only
-- staff can ask. This is a read of policy metadata, never of row data.

create or replace function public.ai_rls_snapshot()
returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select coalesce(jsonb_object_agg(t, obj), '{}'::jsonb)
  from (
    select
      c.relname as t,
      jsonb_build_object(
        'rl_enabled', c.relrowsecurity,
        'policies', jsonb_agg(p.polname order by p.polname),
        'is_staff_gate', bool_or(
          (pg_get_expr(p.polqual, p.polrelid) is not null
           and pg_get_expr(p.polqual, p.polrelid)::text ilike '%is_staff%')
          or (pg_get_expr(p.polwithcheck, p.polrelid) is not null
              and pg_get_expr(p.polwithcheck, p.polrelid)::text ilike '%is_staff%')
          or (pg_get_expr(p.polqual, p.polrelid) is not null
              and pg_get_expr(p.polqual, p.polrelid)::text ilike '%is_admin%')
          or (pg_get_expr(p.polwithcheck, p.polrelid) is not null
              and pg_get_expr(p.polwithcheck, p.polrelid)::text ilike '%is_admin%')
        )
      ) as obj
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'ai_sessions', 'ai_messages', 'ai_tool_calls', 'ai_approvals', 'ai_tasks',
        'businesses', 'business_claims', 'analytics_events', 'audit_log',
        'claimreach_outreach', 'claimreach_suppressions', 'os_approvals',
        'workforce_runs', 'users'
      )
    group by c.relname, c.relrowsecurity
  ) s
  where public.is_staff()
$fn$;

comment on function public.ai_rls_snapshot is
  'AI Command Center Security Sentinel. Returns, per critical table, whether RLS is enabled and whether the policy text references is_staff()/is_admin(). Metadata only; staff-only.';

grant execute on function public.ai_rls_snapshot() to authenticated;