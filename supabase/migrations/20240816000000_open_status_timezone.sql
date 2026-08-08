/*
  # Public open/closed + business timezone (trust-layer correctness)

  The public directory and profile pages must derive "open now" from the
  business's OWN stored hours in the business's OWN timezone — never from the
  visitor's localStorage or a category guess. These two columns back that:

  1. `timezone` — IANA zone the business operates in ("Africa/Lagos"). When
     absent the app falls back to the platform default (Africa/Lagos), so the
     column is nullable and optional.
  2. `open_status` — the owner's DB-persisted open/closed override, written by
     the Business Clock toggle (see syncOpenStatus). When set it wins over the
     schedule; NULL means "derive from the stored hours". A CHECK keeps it to
     exactly 'open' | 'closed' | NULL so no other value can leak onto the
     public badge.

  Existing rows keep their free-text `opening_hours`; this migration is purely
  additive and relies on the existing owner-update RLS policy for writes.
*/

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS timezone    text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS open_status text;

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_open_status_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_open_status_check
  CHECK (open_status IS NULL OR open_status IN ('open', 'closed'));

-- Public readers filter by status (e.g. "Open Now"), so index it.
CREATE INDEX IF NOT EXISTS idx_businesses_open_status ON public.businesses (open_status)
  WHERE open_status IS NOT NULL;
