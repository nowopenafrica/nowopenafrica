// Live Business Canvas — the binding layer that turns a static design into a
// living one.
//
// Any text slot in the Creative Studio can hold tokens like {{business.status}}
// or {{promo.ends}}. They resolve against the business profile at render time,
// so a design stays accurate after the facts change: opening hours, the active
// promotion, the current rating, the top product's price.
//
// What "live" honestly means, per surface:
//   • In-app preview and re-export  — always current, resolved on every render.
//   • A hosted render URL           — current every time it's fetched, so a link
//                                     shared to WhatsApp/social stays right.
//   • A downloaded PNG / print run  — frozen at export time. The QR still points
//                                     at the live profile, but the pixels don't
//                                     change. Never promise otherwise.
//
// This module is deliberately pure: no I/O, no React, no storage. Callers build
// a LiveCanvasContext from wherever the data actually lives (Supabase, the clock
// config in localStorage, the promos list) and hand it in — same contract as
// designCoach.ts, and the reason this is cheap to test.

import type { Business } from '../types';
import type { BusinessStatus } from './businessStatus';
import { STATUS_META, formatMinutes, parseMinutes, WEEKDAY_LABELS_FULL } from './businessStatus';

// ---------------------------------------------------------------------------
// Token registry
// ---------------------------------------------------------------------------

export type LiveTokenGroup = 'Business' | 'Offer' | 'Catalogue';

export interface LiveToken {
  /** Token body as authored, e.g. 'business.status' for {{business.status}}. */
  key: string;
  label: string;
  group: LiveTokenGroup;
  /** One-line explanation shown in the insert menu. */
  desc: string;
  /**
   * Shown when the source has no value. A design must never export a raw
   * {{token}}, so every known token has a sensible standing-in phrase.
   */
  fallback: string;
}

export const LIVE_TOKENS: LiveToken[] = [
  // Business ---------------------------------------------------------------
  { key: 'business.name', label: 'Business name', group: 'Business', desc: 'Your profile name.', fallback: 'Your business' },
  { key: 'business.status', label: 'Open / Closed', group: 'Business', desc: 'Live status from your Business Clock.', fallback: 'Open' },
  { key: 'business.hours', label: "Today's hours", group: 'Business', desc: "Today's opening window.", fallback: 'See profile for hours' },
  { key: 'business.day', label: 'Today (weekday)', group: 'Business', desc: 'The current day name.', fallback: 'Today' },
  { key: 'business.phone', label: 'Phone', group: 'Business', desc: 'Your listed phone number.', fallback: 'Call us' },
  { key: 'business.whatsapp', label: 'WhatsApp', group: 'Business', desc: 'WhatsApp number (uses your phone).', fallback: 'Message us' },
  { key: 'business.website', label: 'Website', group: 'Business', desc: 'Your website, without the https://.', fallback: 'nowopen.africa' },
  { key: 'business.address', label: 'Address', group: 'Business', desc: 'Your listed location.', fallback: 'Find us on NowOpen' },
  { key: 'business.category', label: 'Category', group: 'Business', desc: 'Your primary business category.', fallback: 'Business' },
  { key: 'business.rating', label: 'Rating', group: 'Business', desc: 'Star rating as a number, e.g. 4.8.', fallback: 'New' },
  { key: 'business.ratingLine', label: 'Rating + reviews', group: 'Business', desc: 'e.g. "4.8★ · 57 reviews".', fallback: 'Newly listed' },
  // Offer ------------------------------------------------------------------
  { key: 'promo.title', label: 'Active promo title', group: 'Offer', desc: 'The promotion running right now.', fallback: 'Special offer' },
  { key: 'promo.offer', label: 'Active promo offer', group: 'Offer', desc: 'The offer line, e.g. "20% off".', fallback: 'Great value' },
  { key: 'promo.ends', label: 'Promo end date', group: 'Offer', desc: 'e.g. "Ends Sunday 9 August".', fallback: 'While stocks last' },
  { key: 'promo.daysLeft', label: 'Days remaining', group: 'Offer', desc: 'e.g. "3 days left".', fallback: 'Limited time' },
  // Catalogue --------------------------------------------------------------
  { key: 'product.top', label: 'Featured product', group: 'Catalogue', desc: 'First item in your catalogue.', fallback: 'Our bestseller' },
  { key: 'product.topPrice', label: 'Featured price', group: 'Catalogue', desc: 'That item’s price.', fallback: 'Ask for pricing' },
  { key: 'product.count', label: 'Catalogue size', group: 'Catalogue', desc: 'How many items you list.', fallback: 'Full range' },
];

const TOKEN_BY_KEY = new Map(LIVE_TOKENS.map((t) => [t.key.toLowerCase(), t]));

export function liveTokenByKey(key: string): LiveToken | undefined {
  return TOKEN_BY_KEY.get(key.trim().toLowerCase());
}

