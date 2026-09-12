import { supabase } from './supabase';

// Product event capture and client error reporting, self-hosted.
//
// The platform review scored Observability 2/10: two bugs last month were found
// by a human clicking, not by a system reporting. This is the smallest thing
// that fixes that.
//
// NAMED telemetry, NOT analytics, because src/lib/analytics.ts already exists
// and does something different — it derives marketing scores from planner,
// promo and review data. This module is raw event capture. Merging them would
// couple "what happened" to "how well are we doing".
//
// WHY NOT A VENDOR. A third-party analytics script means a new CSP host, a new
// supply-chain dependency on every page, and platform data leaving the
// jurisdiction. This writes to a table the app already holds a connection to.
// Less capable than a real analytics product; enough to answer "is anyone using
// this, and is it breaking".
//
// THREE RULES, because telemetry is where privacy leaks and where performance
// regressions hide:
//
//  1. NOTHING SENSITIVE. Props are allowlisted to primitives, length-capped,
//     and known-sensitive keys dropped outright — so a caller cannot ship an
//     email by spreading a user object into props.
//  2. NEVER BLOCK, NEVER THROW. Every failure is swallowed. Telemetry must not
//     be able to break a page; that would be a worse bug than the blindness it
//     is fixing.
//  3. BATCHED. Events queue and flush together, so instrumenting a list does
//     not fire thirty requests.

/** The events worth having. A closed set, so a typo is a type error. */
export type EventName =
  | 'signup'
  | 'signin'
  | 'business_created'
  | 'business_viewed'
  // A visitor acted on a listing's contact details. business_viewed alone
  // measures attention; this measures the outcome an owner is paying for.
  | 'business_contact_clicked'
  // Opening directions is a visit in progress. It was the largest untracked
  // connection on the platform: two links on the profile, neither counted.
  | 'directions_opened'
  // A Keep is the return mechanism, and the only connection that also lives as
  // a durable row. Tracked as an event too so the weekly number is one query.
  | 'business_kept'
  // An owner asked us to build their profile. The acquisition funnel's first
  // step, and the one worth watching: it needs no account, so it is the only
  // signal available before somebody commits to anything.
  // Somebody opened the send-business conversation. Paired with
  // profile_requested this is the only number that says whether three questions
  // is genuinely short enough, or whether people still walk away mid-way.
  | 'profile_request_started'
  | 'profile_requested'
  // Somebody sent a business that is not theirs. The second acquisition loop:
  // no owner has to be persuaded for a nomination to arrive, so it is counted
  // separately from a request an owner made about themselves.
  | 'business_nominated'
  // Somebody configured something on Create and asked for it. The first
  // demand signal the catalogue can produce, and the number that says whether
  // any of it is worth signing a printer for.
  | 'create_order_requested'
  // And said yes to the real price once we came back with it. The pair is the
  // only honest conversion rate Create has: how much of the demand survives
  // contact with a number somebody actually stood behind.
  | 'create_order_accepted'
  | 'search_performed'
  // Somebody clicked a result. Without this, "search success" can only mean
  // "results appeared", which §36 of the IQ mandate says is the wrong measure
  // — and which is how a directory convinces itself it is working while
  // nobody finds anything. Carries the rank, because a click at position 1
  // and a click at position 30 report very different ranking quality.
  | 'search_result_clicked'
  | 'enquiry_sent'
  | 'booking_started'
  | 'studio_export'
  // Somebody picked a design out of the public gallery on /media. The number
  // that says whether showing the work before the sign-in is what converts —
  // which was the whole bet in putting it there.
  | 'template_picked'
  | 'plan_viewed'
  // The Founding 1,000 campaign funnel. Kept in the same closed set as
  // everything else, so the campaign cannot invent an event name.
  | 'campaign_view'
  | 'campaign_cta_click'
  | 'campaign_share'
  | 'campaign_referral_joined'
  | 'client_error';

export type PropValue = string | number | boolean | null;
export type EventProps = Record<string, PropValue>;

export interface TelemetryEvent {
  name: EventName;
  props: EventProps;
  business_id?: string | null;
  session_id: string;
  path: string;
}

