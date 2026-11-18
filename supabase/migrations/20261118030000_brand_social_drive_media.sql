-- Brand social: content from the team's Google Drive folder.
--
-- The founder's "Launch Materials" folder is shared "anyone with the link can
-- view", so the sync reads it without any Google credentials. Every file seen
-- gets one row in brand_social_media, keyed by its Drive id, so a file is never
-- imported twice however often it is renamed or moved.
--
-- What a new file becomes:
--   * Files present at the first sync are recorded as 'library' only. The
--     folder held 847 files on 2026-11-18, mostly June-July batches and videos
--     with pre-launch wording; turning them all into drafts would bury the
--     queue. Admins import the ones they want (action 'import').
--   * Files that appear after that are copied into our storage (Instagram cannot
--     fetch Drive links, and only accepts JPEG, so images are re-encoded) and
--     become a DRAFT post whose caption is a [bracketed] placeholder. The checks
--     block brackets, so nothing from Drive can publish until a person has
--     written the caption and approved the post.
--
-- Only admins read these tables; only the service role (the sync) writes them.

CREATE TABLE IF NOT EXISTS public.brand_social_media_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label           text NOT NULL,
  drive_folder_id text NOT NULL UNIQUE CHECK (drive_folder_id ~ '^[A-Za-z0-9_-]{10,}$'),
  active          boolean NOT NULL DEFAULT true,
  baseline_done   boolean NOT NULL DEFAULT false,
  last_synced_at  timestamptz,
  last_result     jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.brand_social_media_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read brand_social_media_sources" ON public.brand_social_media_sources;
CREATE POLICY "Admins read brand_social_media_sources" ON public.brand_social_media_sources
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.brand_social_media (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      uuid NOT NULL REFERENCES public.brand_social_media_sources(id) ON DELETE CASCADE,
  drive_file_id  text NOT NULL UNIQUE,
  name           text NOT NULL,
  folder_path    text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('image','video','other')),
  drive_modified text,                  -- as Drive's folder view shows it ("Nov 9", "11:02 pm")
  status         text NOT NULL DEFAULT 'library' CHECK (status IN ('library','imported','skipped','failed')),
  storage_url    text,
  bytes          bigint,
  content_id     uuid REFERENCES public.brand_social_content(id) ON DELETE SET NULL,
  note           text,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  imported_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_brand_social_media_status ON public.brand_social_media (status, kind);
ALTER TABLE public.brand_social_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read brand_social_media" ON public.brand_social_media;
CREATE POLICY "Admins read brand_social_media" ON public.brand_social_media
  FOR SELECT TO authenticated USING (public.is_admin());

INSERT INTO public.brand_social_media_sources (label, drive_folder_id)
VALUES ('Launch Materials (Google Drive)', '1DvSWcqEY28y4h6LPvAPtGtd7-y18Vsz6')
ON CONFLICT (drive_folder_id) DO NOTHING;

-- Hourly, at 17 past. Fails closed without the automation secret, like the
-- other ticks.
CREATE OR REPLACE FUNCTION public.tick_brand_social_drive_sync()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text; v_anon text; v_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.brand_social_media_sources WHERE active) THEN
    RETURN NULL;
  END IF;
  SELECT value INTO v_key  FROM public.private_config WHERE key = 'automation_secret';
  SELECT value INTO v_anon FROM public.private_config WHERE key = 'anon_key';
  IF v_key IS NULL THEN
    RAISE NOTICE 'tick_brand_social_drive_sync: automation_secret not configured.';
    RETURN NULL;
  END IF;
  SELECT net.http_post(
    url     := 'https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/brand-social-drive-sync',
    body    := '{"action":"tick"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-automation-key', v_key
    ),
    timeout_milliseconds := 120000
  ) INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.tick_brand_social_drive_sync() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('nowopen-brand-social-drive-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nowopen-brand-social-drive-sync');
SELECT cron.schedule('nowopen-brand-social-drive-sync', '17 * * * *',
  $cron$select public.tick_brand_social_drive_sync();$cron$);
