import { supabase } from './supabase';
import type { Business } from '../types';

/*
 * POSTGREST CAPS ROWS PER REQUEST — A SINGLE `.limit()` CANNOT SEE PAST IT.
 *
 * A response is truncated by the server's row cap (1000 by default) with no
 * error and no signal, no matter how large the client's `.limit(...)` asked.
 * That is why `.limit(50000)` still hands the admin panel exactly 1000 rows:
 * the cap is enforced server-side, and `.limit()` only sets the *requested*
 * maximum. The only way to read everything is `.range()` paging — each page
 * stays under the cap, and an empty page is the end-of-table signal.
 */

/**
 * The most rows PostgREST returns for ONE request, whatever `.limit()` asks.
 *
 * Exported because a `.limit()` above it is always a false belief: the caller
 * thinks it read everything and read 1000. `fetchAllBusinesses.test.ts` fails
 * the build on any such call, so this number is the one place to change if the
 * server's `db-max-rows` is ever raised.
 */
export const SERVER_ROW_CAP = 1000;

/** One page of the walk. Never above the cap, or the page itself truncates. */
export const PAGE_SIZE = SERVER_ROW_CAP;
const DEFAULT_CAP = 100_000;

/**
 * Columns no browser code reads, and which the public directory stops sending.
 *
 * ── WHY THIS LIST EXISTS ─────────────────────────────────────────────────
 *
 * MEASURED 2026-10-09 against the live table: the public directory walks all
 * 4,010 listable rows with `select('*')` — 100 columns — and ships 4,685 kB
 * of JSON to every visitor. 1,411 kB of that (30.1%) is these twenty columns,
 * which nothing in `src/` ever reads.
 *
 * The worst single offender is `search_vector`, a Postgres tsvector weighing
 * 477 kB. It is server-side search machinery; a browser can do nothing with it
 * at all. `source_license` is written by the admin importer and never read
 * back. The rest are provenance and audit timestamps.
 *
 * This is bandwidth on a mobile connection in Lagos, not a rounding error.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────
 *
 * Not a claim that these columns are useless — provenance is the reason this
 * directory can say where a fact came from. They are simply not needed by the
 * code that renders a listing, so they do not belong in the payload that
 * renders one. The admin walk below still reads everything, unchanged.
 */
export const COLUMNS_THE_CLIENT_NEVER_READS = [
  'search_vector',
  'source_license',
  'source_imported_at',
  'source_last_checked_at',
  'wikidata_checked_at',
  'image_checked_at',
  'claimed_at',
  'last_verified_at',
  'primary_cta',
  'secondary_cta',
  'removal_requested_at',
  'removal_requested_by',
  'removal_reason',
  'removal_resolved_at',
  'submission_source',
  'submission_campaign',
  'logo_source',
  'logo_source_url',
  'logo_attribution',
  'logo_licence',
] as const;

/**
 * Every column the public directory asks for.
 *
 * ── THE HAZARD THIS CARRIES ──────────────────────────────────────────────
 *
 * `select('*')` picks up a new column automatically. An explicit list does
 * not — so a migration that adds a column, plus a component that reads it,
 * yields `undefined` on the directory with no error anywhere. That is the
 * same silent-failure shape as a mistyped column name killing a whole select.
 *
 * `fetchAllBusinesses.test.ts` is the guard: it fails if anything in `src/`
 * starts reading a column on the denylist above, and if the two lists stop
 * agreeing with each other. Keep them honest, or go back to reading
 * everything — a 30% saving is not worth a field that silently vanishes.
 */
