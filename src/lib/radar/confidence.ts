/**
 * How sure is Radar about a discovered business, and may it publish?
 *
 * The score decides whether a record reaches the public directory without a
 * human seeing it, so it is built to be read rather than trusted: every point
 * is attributable to a named signal, and the breakdown is what the admin queue
 * shows. A single opaque number would be impossible to argue with, and the
 * first time it was wrong nobody would know why.
 *
 * It measures ONE thing: how likely it is that this business exists as
 * described. It says nothing about who owns it. Ownership is never granted by
 * a score — that separation is the whole safety model.
 */

import type { NormalizedBusiness } from './normalize';
import { sourceGate, type RadarSource } from './sources';
import type { MatchVerdict } from './entity';

export interface ConfidenceSignal {
  key: string;
  label: string;
  earned: number;
  max: number;
  /** null when the source simply did not supply it. */
  present: boolean;
}

export interface ConfidenceResult {
  score: number;
  signals: ConfidenceSignal[];
  missing: string[];
}

/**
 * Weights.
 *
 * Contactability dominates deliberately. A listing customers cannot ring is
 * the incumbent directory's failure mode — 131,000 records, and the ones worth
 * reading were the handful with a working number. A business with a confirmed
 * phone and address is worth more than one with six fields of prose.
 */
const WEIGHTS = {
  name: 15,
  category: 8,
  city: 12,
  address: 15,
  phone: 20,
  website: 10,
  email: 5,
  geo: 5,
  corroboration: 10,
} as const;

export interface ConfidenceInput {
  normalized: NormalizedBusiness;
  /** How many independent permitted sources reported this business. */
  sourceCount?: number;
}

export function scoreConfidence({ normalized: n, sourceCount = 1 }: ConfidenceInput): ConfidenceResult {
  const signals: ConfidenceSignal[] = [];
  const add = (key: string, label: string, present: boolean, max: number, earned = present ? max : 0) =>
    signals.push({ key, label, earned, max, present });

  add('name', 'Business name', n.nameKey.length > 1, WEIGHTS.name);
  add('category', 'Category', !!n.category, WEIGHTS.category);
  add('city', 'City', !!n.cityKey, WEIGHTS.city);
  add('address', 'Street address', !!n.addressKey, WEIGHTS.address);
  add('phone', 'Phone number', !!(n.phone || n.whatsapp), WEIGHTS.phone);
  add('website', 'Website', !!n.domain, WEIGHTS.website);
  add('email', 'Email address', !!n.email, WEIGHTS.email);
  add('geo', 'Coordinates', n.latitude !== null && n.longitude !== null, WEIGHTS.geo);

  /*
   * Corroboration: two independent sources agreeing is the strongest evidence
   * available short of talking to the business, so it is worth as much as a
   * website on its own. It caps at three — a fourth source repeating the same
   * record adds very little, and rewarding volume invites source-stuffing.
   */
  const corroboration = Math.min(Math.max(sourceCount - 1, 0), 2) / 2;
  signals.push({
    key: 'corroboration',
    label: sourceCount > 1 ? `Reported by ${sourceCount} sources` : 'Single source',
    earned: Math.round(corroboration * WEIGHTS.corroboration),
    max: WEIGHTS.corroboration,
    present: sourceCount > 1,
  });

  const score = Math.max(0, Math.min(100, signals.reduce((s, x) => s + x.earned, 0)));
  return { score, signals, missing: signals.filter((s) => !s.present).map((s) => s.label) };
}

// --------------------------------------------------------------- publish gate

export type AutonomyMode = 'manual' | 'assisted' | 'autonomous';

export type GateAction = 'auto-publish' | 'review' | 'hold' | 'reject';

export interface GateThresholds {
  autoPublish: number;
  review: number;
}

/** Defaults; the admin can raise them but the floor logic below still applies. */
export const DEFAULT_THRESHOLDS: GateThresholds = { autoPublish: 90, review: 50 };

export interface GateInput {
  confidence: number;
  mode: AutonomyMode;
  duplicate: MatchVerdict;
  source: RadarSource;
  thresholds?: GateThresholds;
  /** The candidate's category, so the gate can spot a sensitive one itself. */
  category?: string | null;
  /** Overrides the category check when the caller already knows. */
  sensitiveCategory?: boolean;
}

export interface GateDecision {
  action: GateAction;
  reason: string;
}

/**
 * Categories where a wrong listing does more than waste somebody's trip.
 *
 * A fabricated pharmacy, clinic or lender is a different order of mistake from
 * a fabricated barber, and this is the market where that distinction is
 * sharpest. These never auto-publish at any confidence, in any mode.
 */
const SENSITIVE = /pharmac|health|medic|clinic|hospital|dental|doctor|financ|bank|loan|insur|lend|legal|law/i;

export function isSensitiveCategory(category: string | null | undefined): boolean {
  return !!category && SENSITIVE.test(category);
}

/**
 * What happens to this record.
 *
 * The order is deliberate: the source gate first, because a record from a
 * source Radar may not use should not be scored, let alone published — and
 * saying so plainly is more useful than a confidence number.
 */
export function publishGate(input: GateInput): GateDecision {
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;

  const gate = sourceGate(input.source);
  if (!gate.allowed) {
    return { action: 'reject', reason: gate.reason };
  }

  // An exact duplicate is not a new business; it is an update to an old one.
  if (input.duplicate === 'match') {
    return { action: 'hold', reason: 'Already in NowOpen — merge into the existing business instead of publishing a second one.' };
  }
  if (input.duplicate === 'possible') {
    return { action: 'review', reason: 'Looks like an existing business. A person decides whether to merge; an uncertain merge loses owner data.' };
  }

  if (input.mode === 'manual') {
    return { action: 'review', reason: 'Radar is in manual mode — nothing publishes without approval.' };
  }

  if (input.confidence < t.review) {
    return { action: 'hold', reason: `Confidence ${input.confidence} is below ${t.review}. Not enough is known to publish or to ask a reviewer.` };
  }

  if (input.sensitiveCategory ?? isSensitiveCategory(input.category)) {
    return { action: 'review', reason: 'Health, financial and legal listings are always read by a person before they go live.' };
  }

  if (input.mode === 'assisted') {
    return { action: 'review', reason: 'Radar is in assisted mode — AI prepares, a person approves.' };
  }

  if (input.confidence >= t.autoPublish) {
    return { action: 'auto-publish', reason: `Confidence ${input.confidence} meets the ${t.autoPublish} bar from a permitted source.` };
  }
  return { action: 'review', reason: `Confidence ${input.confidence} is below the ${t.autoPublish} auto-publish bar.` };
}
