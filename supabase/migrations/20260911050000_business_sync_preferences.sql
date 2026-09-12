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