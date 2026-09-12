-- NOWOPEN AFRICA - ENRICHMENT-ERA MIGRATIONS, IN ONE PASTE
--
-- Verbatim concatenation of the nine migrations that make up the Business
-- Intelligence & Profile Enrichment stack, in version order, wrapped in a
-- single transaction. Paste the whole file into the Supabase SQL editor and
-- run it once. If any statement fails, nothing is applied.
--
-- Included:
--   20260911000000_business_intelligence_columns.sql   businesses columns + honest 24/7 default
--   20260911010000_business_evidence_assertions.sql    evidence metadata (generated_by_ai, ai_model, superseded_at)
--   20260911020000_business_media_assets.sql           business_media_assets table
--   20260911030000_business_enrichment_jobs.sql        business_enrichment_jobs table
--   20260911040000_business_change_proposals.sql       business_change_proposals table
--   20260911050000_business_sync_preferences.sql       owner sync preferences + per-insert trigger
--   20260912000000_enrichment_scheduler.sql            db cron: tick_enrichment() every 15 minutes
--   20260912010000_enrichment_ops.sql                  admin_requeue/retry helpers
--   20260912020000_enrichment_auto_apply.sql           write core + staff gate + owner auto-apply
--
-- Not included (deliberately): the discovery-source authorisations that touch
-- radar_sources - they belong to the separate radar subsystem and are not read
-- by the enrichment engine (sources arrive on the job payload).
--
-- Warnings:
--   * 20260912020000 REPLACES public.apply_business_change_proposal() with a
--     staff-gated version delegating to _apply_proposal_write(). If a previous
--     version of that function is live, it is replaced by design, and the old
--     per-proposal argument rules give way to the single write core.
--   * 20260912000000 uses pg_cron (cron.schedule). If pg_cron is unavailable
--     in this project the whole transaction rolls back and nothing is applied.
--     The enrich-business edge function runs without DB cron; queueing then
--     needs a manual tick from the admin ops panel.
--   * The only row-writes here are (a) the 24/7 default-state naming for
--     businesses with no hours at all (it records the state the app already
--     showed, with is_24_hours_confirmed = false) and (b) the preferences
--     backfill below, which gives EXISTING businesses the same defaults the
--     migration's trigger grants new businesses. Nothing fabricated: no jobs,
--     no proposals, no media assets, no evidence rows are inserted.
--
-- After running: npm run check:drift  (reports missing tables/columns; changes nothing)
--
begin;

-- ===================================================================
-- 20260911000000_business_intelligence_columns.sql
-- ===================================================================
/*
  # Business Intelligence — profile state, removal lifecycle, availability

  First migration of the NowOpen Business Intelligence & Profile Enrichment
  Engine. Everything here is ADDITIVE: existing rows keep their meaning, and
  nothing is backfilled with invented data.

  Three concerns land together because they are three columns on the same row,
  but they are deliberately SEPARATE axes:

    1. `profile_state`  — the shape of the record (draft → published).
    2. `removal_status` — is this business still on the directory?
    3. availability    — what we know about the business's hours.

  ## Why removal is its own column, not a claim_status value

  A business can be claimed and removed at the same time, and mixing "who owns
  this" with "is this still open" is exactly the confusion §2 warns about.
  Claim life and directory life are different questions; `claim_status`
  already answers the first, so `removal_status` answers the second. Existing
  deletion_requests lead to a hard DELETE with an audit log; this adds a
  soft-tombstone alternative that preserves the row for provenance while
  `is_listable` (a generated column) drops to false — mirroring how reviews
  are hidden by moderation rather than destroyed.

  ## Availability vocabulary

  `availability_mode` names HOW the shown hours were produced:
    - `derived`      — the business's own opening_hours (public content)
    - `confirmed`    — an owner or verified source confirmed the availability
    - `default_24_7` — NowOpen's SAFE DEFAULT: unclaimed AND no hours recorded,
                       so we do not guess hours from the category. Never
                       written into `opening_hours`; the UI renders it as
                       "24/7 default · hours unconfirmed".
    - `not_set`      — nothing we can show

  `availability_confirmation` is the §2 confidence triple:
    - `confirmed` — an owner or admin verified it
    - `timed`     — derived from concrete time ranges in opening_hours
    - `unknown`   — neither

  `is_24_hours` + `is_24_hours_confirmed` are the "24/7 confirmed vs default"
  distinction: a default_24_7 row is `is_24_hours = true` but
  `is_24_hours_confirmed = false`, so a public page can say "assumed open
  24/7, please confirm" instead of asserting it. `hours_source`,
  `hours_source_url`, `hours_last_verified` record where the hours came from
  and how fresh they are.

  ## data_confidence — EXTEND, never rename

  The vocabulary is extended with the values the enrichment spec names
  (unknown/low/partial) so the engine can express "we have not even tried"
  without abusing `unconfirmed`. Existing rows and the other values are
  untouched.

  Re-runnable throughout.
*/

-- 1. Profile state ---------------------------------------------------------

-- Default 'published' deliberately: every existing row and every shell created
-- by radar_publish_candidate is already public. A draft-first path is built by
-- the import flow when it wants to gate publication, not by a default that
-- would silently hide live listings.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS profile_state text NOT NULL DEFAULT 'published';

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_profile_state_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_profile_state_check
  CHECK (profile_state IN ('draft','ready_for_review','published','paused','archived'));

-- 2. Removal lifecycle (soft tombstone) ------------------------------------

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS removal_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS removal_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS removal_requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removal_reason text,
  ADD COLUMN IF NOT EXISTS removal_resolved_at timestamptz;

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_removal_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_removal_status_check
  CHECK (removal_status IN ('none','removal_requested','removal_approved','removed'));

COMMENT ON COLUMN public.businesses.removal_status IS
  'Soft tombstone: removal_requested → removal_approved → removed. Removed rows keep their provenance and stay hidden (is_listable drops to false) instead of being destroyed.';

-- 3. Availability / hours metadata ------------------------------------------

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS availability_mode text NOT NULL DEFAULT 'derived',
  ADD COLUMN IF NOT EXISTS is_24_hours boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_24_hours_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS availability_confirmation text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS hours_source text,
  ADD COLUMN IF NOT EXISTS hours_source_url text,
  ADD COLUMN IF NOT EXISTS hours_last_verified timestamptz;

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_availability_mode_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_availability_mode_check
  CHECK (availability_mode IN ('derived','confirmed','default_24_7','not_set'));

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_availability_confirmation_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_availability_confirmation_check
  CHECK (availability_confirmation IN ('confirmed','timed','unknown'));