/**
 * Keys never sent, whatever a caller passes.
 *
 * Substring-matched because the risk is an accidental spread, not a deliberate
 * choice: `{...user}` brings `email` along without anyone deciding to send it.
 */
const BLOCKED_KEY = /email|phone|password|token|secret|key|address|name|lat|lng|dob|card/i;

const MAX_PROPS = 12;
const MAX_STRING = 120;
const MAX_QUEUE = 40;
const FLUSH_MS = 4000;

/**
 * How close two identical events have to be before the second is a duplicate.
 *
 * Two seconds is chosen against the failure it catches — an effect running
 * twice, a re-render, a handler bound twice — not against human behaviour.
 * Somebody genuinely viewing the same business twice inside two seconds is
 * not a distinct visit worth counting either.
 */
const DEDUP_MS = 2000;

/**
 * Events that describe a STATE, not an action, and so happen at most once in
 * a session however many times the code announces them.
 *
 * `signin` is here because of a measured incident: 43,354 events across 64
 * sessions — 677 each — from one emitter firing on every token refresh. That
 * emitter is fixed, but this is the guard that makes the class of mistake
 * impossible rather than the instance.
 */
const ONCE_PER_SESSION = new Set<EventName>(['signin', 'signup']);

/** Last-seen time per dedup key, pruned so it cannot grow without bound. */
const lastSeen = new Map<string, number>();
const firedThisSession = new Set<string>();

/**
 * What makes two events "the same".
 *
 * Includes props and business_id on purpose: viewing two different businesses
 * is two events, and searching two different terms is two searches. Only an
 * identical event about an identical object is a duplicate.
 */
export function dedupKey(name: string, props: EventProps, businessId: string | null, path: string): string {
  const keys = Object.keys(props).sort();
  const flat = keys.map((k) => `${k}=${String(props[k])}`).join('&');
  return `${name}|${businessId ?? ''}|${path}|${flat}`;
}

/**
 * True when this event should be dropped.
 *
 * Exported because it is the whole point of the module being trustworthy —
 * a dedup rule nobody can test is a rule nobody should believe.
 */
export function isDuplicate(
  name: EventName,
  key: string,
  now: number = Date.now(),
): boolean {
  if (ONCE_PER_SESSION.has(name)) {
    if (firedThisSession.has(name)) return true;
    firedThisSession.add(name);
    return false;
  }

  const seen = lastSeen.get(key);
  if (seen !== undefined && now - seen < DEDUP_MS) return true;

  lastSeen.set(key, now);

  // Prune anything older than the window. Bounded by the number of distinct
  // events in a two-second span, which is small.
  if (lastSeen.size > 200) {
    for (const [k, t] of lastSeen) {
      if (now - t >= DEDUP_MS) lastSeen.delete(k);
    }
  }
  return false;
}

/** Test seam: a fresh page is a fresh session. */
export function resetDedupForTests(): void {
  lastSeen.clear();
  firedThisSession.clear();
}

/**
 * Reduce props to what is safe and small.
 *
 * Exported because this is the privacy boundary — it should be provable rather
 * than trusted.
 */
export function sanitizeProps(input: unknown): EventProps {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: EventProps = {};
  let n = 0;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (n >= MAX_PROPS) break;
    if (BLOCKED_KEY.test(k)) continue;
    if (typeof v === 'string') {
      // Free text can contain anything a user typed, so it is capped hard.
      out[k] = v.slice(0, MAX_STRING);
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    } else if (typeof v === 'boolean' || v === null) {
      out[k] = v;
    } else {
      continue; // objects, functions, undefined, NaN
    }
    n++;
  }
  return out;
}

/** A path with ids replaced, so rows group per page rather than per record. */
export function normalizePath(path: string): string {
  return (path || '/')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:n')
    .slice(0, 120);
}

const SESSION_KEY = 'nowopen-telemetry-session';

/**
 * A random per-tab id.
 *
 * sessionStorage, not localStorage: a value that survives visits is a device
 * identifier however it is labelled. Falls back to memory in private mode.
 */
