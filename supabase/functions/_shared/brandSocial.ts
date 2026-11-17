/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Derived from src/lib/brandSocial.ts by scripts/sync-brand-social.mjs.
 * Edit the source and run `npm run sync:brand-social`; `npm run verify`
 * fails if this file and its source have drifted.
 *
 * The admin screen and the dispatcher must agree on what may be posted as the
 * brand. Two hand-maintained copies would eventually disagree.
 */

/**
 * Brand social — the rules a post for NowOpen Africa's OWN accounts must pass
 * before anyone can send it to Zoho.
 *
 * Pure functions only, so the admin screen and the dispatcher agree, and so
 * every rule is pinned by a test. The dispatcher re-runs `checkVariant` on the
 * server; the UI's copy of the result is a convenience, never the authority.
 *
 * Three severities:
 *   block     — cannot be sent. Too long, missing required media, an unfilled
 *               [placeholder], the retired "List your business" wording.
 *   sensitive — can be sent, but only by a person, never by automation: a
 *               number, a superlative, a partner, a price, a testimonial.
 *               These are the claims the honesty rules say must be verified.
 *   warn      — worth a look: no call to action, close to another post.
 */

export type ChannelId =
  | 'instagram' | 'facebook' | 'tiktok' | 'linkedin_company' | 'linkedin_profile'
  | 'x' | 'threads' | 'youtube' | 'pinterest' | 'whatsapp';

export type MediaKind = 'image' | 'video';

export interface ChannelRule {
  label: string;
  maxChars: number;
  /** Media the network will not post without. */
  requires?: MediaKind | 'image_or_video';
  maxHashtags?: number;
  /** Links in the caption are not clickable here (Instagram, TikTok). */
  linkNotClickable?: boolean;
  /** UTM source value for this channel. */
  utmSource: string;
}

/**
 * Limits as each network documents them. A wrong limit here would let a post
 * through that the network then truncates or rejects, so keep them strict.
 */
export const CHANNEL_RULES: Record<ChannelId, ChannelRule> = {
  instagram:        { label: 'Instagram',             maxChars: 2200,  requires: 'image_or_video', maxHashtags: 30, linkNotClickable: true, utmSource: 'instagram' },
  facebook:         { label: 'Facebook Page',         maxChars: 63206, utmSource: 'facebook' },
  tiktok:           { label: 'TikTok',                maxChars: 2200,  requires: 'video', linkNotClickable: true, utmSource: 'tiktok' },
  linkedin_company: { label: 'LinkedIn Company Page', maxChars: 3000,  utmSource: 'linkedin' },
  linkedin_profile: { label: 'LinkedIn Profile',      maxChars: 3000,  utmSource: 'linkedin' },
  x:                { label: 'X',                     maxChars: 280,   utmSource: 'x' },
  threads:          { label: 'Threads',               maxChars: 500,   utmSource: 'threads' },
  youtube:          { label: 'YouTube',               maxChars: 5000,  requires: 'video', utmSource: 'youtube' },
  pinterest:        { label: 'Pinterest',             maxChars: 500,   requires: 'image', utmSource: 'pinterest' },
  whatsapp:         { label: 'WhatsApp Business',     maxChars: 1024,  utmSource: 'whatsapp' },
};

export const BRAND_TIMEZONE = 'Africa/Lagos';
export const SITE_ORIGIN = 'https://www.nowopenafrica.com';

export type Severity = 'block' | 'sensitive' | 'warn';
export interface Check { severity: Severity; code: string; message: string }

// ── Media ────────────────────────────────────────────────────────────────────

export function mediaKind(url: string | null | undefined): MediaKind | null {
  if (!url) return null;
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(mp4|mov|m4v|webm)$/.test(path)) return 'video';
  if (/\.(jpe?g|png|webp|gif)$/.test(path)) return 'image';
  return null;
}

// ── Length ───────────────────────────────────────────────────────────────────

/** X counts every link as 23 characters, whatever its real length. */
export function countChars(channel: ChannelId, text: string): number {
  const chars = [...text].length;
  if (channel !== 'x') return chars;
  const urls = text.match(/https?:\/\/\S+/g) ?? [];
  return urls.reduce((n, u) => n - [...u].length + 23, chars);
}

// ── Claims the honesty rules care about ──────────────────────────────────────