COMMENT ON COLUMN public.businesses.availability_mode IS
  'How the shown hours were produced: derived (from opening_hours), confirmed (owner/verified source), default_24_7 (NowOpen safe default for unclaimed rows with no hours — never written into opening_hours), not_set.';
COMMENT ON COLUMN public.businesses.is_24_hours IS
  'The business trades all day, every day — either from its own hours or from NowOpen''s default. Read with is_24_hours_confirmed: a confirmed=false row must be shown as an assumption, never asserted.';
COMMENT ON COLUMN public.businesses.availability_confirmation IS
  'confidence triple for availability: confirmed (owner/admin verified), timed (derived from concrete time ranges), unknown (no evidence).';
COMMENT ON COLUMN public.businesses.hours_source IS
  'Where the hours came from: nowopen_default, owner, admin, or a radar source key (e.g. openstreetmap). NULL when never written.';

ALTER TABLE public.business_locations
  ADD COLUMN IF NOT EXISTS availability_mode text NOT NULL DEFAULT 'derived',
  ADD COLUMN IF NOT EXISTS is_24_hours boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_24_hours_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS availability_confirmation text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS hours_source text,
  ADD COLUMN IF NOT EXISTS hours_source_url text,
  ADD COLUMN IF NOT EXISTS hours_last_verified timestamptz;

ALTER TABLE public.business_locations DROP CONSTRAINT IF EXISTS business_locations_availability_mode_check;
ALTER TABLE public.business_locations ADD CONSTRAINT business_locations_availability_mode_check
  CHECK (availability_mode IN ('derived','confirmed','default_24_7','not_set'));

ALTER TABLE public.business_locations DROP CONSTRAINT IF EXISTS business_locations_availability_confirmation_check;
ALTER TABLE public.business_locations ADD CONSTRAINT business_locations_availability_confirmation_check
  CHECK (availability_confirmation IN ('confirmed','timed','unknown'));

-- 4. data_confidence — extended vocabulary, nothing reclassified ------------

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_data_confidence_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_data_confidence_check
  CHECK (data_confidence IN (
    'unknown',
    'low',
    'partial',
    'unconfirmed',
    'source_confirmed',
    'partially_confirmed',
    'owner_confirmed',
    'admin_verified'
  ));

-- 5. verification_status — partial verification ------------------------------

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_verification_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_verification_status_check
  CHECK (verification_status IN ('unverified','pending','partially_verified','verified','expired','rejected'));

-- 6. The safe 24/7 default trigger -------------------------------------------

/*
  Unclaimed rows with no hours get NowOpen's default availability: mode
  default_24_7, is_24_hours true, is_24_hours_confirmed FALSE. The UI must
  render this as "24/7 default · hours unconfirmed" — this trigger only
  records that the default applies; it never writes a literal "Open 24/7"
  into opening_hours, so an unconfirmed default can never be mistaken for a
  confirmed fact by anything that only reads opening_hours.

  When real hours appear the mode flips back to `derived`; confirmations that
  an owner or source has already recorded are left untouched, so a subsequent
  import cannot silently downgrade a confirmed fact.
*/
CREATE OR REPLACE FUNCTION public.nowopen_default_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_has_hours boolean;
BEGIN
  v_has_hours := nullif(btrim(coalesce(NEW.opening_hours, NEW.hours, '')), '') IS NOT NULL;

  IF NOT v_has_hours AND NEW.claim_status = 'unclaimed' THEN
    NEW.availability_mode := 'default_24_7';
    NEW.is_24_hours := true;
    NEW.is_24_hours_confirmed := false;
    NEW.availability_confirmation := 'unknown';
    NEW.hours_source := 'nowopen_default';
  ELSIF NEW.availability_mode = 'default_24_7' THEN
    -- Hours now exist; the default no longer applies. Never overwrite a
    -- confirmation the owner or a verified source already set.
    NEW.availability_mode := 'derived';
    IF NEW.is_24_hours_confirmed IS FALSE AND NEW.is_24_hours IS TRUE AND v_has_hours THEN
      NEW.is_24_hours := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nowopen_default_availability ON public.businesses;
CREATE TRIGGER trg_nowopen_default_availability
  BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.nowopen_default_availability();

DROP TRIGGER IF EXISTS trg_nowopen_default_availability ON public.business_locations;
CREATE TRIGGER trg_nowopen_default_availability
  BEFORE INSERT OR UPDATE ON public.business_locations
  FOR EACH ROW EXECUTE FUNCTION public.nowopen_default_availability();

-- 7. Existing rows: record the default where it legitimately applies ---------
-- An unclaimed row with no hours and no evidence of hours is exactly what
-- "default 24/7, unconfirmed" means. Rows that already carry hours keep the
-- `derived` default. Nothing is invented: this only names the state that
-- already existed.

UPDATE public.businesses SET
  availability_mode = 'default_24_7',
  is_24_hours = true,
  is_24_hours_confirmed = false,
  availability_confirmation = 'unknown',
  hours_source = 'nowopen_default'
WHERE claim_status = 'unclaimed'
  AND nullif(btrim(coalesce(opening_hours, hours, '')), '') IS NULL;

-- 8. Intact listing count ---------------------------------------------------
-- The backfill above must not change what is public. Run and compare:
-- select count(*) from businesses where is_listable;  -- unchanged
-- select availability_mode, count(*) from businesses group by 1;
-- select claim_status, verification_status, data_confidence, count(*)
--   from businesses group by 1, 2, 3;

-- ===================================================================
-- 20260911010000_business_evidence_assertions.sql
-- ===================================================================
/*
  # Business Intelligence — evidence assertions metadata

  Extends the field-level provenance table (20260908140000) with the three
  things the enrichment engine needs to prove — not assume — what it wrote:

    generated_by_ai  the row was produced by a model (never by a source or a
                     person). This is what lets the public UI and the admin
                     review queue treat ai-produced evidence differently, the
                     same way `extraction_method = 'ai_inferred'` already is.
    ai_model         which model produced it. Recorded at the moment of
                     generation only — it is unrecoverable afterwards.
    superseded_at    when a newer, better observation replaced this one. Rows
                     stay (they are a history of what sources said) but the
                     engine stops confusing "latest recorded" with "best".

  Purely additive: one ALTER, three nullable columns, no backfill. A null
  generated_by_ai means "not produced by an AI", not "AI and secret".

  Re-runnable.
*/

ALTER TABLE public.business_evidence
  ADD COLUMN IF NOT EXISTS generated_by_ai boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

COMMENT ON COLUMN public.business_evidence.generated_by_ai IS
  'True when a model produced this evidence row rather than a source or a person. Never set retroactively — it only means anything while recorded at write time.';
