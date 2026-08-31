/**
 * Is this business already in NowOpen?
 *
 * The question the directory lives or dies on. Get it wrong one way and
 * "Chicken Republic Lekki", "Chicken Republic - Lekki Phase 1" and "Chicken
 * Republic Admiralty Way" become three unrelated businesses. Get it wrong the
 * other way and two genuinely different shops on the same street are merged
 * into one, which destroys data an owner may have spent an hour entering.
 *
 * The asymmetry matters: a missed duplicate is a tidy-up job, a wrong merge is
 * a data loss. So the engine only ever *reports* a verdict — merging is a
 * decision a person makes, and nothing here writes anything.
 */

import type { NormalizedBusiness } from './normalize';

export type MatchVerdict = 'match' | 'possible' | 'no-match';

export interface MatchSignal {
  key: string;
  label: string;
  /** −1 to 1. Negative means this signal argues they are different. */
  weight: number;
}

export interface MatchResult {
  verdict: MatchVerdict;
  /** 0–100, for display. */
  score: number;
  signals: MatchSignal[];
  /** Set when one signal is decisive on its own. */
  decidedBy?: string;
}

/** Token-set similarity, 0–1. Order-insensitive, which suits business names. */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  // Jaccard understates a short name inside a longer one — "chicken republic"
  // vs "chicken republic lekki phase 1" — which is the exact shape a branch
  // takes, so containment is blended in.
  const jaccard = shared / (A.size + B.size - shared);
  const containment = shared / Math.min(A.size, B.size);
  return Math.max(jaccard, containment * 0.92);
}

/** Metres between two points. */
export function distanceMetres(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Two records are the same business at the same place within this radius. */
const SAME_PLACE_METRES = 120;

/**
 * Compare a discovered record with one already held.
 *
 * A shared phone number or a shared website domain is treated as decisive.
 * Businesses do not share a phone line or a domain by coincidence, and both
 * are far stronger evidence than any amount of name similarity — which is what
 * lets "XYZ Foods" and "X.Y.Z. Foods Ltd" resolve correctly while keeping two
 * different pharmacies on the same road apart.
 */
export function matchBusiness(
  a: NormalizedBusiness,
  b: NormalizedBusiness,
): MatchResult {
  const signals: MatchSignal[] = [];

  const samePhone = !!a.phone && (a.phone === b.phone || a.phone === b.whatsapp);
  const sameWhats = !!a.whatsapp && (a.whatsapp === b.whatsapp || a.whatsapp === b.phone);
  const sameDomain = !!a.domain && a.domain === b.domain;
  const sameEmail = !!a.email && a.email === b.email;

  if (samePhone || sameWhats) signals.push({ key: 'phone', label: 'Same phone number', weight: 1 });
  if (sameDomain) signals.push({ key: 'domain', label: 'Same website domain', weight: 1 });
  if (sameEmail) signals.push({ key: 'email', label: 'Same email address', weight: 0.8 });

  const nameSim = nameSimilarity(a.nameKey, b.nameKey);
  if (nameSim >= 0.95) signals.push({ key: 'name', label: 'Business name matches', weight: 0.55 });
  else if (nameSim >= 0.7) signals.push({ key: 'name', label: 'Business name is similar', weight: 0.3 });
  else if (nameSim > 0) signals.push({ key: 'name', label: 'Business names differ', weight: -0.15 });
  else signals.push({ key: 'name', label: 'Business names are unrelated', weight: -0.4 });

  const sameCity = !!a.cityKey && a.cityKey === b.cityKey;
  if (sameCity) signals.push({ key: 'city', label: 'Same city', weight: 0.12 });
  else if (a.cityKey && b.cityKey) signals.push({ key: 'city', label: 'Different city', weight: -0.35 });

  if (a.addressKey && b.addressKey) {
    const addrSim = nameSimilarity(a.addressKey, b.addressKey);
    if (addrSim >= 0.8) signals.push({ key: 'address', label: 'Same address', weight: 0.35 });
    else if (addrSim >= 0.5) signals.push({ key: 'address', label: 'Similar address', weight: 0.15 });
  }

  if (a.latitude !== null && a.longitude !== null && b.latitude !== null && b.longitude !== null) {
    const d = distanceMetres(a.latitude, a.longitude, b.latitude, b.longitude);
    if (d <= SAME_PLACE_METRES) signals.push({ key: 'geo', label: 'Same location', weight: 0.3 });
    else if (d > 2000) signals.push({ key: 'geo', label: 'Far apart', weight: -0.3 });
  }

  const total = signals.reduce((s, x) => s + x.weight, 0);
  const score = Math.max(0, Math.min(100, Math.round((total / 1.6) * 100)));

  /*
   * A decisive identifier settles it — but only alongside a name that is not
   * actively contradictory. A shared switchboard across a mall would otherwise
   * merge every shop in it.
   */
  if ((samePhone || sameDomain) && nameSim >= 0.45) {
    return { verdict: 'match', score: Math.max(score, 90), signals, decidedBy: sameDomain ? 'domain' : 'phone' };
  }
  if (nameSim >= 0.95 && sameCity) return { verdict: 'match', score: Math.max(score, 85), signals, decidedBy: 'name+city' };
  if (total >= 0.55) return { verdict: 'possible', score, signals };
  if (nameSim >= 0.7 && sameCity) return { verdict: 'possible', score, signals };
  return { verdict: 'no-match', score, signals };
}

export interface Candidate<T> {
  record: T;
  normalized: NormalizedBusiness;
}

export interface DuplicateReport<T> {
  best: { record: T; result: MatchResult } | null;
  possibles: Array<{ record: T; result: MatchResult }>;
}

/**
 * Compare one discovered record against everything already held.
 *
 * Returns the strongest match and every "possible" for a reviewer, rather than
 * picking one. Nothing merges automatically: an uncertain merge destroys owner
 * data, and no confidence threshold makes that recoverable.
 */
export function findDuplicates<T>(
  incoming: NormalizedBusiness,
  existing: Array<Candidate<T>>,
): DuplicateReport<T> {
  const scored = existing
    .map((c) => ({ record: c.record, result: matchBusiness(incoming, c.normalized) }))
    .filter((x) => x.result.verdict !== 'no-match')
    .sort((a, b) => b.result.score - a.result.score);

  const definite = scored.find((x) => x.result.verdict === 'match') ?? null;
  return {
    best: definite ?? scored[0] ?? null,
    possibles: scored.filter((x) => x.result.verdict === 'possible'),
  };
}

/**
 * Do these two look like branches of one chain rather than duplicates?
 *
 * "Chicken Republic Lekki" and "Chicken Republic Ikeja" share a strong name
 * stem and sit in different places. That is a parent business with locations,
 * not a duplicate — and merging them would be as wrong as splitting them.
 */
export function looksLikeBranches(a: NormalizedBusiness, b: NormalizedBusiness): boolean {
  const sim = nameSimilarity(a.nameKey, b.nameKey);
  if (sim < 0.6) return false;
  if (a.nameKey === b.nameKey && a.cityKey === b.cityKey) return false;
  const differentPlace =
    (!!a.cityKey && !!b.cityKey && a.cityKey !== b.cityKey) ||
    (a.latitude !== null && b.latitude !== null && a.longitude !== null && b.longitude !== null &&
      distanceMetres(a.latitude, a.longitude, b.latitude, b.longitude) > 2000);
  return differentPlace;
}
