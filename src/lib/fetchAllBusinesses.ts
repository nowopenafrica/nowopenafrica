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

export const PAGE_SIZE = 1000;
const DEFAULT_CAP = 100_000;

export interface FetchAllBusinessesOptions {
  /** Only rows the public can see (is_listable = true), directory ordering. */
  isListable?: boolean;
  /** Whole-walk safety cap, so a runaway table cannot empty it for hours. */
  cap?: number;
}

export interface FetchAllBusinessesResult {
  data: Business[];
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
export async function fetchAllBusinesses(opts: FetchAllBusinessesOptions = {}): Promise<FetchAllBusinessesResult> {
  const { isListable = false, cap = DEFAULT_CAP } = opts;
  const out: Business[] = [];

  for (let offset = 0; offset < cap; offset += PAGE_SIZE) {
    let query = supabase.from('businesses').select('*');
    if (isListable) {
      query = query
        .eq('is_listable', true)
        .order('listing_score', { ascending: false })
        .order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }
    const { data, error } = await query.range(offset, Math.min(offset + PAGE_SIZE - 1, cap - 1));
    if (error) return { data: out, error: error.message, truncated: false };
    const rows = (data ?? []) as Business[];
    out.push(...rows);
    if (rows.length === 0) break;
  }

  return { data: out, error: null, truncated: out.length >= cap };
}