export const PUBLIC_DIRECTORY_COLUMNS = [
  /*
   * Added by 20261104010000_cover_focal_point.sql. The card crops the cover
   * to its own shape, so it needs the owner's focal point or a cover
   * positioned on the profile is wrong in the directory. Two smallints.
   */
  'cover_focal_x',
  'cover_focal_y',
  /*
   * Added by 20261103010000_business_cover_video.sql.
   *
   * Here because `BusinessForm` reads it, and this list's guard is binary by
   * design: a column is either in the payload or nothing reads it. The
   * migration says the directory itself wants the STILL (`image_url`), not
   * the video, so if the extra column per card matters this should instead be
   * fetched by the dashboard form on its own — that is a deliberate change,
   * not something to leave implied.
   */
  'cover_video_url',
  'id', 'name', 'description', 'category', 'location', 'phone', 'website',
  'rating', 'image_url', 'created_at', 'status', 'email', 'user_id',
  'updated_at', 'username', 'verified', 'logo_url', 'enabled_modules',
  'email_verified', 'phone_verified', 'id_verified', 'registration_verified',
  'address_verified', 'documents_reviewed', 'onsite_verified',
  'verification_tier', 'trust_score', 'secondary_categories', 'timezone',
  'open_status', 'opening_hours', 'hours', 'tagline', 'subcategory',
  'whatsapp', 'social_links', 'about', 'story', 'vision', 'mission',
  'core_values', 'why_us', 'credentials', 'team', 'faqs', 'policies',
  'founded_year', 'employees', 'business_type', 'service_area', 'languages',
  'payment_methods', 'data_status', 'claim_status', 'verification_status',
  'lifecycle_status', 'source_name', 'source_url', 'source_record_id',
  'external_id', 'address', 'listing_score', 'is_listable',
  'opens_on_holidays', 'open_status_set_at', 'data_confidence',
  'profile_state', 'removal_status', 'availability_mode', 'is_24_hours',
  'is_24_hours_confirmed', 'availability_confirmation', 'hours_source',
  'hours_source_url', 'hours_last_verified', 'submission_type',
  'image_source', 'image_source_url', 'image_attribution', 'image_licence',
] as const;

/** PostgREST's `select=` value for the public directory. */
export const PUBLIC_DIRECTORY_SELECT = PUBLIC_DIRECTORY_COLUMNS.join(',');

export interface FetchAllBusinessesOptions {
  /** Only rows the public can see (is_listable AND published), directory ordering. */
  isListable?: boolean;
  /** Whole-walk safety cap, so a runaway table cannot empty it for hours. */
  cap?: number;
  /**
   * Columns to read, for a caller that needs the whole table but only a few
   * fields of it — deduplication against every existing listing, say. Omitted,
   * the public walk takes PUBLIC_DIRECTORY_SELECT and the admin walk takes
   * everything.
   */
  columns?: string;
}

export interface FetchAllBusinessesResult<T = Business> {
  data: T[];
  /** null on success; a human-readable message on the first failed request. */
  error: string | null;
  /** True when the walk stopped because `cap` was reached, not the table end. */
  truncated: boolean;
}

/**
 * The whole businesses table, walked in `.range()` pages.
 *
 * Each request asks for at most PAGE_SIZE rows and is therefore safe under any
 * PostgREST cap; pages are appended until one comes back empty. Ordering
 * matches the two callers: newest-first for the admin panel, listing_score then
 * recency for the public directory.
 */
export async function fetchAllBusinesses<T = Business>(
  opts: FetchAllBusinessesOptions = {},
): Promise<FetchAllBusinessesResult<T>> {
  const { isListable = false, cap = DEFAULT_CAP, columns } = opts;
  const out: T[] = [];

  for (let offset = 0; offset < cap; offset += PAGE_SIZE) {
    /*
     * The public walk names its columns (30% less JSON over the wire); the
     * admin walk still reads everything, because an operator inspecting a
     * record is exactly who needs the provenance columns.
     */
    let query = supabase.from('businesses').select(columns ?? (isListable ? PUBLIC_DIRECTORY_SELECT : '*'));
    if (isListable) {
      query = query
        .eq('is_listable', true)
        // A submission awaiting review is not part of the directory yet. See
        // isPubliclyListed() in listingStatus.ts for why this is separate from
        // is_listable, which mirrors the database's generated column.
        .eq('profile_state', 'published')
        .order('listing_score', { ascending: false })
        .order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }
    const { data, error } = await query.range(offset, Math.min(offset + PAGE_SIZE - 1, cap - 1));
    if (error) return { data: out, error: error.message, truncated: false };
    /*
     * Through `unknown` because supabase-js infers a row type by parsing the
     * select string at COMPILE time, and ours is chosen at runtime — so it
     * gives up and widens to `GenericStringError[]`.
     *
     * That lost inference is the price of naming columns, and it is the exact
     * reason the two guards in the test file exist: nothing in the type
     * system is checking this list any more, so something else has to.
     */
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length === 0) break;
  }

  return { data: out, error: null, truncated: out.length >= cap };
}