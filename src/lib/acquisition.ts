/**
 * NOWOPEN YOUR BUSINESS — the acquisition loop.
 *
 * Send it. We set it up. You claim it.
 *
 * The bet is that the barrier was never willingness, it was the ask. "Register,
 * confirm your email, complete your profile" asks somebody to understand
 * NowOpen before they get anything. "What is your business called?" asks for
 * something they already know, and the product does the rest.
 *
 * This module is the part of that worth testing on its own: the conversation
 * steps, what counts as an answer, and where a submission came from.
 */

/**
 * Where a request came from.
 *
 * A CLOSED LIST, deliberately. `?src=` is attacker-controlled and, more to the
 * point, typo-controlled: left open, one campaign becomes "whatsapp", "WhatsApp"
 * and "whatsap" in the same report and the only question this link exists to
 * answer — which surface actually works — stops having an answer. Anything
 * unrecognised falls back rather than being stored.
 */
export const SOURCES = [
  'whatsapp', 'instagram', 'tiktok', 'facebook', 'x', 'linkedin', 'youtube',
  'qr', 'flyer', 'poster', 'event', 'founder', 'referral', 'ambassador',
  'creator', 'radio', 'nomination', 'homepage', 'direct',
] as const;

export type Source = typeof SOURCES[number];

/** Hosts we can attribute without being told, when ?src= is missing. */
const REFERRER_HOSTS: [RegExp, Source][] = [
  [/(^|\.)instagram\.com$/i, 'instagram'],
  [/(^|\.)tiktok\.com$/i, 'tiktok'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.(com|me)$/i, 'facebook'],
  [/(^|\.)(twitter|x)\.com$/i, 'x'],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/i, 'linkedin'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, 'youtube'],
  // WhatsApp link previews arrive from these, and WhatsApp is the channel this
  // campaign mostly lives in — attributing it to "direct" would hide the one
  // number that matters most.
  [/(^|\.)whatsapp\.com$|(^|\.)wa\.me$/i, 'whatsapp'],
];

const isSource = (v: string): v is Source => (SOURCES as readonly string[]).includes(v);

/**
 * Which surface produced this visit.
 *
 * `?src=` wins because it is what we printed on the flyer. The referrer is the
 * fallback, and 'direct' is the honest answer when we genuinely do not know —
 * better than guessing and better than dropping the row.
 */
export function readSource(search: string, referrer = ''): Source {
  const declared = new URLSearchParams(search).get('src')?.trim().toLowerCase() ?? '';
  if (declared && isSource(declared)) return declared;

  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      for (const [pattern, source] of REFERRER_HOSTS) if (pattern.test(host)) return source;
    } catch {
      // A referrer we cannot parse tells us nothing. It is not an error.
    }
  }
  return 'direct';
}

/** Kept short: it is stored, and a 2KB referrer is a tracking payload. */
export const shortReferrer = (referrer: string): string | null => {
  const v = referrer.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return `${u.hostname}${u.pathname}`.slice(0, 200);
  } catch {
    return v.slice(0, 200);
  }
};

/* ── The conversation ─────────────────────────────────────────────────────── */

export type StepKey = 'name' | 'location' | 'contact';

export interface Step {
  key: StepKey;
  /** What NowOpen says. One question, in the second person. */
  asks: string;
  placeholder: string;
  /** Shown under the field. Never a rule — a reason. */
  hint?: string;
  label: string;
}

/**
 * Three questions, in this order, and no more.
 *
 * A form asks for everything at once and is judged on its length before a
 * single field is filled. A conversation asks one thing, and each answer is a
 * small commitment that makes the next one easier — which is why the easiest
 * question is first and the one that costs something is last.
 *
 * There is no category, no address, no opening hours and no website. Every one
 * of those is something we can find or ask later, and each would cost more
 * submissions than it is worth.
 */
export const STEPS: Step[] = [
  {
    key: 'name',
    asks: 'Great. What is the name of your business?',
    label: 'Business name',
    placeholder: 'e.g. MeatClub Nigeria',
  },
  {
    key: 'location',
    asks: 'Nice. Where is it located?',
    label: 'Where it is',
    placeholder: 'e.g. Lekki, Lagos',
    hint: 'Town or city is enough.',
  },
  {
    key: 'contact',
    asks: 'How should we reach you when your page is ready?',
    label: 'How to reach you',
    placeholder: 'WhatsApp number, phone or email',
    hint: 'We use this once, to show you the page. Nothing is published until you have seen it.',
  },
];

export type Answers = Partial<Record<StepKey, string>>;

/**
 * Is this answer good enough to move on?
 *
 * Deliberately forgiving. This is a campaign landing page reached from a
 * WhatsApp status, and every rejection is somebody deciding not to bother. The
 * only things refused are answers that would produce a row nobody can act on.
 */
export function answerError(step: StepKey, raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    if (step === 'name') return 'What is it called?';
    if (step === 'location') return 'Which town or city?';
    return 'One way to reach you.';
  }
  if (value.length > 160) return 'A little shorter, please.';

  if (step === 'contact') {
    // A contact has to be reachable. A digit or an @ covers every real answer:
    // a phone number, a WhatsApp number, an email, an Instagram handle.
    if (!/[0-9]/.test(value) && !value.includes('@')) {
      return 'A number, an email or an @handle so we can show you the page.';
    }
  }
  return null;
}

export const isComplete = (answers: Answers): boolean =>
  STEPS.every((s) => !answerError(s.key, answers[s.key] ?? ''));

/* ── Sharing ──────────────────────────────────────────────────────────────── */

export const CAMPAIGN_PATH = '/send-business';

/**
 * The message somebody sends on. Written to be forwarded, not read: short
 * enough to survive a WhatsApp status, and it says what happens rather than
 * what NowOpen is.
 */
export function shareText(siteUrl: string): string {
  return [
    'Own a business? Do not register.',
    'Send NowOpen your business name and they set up your page. You check it, then it is yours.',
    `${siteUrl}${CAMPAIGN_PATH}?src=whatsapp`,
  ].join('\n\n');
}

export const whatsappShareUrl = (siteUrl: string): string =>
  `https://wa.me/?text=${encodeURIComponent(shareText(siteUrl))}`;