COMMENT ON COLUMN public.business_evidence.ai_model IS
  'The model identifier used to generate this evidence row (formatting follows _shared/llm.ts). NULL for non-AI rows.';
COMMENT ON COLUMN public.business_evidence.superseded_at IS
  'When this observation was replaced by a better one. The row is kept for the audit trail but is no longer "current evidence".';

-- ===================================================================
-- 20260911020000_business_media_assets.sql
-- ===================================================================
/*
  # Business Intelligence — media asset registry

  The single home for every image/video/document we know about for a business:
  the business's own cover/logo/gallery, and everything a discovery source
  proposed. §16 requires knowing, per asset:

    - where we found it and WHAT it matched on (match_confidence + signal)
    - whether we may use it (rights_decision + jurisdiction + licence)
    - how critical it is to the page and how it is moderated
    - whether a takedown has been requested and honoured
    - licence metadata for re-use:
        object_type / source_url / source_uri (the asset's own rights-bearing
        URL, distinct from where we discovered it), attribution, price,
        iconography/motifs, keywords, and the structured metadata that let a
        reviewer confirm the match without fetching the page again.

  The `status` column is the §16 lifecycle:
    discovered (a source proposed it, nothing checked yet)
      → match_confirmed (automatic matching confidence exceeded a floor)
      → approved (a person reviewed it) → published (it renders on the page)
    rejected / removed at any point. `removed` is a takedown honour, always
    final and always retaining the row.

  SAFETY: by default we store the asset's URL and metadata and DO NOT re-host
  it (`keep_url_only = true`). Re-hosting is an explicit, licensed decision
  made by a person via a later migration/flow — never something a crawler does
  silently.

  Re-runnable throughout.
*/

CREATE TABLE IF NOT EXISTS public.business_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- What the asset is.
  asset_type text NOT NULL,  -- logo | cover | gallery | video | document
  caption text,
  description text,
  keywords text[] NOT NULL DEFAULT '{}',
  iconography text,          -- motifs/depicted objects, free text for human review

  -- Where we found it, and what matched.
  source_id   text REFERENCES public.radar_sources(key) ON DELETE SET NULL,
  source_url  text,          -- the page/post that referenced the asset
  source_uri  text,          -- the asset's own URL as the source presented it
  match_confidence integer NOT NULL DEFAULT 0,
  matching_signal jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { fields: [...], exact: bool }

  -- Rights & re-use.
  rights_decision text,      -- licensed | permission_obtained | conservative_default | no_rights | unchecked
  licence         text,      -- licence/terms of the asset itself, e.g. "CC BY 4.0" or the source licence
  rights_owner    text,      -- attribution, when the licence requires one
  jurisdiction    text,      -- which country's law governs (defaults to the asset's country)
  price           text,      -- licence fee when paid, else NULL (free/CC)

  -- Moderation & rendering control.
  criticality text NOT NULL DEFAULT 'non_critical',  -- critical | non_critical | mandatory
  moderation_status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  moderation_reason text,
  keep_url_only boolean NOT NULL DEFAULT true,       -- store URL only, do not re-host
  hosted_url text,                                   -- storage path when re-hosted intentionally

  -- Lifecycle.
  status text NOT NULL DEFAULT 'discovered',         -- discovered | match_confirmed | approved | published | rejected | removed
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  conflicts_with uuid REFERENCES public.business_media_assets(id) ON DELETE SET NULL,
  conflict_note text,

  -- Takedown management (honoured, never destroyed).
  takedown_requested_at timestamptz,
  takedown_requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  takedown_reason text,

  -- Audit.
  discovered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Same source+asset proposed twice must not pile up.
CREATE UNIQUE INDEX IF NOT EXISTS business_media_assets_unique_source
  ON public.business_media_assets (business_id, asset_type, source_id, source_uri)
  WHERE source_uri IS NOT NULL AND status <> 'removed';

CREATE INDEX IF NOT EXISTS business_media_assets_lookup
  ON public.business_media_assets (business_id, asset_type, status);
CREATE INDEX IF NOT EXISTS business_media_assets_review_queue
  ON public.business_media_assets (status, moderation_status, match_confidence DESC, created_at);

ALTER TABLE public.business_media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_media_assets_public_read ON public.business_media_assets;
DROP POLICY IF EXISTS business_media_assets_staff_write ON public.business_media_assets;

-- Public READ only for published assets of listable businesses. Discovery
-- proposals stay internal until a person approves them (§16's manual review
-- for low-confidence images).
CREATE POLICY business_media_assets_public_read ON public.business_media_assets
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    AND exists (
      select 1 from public.businesses b
       where b.id = business_media_assets.business_id and b.is_listable
    )
  );

-- Only staff move an asset through discovery → approved → published → removed.
CREATE POLICY business_media_assets_staff_write ON public.business_media_assets
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

COMMENT ON TABLE public.business_media_assets IS
  'Asset registry for Business Intelligence. status is the §16 lifecycle; removed means a takedown honour and always keeps the row. keep_url_only=true is the default — re-hosting is a licensed decision a person makes.';
COMMENT ON COLUMN public.business_media_assets.source_uri IS
  'The asset''s own URL as the source presented it — the rights-bearing location, distinct from source_url (where we found it referenced).';

-- ===================================================================
-- 20260911030000_business_enrichment_jobs.sql
-- ===================================================================
/*
  # Business Intelligence — enrichment job queue

  The queue that drives continuous enrichment over EXISTING businesses (not
  candidates — radar already owns discovery of new ones). One row per
  (business, job_type) run; the executor edge function claims due rows, runs
  the Phase-3 resolvers, records evidence/proposals, and moves on.

  WHY THIS NEEDS TO EXIST ALONGSIDE `radar_candidates`

  Radar answers "is there a business here we don't have?". Enrichment answers
  "the business this row describes — what can we now find out about it?".
  Mixing the two would give a candidate row a business_id, which it has on
  purpose (published_business_id) but which means "this candidate became this
  row", not "this row needs facts".

  DRY-RUN and COST CONTROL

  The executor never runs (and operators never pay for) a job the operator has
  not budgeted for. `run_cost_budget` bounds the cost of one run; the executor
  aborts and records a `failed` row with a `reason` when it would exceed the
  bound. `dry_run` makes the executor return what it WOULD write without
  writing — the admin review surface's default mode, matches infancy.

  SAFETY: the executor may only WRITE evidence, proposals and its own job row.
  It cannot change a business directly: changes made real by the engine go
  through 20260911040000's change proposals (approved by a person or by an
  owner's sync preference). This is the same boundary the workforce draws
  between "measure and report" and "act".

  Re-runnable throughout.
*/