const SENSITIVE_PATTERNS: Array<{ code: string; re: RegExp; message: string }> = [
  {
    code: 'number_claim',
    re: /\b\d[\d,.]*\s*(\+|k|m|million|thousand|%|percent)?\s*(users?|businesses|customers|members|downloads|sign-?ups|listings|followers|countries|cities|merchants|vendors)\b/i,
    message: 'States a number of users, businesses or similar. Confirm it from live data and note the source in Evidence.',
  },
  {
    code: 'percent_claim',
    // No \b after %: it is not a word character, so a boundary never follows it.
    re: /\b\d[\d.]*\s*(%|percent\b)/i,
    message: 'Contains a percentage. Confirm where it comes from.',
  },
  {
    // No digits, so number_claim misses it, but it is still a statistic.
    code: 'crowd_claim',
    re: /\b(the majority of|most (people|customers|shoppers|consumers|businesses|owners|africans|nigerians)|millions of|thousands of|everyone (is|uses|searches))\b/i,
    message: 'Says how many people do something (“most customers”, “millions of”). Give a source in Evidence or reword it.',
  },
  {
    code: 'superlative',
    re: /(#1\b|\bnumber one\b|\bleading\b|\blargest\b|\bbiggest\b|\bbest in\b|\bfirst in africa\b|\bonly platform\b|\bmost trusted\b)/i,
    message: 'Makes a ranking or "first/only/biggest" claim. These need evidence or rewording.',
  },
  {
    code: 'partner_claim',
    re: /\b(partner(ed|ship|s)?\s+with|in partnership|backed by|trusted by|endorsed by|powered by)\b/i,
    message: 'Names a partner, backer or endorsement. Needs written confirmation before it is public.',
  },
  {
    code: 'price_claim',
    re: /(₦|\bngn\b|\$|\bkes\b|\bghs\b|\bzar\b|\bfree trial\b|\b\d+\s*% off\b|\bdiscount\b|\bguarantee(d)?\b)/i,
    message: 'Mentions a price, discount or guarantee. Pricing claims always need the founder’s approval.',
  },
  {
    code: 'testimonial',
    re: /[“"][^”"]{12,}[”"]\s*(—|-|–)?\s*(said|says|according to)?/i,
    message: 'Looks like a quotation or testimonial. Only publish real, consented quotes.',
  },
  {
    code: 'announcement',
    re: /\b(announc(e|ing|ement)|launch(es|ed|ing)? (today|now)|now live|available now)\b/i,
    message: 'Reads as an announcement. Confirm the feature is actually live today.',
  },
];

const CTA_RE = /\b(add your business|claim (your|it|the)|discover|find|explore|sign up|join|visit|book|learn more|see how|try)\b/i;

// ── The checker ──────────────────────────────────────────────────────────────

export interface VariantInput {
  channel: ChannelId;
  caption: string;
  mediaUrl?: string | null;
  destinationUrl?: string | null;
}

export function checkVariant(v: VariantInput): Check[] {
  const rule = CHANNEL_RULES[v.channel];
  const out: Check[] = [];
  const text = v.caption ?? '';

  if (!text.trim()) {
    out.push({ severity: 'block', code: 'empty', message: 'The caption is empty.' });
    return out;
  }

  const n = countChars(v.channel, text);
  if (n > rule.maxChars) {
    out.push({ severity: 'block', code: 'too_long', message: `${n} characters; ${rule.label} allows ${rule.maxChars}.` });
  }

  const tags = text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? [];
  if (rule.maxHashtags && tags.length > rule.maxHashtags) {
    out.push({ severity: 'block', code: 'too_many_hashtags', message: `${tags.length} hashtags; ${rule.label} allows ${rule.maxHashtags}.` });
  }

  const kind = mediaKind(v.mediaUrl);
  if (v.mediaUrl && !kind) {
    out.push({ severity: 'block', code: 'media_unknown', message: 'The media link is not a recognised image or video file.' });
  }
  if (rule.requires === 'video' && kind !== 'video') {
    out.push({ severity: 'block', code: 'needs_video', message: `${rule.label} needs a finished video.` });
  } else if (rule.requires === 'image' && kind !== 'image') {
    out.push({ severity: 'block', code: 'needs_image', message: `${rule.label} needs a finished image.` });
  } else if (rule.requires === 'image_or_video' && !kind) {
    out.push({ severity: 'block', code: 'needs_media', message: `${rule.label} needs a finished image or video.` });
  }

  if (/\[[^\]]+\]/.test(text)) {
    out.push({ severity: 'block', code: 'placeholder', message: 'Contains an unfilled [placeholder]. Replace it with the confirmed fact, or remove it.' });
  }

  if (/list your business/i.test(text)) {
    out.push({ severity: 'block', code: 'old_cta', message: 'Uses “List your business”. The call to action is “Add your business”.' });
  }

  for (const p of SENSITIVE_PATTERNS) {
    if (p.re.test(text)) out.push({ severity: 'sensitive', code: p.code, message: p.message });
  }

  if (!CTA_RE.test(text) && !v.destinationUrl) {
    out.push({ severity: 'warn', code: 'no_cta', message: 'No call to action or link. Say what the reader should do next.' });
  }

  if (rule.linkNotClickable && /https?:\/\//.test(text)) {
    out.push({ severity: 'warn', code: 'link_not_clickable', message: `Links are not clickable in ${rule.label} captions. Point to the link in bio instead.` });
  }

  return out;
}

export const isBlocked = (checks: Check[]) => checks.some((c) => c.severity === 'block');
export const isSensitive = (checks: Check[]) => checks.some((c) => c.severity === 'sensitive');

// ── Tracked links ────────────────────────────────────────────────────────────

/**
 * Adds UTM tags to links on our own site so a visit, a registration or a
 * claim can be traced back to the post. Links to other sites are returned
 * untouched; tagging somebody else's URL tells us nothing and is rude.
 */
export function trackedUrl(
  destination: string | null | undefined,
  channel: ChannelId,
  campaignSlug: string,
  contentCode: string,
): string | null {
  if (!destination) return null;
  let url: URL;
  try {
    url = new URL(destination, SITE_ORIGIN);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'nowopenafrica.com') return url.toString();
  // The bare host 308-redirects to www; send people straight to the canonical one.
  url.hostname = 'www.nowopenafrica.com';
  url.protocol = 'https:';
  url.searchParams.set('utm_source', CHANNEL_RULES[channel].utmSource);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', campaignSlug || 'always-on');
  url.searchParams.set('utm_content', contentCode);
  return url.toString();
}

// ── Lagos time ───────────────────────────────────────────────────────────────

/** "2026-10-29" for the Lagos calendar day an instant falls on. */
export function lagosDay(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-CA', { timeZone: BRAND_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "Thu 29 Oct, 09:30" in Lagos time, for screens. */
export function formatLagos(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BRAND_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

/**
 * The UTC instant for a Lagos wall-clock time typed into a form
 * ("2026-10-29T09:30"). Lagos has no daylight saving, but the offset is still
 * read from the time zone database rather than hard-coded.
 */
export function lagosLocalToUtc(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BRAND_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return new Date(guess - (shown - guess)).toISOString();
}

/** The inverse, for filling the form: "2026-10-29T09:30". */
export function utcToLagosLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BRAND_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${String(Number(get('hour')) % 24).padStart(2, '0')}:${get('minute')}`;
}

// ── Duplicates and the daily ceiling ─────────────────────────────────────────

function tokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[#@]/g, ' ')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  );
}

/** Share of words two captions have in common (Jaccard, 0–1). */
export function similarity(a: string, b: string): number {
  const A = tokens(a); const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

export interface CalendarEntry { id: string; channel: ChannelId; at: string; caption: string }

/** Captions on the same channel within 14 days that say nearly the same thing. */
export function findNearDuplicates(
  candidate: CalendarEntry,
  calendar: CalendarEntry[],
  threshold = 0.8,
  windowDays = 14,
): CalendarEntry[] {
  const t = new Date(candidate.at).getTime();
  return calendar.filter((e) =>
    e.id !== candidate.id
    && e.channel === candidate.channel
    && Math.abs(new Date(e.at).getTime() - t) <= windowDays * 86_400_000
    && similarity(e.caption, candidate.caption) >= threshold);
}

/** How many posts are already on this channel on the candidate's Lagos day. */
export function postsThatDay(candidate: CalendarEntry, calendar: CalendarEntry[]): number {
  const day = lagosDay(candidate.at);
  return calendar.filter((e) => e.id !== candidate.id && e.channel === candidate.channel && lagosDay(e.at) === day).length;
}
