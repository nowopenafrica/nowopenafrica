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