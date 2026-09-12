// Hours resolution for the enrichment engine.
//
// A source (OpenStreetMap, a parsed website) reports the business's hours as
// STRUCTURED entries — day ranges and open/close minutes. This module turns
// those entries into the canonical stored text and decides what the engine may
// PROPOSE given what the business already has.
//
// CANONICAL TEXT: the same format the owner editor stores — "Mon–Fri: 9AM–6PM
// · Sat: 10AM–4PM" with en-dashes. Right then the app's parseOpeningHours can
// read back whatever this engine proposes, so a proposal never leaves the
// business with hours its own UI cannot parse. This file deliberately holds NO
// dependency on src/lib/openingHours.ts: it must run in the Deno edge function
// as well as under Vitest.
//
// The confirmed-vs-default rule (§2 of the enrichment spec) lives here: a
// source observation NEVER upgrades a default to "24/7 confirmed". It either
// proposes real hours (which supersede the default via a proposal approval,
// flipping availability_mode back to derived in the trigger) or it stays quiet.

export type WeekdayToken = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

/** One structured entry as a source reports it. */
export interface SourceHoursEntry {
  days: WeekdayToken[];
  open: number;   // minutes from midnight
  close: number;  // minutes from midnight; close <= open means overnight
  /** True when the source explicitly says the business never closes. */
  alwaysOpen?: boolean;
}

const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export interface DayHours {
  open: number | null;
  close: number | null;
}

/** Fold entries into the 7-slot week the formatter expects (index = Date#getDay). */
export function weekFromEntries(entries: SourceHoursEntry[]): { week: DayHours[]; alwaysOpen: boolean } {
  const alwaysOpen = entries.some((e) => e.alwaysOpen);
  const week: DayHours[] = Array.from({ length: 7 }, () => ({ open: null, close: null }));
  if (alwaysOpen) return { week, alwaysOpen };

  for (const e of entries) {
    for (const token of e.days) {
      const idx = DAY_INDEX[token];
      if (idx === undefined) continue;
      // A day listed twice: later entry wins (matches the app parser's behaviour).
      week[idx] = { open: e.open, close: e.close };
    }
  }
  return { week, alwaysOpen: false };
}

/** "9AM"/"9:30AM"/"12PM" — the style the app already stores. */
export function minutesToLabel(mins: number): string {
  const total = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

const WEEK_ORDER: readonly { index: number; label: string }[] = [
  { index: 1, label: 'Mon' }, { index: 2, label: 'Tue' }, { index: 3, label: 'Wed' },
  { index: 4, label: 'Thu' }, { index: 5, label: 'Fri' }, { index: 6, label: 'Sat' },
  { index: 0, label: 'Sun' },
];

/** Render a week to the canonical stored text, collapsing shared consecutive days. */
export function formatHoursWeek(days: DayHours[], alwaysOpen = false): string {
  if (alwaysOpen) return 'Open 24/7';

  type Run = { from: string; to: string; open: number; close: number; endPos: number };
  const runs: Run[] = [];
  WEEK_ORDER.forEach(({ index, label }, pos) => {
    const d = days[index];
    if (!d || d.open === null || d.close === null) return;
    const last = runs[runs.length - 1];
    if (last && last.open === d.open && last.close === d.close && last.endPos === pos - 1) {
      last.to = label;
      last.endPos = pos;
      return;
    }
    runs.push({ from: label, to: label, open: d.open, close: d.close, endPos: pos });
  });

  return runs
    .map((r) => {
      const dayPart = r.from === r.to ? r.from : `${r.from}–${r.to}`;
      return `${dayPart}: ${minutesToLabel(r.open)}–${minutesToLabel(r.close)}`;
    })
    .join(' · ');
}

/** The canonical text the engine would store, or null when nothing to store. */
export function canonicalHoursText(entries: SourceHoursEntry[]): string | null {
  const { week, alwaysOpen } = weekFromEntries(entries);
  if (alwaysOpen) return 'Open 24/7';
  if (week.every((d) => d.open === null || d.close === null)) return null;
  return formatHoursWeek(week) || null;
}

/**
 * Compare two hour texts ignoring the cosmetic differences (en-dash vs hyphen,
 * spacing, 12h/24h casing). Text rendered by the same formatter twice should
 * compare equal.
 */
export function hoursTextEqual(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, '');
  return norm(a) === norm(b);
}

export type HoursResolutionKind =
  | 'no_change'          // proposed == stored (modulo canonicalisation)
  | 'proposal'           // propose adopting the source hours
  | 'default_remains'    // source says 24/7 but business runs the unconfirmed default — stay quiet
  | 'skip_confirmed'     // owner already confirmed something; leave it alone
  | 'skip_conflict';     // source contradicts an owner-confirmed value; flag for a person

export interface HoursResolution {
  kind: HoursResolutionKind;
  proposedText?: string | null;
  reason: string;
  /** Deterministic confidence for the evidence row if we record one. */
  confidence: number;
}

const IS_247 = /24\s*\/\s*7|24 ?hours|always open/i;

/** True when the stored text (or mode) reads as the unconfirmed default. */
const isDefault247 = (b: { opening_hours?: string | null; hours?: string | null; availability_mode?: string | null }): boolean =>
  b.availability_mode === 'default_24_7'
  || (b.availability_mode === 'default_24_7' && !(b.opening_hours || b.hours));

/**
 * Decide what the engine may do with source hours for this business.
 *
 * `ownerConfirmed` means the row carries a confirmation (data_confidence =
 * owner_confirmed / admin_verified, or availability_mode = confirmed):
 * owner-set content is never overwritten by a machine without asking. In that
 * case differing source hours become a proposal for A PERSON — labeled so —
 * and matching ones become nothing.
 */
export function resolveHours(
  business: { opening_hours?: string | null; hours?: string | null; availability_mode?: string | null; data_confidence?: string | null },
  sourceEntries: SourceHoursEntry[],
  opts: { sourceName?: string; ownerConfirmed?: boolean } = {},
): HoursResolution {
  const ownerConfirmed = opts.ownerConfirmed
    ?? ['owner_confirmed', 'admin_verified'].includes(business.data_confidence ?? '')
    ?? business.availability_mode === 'confirmed';

  const proposed = canonicalHoursText(sourceEntries);
  const existing = (business.opening_hours || business.hours || '').trim();

  if (!proposed) return { kind: 'skip_conflict', reason: 'Source produced no parseable hours.', confidence: 0 };

  const proposedIs247 = IS_247.test(proposed);
  const existingIsDefault = isDefault247(business);

  if (existing && hoursTextEqual(proposed, existing)) {
    return { kind: 'no_change', reason: 'Source hours match what is already stored.', confidence: 80 };
  }

  if (existingIsDefault && proposedIs247) {
    return { kind: 'default_remains', reason: 'Source agrees with the 24/7 default; hours are still unconfirmed.', confidence: 0 };
  }

  if (ownerConfirmed && existing && !existingIsDefault) {
    return {
      kind: 'skip_conflict',
      reason: 'Source hours conflict with owner-set hours; leaving the owner value and flagging for review.',
      confidence: 55,
    };
  }

  return {
    kind: 'proposal',
    proposedText: proposed,
    reason: `${opts.sourceName ?? 'Source'} reports hours that differ from what this business has.`,
    confidence: 80,
  };
}