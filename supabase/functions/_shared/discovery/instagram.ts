// Instagram, as a source that enriches a business we already know about.
//
// ── WHAT THIS CAN AND CANNOT DO ──────────────────────────────────────────
//
// Checked against Meta's documentation on 2026-10-06:
//
//   business_discovery takes a USERNAME and returns that account's public
//   profile. It cannot search by location, category or keyword.
//
// So there is no authorised way to ask Instagram for "fashion businesses in
// Lagos". The hashtag edge exists but returns MEDIA from the last 24 hours,
// not business profiles. Anything that appears to search Instagram is
// scraping an unofficial endpoint, and this platform does not do that — not
// as a style preference, but because it is the difference between a data
// source and a liability.
//
// What it IS good for: 157 businesses and 176 candidates already carry an
// Instagram handle, harvested from their own websites. For each of those this
// returns a biography, a website and activity signals, from the official API,
// with the business's own consent implied by it being a public professional
// profile.
//
// ── IT REFUSES RATHER THAN PRETENDS ──────────────────────────────────────
//
// No Meta credentials are configured. Every function here returns an explicit
// `not_configured` result naming what is missing. None of them returns an
// empty success, and none returns invented data — an "enrichment" that
// silently produces nothing is indistinguishable from one that is working and
// finding nothing, which is how a dead pipeline survives for weeks.

/**
 * One post, as Meta's media edge returns it.
 *
 * No image URL by design — see MEDIA_FIELDS. A permalink is a link to the
 * post; a media_url is a copy of somebody's photograph that expires.
 */
export interface InstagramMedia {
  id: string;
  /** The business's own words. The only text here worth reading for facts. */
  caption: string | null;
  permalink: string | null;
  /** IMAGE | VIDEO | CAROUSEL_ALBUM — a reel reports as VIDEO. */
  mediaType: string | null;
  timestamp: string | null;
  likeCount: number | null;
  commentsCount: number | null;
}

/** Fields business_discovery exposes that are useful to a directory. */
export interface InstagramProfile {
  username: string;
  name: string | null;
  biography: string | null;
  website: string | null;
  followersCount: number | null;
  mediaCount: number | null;
  profilePictureUrl: string | null;
  /** Recent posts, read through the official media edge. */
  media?: InstagramMedia[];
  /** When this was read, for provenance. */
  retrievedAt: string;
}

/**
 * Meta's quota headers, forwarded verbatim.
 *
 * Parsed by src/lib/instagramQuota.ts on the client rather than here, so the
 * pacing rules live in one place with their tests. Raw strings, because that
 * is what Meta sends and what the parser is written against.
 *
 * `X-App-Usage` carries call_count / total_time / total_cputime as
 * percentages of a rolling hour; `X-Business-Use-Case-Usage` carries
 * `estimated_time_to_regain_access` in minutes. Nothing was reading either,
 * so a batch ran flat out until Meta refused and then called it a failure.
 */
export type UsageHeaders = Record<string, string>;

export type InstagramResult =
  | { ok: true; profile: InstagramProfile; usage?: UsageHeaders }
  | { ok: false; reason: 'not_configured'; missing: string[]; message: string }
  | { ok: false; reason: 'not_found'; message: string; usage?: UsageHeaders }
  | { ok: false; reason: 'rate_limited' | 'auth' | 'permission' | 'error'; message: string; usage?: UsageHeaders };

