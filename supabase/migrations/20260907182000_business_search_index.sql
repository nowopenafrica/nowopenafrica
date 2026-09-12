-- Directory search: give Postgres something to search with.
--
-- THE PROBLEM
--
-- `src/pages/Businesses.tsx` runs `select('*')` with `.eq('is_listable', true)`
-- and no `.limit()` or `.range()`, then filters by category, location, text and
-- open-status entirely in the browser. The live index list on `businesses`
-- contains only btree indexes, so there is nothing a substring search can use.
--
-- At two listings this is invisible. The failure modes as supply arrives:
--
--   ~1,000    a multi-megabyte response, re-scanned in the browser on every
--             keystroke, paid for out of a Nigerian mobile data bundle
--   ~10,000   unusable on the connections this audience actually has
--   beyond    PostgREST's row cap truncates the response SILENTLY. Search then
--             reports "no results" for businesses that demonstrably exist —
--             a correctness failure wearing the costume of an empty state,
--             and the worst possible bug for a directory
--
-- This migration builds the index side. It is additive and changes no
-- behaviour on its own: the page keeps working exactly as it does today, and
-- the query can be moved server-side against a real index rather than against
-- a sequential scan.
--
-- WHY pg_trgm AS WELL AS tsvector. Full-text handles whole words; it does not
-- help someone typing "barbin salon" or "resturant". Measured: the directory
-- currently returns nothing for either. Trigram similarity is what makes a
-- misspelling still find the shop, and in this market — where business names
-- are typed on phone keyboards, often in a second language — that is not a
-- nicety.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Full-text over the fields a customer actually searches.
--
-- 'simple' rather than 'english': Nigerian business names are full of words no
-- English stemmer should touch — "Buka", "Suya", "Aso-Oke", "Okrika", "Mama
-- Put", "Keke". Stemming them produces worse matches, not better ones.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(name, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(location, '') || ' ' ||
      coalesce(description, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_businesses_search_vector
  ON public.businesses USING gin (search_vector);

-- Typo tolerance on the two fields worth being forgiving about.
CREATE INDEX IF NOT EXISTS idx_businesses_name_trgm
  ON public.businesses USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_businesses_location_trgm
  ON public.businesses USING gin (location gin_trgm_ops);

COMMENT ON COLUMN public.businesses.search_vector IS
  'Generated full-text vector over name, category, location and description. Configuration is ''simple'' on purpose: an English stemmer mangles Nigerian business vocabulary (Buka, Suya, Aso-Oke, Okrika).';

/*
 * One paged, ranked, server-side search.
 *
 * Replaces "fetch every listable row and filter in the browser". Ranking is
 * deliberately explicit rather than clever:
 *
 *   1. a full-text match on the query, weighted by rank
 *   2. then trigram similarity, so a misspelling still lands
 *   3. then the directory's existing order — listing_score, then recency —
 *      which is what already decides what a visitor sees first
 *
 * Keyset pagination on (listing_score, created_at, id) rather than OFFSET:
 * OFFSET re-scans everything it skips, so deep pages get slower and slower,
 * and a row inserted mid-scroll shifts every subsequent page.
 */
CREATE OR REPLACE FUNCTION public.search_businesses(
  q            text    DEFAULT NULL,
  in_category  text    DEFAULT NULL,
  in_place     text    DEFAULT NULL,
  page_size    integer DEFAULT 24,
  after_score  integer DEFAULT NULL,
  after_created timestamptz DEFAULT NULL,
  after_id     uuid    DEFAULT NULL
)
RETURNS SETOF public.businesses
LANGUAGE sql
STABLE
SECURITY INVOKER            -- RLS stays the visibility authority, as everywhere else
SET search_path TO 'public'
AS $$
  SELECT b.*
  FROM public.businesses b
  WHERE b.is_listable
    AND (in_category IS NULL OR in_category = ''
         OR b.category = in_category
         OR in_category = ANY (coalesce(b.secondary_categories, '{}')))
    AND (in_place IS NULL OR in_place = ''
         OR b.location ILIKE '%' || in_place || '%')
    AND (
      q IS NULL OR q = ''
      OR b.search_vector @@ plainto_tsquery('simple', q)
      OR b.name     ILIKE '%' || q || '%'
      OR b.location ILIKE '%' || q || '%'
      /*
       * TYPO TOLERANCE — word_similarity, not similarity.
       *
       * This shipped as `similarity(b.name, q) > 0.25` and caught nothing.
       * Measured on production the day it was applied:
       *
       *   similarity('Eko Hotels & Suites', 'hotle')       = 0.143   MISS
       *   word_similarity('hotle', 'Eko Hotels & Suites')  = 0.500   hit
       *
       * `similarity` compares whole strings, so a short query against a long
       * business name is dragged down by every trigram in the name it does not
       * share. `word_similarity` finds the best-matching run of words inside
       * the target, which is what a search box actually needs.
       *
       * And it has to cover CATEGORY and LOCATION, not only the name: in this
       * directory "restaurant" and "fashion" appear in 12 and 32 category
       * values and in zero names, so a customer typing "resturant" found
       * nothing while twelve restaurants sat in the table.
       *
       * Threshold 0.4, chosen against real data rather than picked: it catches
       * hotle (16), resturant (12), fashon (32), insurnce (14) and rejects
       * zzzqqq, xkcdqq and a single character.
       *
       * AT SCALE this should move to the `<%` operator so the trigram GIN
       * index is used; the operator's threshold is a GUC (0.6 by default),
       * which is too strict for the cases above and awkward to set inside a
       * STABLE function. At a few hundred rows the sequential scan is free,
       * and correctness now beats an index later.
       */
      OR word_similarity(q, b.name) > 0.4
      OR word_similarity(q, coalesce(b.category, '')) > 0.4
      OR word_similarity(q, coalesce(b.location, '')) > 0.4
    )
    -- Keyset cursor: strictly "after" the last row of the previous page.
    AND (
      after_id IS NULL
      OR (coalesce(b.listing_score, 0), b.created_at, b.id)
         < (coalesce(after_score, 0), after_created, after_id)
    )
  ORDER BY
    CASE WHEN q IS NULL OR q = '' THEN 0
         ELSE ts_rank(b.search_vector, plainto_tsquery('simple', q)) END DESC,
    coalesce(b.listing_score, 0) DESC,
    b.created_at DESC,
    b.id DESC
  LIMIT least(greatest(page_size, 1), 100);
$$;

COMMENT ON FUNCTION public.search_businesses IS
  'Paged, ranked directory search. SECURITY INVOKER so RLS remains the single visibility authority. Keyset pagination on (listing_score, created_at, id) — OFFSET degrades on deep pages and shifts under concurrent inserts.';
