/*
  # Remember which Instagram handles we have already looked up

  A batch that meets a personal account reported "skipped — @x is not a public
  Instagram Business or Creator account" on screen, and wrote nothing. Close
  the page and the finding was gone: the next run of the same list spent
  another API call to learn the same thing, and nobody could answer "which of
  the handles we were sent are not reachable?"

  This table is that answer. One row per handle, updated in place.

  ── WHAT THIS IS NOT ──────────────────────────────────────────────────────

  It is NOT a store of anything about a personal account. The only facts here
  are the handle an operator already supplied and the outcome Meta returned.
  No profile, no media, no followers, nothing read from an account we are not
  permitted to read. The point is the opposite of scraping: having been told
  once that an account cannot be read through the official API, we record it
  so we stop asking.

  ── WHY IT IS NOT A PERMANENT VERDICT ─────────────────────────────────────

  A personal account can be converted to a Business or Creator account at any
  time, and plenty of the small businesses this directory is for will do
  exactly that. So `last_checked_at` exists to let a later run re-check and
  UPDATE the row, rather than treating "not reachable in October" as settled
  forever. `check_count` records how often we have asked, so a handle that is
  never going to convert can be recognised rather than re-tried indefinitely.
*/

create table if not exists public.instagram_handle_checks (
  /* Lowercase, no leading @ — the normalised form readHandle() produces. */
  handle            text primary key,

  /*
    What happened last time.

    'not_business'  Meta says this is not a public Business/Creator account.
    'no_name'       Reachable, but carried no business name to file.
    'rate_limited'  We were throttled; this says nothing about the account.
    'error'         The lookup itself failed.
    'extracted'     Read successfully and filed as a candidate.
  */
  outcome           text not null,

  /* The operator-facing sentence, kept verbatim so the UI need not re-derive it. */
  reason            text,

  first_checked_at  timestamptz not null default now(),
  last_checked_at   timestamptz not null default now(),
  check_count       integer     not null default 1,

  /*
    Provenance, the same pair every batch already records against a filed
    listing: where the list came from, and which file carried it.
  */
  list_source       text,
  source_file       text,

  constraint instagram_handle_checks_outcome_valid
    check (outcome in ('not_business', 'no_name', 'rate_limited', 'error', 'extracted')),
  /* Normalised on the way in, so a handle cannot be stored twice in two cases. */
  constraint instagram_handle_checks_handle_normalised
    check (handle = lower(handle) and handle not like '@%' and length(handle) between 1 and 30)
);

comment on table public.instagram_handle_checks is
  'One row per Instagram handle we have attempted, updated in place. Records only the handle supplied and the outcome returned — never anything read from an account we may not read.';
comment on column public.instagram_handle_checks.last_checked_at is
  'When we last asked. A personal account can convert to a Business account, so this is a re-check timer, not a permanent verdict.';

/* The question the batch asks on every run: have we seen this handle lately? */
create index if not exists instagram_handle_checks_recheck_idx
  on public.instagram_handle_checks (outcome, last_checked_at desc);

alter table public.instagram_handle_checks enable row level security;

/*
 * Staff only, read and write. Nothing here is public: a list of handles that
 * were offered to NowOpen is operational data, not directory content.
 */
drop policy if exists "Staff read instagram handle checks" on public.instagram_handle_checks;
create policy "Staff read instagram handle checks"
  on public.instagram_handle_checks for select
  using (is_staff());

drop policy if exists "Staff add instagram handle checks" on public.instagram_handle_checks;
create policy "Staff add instagram handle checks"
  on public.instagram_handle_checks for insert
  with check (is_staff());

drop policy if exists "Staff update instagram handle checks" on public.instagram_handle_checks;
create policy "Staff update instagram handle checks"
  on public.instagram_handle_checks for update
  using (is_staff()) with check (is_staff());
