/**
 * Which candidates deserve a second look before they are published.
 *
 * ── THE PROBLEM THIS ADDRESSES ───────────────────────────────────────────
 *
 * Measured 2026-10-09: 4,477 candidates, 100% published, 0 rejected — and
 * 3,642 change proposals, also 100% approved. Two separate review stages,
 * neither of which has ever refused anything.
 *
 * A gate that passes everything is not a gate. The cause is not missing
 * logic — `confidence.ts` already decides auto-publish / review / hold /
 * reject — it is that a reviewer facing a flat list of thousands has nothing
 * telling them which five to actually read. So they approve the lot.
 *
 * ── WHAT THESE SIGNALS ARE, AND ARE NOT ──────────────────────────────────
 *
 * Every signal here is computed from a field we hold. None is a guess about
 * the business, none calls a listing bad, and none blocks publication. They
 * answer one question: "is there a reason to look at this one more closely?"
 *
 * The reviewer still decides. The point is that they are now deciding about
 * forty rows instead of four thousand.
 */

export type RiskCode =
  | 'no_contact'
  | 'institutional'
  | 'place_not_business'
  | 'low_confidence'
  | 'possible_duplicate'
  | 'no_evidence';

export interface RiskSignal {
  code: RiskCode;
  /** Shown to the reviewer. Says what was observed, not what to conclude. */
  label: string;
  /**
   * 'look'    — a reason to read THIS row before publishing it.
   * 'context' — true of the row, but true of thousands like it.
   *
   * MEASURED 2026-10-09, and it changed this design. Flagging every
   * institutional category raised 2,733 of 4,517 candidates, and a queue
   * where 79% is flagged is the flat list of thousands all over again. A
   * reviewer cannot act on "this is a hospital" one row at a time — that is
   * a decision about the Wikidata import as a whole, taken once.
   *
   * So the label still shows, because it is useful context on the row a
   * reviewer has opened. It just does not summon them to it. With cohort
   * signals excluded the queue falls to 1,066 — 23.6%, and every one of them
   * is a per-row fact somebody can do something about.
   */
  severity: 'look' | 'context';
}

export interface RiskInput {
  name: string | null;
  category: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  whatsapp?: string | null;
  confidence: number | null;
  duplicateOf?: string | null;
  /** How many fields carry recorded evidence. */
  evidenceCount?: number | null;
}

/**
 * Categories whose members are institutions rather than owner-run businesses.
 *
 * Not a judgement on the listing — a teaching hospital is a perfectly real
 * organisation. It is a judgement on the FUNNEL: 1,769 hospitals and 829
 * schools sit in this directory and not one has ever been claimed, because
 * nobody at a public hospital wants to manage a business profile.
 */
const INSTITUTIONAL = new Set([
  'Hospital & Clinic',
  'Schools & Training',
  'Library & Archive',
  'Government',
  'Health & Medical',
]);

/**
 * Words that describe a PLACE rather than a trading business.
 *
 * Used only alongside "no contact at all", because plenty of real businesses
 * are called Park Inn or Bridge House. On its own this would be a bad rule;
 * paired with unreachability it describes the thing actually found in the
 * data — "IBM Building, Johannesburg", a landmark imported as a business.
 */
const PLACE_WORDS = /\b(building|house|tower|complex|roundabout|junction|bridge|flyover|monument|cemetery|stadium)\b/i;

export function riskSignals(c: RiskInput, reviewThreshold = 50): RiskSignal[] {
  const out: RiskSignal[] = [];

  const contactable = Boolean(
    (c.phone ?? '').trim() || (c.email ?? '').trim()
    || (c.website ?? '').trim() || (c.whatsapp ?? '').trim(),
  );

  /*
   * The most consequential one. A listing with no contact of any kind can
   * never be invited to claim itself, so publishing it adds a page nobody
   * owns and nobody can be told about. It is the difference between a
   * directory and a dataset.
   */
  if (!contactable) {
    out.push({
      code: 'no_contact',
      label: 'No phone, email or website — nobody can be invited to claim it',
      severity: 'look',
    });
  }

  if (c.category && INSTITUTIONAL.has(c.category)) {
    out.push({
      code: 'institutional',
      label: `${c.category} — institutions rarely claim a listing`,
      // Cohort, not alarm: see the note on `severity`.
      severity: 'context',
    });
  }

  if (!contactable && PLACE_WORDS.test(c.name ?? '')) {
    out.push({
      code: 'place_not_business',
      label: 'Name reads like a place rather than a trading business',
      severity: 'look',
    });
  }

  if (typeof c.confidence === 'number' && c.confidence < reviewThreshold) {
    out.push({
      code: 'low_confidence',
      label: `Confidence ${c.confidence} is below ${reviewThreshold}`,
      severity: 'look',
    });
  }

  if (c.duplicateOf) {
    out.push({
      code: 'possible_duplicate',
      label: 'Looks like a business already on NowOpen',
      severity: 'look',
    });
  }

  /*
   * Zero recorded evidence means nothing can be shown to a business that
   * later asks where its details came from. `evidenceCount` is optional
   * because not every caller loads it — and an UNKNOWN count must not be
   * reported as "no evidence", which would be the usual mistake.
   */
  if (typeof c.evidenceCount === 'number' && c.evidenceCount === 0) {
    out.push({ code: 'no_evidence', label: 'No recorded source for any field', severity: 'look' });
  }

  return out;
}

/**
 * True when a reviewer should read this one before publishing.
 *
 * Deliberately not a score. A number invites a threshold, a threshold invites
 * a bulk action, and a bulk action is how 4,477 candidates got published
 * without anybody reading one.
 */
export function needsCloserLook(c: RiskInput, reviewThreshold = 50): boolean {
  return riskSignals(c, reviewThreshold).some((s) => s.severity === 'look');
}
