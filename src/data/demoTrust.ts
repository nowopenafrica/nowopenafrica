// Trust signals for the curated demo spotlights.
//
// Why this exists: the spotlight records set the legacy `verified: true` flag but
// carry none of the trust signals the Business Trust Panel reads. That made a
// profile contradict itself — "Verified" in the header, "UNVERIFIED, 0 of 7
// checks" in the panel six lines below.
//
// Rather than weaken what verification means, the demo records are given real
// signals so the badge is earned. They are demo data, so this is presentation,
// not a claim about a real business — and real rows are untouched: they show
// Verified only when an admin has actually confirmed the checks.
//
// The spread is deliberate. Making every demo Platinum would teach visitors that
// the tier is decoration; a mix shows the ladder doing its job, and gives the
// /platform gallery something honest to demonstrate.

/** Deterministic bucket from an id, so a given demo always renders the same. */
function bucket(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 10;
}

export interface DemoTrustFields {
  email_verified: boolean;
  phone_verified: boolean;
  id_verified: boolean;
  registration_verified: boolean;
  address_verified: boolean;
  documents_reviewed: boolean;
  onsite_verified: boolean;
  verification_tier: 'bronze' | 'silver' | 'gold' | 'platinum';
}

/**
 * Signals for one demo record. Roughly: 20% platinum, 40% gold, 30% silver,
 * 10% bronze — a believable distribution for a directory rather than a wall of
 * top-tier badges.
 */
export function demoTrustFor(id: string): DemoTrustFields {
  const b = bucket(id);
  const contact = { email_verified: true, phone_verified: true };
  if (b < 1) {
    return { ...contact, id_verified: false, registration_verified: false, address_verified: false, documents_reviewed: false, onsite_verified: false, verification_tier: 'bronze' };
  }
  if (b < 4) {
    return { ...contact, id_verified: true, registration_verified: true, address_verified: false, documents_reviewed: false, onsite_verified: false, verification_tier: 'silver' };
  }
  if (b < 8) {
    return { ...contact, id_verified: true, registration_verified: true, address_verified: true, documents_reviewed: true, onsite_verified: false, verification_tier: 'gold' };
  }
  return { ...contact, id_verified: true, registration_verified: true, address_verified: true, documents_reviewed: true, onsite_verified: true, verification_tier: 'platinum' };
}

/**
 * Apply demo signals to a spotlight record, without overwriting anything the
 * record already sets — so a hand-authored demo can still pin its own tier.
 */
export function withDemoTrust<T extends { id?: string }>(record: T): T & Partial<DemoTrustFields> {
  const id = String(record.id ?? '');
  if (!id) return record;
  const demo = demoTrustFor(id);
  return { ...demo, ...record };
}

/** Map a whole spotlight dictionary in one go. */
export function withDemoTrustAll<T extends { id?: string }>(records: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(records)) out[k] = withDemoTrust(v) as T;
  return out;
}