/**
 * A handle from anything a business might have written down.
 *
 * `@Business_Name`, `businessname`, `instagram.com/businessname/`,
 * `https://www.instagram.com/businessname?igsh=...` all describe one account.
 * Normalising them is what stops the same business being looked up four times
 * and counted as four.
 */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = String(raw).trim();
  if (!v) return null;

  // A full or partial URL — take the first path segment.
  const urlish = v.match(/instagram\.com\/([^/?#\s]+)/i);
  if (urlish) v = urlish[1];

  v = v.replace(/^@+/, '').trim();
  // Query strings survive a bare paste of a share link.
  v = v.split(/[?#]/)[0];
  v = v.replace(/\/+$/, '');

  // Instagram handles: letters, digits, full stops and underscores, ≤30.
  if (!/^[A-Za-z0-9._]{1,30}$/.test(v)) return null;
  // Reserved paths that are not accounts.
  if (/^(p|reel|reels|stories|explore|accounts|direct)$/i.test(v)) return null;

  return v.toLowerCase();
}

interface Credentials {
  accessToken: string;
  /** The IG Business account doing the asking — the API requires one. */
  igUserId: string;
}

/**
 * Credentials, or an explicit account of what is missing.
 *
 * business_discovery is not a public endpoint: it is queried ON an Instagram
 * Business account you control, so it needs both a token and that account's
 * id. Reporting them separately means the operator is told which half to fix.
 */
export function readCredentials(env: (k: string) => string | undefined): Credentials | { missing: string[] } {
  const accessToken = env('META_PAGE_ACCESS_TOKEN') ?? env('META_ACCESS_TOKEN');
  const igUserId = env('INSTAGRAM_BUSINESS_ACCOUNT_ID');
  const missing: string[] = [];
  if (!accessToken) missing.push('META_PAGE_ACCESS_TOKEN');
  if (!igUserId) missing.push('INSTAGRAM_BUSINESS_ACCOUNT_ID');
  if (missing.length) return { missing };
  return { accessToken: accessToken!, igUserId: igUserId! };
}

const GRAPH = 'https://graph.facebook.com/v21.0';

/** The fields worth asking for. Kept narrow — ask for what will be used. */
const FIELDS = 'username,name,biography,website,followers_count,media_count,profile_picture_url';

/**
 * Recent posts, through the official media edge of business_discovery.
 *
 * This is Meta's own endpoint for reading a public business account's posts —
 * not scraping, and not an unofficial route. What comes back is the caption
 * the business wrote, the permalink, the kind of post and when it went up.
 *
 * `media_url` is deliberately NOT requested. It is a signed CDN address that
 * expires within days, and Meta's Platform Terms do not permit us to store or
 * re-host the image. A "gallery" built from those URLs would be broken images
 * on somebody's listing within the week, and somebody else's photographs
 * published without their permission in the meantime. `permalink` is the
 * honest substitute: a stable public link to the post on Instagram.
 */
const MEDIA_FIELDS = 'id,caption,permalink,media_type,timestamp,like_count,comments_count';
/** One screenful. Enough to judge a business; not a bulk export of its feed. */
const MEDIA_LIMIT = 12;

/**
 * Look up one public Instagram Business/Creator account by handle.
 *
 * Returns `not_configured` when credentials are absent, which is the state
 * this platform is in today. It never returns a fabricated profile.
 */
export async function lookupInstagramBusiness(
  rawHandle: string,
  env: (k: string) => string | undefined = (k) => Deno.env.get(k),
  fetchImpl: typeof fetch = fetch,
): Promise<InstagramResult> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) {
    return { ok: false, reason: 'not_found', message: `"${rawHandle}" is not a usable Instagram handle.` };
  }

  const creds = readCredentials(env);
  if ('missing' in creds) {
    return {
      ok: false,
      reason: 'not_configured',
      missing: creds.missing,
      message:
        `Instagram is not connected. Missing: ${creds.missing.join(', ')}. ` +
        'business_discovery also needs an Instagram Business or Creator account linked to a ' +
        'Facebook Page, and App Review for instagram_basic, instagram_manage_insights and ' +
        'pages_read_engagement.',
    };
  }

  /*
   * The username is interpolated into a Graph field expression, not a query
   * parameter, so it cannot simply be URL-encoded away. normalizeHandle above
   * is the guard: it has already rejected anything outside [A-Za-z0-9._].
   */
  const url = `${GRAPH}/${creds.igUserId}`
    + `?fields=business_discovery.username(${handle})`
    + `{${FIELDS},media.limit(${MEDIA_LIMIT}){${MEDIA_FIELDS}}}`
    + `&access_token=${encodeURIComponent(creds.accessToken)}`;

  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    return { ok: false, reason: 'error', message: `Could not reach the Graph API: ${(e as Error).message}` };
  }

  /*
   * Captured before anything can return. Meta reports quota on failures too --
   * especially on a rate-limit refusal, where estimated_time_to_regain_access
   * is the one number that says when to come back.
   */
  const usage: UsageHeaders = {};
  for (const h of ['x-app-usage', 'x-business-use-case-usage']) {
    /*
     * Optional chaining: a quota reading is a nicety, and a response without
     * a `headers` object -- a stub, or a proxy that strips them -- must not
     * take down the lookup itself. Absent reads as "not reported", which the
     * pacing treats as unknown rather than as zero.
     */
    const v = res.headers?.get?.(h);
    if (v) usage[h] = v;
  }

  const body = await res.json().catch(() => null) as
    | { business_discovery?: Record<string, unknown>; error?: { message?: string; code?: number } }
    | null;

  if (!res.ok || body?.error) {
    const code = body?.error?.code;
    const message = body?.error?.message ?? `Graph API returned ${res.status}`;
    // 4 and 17 are Meta's rate-limit codes; 190 is an expired/invalid token.
    if (code === 4 || code === 17 || res.status === 429) {
      return { ok: false, reason: 'rate_limited', message, usage };
    }
    if (code === 190 || res.status === 401) {
      return { ok: false, reason: 'auth', message, usage };
    }
    /*
     * (#10) is the App Review gate, and it is the error this will actually hit
     * until review passes.
     *
     * Measured 2026-10-08 against a real token: it held instagram_basic and a
     * linked Business account, and business_discovery still answered
     * "(#10) Application does not have permission for this action" because
     * instagram_manage_insights and pages_read_engagement had not been
     * granted. Without this branch it fell through to "could not be reached",
     * which points at the network instead of at Meta's review queue.
     */
    if (code === 10 || code === 200 || res.status === 403 || /does not have permission/i.test(message)) {
      return { ok: false, reason: 'permission', message, usage };
    }
    /*
     * Meta returns an error, not an empty result, for a handle that is not a
     * Business/Creator account — which is most personal accounts. That is a
     * normal outcome for a directory, not a fault.
     */
    /*
     * "Invalid user id" is Meta's wording when a username does not resolve to
     * a discoverable Business/Creator account — a personal account, a typo, or
     * a handle that no longer exists.
     *
     * Measured 2026-10-08: three of four real handles returned exactly this
     * and fell through to the generic branch, which told the operator
     * "Instagram could not be reached just now". For a directory — where most
     * looked-up handles ARE personal accounts — that turns the normal case
     * into an apparent outage.
     */
    if (/does not exist|cannot be found|not a business|invalid user id/i.test(message)) {
      return { ok: false, reason: 'not_found', message, usage };
    }
    return { ok: false, reason: 'error', message };
  }

  const d = body?.business_discovery;
  if (!d) {
    return { ok: false, reason: 'not_found', message: `No public business profile for @${handle}.`, usage };
  }

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  return {
    ok: true,
    // Forwarded so the caller can pace itself; see UsageHeaders above.
    usage,
    profile: {
      username: str(d.username) ?? handle,
      name: str(d.name),
      biography: str(d.biography),
      website: str(d.website),
      followersCount: num(d.followers_count),
      mediaCount: num(d.media_count),
      /*
       * Recorded, NOT copied onto a listing. The profile picture is Meta
       * Platform Data and radar_sources marks image_reuse_allowed as
       * prohibited for this source — a URL that expires and is not ours to
       * redistribute.
       */
      profilePictureUrl: str(d.profile_picture_url),
      /*
       * Recent posts, as the business published them. Captions are its own
       * words; permalinks point at the post on Instagram rather than copying
       * anything out of it.
       */
      media: Array.isArray((d.media as { data?: unknown[] } | undefined)?.data)
        ? ((d.media as { data: Record<string, unknown>[] }).data
          .map((m) => ({
            id: str(m.id) ?? '',
            caption: str(m.caption),
            permalink: str(m.permalink),
            mediaType: str(m.media_type),
            timestamp: str(m.timestamp),
            likeCount: num(m.like_count),
            commentsCount: num(m.comments_count),
          }))
          .filter((m) => m.permalink))
        : [],
      retrievedAt: new Date().toISOString(),
    },
  };
}

/**
 * The fields this source is willing to assert about a business, as evidence.
 *
 * Deliberately short. A biography is the business describing itself and a
 * website is checkable; follower counts are an activity signal, not a fact
 * about the business, and the profile picture is not ours to reuse.
 */
export function evidenceFrom(profile: InstagramProfile): Array<{ field: string; value: string; confidence: number }> {
  const out: Array<{ field: string; value: string; confidence: number }> = [];
  if (profile.website) {
    // A website the business published on its own professional profile is
    // strong evidence that the website is theirs.
    out.push({ field: 'website', value: profile.website, confidence: 85 });
  }
  if (profile.biography) {
    out.push({ field: 'description', value: profile.biography, confidence: 60 });
  }
  if (profile.name) {
    out.push({ field: 'name', value: profile.name, confidence: 70 });
  }
  return out;
}