/** Tokens grouped for the insert menu, in registry order. */
export function liveTokenGroups(): { group: LiveTokenGroup; tokens: LiveToken[] }[] {
  const order: LiveTokenGroup[] = ['Business', 'Offer', 'Catalogue'];
  return order.map((group) => ({ group, tokens: LIVE_TOKENS.filter((t) => t.group === group) }));
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface LivePromoLike {
  title: string;
  offer: string;
  /** YYYY-MM-DD */
  endsAt: string;
}

export interface LiveProductLike {
  name: string;
  price?: string | null;
}

export interface LiveCanvasContext {
  business: Business;
  now: Date;
  /** Resolved live status; omit to fall back to the profile's own status. */
  status?: BusinessStatus | null;
  /** Today's hours as {open,close} minutes-of-day strings, e.g. '08:00'. */
  todayHours?: { open: string; close: string; closed: boolean } | null;
  /** The promotion currently running, if any. */
  promo?: LivePromoLike | null;
  /** Catalogue items, first is treated as featured. */
  products?: LiveProductLike[] | null;
  /** Review count, since it isn't part of the Business row. */
  reviewCount?: number | null;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Matches {{ token.key }} with optional inner whitespace. Deliberately narrow:
 * only word chars and dots inside, so a stray brace in real copy ("{{ sale }}!")
 * can't swallow the rest of the line or backtrack badly.
 */
const TOKEN_RE = /\{\{\s*([a-zA-Z][\w]*(?:\.[\w]+)*)\s*\}\}/g;

export function hasLiveTokens(text: string): boolean {
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(text || '');
}

/** Every token key referenced in `text`, in order, including duplicates. */
export function listTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of (text || '').matchAll(TOKEN_RE)) out.push(m[1]);
  return out;
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/**
 * Whole calendar days from `from` until the end date — not elapsed hours. An
 * offer ending tonight reads "Ends today" (0), not "1 day left", which is what
 * a shopper means by it. Negative when the date has already passed.
 */
function daysBetween(from: Date, toIso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toIso.trim());
  if (!m) return null;
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(end.getTime())) return null;
  const startOfToday = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((end.getTime() - startOfToday.getTime()) / 86_400_000);
}

function formatEndDate(iso: string): string | null {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `${WEEKDAY_LABELS_FULL[d.getDay()]} ${d.getDate()} ${d.toLocaleString('en', { month: 'long' })}`;
}

export interface TokenResolution {
  /** The text to render. Never a raw token for a known key. */
  value: string;
  /** False when the source had no data and the fallback was used. */
  resolved: boolean;
}

/**
 * Resolve one token key against the context.
 * Returns null for keys that aren't in the registry — callers decide how loudly
 * to complain (see resolveLiveText, which reports them as `unknown`).
 */
export function resolveToken(key: string, ctx: LiveCanvasContext): TokenResolution | null {
  const token = liveTokenByKey(key);
  if (!token) return null;

  const b = ctx.business;
  const ok = (value: string | null | undefined): TokenResolution =>
    value && String(value).trim()
      ? { value: String(value).trim(), resolved: true }
      : { value: token.fallback, resolved: false };

  switch (token.key) {
    case 'business.name':
      return ok(b.name);
    case 'business.status': {
      const status = ctx.status ?? null;
      if (!status) return ok(null);
      // "Open Now" reads better on a poster than the UI chip's bare "Open".
      return { value: status === 'open' ? 'Open Now' : STATUS_META[status].label, resolved: true };
    }
    case 'business.hours': {
      const h = ctx.todayHours;
      if (!h) return ok(b.hours);
      if (h.closed) return { value: 'Closed today', resolved: true };
      const open = parseMinutes(h.open);
      const close = parseMinutes(h.close);
      if (open === null || close === null) return ok(b.hours);
      return { value: `${formatMinutes(open)} – ${formatMinutes(close)}`, resolved: true };
    }
    case 'business.day':
      return { value: WEEKDAY_LABELS_FULL[ctx.now.getDay()], resolved: true };
    case 'business.phone':
      return ok(b.phone);
    case 'business.whatsapp':
      return ok(b.phone);
    case 'business.website':
      return b.website ? { value: stripProtocol(b.website), resolved: true } : ok(null);
    case 'business.address':
      return ok(b.location);
    case 'business.category':
      return ok(b.category);
    case 'business.rating':
      return typeof b.rating === 'number' && b.rating > 0
        ? { value: b.rating.toFixed(1), resolved: true }
        : ok(null);
    case 'business.ratingLine': {
      if (typeof b.rating !== 'number' || b.rating <= 0) return ok(null);
      const stars = `${b.rating.toFixed(1)}★`;
      const n = ctx.reviewCount ?? null;
      return {
        value: n && n > 0 ? `${stars} · ${n} review${n === 1 ? '' : 's'}` : stars,
        resolved: true,
      };
    }
    case 'promo.title':
      return ok(ctx.promo?.title);
    case 'promo.offer':
      return ok(ctx.promo?.offer);
    case 'promo.ends': {
      if (!ctx.promo?.endsAt) return ok(null);
      const label = formatEndDate(ctx.promo.endsAt);
      return label ? { value: `Ends ${label}`, resolved: true } : ok(null);
    }
    case 'promo.daysLeft': {
      if (!ctx.promo?.endsAt) return ok(null);
      const d = daysBetween(ctx.now, ctx.promo.endsAt);
      if (d === null || d < 0) return ok(null);
      if (d === 0) return { value: 'Ends today', resolved: true };
      return { value: `${d} day${d === 1 ? '' : 's'} left`, resolved: true };
    }
    case 'product.top':
      return ok(ctx.products?.[0]?.name);
    case 'product.topPrice':
      return ok(ctx.products?.[0]?.price ?? null);
    case 'product.count': {
      const n = ctx.products?.length ?? 0;
      return n > 0 ? { value: `${n} item${n === 1 ? '' : 's'}`, resolved: true } : ok(null);
    }
    default:
      return null;
  }
}

