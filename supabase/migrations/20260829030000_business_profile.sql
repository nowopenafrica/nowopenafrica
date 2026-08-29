/*
  # The business story: the fields a page needs to convert, not just inform

  A NowOpen page should answer seven questions in seconds — who are you, what
  do you do, why you, can I trust you, are you open, where are you, and what do
  I do next. The schema could answer three of those. This adds the rest.

  WHY THESE SHAPES

  Prose fields are text: About, Story, Vision, Mission. They are written once
  and read whole.

  The list-shaped fields are jsonb, not child tables: values, why_us, faqs,
  team, credentials, policies. Every one of them is owned entirely by a single
  business, is only ever read with that business, and is never queried across
  businesses or joined to anything. A child table for each would be six tables,
  six RLS policies and six round trips to render one page. If a use appears
  later that needs to query across them — "find businesses that answer this
  FAQ" — that is when a table earns its place.

  Defaults are '[]' rather than NULL so the app never has to distinguish "no
  FAQs" from "FAQs not set", which is a difference nobody can act on.

  The CTA columns hold a key from categoryFeatures.ts, not a label. Storing
  "Book a Room" would freeze the wording at the moment it was chosen; storing
  the module key lets the label follow the config and stay translatable.

  Re-runnable: every statement is IF NOT EXISTS.
*/

-- 1. Identity -------------------------------------------------------------

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS subcategory text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS whatsapp text;
-- { instagram, facebook, x, tiktok, linkedin, youtube } — sparse by nature.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Story ----------------------------------------------------------------

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS about text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS story text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS vision text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS mission text;
-- ["Quality", "Trust", ...]
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS core_values jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Why us ---------------------------------------------------------------

/*
  ["Same-day delivery", "Wholesale pricing", ...]

  Deliberately a list of short claims rather than a paragraph. A customer
  comparing two businesses scans; they do not read. A paragraph saying the same
  thing loses to five ticks every time.
*/
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS why_us jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 4. Trust ----------------------------------------------------------------

-- [{ label, year?, issuer? }] — awards, licences, memberships, media features.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS credentials jsonb NOT NULL DEFAULT '[]'::jsonb;
-- [{ name, role, photo_url?, bio? }]
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS team jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 5. Answers --------------------------------------------------------------

-- [{ q, a }] — also the best material the AI assistant has to answer with.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS faqs jsonb NOT NULL DEFAULT '[]'::jsonb;
-- { refund, cancellation, delivery, booking, warranty, returns } — only the
-- keys a category actually needs are ever shown.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS policies jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 6. Business information -------------------------------------------------

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS founded_year integer;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS employees text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS business_type text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS service_area text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS languages jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS payment_methods jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 7. What to do next ------------------------------------------------------

/*
  A module key from categoryFeatures.ts (e.g. 'room-booking'), or one of the
  built-ins 'whatsapp' | 'call' | 'directions' | 'enquiry'. Null means "let the
  category decide", which is the right default and the one most owners will
  never need to change.
*/
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS primary_cta text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS secondary_cta text;

-- A founded year in the future, or before commerce, is a typo rather than a
-- fact. Bounded loosely: the point is to catch 20026, not to police history.
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_founded_year_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_founded_year_check
  CHECK (founded_year IS NULL OR (founded_year >= 1800 AND founded_year <= 2200)) NOT VALID;
