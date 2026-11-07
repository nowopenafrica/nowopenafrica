/**
 * Hosts NowOpen refuses to read automatically, decided once rather than per run.
 *
 * WHY A LIST AND NOT A JUDGEMENT
 *
 * These platforms prohibit automated access in their terms of service. That is
 * a fact about the contract, not a property of any particular request, so the
 * answer must not depend on whether a robots.txt was fetched successfully, on
 * how a URL was spelled, or on whoever is operating the tool that day.
 *
 * Refusing BEFORE the request also means no connection is opened at all — the
 * cleanest possible form of "we do not do this".
 *
 * WHAT THE LEGITIMATE PATH LOOKS LIKE
 *
 * A business's own social links reach NowOpen two ways, both with permission
 * built in: the owner adds them when they claim the profile, or the platform's
 * official API is used with that business's explicit authorisation. Neither is
 * scraping. This file exists so the illegitimate third way stays closed.
 */

/**
 * Registrable domains, without `www.`.
 *
 * Matching is exact-or-subdomain, so `m.facebook.com`, `business.facebook.com`
 * and `facebook.com` are one refusal, and a lookalike such as
 * `facebook.com.evil.example` is NOT caught here — that is the SSRF guard and
 * the robots check's job, and pretending otherwise would hide a gap.
 */
export const TERMS_REFUSED_HOSTS: readonly string[] = [
  // Meta
  'instagram.com', 'instagr.am', 'cdninstagram.com',
  'facebook.com', 'fb.com', 'fb.me', 'messenger.com', 'threads.net',
  // Short-form video and microblogging
  'tiktok.com', 'twitter.com', 'x.com',
  // Professional and messaging
  'linkedin.com', 'lnkd.in',
  'whatsapp.com', 'wa.me',
  // Other social platforms with the same prohibition
  'pinterest.com', 'snapchat.com',
];

/**
 * The domain that refuses this host, or null if none does.
 *
 * Returns the matched domain rather than a boolean so the caller can tell the
 * operator WHICH platform refused — "instagram.com prohibits automated access"
 * is actionable; "refused" is not.
 */
export function termsRefusedBy(host: string | null | undefined): string | null {
  const h = String(host ?? '').trim().toLowerCase().replace(/^www\./, '');
  if (!h) return null;
  for (const domain of TERMS_REFUSED_HOSTS) {
    if (h === domain || h.endsWith(`.${domain}`)) return domain;
  }
  return null;
}

/** What to tell an operator who pasted one of these. */
export function termsRefusalMessage(domain: string): string {
  return `${domain} prohibits automated access in its terms, so NowOpen does not read it.`;
}

export const TERMS_REFUSAL_GUIDANCE =
  'Ask the business to add this link when they claim their profile, or enter what you can see by hand.';
