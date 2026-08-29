/*
  # Business opening hours

  `businesses.opening_hours` is read across the app — the public profile panel,
  the "Open now" badge (via parseOpeningHours) and the directory's open-now
  filter — and 20240816000000_open_status_timezone.sql assumed it already
  existed ("Existing rows keep their free-text opening_hours"). No migration
  ever created it, so on a database built only from this folder the column is
  absent and every read falls back to "hours not confirmed" while the owner has
  no way to set them.

  This adds the column so the Business form's opening-hours editor can save.
  Free text by design: the editor writes a canonical, always-parseable string
  (formatOpeningHours), while rows seeded or typed earlier keep whatever prose
  they hold. Purely additive and idempotent, and writes rely on the existing
  owner-update RLS policy.

  `hours` is included because some historical rows carry the value under that
  name; the app reads `opening_hours ?? hours`.
*/

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS opening_hours text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS hours         text;

-- Backfill from the legacy column where only that one was populated.
UPDATE public.businesses
   SET opening_hours = hours
 WHERE opening_hours IS NULL
   AND hours IS NOT NULL
   AND btrim(hours) <> '';