CREATE TABLE IF NOT EXISTS public.business_enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_key   text NOT NULL DEFAULT 'enrichment',

  /*
   * What kind of enrichment. Free text, matching the resolvers the executor
   * knows about; kept as text because the set grows with the engine and an
   * enum would need a migration every addition.
   */
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',  -- queued | running | succeeded | failed | cancelled
  priority integer NOT NULL DEFAULT 50,   -- lower runs first
  attempts integer NOT NULL DEFAULT 0,

  payload jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { source_keys?, fields?, dry_run? } — executor input
  result  jsonb,                                -- what the run produced (evidence counts, proposals)
  error   text,                                 -- failure message for the admin surface
  reason  text,                                 -- human reason for queuing this job

  run_cost_budget numeric DEFAULT NULL,         -- upper bound on what this run may cost, else unlimited
  queue_reason  text,                           -- why it was queued (stale-hours, never-enriched, claim…)
  run_at        timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz,

  queued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT business_enrichment_jobs_status_check CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  CONSTRAINT business_enrichment_jobs_priority_check CHECK (priority BETWEEN 0 AND 100)
);

-- One active (queued/running) job per business+type, so a schedule tick cannot
-- stack duplicate work.
CREATE UNIQUE INDEX IF NOT EXISTS business_enrichment_jobs_active_unique
  ON public.business_enrichment_jobs (business_id, job_type)
  WHERE status IN ('queued','running');

CREATE INDEX IF NOT EXISTS business_enrichment_jobs_due
  ON public.business_enrichment_jobs (status, run_at, priority);
CREATE INDEX IF NOT EXISTS business_enrichment_jobs_business
  ON public.business_enrichment_jobs (business_id, created_at DESC);

ALTER TABLE public.business_enrichment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_enrichment_jobs_staff_read ON public.business_enrichment_jobs;
DROP POLICY IF EXISTS business_enrichment_jobs_staff_manage ON public.business_enrichment_jobs;

-- The queue is internal work-in-progress: staff-only on both axes. The
-- executor runs with the service role (service key), which bypasses RLS.
CREATE POLICY business_enrichment_jobs_staff_read ON public.business_enrichment_jobs
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY business_enrichment_jobs_staff_manage ON public.business_enrichment_jobs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.business_enrichment_jobs IS
  'Continuous-enrichment queue over existing businesses. The executor writes only evidence, proposals and its own job row — never a business directly (20260911040000 proposals carry business changes).';

-- Claim the next due job atomically, service-role only.
CREATE OR REPLACE FUNCTION public.claim_next_enrichment_job()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.business_enrichment_jobs
     SET status = 'running',
         started_at = now(),
         attempts = attempts + 1
   WHERE id = (
         SELECT id FROM public.business_enrichment_jobs
          WHERE status = 'queued' AND run_at <= now()
          ORDER BY priority, run_at
          LIMIT 1
         FOR UPDATE SKIP LOCKED)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_next_enrichment_job() FROM public;

CREATE OR REPLACE FUNCTION public.finish_enrichment_job(
  p_job uuid, p_status text, p_result jsonb, p_error text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.business_enrichment_jobs
     SET status = p_status,
         result = coalesce(p_result, result),
         error = p_error,
         finished_at = now(),
         updated_at = now()
   WHERE id = p_job;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_enrichment_job(uuid, text, jsonb, text) FROM public;

-- ===================================================================
-- 20260911040000_business_change_proposals.sql
-- ===================================================================
/*
  # Business Intelligence — change proposals

  The ONLY route by which the enrichment engine (or a source, or a reviewer)
  changes a real business listing. A proposal is "here is what source X says,
  with evidence — adopt it?":

    - Evidence travels with the proposal (field_name + confidence + the
      business_evidence row it rests on), so approval is a mapped decision,
      never a blind write.
    - Anything the engine does NOT know to be true cannot become real: there
      is no auto-publish path in the database itself. Autonomy is a policy
      (business_sync_preferences / a staff decision), decided elsewhere.
    - Once approved, the row's current_value records what was replaced, so the
      proposal list doubles as the change history the audit trail on top of
      it already supplies.

  DELIBERATELY NOT auto-applied: the workforce boundary in 20260901040000
  ("measure and report, never act") is what this list protects. The executor
  may WRITE proposals; approving ONE is an authority-bearing decision made by
  a person or by an owner's explicit sync preference held in
  business_sync_preferences.

  SAFETY: proposed_value is never stored in a way any render path consumes
  directly — applying a proposal is the ONLY write path, and it runs through
  a SECURITY DEFINER function that re-checks the evidence exists, so a raw
  UPDATE cannot bypass the engine's own rules.

  Re-runnable throughout.
*/

CREATE TABLE IF NOT EXISTS public.business_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  field_name text NOT NULL,
  current_value text,            -- what the row holds today (for history)
  proposed_value text NOT NULL,  -- what source X says it should be

  source_id   text REFERENCES public.radar_sources(key) ON DELETE SET NULL,
  source_url  text,
  confidence  integer NOT NULL DEFAULT 0,
  extraction_method text,        -- same vocabulary as business_evidence
  evidence_id uuid REFERENCES public.business_evidence(id) ON DELETE SET NULL,
  reason  text,                  -- human-readable why (.e.g. "OpenStreetMap hours differ from stored hours")

  status text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | superseded
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  note text,
  auto_applied boolean NOT NULL DEFAULT false,  -- true when an owner sync preference approved it

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_change_proposals_status_check CHECK (status IN ('pending','approved','rejected','superseded'))
);