let memorySession = '';
export function sessionId(): string {
  try {
    const found = sessionStorage.getItem(SESSION_KEY);
    if (found) return found;
    const made = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(SESSION_KEY, made);
    return made;
  } catch {
    if (!memorySession) memorySession = Math.random().toString(36).slice(2);
    return memorySession;
  }
}

let queue: TelemetryEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let userId: string | null = null;

/** Set once auth resolves so later events attribute correctly. */
export function setTelemetryUser(id: string | null): void {
  userId = id;
}

export async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  if (timer) { clearTimeout(timer); timer = null; }

  try {
    await supabase.from('analytics_events').insert(
      batch.map(e => ({
        name: e.name,
        props: e.props,
        user_id: userId,
        business_id: e.business_id ?? null,
        session_id: e.session_id,
        path: e.path,
      })),
    );
  } catch {
    // Dropped deliberately. Retrying risks an unbounded queue on a flaky
    // connection, and a lost metric matters less than a slow page.
  }
}

/**
 * Is this a real environment whose events belong in the production table?
 *
 * It was not, and the production table proves it: `client_error` rows carry
 * stack traces reading `at Discover (http://localhost:5175/src/pages/...)` for
 * ReferenceErrors — `placeInput`, `useEffect`, `PRIMARY_NAV`, `fromUrl`,
 * `capabilityFrom` — that are development typos, unreachable in production and
 * long since fixed. Real incidents were buried under them, which defeats the
 * entire purpose of the module.
 *
 * Host-based rather than `import.meta.env.PROD`, because a preview deploy and
 * a `vite preview` build both report PROD while being just as much noise.
 */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|.*\.local)$/i;

export function shouldReport(hostname?: string): boolean {
  const host = hostname ?? (typeof location !== 'undefined' ? location.hostname : '');
  if (!host) return false;
  return !LOCAL_HOST.test(host);
}

export function track(name: EventName, props?: unknown, businessId?: string | null): void {
  // Development never writes to the production table. See shouldReport.
  if (!shouldReport()) return;
  try {
    const clean = sanitizeProps(props);
    const bid = businessId ?? null;
    const path = normalizePath(typeof location !== 'undefined' ? location.pathname : '/');

    // Dropped before the queue, so a burst cannot also trigger a flush.
    if (isDuplicate(name, dedupKey(name, clean, bid, path))) return;

    queue.push({
      name,
      props: clean,
      business_id: bid,
      session_id: sessionId(),
      path,
    });

    // A burst (a list, a loop) flushes at once rather than growing unbounded.
    if (queue.length >= MAX_QUEUE) { void flush(); return; }
    if (!timer) timer = setTimeout(() => { void flush(); }, FLUSH_MS);
  } catch {
    // Never allowed to surface.
  }
}

/** Trim a stack to something storable that is still useful. */
export function shortStack(stack: string | undefined, lines = 4): string {
  if (!stack) return '';
  return stack.split('\n').slice(0, lines).join(' | ').slice(0, 600);
}

export function reportError(source: string, err: unknown): void {
  const e = err as { message?: string; stack?: string } | undefined;
  track('client_error', {
    source,
    message: String(e?.message ?? err ?? 'unknown').slice(0, 200),
    stack: shortStack(e?.stack),
  });
  // The one thing not worth batching: the page may be about to die.
  void flush();
}

/**
 * Global handlers, plus a flush on the way out.
 *
 * `pagehide` and `visibilitychange` rather than `unload`, which does not fire
 * reliably on mobile Safari — a large share of this audience — so the last
 * events of a session would be lost exactly where they matter most.
 */
export function initTelemetry(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (ev) => {
    reportError('window.onerror', ev.error ?? { message: ev.message });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    reportError('unhandledrejection', (ev as PromiseRejectionEvent).reason);
  });
  window.addEventListener('pagehide', () => { void flush(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}

/** Test seam: drop anything queued without sending it. */
export function __resetTelemetry(): void {
  queue = [];
  if (timer) { clearTimeout(timer); timer = null; }
  userId = null;
}
