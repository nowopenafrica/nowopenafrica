// Identity matching for the enrichment engine.
//
// Before the engine attaches a source's facts to a business it must establish
// "these are the same real-world entity" — otherwise a wrong phone number gets
// attached to a correct name and the evidence trail records a confident lie.
// Everything here is pure text/number work so it runs the same in a test, in
// the edge function, and in a future batch job.

/** Normalised keys: the strings we actually compare. Store nothing else. */
export interface EntityKey {
  nameKey: string;
  domain?: string | null;
  phoneE164?: string | null;
}

/** Strip to the letters/digits a name comparison actually cares about. */
export function normName(name: string | null | undefined): string {
  const clean = (name ?? '')
    .toLowerCase()
    // Drop legal suffixes that add nothing ("Abdul & Sons Limited" ~ "Abdul & Sons").
    .replace(/\b(nigeria|nig\.?|limited|ltd|plc|incorporated|inc\.?|llc|llp)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return clean.replace(/\s+/g, ' ');
}

/** Hostname of a URL, bare: https://www.example.com/ → example.com */
export function normDomain(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  try {
    const host = new URL(v.includes('://') ? v : `https://${v}`).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Best-effort E.164 normalisation for Nigerian + international numbers.
 * Returns null when nothing phone-like is present; never guesses an exchange.
 */
export function normPhoneE164(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.startsWith('234')) {
    const rest = digits.slice(3);
    if (rest.length === 10 && rest.startsWith('0')) return `+234${rest.slice(1)}`;
    if (rest.length === 10) return `+234${rest}`;
    return `+234${rest}`;
  }
  if (digits.startsWith('0')) {
    const rest = digits.slice(1);
    if (rest.length === 10) return `+234${rest}`;
    return null;
  }
  if (digits.length === 13 && digits.startsWith('234')) return `+${digits}`;
  return null;
}

export interface IdentityMatch {
  /** 0-100 deterministic score. NOT a probability. */
  score: number;
  signals: string[];
  matched: boolean;
  /** The threshold below which we refuse to attach facts. */
}

/** Same business ≈ same name AND at least one corroborating channel. */
export function matchIdentity(
  a: EntityKey,
  b: EntityKey,
  opts: { nameRequired?: boolean; threshold?: number } = {},
): IdentityMatch {
  const nameRequired = opts.nameRequired ?? true;
  const threshold = opts.threshold ?? 40;

  const signals: string[] = [];
  let score = 0;

  const aName = normName(a.nameKey);
  const bName = normName(b.nameKey);
  if (!aName || !bName) return { score: 0, signals: ['no comparable name'], matched: false };

  const namesSame = aName === bName;
  const nameContains = aName.includes(bName) || bName.includes(aName);

  // Graphs: exactly the same trade name is the highest single signal.
  if (namesSame) { score += 60; signals.push('name:exact'); }
  else if (nameContains) { score += 42; signals.push('name:contains'); }
  else { score += 0; signals.push('name:differs'); }

  const aDomain = normDomain(a.domain);
  const bDomain = normDomain(b.domain);
  if (aDomain && aDomain === bDomain) { score += 25; signals.push(`domain:${aDomain}`); }

  const aPhone = normPhoneE164(a.phoneE164);
  const bPhone = normPhoneE164(b.phoneE164);
  if (aPhone && aPhone === bPhone) { score += 20; signals.push(`phone:${aPhone}`); }

  if (nameRequired && !namesSame && !nameContains) {
    return { score, signals, matched: false };
  }

  const matched = score >= threshold;
  return { score, signals, matched };
}

/** Compare two stored fields for "was it the same value". */
export function sameValue(
  current: string | null | undefined,
  proposed: string | null | undefined,
): boolean {
  if (current === proposed) return true;
  const clean = (s: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return clean(current) === clean(proposed);
}