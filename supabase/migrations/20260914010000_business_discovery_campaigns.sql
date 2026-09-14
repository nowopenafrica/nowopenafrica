/*
  # Business Discovery & Claim Engine — campaign orchestration layer

  Radar already does discovery, evidence and unclaimed publication; this file
  adds the campaign that scopes a run — the targets, budget, thresholds and
  outreach preferences an acquisition push is defined by — and a run ledger so
  a campaign's work is auditable.

  ## What this is NOT

  No ingestor exists yet. A campaign row is a plan, not work done; the worker
  that turns an active campaign into radar_candidates arrives with the
  enrichment/discovery executors (Phase 2). Nothing here publishes a business.

  ## The outreach gate ships OFF

  Every outreach flag in this file is seeded disabled with
  default_when_unreachable = false, so a fresh database never believes it may
  contact a business owner until an operator has configured the channel and the
  permission model. Claim invitations are the one kind of outreach none of the
  existing onboarding flows cover, and it must not silently turn itself on.

  Re-runnable; ON CONFLICT never touches an operator's flag state.
*/

-- ------------------------------------------------------------- campaigns
CREATE TABLE IF NOT EXISTS public.business_discovery_campaigns (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name   text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  owner  uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  countries      text[] NOT NULL DEFAULT '{}',
  regions        text[] NOT NULL DEFAULT '{}',
  cities         text[] NOT NULL DEFAULT '{}',
  neighborhoods  text[] NOT NULL DEFAULT '{}',
  categories     text[] NOT NULL DEFAULT '{}',
  services       text[] NOT NULL DEFAULT '{}',
  products       text[] NOT NULL DEFAULT '{}',
  filters        jsonb NOT NULL DEFAULT '{}',

  source_keys     text[] NOT NULL DEFAULT '{}',
  max_records     integer,
  daily_limit     integer,
  budget_max      numeric(12,2),
  review_threshold     integer NOT NULL DEFAULT 50,
  auto_publish_threshold integer NOT NULL DEFAULT 90,

  outreach_enabled          boolean NOT NULL DEFAULT false,
  outreach_channel          text,
  outreach_approval_required boolean NOT NULL DEFAULT true,

  start_at    timestamptz,
  end_at      timestamptz,
  schedule_cron text,

  records_discovered integer NOT NULL DEFAULT 0,
  records_published  integer NOT NULL DEFAULT 0,
  claims_linked      integer NOT NULL DEFAULT 0,
  last_run_at        timestamptz,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_discovery_campaigns DROP CONSTRAINT IF EXISTS business_discovery_campaigns_status_check;
ALTER TABLE public.business_discovery_campaigns ADD CONSTRAINT business_discovery_campaigns_status_check
  CHECK (status IN ('draft','active','paused','completed','archived'));

/* Thresholds mirror radar_config (review below auto-publish); an "active"
   campaign can never publish a record Radar itself would hold. */
ALTER TABLE public.business_discovery_campaigns DROP CONSTRAINT IF EXISTS business_discovery_campaigns_thresholds_check;
ALTER TABLE public.business_discovery_campaigns ADD CONSTRAINT business_discovery_campaigns_thresholds_check
  CHECK (
    review_threshold BETWEEN 0 AND 100
    AND auto_publish_threshold BETWEEN 50 AND 100
    AND review_threshold <= auto_publish_threshold
  );

ALTER TABLE public.business_discovery_campaigns DROP CONSTRAINT IF EXISTS business_discovery_campaigns_limits_check;
ALTER TABLE public.business_discovery_campaigns ADD CONSTRAINT business_discovery_campaigns_limits_check
  CHECK (
    (max_records IS NULL OR max_records >= 0)
    AND (daily_limit IS NULL OR daily_limit >= 0)
    AND (budget_max IS NULL OR budget_max >= 0)
    AND (end_at IS NULL OR start_at IS NULL OR end_at >= start_at)
  );

ALTER TABLE public.business_discovery_campaigns DROP CONSTRAINT IF EXISTS business_discovery_campaigns_outreach_check;
ALTER TABLE public.business_discovery_campaigns ADD CONSTRAINT business_discovery_campaigns_outreach_check
  CHECK (
    (NOT outreach_enabled AND outreach_approval_required) OR
    (outreach_channel IS NULL OR outreach_channel IN ('email','whatsapp','sms','instagram_interaction','manual'))
  );

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.business_discovery_campaigns (status, created_at DESC);

ALTER TABLE public.business_discovery_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read discovery campaigns" ON public.business_discovery_campaigns;
CREATE POLICY "Staff read discovery campaigns" ON public.business_discovery_campaigns
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Staff manage discovery campaigns" ON public.business_discovery_campaigns;
CREATE POLICY "Staff manage discovery campaigns" ON public.business_discovery_campaigns
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

/* Candidates become attributable to the campaign that surfaced them. */
ALTER TABLE public.radar_candidates ADD COLUMN IF NOT EXISTS campaign_id uuid
  REFERENCES public.business_discovery_campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_radar_candidates_campaign
  ON public.radar_candidates (campaign_id) WHERE campaign_id IS NOT NULL;

-- --------------------------------------------------------------- run ledger
CREATE TABLE IF NOT EXISTS public.business_discovery_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.business_discovery_campaigns(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'queued',
  records_discovered integer NOT NULL DEFAULT 0,
  records_published  integer NOT NULL DEFAULT 0,
  error       text,
  started_at  timestamptz,
  finished_at timestamptz,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_discovery_runs DROP CONSTRAINT IF EXISTS business_discovery_runs_status_check;
ALTER TABLE public.business_discovery_runs ADD CONSTRAINT business_discovery_runs_status_check
  CHECK (status IN ('queued','running','succeeded','partially_succeeded','failed','blocked','cancelled'));

CREATE INDEX IF NOT EXISTS idx_discovery_runs_campaign ON public.business_discovery_runs (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_status ON public.business_discovery_runs (status, created_at DESC);

ALTER TABLE public.business_discovery_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read discovery runs" ON public.business_discovery_runs;
CREATE POLICY "Staff read discovery runs" ON public.business_discovery_runs
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Staff manage discovery runs" ON public.business_discovery_runs;
CREATE POLICY "Staff manage discovery runs" ON public.business_discovery_runs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------- engine flags
/*
  Engine surfaces ship ON (they only surface data). Anything that publishes
  public content, and every outreach-capable switch, ships OFF and fails
  silent: not sending is recoverable, sending is not. ON CONFLICT preserves an
  operator's existing toggle — it only sets the label/description.
*/
INSERT INTO public.feature_flags (key, enabled, label, description, default_when_unreachable) VALUES
  ('business_discovery_engine', true,  'Discovery engine', 'The Business Discovery & Claim Engine admin workspace.', true),
  ('source_registry',           true,  'Source registry',  'Source adapters and rights governance for discovery.', true),
  ('enrichment_engine',         true,  'Enrichment engine', 'Evidence-gated profile enrichment jobs.', true),
  ('image_intelligence',        true,  'Image intelligence', 'Rights-aware media discovery and matching.', true),
  ('continuous_sync',           true,  'Continuous updates', 'Scheduled re-discovery and change proposals for unclaimed profiles.', true),
  ('auto_profile_draft_enabled', false, 'Auto profile drafts', 'Create draft profiles from qualifying candidates.', true),
  ('auto_publish_enabled',      false, 'Auto publish',     'Publish unclaimed profiles without human approval.', false),
  ('auto_enrichment_enabled',   true,  'Auto enrichment',  'Run enrichment jobs on a schedule.', true),
  ('media_discovery_enabled',   true,  'Media discovery',  'Discover candidate media from authorised sources.', true),
  ('claim_outreach',            false, 'Claim outreach',   'Automated claim invitations to business owners.', false),
  ('auto_outreach_enabled',     false, 'Auto outreach',    'Send claim invitations without per-campaign approval.', false),
  ('email_outreach_enabled',    false, 'Email outreach',   'Claim invitations by email.', false),
  ('whatsapp_outreach_enabled', false, 'WhatsApp outreach', 'Claim invitations by WhatsApp Business.', false),
  ('instagram_official_integration', false, 'Instagram (official API)', 'Official Meta/Instagram connection and owner-authorized sync.', false),
  ('instagram_interaction_flow_enabled', false, 'Instagram claim flow', 'Owner-initiated Instagram claim conversations via official API.', false)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description;