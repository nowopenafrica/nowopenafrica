// OpenStreetMap `opening_hours` → the engine's structured entries.
//
// OSM cards list hours in a compact, 24h notation ("Mo-Fr 08:30-17:00; Sa
// 09:00-13:00" or "24/7") that neither the app parser nor the owner editor
// reads. This parser translates the SUBSET a reconciliation flow actually
// meets into SourceHoursEntry[] so the rest of the engine treats OSM like any
// other structured source. It is deliberately conservative: anything it
// cannot attribute to concrete days and minutes produces no entry — a wrong
// hour is worse than no hour.

import type { SourceHoursEntry, WeekdayToken } from './hours.ts';

const DAY_NAMES: WeekdayToken[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// OSM uses two-letter abbreviations (Mo Tu We Th Fr Sa Su); the engine's
// WeekdayToken uses the full three-letter names, so map abbreviations here.
const INDEX: Record<string, number> = { mo: 0, tu: 1, we: 2, th: 3, fr: 4, sa: 5, su: 6 };

/** Expand "mo-fr" (inclusive, wrapping allowed) to the concrete day tokens. */
function expand(token: string): WeekdayToken[] {
  const m = /^([a-z]{2})(?:\s*-\s*([a-z]{2}))?$/.exec(token.trim().toLowerCase());
  if (!m) return [];
  const from = INDEX[m[1]];
  if (from === undefined) return [];
  if (!m[2]) return [DAY_NAMES[from]];
  const to = INDEX[m[2]];
  if (to === undefined) return [];
  const out: string[] = [];
  let i = from;
  for (let guard = 0; guard < 7; guard++) {
    out.push(DAY_NAMES[i]);
    if (i === to) break;
    i = (i + 1) % 7;
  }
  return out as WeekdayToken[];
}

/** "08:30" -> minutes from midnight; "24:00" -> 1440. Null when malformed. */
function parseOsmTime(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  if (h === 24 && min !== 0) return null;
  return h * 60 + min;
}

export function parseOsmHours(text: string | null | undefined): SourceHoursEntry[] | null {
  const src = (text ?? '').trim();
  if (!src) return null;

  // 24/7 — sometimes written "24/7", "00:00-24:00" or "(Mo-Su) 00:00-24:00".
  const alwaysTwentyFour = /24\s*\/\s*7/.test(src.toLowerCase());
  if (alwaysTwentyFour) {
    return [{ days: [...DAY_NAMES], open: 0, close: 1440, alwaysOpen: true }];
  }

  const entries: SourceHoursEntry[] = [];

  for (const group of src.split(';')) {
    let g = group.trim();
    if (!g) continue;

    // Closed / off groups produce no hours.
    if (/^\s*(closed|off|web\b)\s*$/i.test(g)) continue;

    // Day prefix: consume "mo-fr, sa" style tokens until the time part.
    let openAll: WeekdayToken[] | null = null;
    while (true) {
      const m = /^(\s*,\s*|\s+)?([a-z]{2})(?:\s*-\s*([a-z]{2}))?/i.exec(g);
      if (!m || !m[2] || INDEX[m[2].toLowerCase()] === undefined) break;
      const tok = expand(`${m[2].toLowerCase()}${m[3] ? `-${m[3].toLowerCase()}` : ''}`);
      if (!tok.length) break;
      openAll = [...(openAll ?? []), ...tok];
      g = g.slice(m[0].length);
    }
    openAll ||= null;

    if (!openAll || openAll.length === 0) {
      // No day prefix: "08:00-17:00" alone means every day.
      openAll = [...DAY_NAMES];
    }

    // One or more time ranges, comma-separated ("Mo 09:00-12:00,13:00-17:00").
    const timeMatches = g.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g) ?? [];
    if (!timeMatches.length) continue; // a lone day name (or junk) yields nothing

    for (const tm of timeMatches) {
      const [a, b] = tm.split('-');
      const open = parseOsmTime(a);
      let close = parseOsmTime(b);
      if (open === null || close === null) continue;
      // "Mo 08:00-" (open-ended) is treated as through midnight.
      if (tm.trim().endsWith('-')) close = 1440;
      entries.push({ days: openAll, open, close });
    }
  }

  if (!entries.length) return null;

  // A week fully covered 00:00-24:00 is still "open all day every day".
  const lowered = src.toLowerCase();
  if (/00:00-24:00/.test(lowered)) {
    const names = new Set<string>();
    for (const e of entries) e.days.forEach((d) => names.add(d));
    if (names.size === 7) return [{ days: [...DAY_NAMES], open: 0, close: 1440, alwaysOpen: true }];
  }

  return entries;
}