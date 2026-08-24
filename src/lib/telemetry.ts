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
  | 'search_performed'
  | 'enquiry_sent'
  | 'booking_started'
  | 'studio_export'
  | 'plan_viewed'
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

export function track(name: EventName, props?: unknown, businessId?: string | null): void {
  try {
    queue.push({
      name,
      props: sanitizeProps(props),
      business_id: businessId ?? null,
      session_id: sessionId(),
      path: normalizePath(typeof location !== 'undefined' ? location.pathname : '/'),
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