CREATE INDEX IF NOT EXISTS business_change_proposals_queue
  ON public.business_change_proposals (business_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS business_change_proposals_active_unique
  ON public.business_change_proposals (business_id, field_name)
  WHERE status = 'pending';

ALTER TABLE public.business_change_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_change_proposals_public_read ON public.business_change_proposals;
DROP POLICY IF EXISTS business_change_proposals_staff_write ON public.business_change_proposals;

-- Public read, scoped to listable businesses: a visitor/owner should be able
-- to see "a proposal to change the logo is pending" — it is provenance, same
-- as business_evidence. Proposals for non-listable rows stay invisible.
CREATE POLICY business_change_proposals_public_read ON public.business_change_proposals
  FOR SELECT TO anon, authenticated
  USING (exists (
    select 1 from public.businesses b
     where b.id = business_change_proposals.business_id and b.is_listable
  ));

-- Only staff (or the SECURITY DEFINER applier below) may write them.
CREATE POLICY business_change_proposals_staff_write ON public.business_change_proposals
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

/*
  Apply an approved proposal to the business row.

  Re-checks, in the definer, everything the engine was supposed to have
  checked before proposing: the caller is staff, the proposal really is
  approved, and it carries evidence (a proposal with none is refused — an AI
  asserting a fact out of thin air must not be writable). It then writes the
  field, marks the proposal applied, and marks any earlier evidence for that
  field superseded, so the field's provenance trail reads forward.

  Granted to authenticated exactly like radar_publish_candidate: the
  in-function staff gate is the authority, not the grant list. The owner
  sync-preference auto-apply path runs through an edge function holding the
  service role.
*/
CREATE OR REPLACE FUNCTION public.apply_business_change_proposal(p_proposal uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; v_field text; v_statement text;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Staff only'; END IF;
  SELECT * INTO v FROM public.business_change_proposals WHERE id = p_proposal;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such proposal'; END IF;
  IF v.status <> 'approved' THEN RAISE EXCEPTION 'proposal is not approved'; END IF;
  IF v.evidence_id IS NULL THEN RAISE EXCEPTION 'proposal has no evidence and cannot be applied'; END IF;

  -- Allowed fields only; the set lives with the importer (UPDATABLE_FIELDS)
  -- and is enforced here rather than mirrored twice. social_links is the
  -- engine's own addition (the jsonb column that holds {instagram,…}).
  IF v.field_name NOT IN ('description','category','address','location','phone','whatsapp','email',
                          'website','logo_url','image_url','opening_hours','tagline','about','story',
                          'mission','vision','subcategory','business_type','employees','service_area',
                          'timezone','founded_year','social_links')
  THEN RAISE EXCEPTION 'field % is not writable through proposals', v.field_name; END IF;

  -- social_links is jsonb and MERGES so a proposal in one run never wipes a
  -- platform an owner added themselves afterwards.
  IF v.field_name = 'social_links' THEN
    UPDATE public.businesses
       SET social_links = coalesce(social_links, '{}'::jsonb) || v.proposed_value::jsonb,
           updated_at = now()
     WHERE id = v.business_id;
  ELSE
    -- Exact write: proposal value is used verbatim. It is what a source said.
    v_field := quote_ident(v.field_name);
    v_statement := format('update public.businesses set %s = $1, updated_at = now() where id = $2', v_field);
    EXECUTE v_statement USING v.proposed_value, v.business_id;
  END IF;

  -- Applying real hours also records WHERE they came from and that they are
  -- timed (derived from concrete ranges), so a 24/7-only source cannot be
  -- mistaken for owner confirmation. The availability trigger flips the mode
  -- to derived on the same write.
  IF v.field_name = 'opening_hours' THEN
    UPDATE public.businesses
       SET hours_source = coalesce(v.source_id, 'source'),
           hours_source_url = v.source_url,
           hours_last_verified = now(),
           availability_confirmation = 'timed',
           is_24_hours = (v.proposed_value ~ '24\s*/\s*7|24 *hours|always open')
     WHERE id = v.business_id;
  END IF;

  UPDATE public.business_change_proposals
     SET reviewed_by = auth.uid(), reviewed_at = now(), note = 'Applied by engine', status = 'approved'
   WHERE id = p_proposal;

  -- This field's other evidence is now history, not current.
  UPDATE public.business_evidence
     SET superseded_at = now()
   WHERE business_id = v.business_id AND field_name = v.field_name AND id <> v.evidence_id;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_business_change_proposal(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_business_change_proposal(uuid) TO authenticated;

-- ===================================================================
-- 20260911050000_business_sync_preferences.sql
-- ===================================================================
/*
  # Business Intelligence — owner sync preferences

  What an owner has decided the enrichment engine may do to THEIR business.
  The workforce/executor writes proposals; whether those proposals are ever
  applied to a claimed business is decided here, by the person who owns it.

  WHY A SEPARATE TABLE FROM THE BUSINESS ROW

  These are permissions, not content: they describe what the platform may do,
  and they change more often than the business does. Bundling them into
  businesses would bloat every SELECT * and make a lexical "what is the
  business?" read carry an authorization decision. Separate, one-to-one.

  SECURITY MODEL

  - Columns default to the SAFE direction: nothing auto-applies without an
    owner saying so. `approval_threshold` only matters when an auto-apply flag
    is on — it is the confidence a proposal must clear to auto-apply.
  - `owner_id` is denormalised from businesses.user_id for RLS convenience
    (the row is readable/updatable by the owner, staff by policy) and is
    maintained by the claim trigger so a handover moves the permissions too.
  - `sync_enabled = false` turns the engine off for this business entirely:
    the executor checks it before even queueing.

  Three rows are seeded for every business shell by the claim-approval trigger
  in 20260830000000 via NOWOPEN hooks below; rows are created silently where
  missing when an owner first interacts (20260911050000's guard trigger).

  Re-runnable throughout.
*/

CREATE TABLE IF NOT EXISTS public.business_sync_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Master switch: false = the enrichment engine does nothing for this row.
  sync_enabled boolean NOT NULL DEFAULT true,

  -- What the engine may do, each defaulting to "ask first".
  auto_apply_hours         boolean NOT NULL DEFAULT false,  -- adopt OSM/verified source hours
  auto_apply_source_images boolean NOT NULL DEFAULT true,   -- adopt clearly-licensed source logos/covers
  auto_apply_discovery_fields boolean NOT NULL DEFAULT false, -- address/phone/socials from sources
  notify_on_change         boolean NOT NULL DEFAULT true,   -- email/in-app when a proposal lands

  /* Only consulted when an auto_apply_* flag is true: a proposal's confidence
     must be >= this to apply without asking. Above the threshold the browser
     still shows the proposal list, marking those auto-applied. */
  approval_threshold integer NOT NULL DEFAULT 80,
  confirm_24_hours boolean NOT NULL DEFAULT false,          -- owner-confirmed 24/7 overrides defaults
  hours_override_reason text,                                -- why confirm_24_hours is set, if at all

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_sync_preferences_threshold_check CHECK (approval_threshold BETWEEN 0 AND 100)
);

ALTER TABLE public.business_sync_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_sync_preferences_owner_read ON public.business_sync_preferences;
DROP POLICY IF EXISTS business_sync_preferences_owner_update ON public.business_sync_preferences;
DROP POLICY IF EXISTS business_sync_preferences_staff_manage ON public.business_sync_preferences;

-- The owner reads and edits their own row; staff manage all.
CREATE POLICY business_sync_preferences_owner_read ON public.business_sync_preferences
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_staff());
CREATE POLICY business_sync_preferences_owner_update ON public.business_sync_preferences
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY business_sync_preferences_staff_manage ON public.business_sync_preferences
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- On business insert create the preferences row at defaults automatically.
CREATE OR REPLACE FUNCTION public.ensure_business_sync_preferences()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.business_sync_preferences (business_id)
  VALUES (NEW.id)
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_business_sync_preferences ON public.businesses;
CREATE TRIGGER trg_ensure_business_sync_preferences
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.ensure_business_sync_preferences();

-- ===================================================================
-- 20260912000000_enrichment_scheduler.sql
-- ===================================================================
/*
  # The scheduler that makes enrichment autonomous

  20260911030000 built the queue and the executor; nothing ever filled the
  queue, so the executor always saw an empty table. This is the missing spine:

    - queue_due_enrichment_businesses() figures out which listable businesses
      are due and inserts one (business, job_type) row per cadence.
    - tick_enrichment() posts to the executor once per tick, with the queue
      refilled first (the operator configures the endpoint URL, including
      ?limit=N&refill=1, exactly like the workforce endpoint).
    - a pg_cron job schedules that tick, mirroring the workforce.
    - enrichment_cron_status() shows what the scheduler is doing.

  ELIGIBILITY — all four must hold:

    - the business row is listable and not removed;
    - the owner has not switched sync off (business_sync_preferences.sync_enabled
      defaults TRUE; a business with no prefs row counts as opted-in);
    - no active (queued/running) job already exists; the partial unique index
      would refuse the duplicate anyway, but the scan-side check keeps the
      insert honest about how many it actually queued;
    - the job TYPE is not already satisfied within its freshness window.

  CADENCE — freshness windows decide when a type is due:

    - hours_resolution (priority 40, 45-day window): never had hours, or
      hours_last_verified older than 30 days — verify/re-verify opening hours
      on the topping-up cadence;
    - enrichment (priority 50, 7-day window): everything else, a rolling
      refresh pass.

  The tick is deliberately dumb, like tick_workforce: all judgement lives in
  the queue function, so a cadence change never means touching cron.

  SAFETY: this migration only queues work. The executor still cannot write a
  business directly — changes flatten through 20260911040000's proposals.

  Re-runnable throughout.
*/

-- Succeeded-run scan for the freshness windows above.
CREATE INDEX IF NOT EXISTS business_enrichment_jobs_done
  ON public.business_enrichment_jobs (business_id, job_type, finished_at DESC)
  WHERE status = 'succeeded';

/*
  Refill: pick every eligible business and enqueue the job type it is due.

  Returns the number of rows actually inserted (0 is a valid, "nothing due"
  answer). Service-role only.
*/
CREATE OR REPLACE FUNCTION public.queue_due_enrichment_businesses(p_max integer DEFAULT 20)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inserted integer;
BEGIN
  WITH due AS (
    SELECT
      b.id                                                  AS business_id,
      CASE
        WHEN b.opening_hours IS NULL AND b.hours IS NULL THEN 'hours_resolution'
        WHEN b.hours_last_verified IS NULL OR b.hours_last_verified < now() - interval '30 days' THEN 'hours_resolution'
        ELSE 'enrichment'
      END                                                   AS job_type,
      CASE
        WHEN b.opening_hours IS NULL AND b.hours IS NULL THEN 'hours never set'
        WHEN b.hours_last_verified IS NULL OR b.hours_last_verified < now() - interval '30 days' THEN 'hours last verified over 30 days ago'
        ELSE 'rolling refresh pass'
      END                                                   AS reason,
      (CASE WHEN b.opening_hours IS NULL AND b.hours IS NULL THEN 40 ELSE 50 END) AS priority
    FROM public.businesses b
    LEFT JOIN public.business_sync_preferences p ON p.business_id = b.id
    WHERE b.is_listable
      AND coalesce(b.removal_status, 'none') <> 'removed'
      AND coalesce(p.sync_enabled, true)
      AND NOT EXISTS (
        SELECT 1 FROM public.business_enrichment_jobs a
         WHERE a.business_id = b.id AND a.status IN ('queued','running'))
      AND (
        (CASE
          WHEN b.opening_hours IS NULL AND b.hours IS NULL THEN 'hours_resolution'
          WHEN b.hours_last_verified IS NULL OR b.hours_last_verified < now() - interval '30 days' THEN 'hours_resolution'
          ELSE 'enrichment'
         END = 'hours_resolution'
          AND NOT EXISTS (
            SELECT 1 FROM public.business_enrichment_jobs j
             WHERE j.business_id = b.id AND j.job_type = 'hours_resolution'
               AND j.status = 'succeeded'
               AND j.finished_at > now() - interval '45 days'))
        OR
        (CASE
          WHEN b.opening_hours IS NULL AND b.hours IS NULL THEN 'hours_resolution'
          WHEN b.hours_last_verified IS NULL OR b.hours_last_verified < now() - interval '30 days' THEN 'hours_resolution'
          ELSE 'enrichment'
         END = 'enrichment'
          AND NOT EXISTS (
            SELECT 1 FROM public.business_enrichment_jobs j
             WHERE j.business_id = b.id AND j.job_type = 'enrichment'
               AND j.status = 'succeeded'
               AND j.finished_at > now() - interval '7 days'))
      )
    ORDER BY (b.opening_hours IS NULL AND b.hours IS NULL) DESC, b.updated_at
    LIMIT p_max
  )
  INSERT INTO public.business_enrichment_jobs
    (business_id, job_type, status, priority, payload, queue_reason, run_at)
  SELECT
    d.business_id,
    d.job_type,
    'queued',
    d.priority,
    CASE WHEN d.job_type = 'hours_resolution'
         THEN '{"sources": ["openstreetmap"]}'::jsonb
         ELSE '{"ai_resolver": true}'::jsonb END,
    d.reason,
    now()
  FROM due d
  ON CONFLICT (business_id, job_type) WHERE status IN ('queued','running') DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_due_enrichment_businesses(integer) FROM public, anon, authenticated;

/*
  One tick.

  Posts to the enrichment executor, which refills the queue then drains it.
  Deliberately dumb for the same reason tick_workforce is: cadence lives in the
  queue function. Returns the pg_net request id so a failure can be traced in
  net._http_response.
*/
CREATE OR REPLACE FUNCTION public.tick_enrichment()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_url text; v_key text; v_anon text; v_id bigint;
BEGIN
  SELECT value INTO v_url  FROM public.private_config WHERE key = 'enrichment_endpoint';
  SELECT value INTO v_key  FROM public.private_config WHERE key = 'automation_secret';
  SELECT value INTO v_anon FROM public.private_config WHERE key = 'anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'tick_enrichment: not configured yet; nothing scheduled to call.';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-automation-key', v_key
    ),
    timeout_milliseconds := 55000
  ) INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tick_enrichment() FROM public, anon, authenticated;

