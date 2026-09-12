-- AI Command Center — OpenCode engine binding.
--
-- Phase 1.5: the workspace may be powered by an OpenCode SDK session instead of
-- the built-in router+llm engine. The session that powers that engine must be
-- traceable back to the NowOpen row that owns it (one opencode session per
-- ai_sessions row), and the UI needs to know which engine a session runs on so
-- it can pick the right transport.
--
-- Writes stay a ledger-only concern: this migration only ADDS columns to
-- ai_sessions. No tool becomes writable here; the LEVEL 2 PREPARE guarantee is
-- unchanged everywhere else.

alter table public.ai_sessions
  add column if not exists engine text not null default 'builtin'
    check (engine in ('builtin', 'opencode'));

alter table public.ai_sessions
  add column if not exists opencode_session_id text;

-- One opencode session per NowOpen row (and vice versa). Null rows (built-in
-- sessions) are excluded so one admin's opencode sessions can never collide.
create unique index if not exists ai_sessions_opencode_session
  on public.ai_sessions (opencode_session_id)
  where opencode_session_id is not null;

comment on column public.ai_sessions.engine is
  'Which engine powers the session: builtin (Phase 1 router + provider-agnostic llm) or opencode (a real OpenCode SDK session on the hosted server, one-to-one via opencode_session_id).';