export interface LiveTextResult {
  /** Fully resolved text, safe to render or export. */
  text: string;
  /** Known tokens that resolved against real data. */
  live: string[];
  /** Known tokens that fell back — the design references data you don't have. */
  stale: string[];
  /** Tokens that aren't in the registry (typos). Left verbatim in `text`. */
  unknown: string[];
}

/**
 * Resolve every token in `text`.
 *
 * Known-but-empty tokens become their fallback, so an export can never show a
 * raw `{{promo.title}}`. Unknown keys are left *verbatim* on purpose: a typo
 * should be visible in the editor and flagged by the coach rather than silently
 * deleted, which would quietly drop the owner's words.
 */
export function resolveLiveText(text: string, ctx: LiveCanvasContext): LiveTextResult {
  const live: string[] = [];
  const stale: string[] = [];
  const unknown: string[] = [];

  const out = (text || '').replace(TOKEN_RE, (raw, key: string) => {
    const res = resolveToken(key, ctx);
    if (!res) {
      if (!unknown.includes(key)) unknown.push(key);
      return raw;
    }
    const canonical = liveTokenByKey(key)!.key;
    const bucket = res.resolved ? live : stale;
    if (!bucket.includes(canonical)) bucket.push(canonical);
    return res.value;
  });

  return { text: out, live, stale, unknown };
}

/** Resolve a whole set of slots at once, merging the reports. */
export function resolveLiveSlots<K extends string>(
  slots: Record<K, string>,
  ctx: LiveCanvasContext,
): { values: Record<K, string>; live: string[]; stale: string[]; unknown: string[] } {
  const values = {} as Record<K, string>;
  const live = new Set<string>();
  const stale = new Set<string>();
  const unknown = new Set<string>();

  for (const k of Object.keys(slots) as K[]) {
    const r = resolveLiveText(slots[k], ctx);
    values[k] = r.text;
    r.live.forEach((t) => live.add(t));
    r.stale.forEach((t) => stale.add(t));
    r.unknown.forEach((t) => unknown.add(t));
  }
  // A token that resolved in one slot isn't stale just because another slot
  // used it too — real data wins.
  for (const t of live) stale.delete(t);

  return { values, live: [...live], stale: [...stale], unknown: [...unknown] };
}

/** Wrap a key as an authored token, ready to splice into a text field. */
export const tokenText = (key: string): string => `{{${key}}}`;

/**
 * Insert a token into `text` at `caret` (end of string when omitted), adding a
 * single separating space where one is needed.
 */
export function insertToken(text: string, key: string, caret?: number): string {
  const src = text || '';
  const at = caret === undefined || caret < 0 || caret > src.length ? src.length : caret;
  const before = src.slice(0, at);
  const after = src.slice(at);
  const token = tokenText(key);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const trail = after && !/^\s/.test(after) ? ' ' : '';
  return `${before}${lead}${token}${trail}${after}`;
}

/**
 * One-line summary for the editor: how live is this design?
 * `bound` counts distinct known tokens in use.
 */
export function liveCanvasSummary(result: {
  live: string[];
  stale: string[];
  unknown: string[];
}): { bound: number; label: string; level: 'none' | 'live' | 'partial' | 'error' } {
  const bound = result.live.length + result.stale.length;
  if (result.unknown.length) {
    return { bound, label: `Unknown token: {{${result.unknown[0]}}}`, level: 'error' };
  }
  if (!bound) return { bound: 0, label: 'Static design — nothing linked yet', level: 'none' };
  if (result.stale.length) {
    return {
      bound,
      label: `${result.live.length} of ${bound} linked fields have live data`,
      level: 'partial',
    };
  }
  return { bound, label: `${bound} field${bound === 1 ? '' : 's'} linked to your profile`, level: 'live' };
}