/*
  Every 15 minutes.

  As with the workforce, this is not because enrichment runs that often — it is
  because the tick is what makes cadence changes take effect promptly, and a
  tick with nothing due costs one HTTP call that returns immediately.
*/
DO $$
BEGIN
  PERFORM cron.unschedule('nowopen-enrichment');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule('nowopen-enrichment', '*/15 * * * *', $$SELECT public.tick_enrichment();$$);

/** What the scheduler has been doing, for the admin console. */
CREATE OR REPLACE FUNCTION public.enrichment_cron_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'scheduled',   EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nowopen-enrichment'),
    'schedule',    (SELECT schedule FROM cron.job WHERE jobname = 'nowopen-enrichment'),
    'active',      (SELECT active   FROM cron.job WHERE jobname = 'nowopen-enrichment'),
    'last_run',    (SELECT max(start_time) FROM cron.job_run_details d
                      JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname = 'nowopen-enrichment'),
    'last_status', (SELECT d.status FROM cron.job_run_details d
                      JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname = 'nowopen-enrichment'
                     ORDER BY d.start_time DESC LIMIT 1),
    'configured',  EXISTS (SELECT 1 FROM public.private_config WHERE key = 'enrichment_endpoint'),
    'queued',      (SELECT count(*) FROM public.business_enrichment_jobs WHERE status IN ('queued','running')),
    'succeeded',   (SELECT count(*) FROM public.business_enrichment_jobs WHERE status = 'succeeded')
  ) INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.enrichment_cron_status() TO authenticated;

