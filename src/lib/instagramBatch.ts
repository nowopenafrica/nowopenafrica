/**
 * Reading a list of Instagram handles out of a spreadsheet.
 *
 * ── WHAT A BATCH IS, AND WHAT IT IS NOT ──────────────────────────────────
 *
 * `radar_sources.instagram_graph` records `bulk_extraction = 'prohibited'`,
 * and that record stands: this platform does not harvest Instagram to find
 * businesses it does not already know about. There is no authorised endpoint
 * for that, and building one would be scraping.
 *
 * This is the other thing — looking up a list somebody already holds. The
 * distinction is the provenance of the list, not its length: fifty handles
 * copied from a trade directory the operator subscribes to is fifty lookups,
 * each identical to the one they would do by hand. So the screen asks where
 * the list came from and records the answer on every row it files.
 *
 * ── WHAT A BATCH DELIBERATELY DOES NOT CARRY ─────────────────────────────
 *
 * In single mode an operator ticks services, products and the logo per
 * account, having looked at that account. In a batch nobody is looking. So a
 * batch files FACTS ONLY — name, website, the account link, the bio as a
 * description, post permalinks — and never services, products or a logo.
 *
 * That is not a limitation to lift later. A service confirmed by nobody is a
 * service nobody confirmed, however it got into the database.
 */

/** Instagram's own character set. Same rule the server enforces. */
const HANDLE = /^[A-Za-z0-9._]{1,30}$/;

export interface BatchRow {
  /** 1-based row number in the file, for an error an operator can find. */
  line: number;
  /** Exactly what the cell said, so a rejection can quote it. */
  raw: string;
  /** The handle, lowercased, or null when the cell is not one. */
  handle: string | null;
  /** Why it was not accepted — shown next to the row. */
  reason?: string;
}

export interface BatchPlan {
  rows: BatchRow[];
  /** Unique, in file order. These are what will be looked up. */
  handles: string[];
  /** Cells that are not handles. */
  rejected: BatchRow[];
  /** Rows naming a handle an earlier row already named. */
  duplicates: BatchRow[];
  /** The column the handles were read from, for the operator to confirm. */
  column: string | null;
}

/**
 * Column names a person actually uses for this.
 *
 * Ordered: a file with both `instagram` and `name` must not take the name.
 */
const HANDLE_HEADERS = [
  'instagram', 'instagram_handle', 'instagramhandle', 'handle', 'username',
  'ig', 'ig_handle', 'account', 'profile',
];

const key = (h: string) => h.toLowerCase().replace(/[\s_-]+/g, '');

/** Which column holds the handles, or null when nothing looks like one. */
export function pickHandleColumn(headers: string[]): string | null {
  const normalised = headers.map((h) => ({ raw: h, k: key(h) }));
  for (const want of HANDLE_HEADERS) {
    const hit = normalised.find((h) => h.k === key(want));
    if (hit) return hit.raw;
  }
  /*
   * A single-column file is unambiguous whatever it calls itself — people
   * paste a bare list and the header is often the first handle.
   */
  if (headers.length === 1) return headers[0];
  return null;
}

/**
 * A handle from whatever a person pasted.
 *
 * Mirrors the server's normalizeHandle so the preview matches what will
 * actually be looked up. The server stays the authority — this is for showing
 * the operator the plan and for de-duplicating the file.
 */
export function readHandle(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;

  let s = v;
  // A profile URL, in any of the forms people paste.
  const url = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#\s]+)/i.exec(s);
  if (url) {
    s = url[1];
    /*
     * A post or reel link names the POST, not the account. Accepting it would
     * look up a handle like "p" or "reel" and report it missing, which reads
     * as the account being gone rather than the wrong link being pasted.
     */
    if (/^(p|reel|reels|tv|stories|explore)$/i.test(s)) return null;
  }
  s = s.replace(/^@/, '').replace(/\/+$/, '').trim();
  if (!HANDLE.test(s)) return null;
  return s.toLowerCase();
}

/**
 * Turn parsed CSV rows into the list that will be looked up.
 *
 * @param column pass null to let it choose, or a header to force one.
 */
export function planBatch(
  headers: string[],
  rows: Record<string, string>[],
  column: string | null = null,
): BatchPlan {
  const col = column ?? pickHandleColumn(headers);
  const out: BatchRow[] = [];
  const seen = new Set<string>();
  const handles: string[] = [];
  const rejected: BatchRow[] = [];
  const duplicates: BatchRow[] = [];

  /*
   * A single-column file whose header is itself a handle: people paste a bare
   * list and the first line becomes the header. Losing the first account
   * silently is worse than considering it.
   *
   * But NOT when the header is a column name. "instagram", "username" and
   * "handle" all pass the character set, so without this a file headed
   * `instagram` would look up the @instagram account and file Meta's own
   * profile as a candidate. Caught by a test rather than in production.
   */
  const headerIsColumnName = headers.length === 1
    && HANDLE_HEADERS.some((h) => key(h) === key(headers[0]));
  const headerAsRow = headers.length === 1 && !headerIsColumnName && readHandle(headers[0])
    ? headers[0]
    : null;
  const cells = headerAsRow ? [headerAsRow, ...rows.map((r) => r[col ?? ''] ?? '')] : rows.map((r) => r[col ?? ''] ?? '');

  cells.forEach((raw, i) => {
    // +2 counts the header, so the number matches what a spreadsheet shows.
    const line = headerAsRow ? i + 1 : i + 2;
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return; // Blank rows are not errors; spreadsheets are full of them.

    const handle = readHandle(trimmed);
    if (!handle) {
      const row: BatchRow = { line, raw: trimmed, handle: null, reason: 'Not an Instagram handle' };
      out.push(row);
      rejected.push(row);
      return;
    }
    if (seen.has(handle)) {
      const row: BatchRow = { line, raw: trimmed, handle, reason: 'Already in this file' };
      out.push(row);
      duplicates.push(row);
      return;
    }
    seen.add(handle);
    handles.push(handle);
    out.push({ line, raw: trimmed, handle });
  });

  return { rows: out, handles, rejected, duplicates, column: col };
}

/**
 * The most a single upload will look up.
 *
 * Raised from 200 to 1,000 on request, 2026-10-09. It was never a technical
 * limit — Meta would serve more — but a ceiling on how much one unattended
 * click can do against somebody else's API and into our own review queue.
 *
 * THE REAL CEILING IS META'S, NOT THIS NUMBER. business_discovery is rate
 * limited per app, and a run of this size will very likely meet that limit
 * before it meets this one. That is handled rather than ignored: the run
 * stops on the first rate-limited answer, the results table says which rows
 * were attempted, and re-uploading the same file later picks up the rest —
 * already-filed handles update instead of duplicating.
 *
 * At BATCH_DELAY_MS this is roughly twenty minutes of a tab staying open.
 */
export const BATCH_LIMIT = 1000;

/**
 * Milliseconds between lookups.
 *
 * business_discovery is rate-limited per app, and a burst spends the budget
 * every other feature shares. Sequential with a pause takes longer and is the
 * only version that can run to the end of a long list.
 */
export const BATCH_DELAY_MS = 1200;