-- ===================================================================
-- 20260912010000_enrichment_ops.sql
-- ===================================================================
/*
  # Enrichment ops — admin levers for the scheduler

  20260912000000 scheduled enrichment but gave the console no way to act on
  it. This adds the two admin-only levers the ops panel uses, both SECURITY
  DEFINER with the same is_admin() gate that enrichment_cron_status() uses:

    - admin_requeue_enrichment(): make the scheduler's own "what is due now"
      decision run this second, returning how many jobs it queued.
    - admin_retry_failed_enrichment(): return failed jobs (attempts < 3) to
      the queue so a transient failure waits for a human nudge, not a fresh
      attempt stack.

  Neither touches a business directly — both only move work into the queue,
  which already holds for queue_due_enrichment_businesses.

  Re-runnable throughout.
*/

/** What the next cron tick would queue, but now. Admins only; service-role
 *  calls go straight to queue_due_enrichment_businesses. */
CREATE OR REPLACE FUNCTION public.admin_requeue_enrichment(p_max integer DEFAULT 20)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN public.queue_due_enrichment_businesses(p_max);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_requeue_enrichment(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_requeue_enrichment(integer) TO authenticated;

/** Failed jobs back into the line (bounded attempts so nothing loops forever). */
CREATE OR REPLACE FUNCTION public.admin_retry_failed_enrichment(p_max integer DEFAULT 25)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  UPDATE public.business_enrichment_jobs
     SET status = 'queued',
         run_at = now(),
         updated_at = now(),
         error = 'requeued from the admin console'
   WHERE id IN (
         SELECT id FROM public.business_enrichment_jobs
          WHERE status = 'failed' AND attempts < 3
          ORDER BY updated_at
          LIMIT p_max);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_retry_failed_enrichment(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_retry_failed_enrichment(integer) TO authenticated;

-- ===================================================================
-- 20260912020000_enrichment_auto_apply.sql
-- ===================================================================
/*
  # Business Intelligence — owner sync-preference auto-apply

  Turns business_sync_preferences into behaviour. The engine WRITES proposals;
  whether one is applied is authority, and that authority is the owner's —
  this migration is the single place where an owner's stored `auto_apply_*`
  flags and `approval_threshold` can approve a proposal WITHOUT a person in
  the review loop.

  DESIGN

  - `_apply_proposal_write(uuid)` is the ONE write core (business row + the
    hours metadata + superseding the field's older evidence). The staff
    applier and the auto applier both hand it the proposal id AFTER each has
    done its own authorisation. Extracting the write keeps two authorised
    paths from drifting apart — a drift here would mean one path edits the
    business without the other's rules.
  - `_apply_proposal_write` holds no authority of its own and grants nothing
    to PUBLIC: it is reachable only by the service role, or by a definer
    chain that already checked something (staff, owner prefs). The staff
    applier is REPLACED so it delegates here instead of inlining a second
    copy of the write.
  - `auto_apply_due_proposals(uuid)` is the owner-authorised applier. For
    each pending proposal it consults the owner's flags (field family →
    column), the confidence bar (`approval_threshold`), the evidence rule the
    staff applier enforces, and the writable-field allowlist, then applies.
    Nothing applies unless the OWNER set a flag; every flag defaults to
    ask-first. The single override: an owner who set `confirm_24_hours` has
    ALREADY asserted the business is open 24/7, so a proposal whose value
    matches that assertion applies without the hours flag or the confidence
    bar — the authority is the owner's own claim, not the source's score.
  - The executor (service role, held by the edge function) calls this once
    per business at the end of a live run; it is idempotent (approving moves
    rows out of `status = 'pending'`, which is also the queue the dedupe
    index guards).

  Re-runnable throughout.
*/

-- The write core. NO authorisation here — callers authorise, this writes.
CREATE OR REPLACE FUNCTION public._apply_proposal_write(p_proposal uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v record; v_field text; v_statement text;
BEGIN
  SELECT * INTO v FROM public.business_change_proposals WHERE id = p_proposal;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such proposal'; END IF;

  -- Allowed fields only, enforced here rather than mirrored twice (the set
  -- lives with the importer; social_links is the engine's own jsonb add).
  IF v.field_name NOT IN ('description','category','address','location','phone','whatsapp','email',
                          'website','logo_url','image_url','opening_hours','tagline','about','story',
                          'mission','vision','subcategory','business_type','employees','service_area',
                          'timezone','founded_year','social_links')
  THEN RAISE EXCEPTION 'field % is not writable through proposals', v.field_name; END IF;

  -- social_links is jsonb and MERGES so one run never wipes a platform an
  -- owner added afterwards.
  IF v.field_name = 'social_links' THEN
    UPDATE public.businesses
       SET social_links = coalesce(social_links, '{}'::jsonb) || v.proposed_value::jsonb,
           updated_at = now()
     WHERE id = v.business_id;
  ELSE
    v_field := quote_ident(v.field_name);
    v_statement := format('update public.businesses set %s = $1, updated_at = now() where id = $2', v_field);
    EXECUTE v_statement USING v.proposed_value, v.business_id;
  END IF;

  -- Real hours also record WHERE they came from and that they are timed, so a
  -- 24/7-only source cannot be mistaken for owner confirmation.
  IF v.field_name = 'opening_hours' THEN
    UPDATE public.businesses
       SET hours_source = coalesce(v.source_id, 'source'),
           hours_source_url = v.source_url,
           hours_last_verified = now(),
           availability_confirmation = 'timed',
           is_24_hours = (v.proposed_value ~ '24\s*/\s*7|24 *hours|always open')
     WHERE id = v.business_id;
  END IF;

  -- This field's other evidence is now history, not current.
  UPDATE public.business_evidence
     SET superseded_at = now()
   WHERE business_id = v.business_id AND field_name = v.field_name AND id <> v.evidence_id;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._apply_proposal_write(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._apply_proposal_write(uuid) TO service_role;

-- The staff applier, REPLACED so it authorises and delegates. The behaviour is
-- identical to the original: staff gate, approved + evidence re-check, stamps
-- the reviewer, then delegates the actual write to the shared core.
CREATE OR REPLACE FUNCTION public.apply_business_change_proposal(p_proposal uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Staff only'; END IF;
  SELECT * INTO v FROM public.business_change_proposals WHERE id = p_proposal;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such proposal'; END IF;
  IF v.status <> 'approved' THEN RAISE EXCEPTION 'proposal is not approved'; END IF;
  IF v.evidence_id IS NULL THEN RAISE EXCEPTION 'proposal has no evidence and cannot be applied'; END IF;

  UPDATE public.business_change_proposals
     SET reviewed_by = auth.uid(), reviewed_at = now(), note = 'Applied by engine', status = 'approved'
   WHERE id = p_proposal;

  RETURN public._apply_proposal_write(p_proposal);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_business_change_proposal(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_business_change_proposal(uuid) TO authenticated;

-- The owner-authorized applier. Service role only: called by the executor
-- edge function after a live run.
CREATE OR REPLACE FUNCTION public.auto_apply_due_proposals(p_business uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pref record;
  v record;
  v_flag boolean;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_pref FROM public.business_sync_preferences WHERE business_id = p_business;
  IF NOT FOUND OR v_pref.sync_enabled = false THEN RETURN 0; END IF;

  FOR v IN
    SELECT id, field_name, proposed_value, confidence, source_id, source_url, evidence_id
      FROM public.business_change_proposals
     WHERE business_id = p_business AND status = 'pending'
     ORDER BY confidence DESC
  LOOP
    -- Which owner flag governs this field family?
    IF v.field_name = 'opening_hours' THEN v_flag := v_pref.auto_apply_hours;
    ELSIF v.field_name IN ('logo_url','image_url') THEN v_flag := v_pref.auto_apply_source_images;
    ELSE v_flag := v_pref.auto_apply_discovery_fields;
    END IF;

    -- The owner confirmed 24/7: a proposal whose value says exactly that is
    -- the owner's own claim, so it applies without the flag or the bar.
    IF v.field_name = 'opening_hours'
       AND v_pref.confirm_24_hours
       AND v.proposed_value ~* '24\s*/\s*7|24[\s-]*hours|always open'
    THEN
      IF v.evidence_id IS NULL THEN CONTINUE; END IF;
      UPDATE public.business_change_proposals
         SET status = 'approved', reviewed_at = now(), auto_applied = true,
             note = 'Auto-applied by owner preference'
       WHERE id = v.id;
      PERFORM public._apply_proposal_write(v.id);
      v_count := v_count + 1;
      CONTINUE;
    END IF;

    IF NOT v_flag THEN CONTINUE; END IF;                 -- owner didn't opt this family in
    IF v.confidence < v_pref.approval_threshold THEN CONTINUE; END IF; -- wouldn't clear their bar
    IF v.evidence_id IS NULL THEN CONTINUE; END IF;      -- same evidence rule as staff

    UPDATE public.business_change_proposals
       SET status = 'approved', reviewed_at = now(), auto_applied = true,
           note = 'Auto-applied by owner preference'
     WHERE id = v.id;

    PERFORM public._apply_proposal_write(v.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_apply_due_proposals(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.auto_apply_due_proposals(uuid) TO service_role;

-- ===================================================================
-- BACKFILL - existing businesses get the same defaults new businesses do.
-- ===================================================================
INSERT INTO public.business_sync_preferences (business_id)
SELECT id FROM public.businesses
ON CONFLICT (business_id) DO NOTHING;
COMMIT;

-- ===================================================================
-- AFTER THE COMMIT - verification queries (expected values in comments).
-- ===================================================================

-- 1. Businesses carry the intelligence columns; the hours default only names
--    state for rows that had no hours at all, never confirmed by an owner.
select availability_mode, is_24_hours_confirmed, hours_source, count(*)
  from businesses group by 1, 2, 3;

-- 2. The evidence assertions metadata exists.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'business_evidence'
   and column_name in ('generated_by_ai', 'ai_model', 'superseded_at');
-- expect three rows.

-- 3. The four new tables exist with RLS on.
select relname, relrowsecurity from pg_class
 where relkind = 'r'
   and relname in ('business_media_assets', 'business_enrichment_jobs',
                   'business_change_proposals', 'business_sync_preferences')
 order by relname;
-- expect relrowsecurity = true on each.

-- 4. Every existing business has a preference row (the backfill).
select (select count(*) from businesses)                as businesses,
       (select count(*) from business_sync_preferences) as prefs_rows;
-- expect businesses = prefs_rows.

-- 5. Nothing was invented: no jobs, proposals, assets or evidence rows.
select 'jobs'       as thing, count(*) from business_enrichment_jobs
union all select 'proposals', count(*) from business_change_proposals
union all select 'assets',    count(*) from business_media_assets;
-- expect each = 0.

-- 6. The write chain landed: owner applier + staff-gated proposal apply.
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('auto_apply_due_proposals', 'apply_business_change_proposal')
 order by p.proname;
-- expect both, with identity args (p_business uuid) and (p_proposal uuid).

-- ===================================================================
-- THEN
--   a) npm run check:drift  - should report no missing tables or columns.
--   b) The admin Enrichment panels flip from "not yet provisioned" to live.
--   c) Existing businesses show in the owner Studio tab under Enrichment &
--      Sync as configured (defaults), ready to change.
-- ===================================================================
