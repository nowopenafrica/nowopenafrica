/**
 * What a person is told when authentication fails.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * MEASURED ON PRODUCTION, 2026-09-22. Signing up with a phone number returned:
 *
 *   "Error sending confirmation OTP to provider: Invalid From Number
 *    (caller ID): SK6d9c6ed2fe1c74994b995108f7358731
 *    More information: https://www.twilio.com/docs/errors/21212"
 *
 * Every auth surface did `toast.error(error.message)`, so that whole string —
 * the provider's name, an internal Twilio SID and a link to Twilio's error
 * docs — was shown to anybody who tried to sign up with a phone number. It
 * tells them nothing they can act on and leaks how the platform is wired.
 *
 * ── FAIL CLOSED ON UNKNOWN ERRORS ────────────────────────────────────────
 *
 * The mapping is an ALLOWLIST. A code nobody has classified gets a generic
 * message and the real error goes to the console for whoever is on call. The
 * opposite default — pass the provider's text through unless it looks
 * dangerous — is how the string above reached real people: nothing about it
 * looked dangerous, it was simply never considered.
 *
 * Messages here say what happened AND what to do next. "Failed to create
 * account" is not an error message, it is a shrug.
 */

export interface AuthErrorLike {
  message?: string;
  code?: string;
  /** GoTrue sends `error_code` on some responses and `code` on others. */
  error_code?: string;
  status?: number;
}

/** A message that is safe to show and useful to read. */
interface Mapped {
  message: string;
  /**
   * True when this is the platform's fault, not the visitor's.
   *
   * The UI uses it to offer the other route — nobody should be stuck staring
   * at a phone field that cannot work while an email field sits above it.
   */
  ours: boolean;
}

const GENERIC: Mapped = {
  message: 'Something went wrong on our side. Please try again in a moment.',
  ours: true,
};

/*
 * Known GoTrue error codes.
 *
 * Grouped by whose problem it is, because that decides what the UI offers
 * next, not just what it says.
 */
const BY_CODE: Record<string, Mapped> = {
  // ── The platform's problem ────────────────────────────────────────────
  /*
   * The one that started this. A visitor cannot fix an SMS provider, so the
   * message must not imply they did anything wrong, and must point at the
   * route that does work.
   */
  sms_send_failed: {
    message: 'We could not send a code to that number just now. Please sign up with an email address instead, or try again later.',
    ours: true,
  },
  email_send_failed: {
    message: 'We could not send that email just now. Please try again in a few minutes.',
    ours: true,
  },
  signup_disabled: {
    message: 'New accounts are paused at the moment. Please try again later.',
    ours: true,
  },
  provider_disabled: {
    message: 'That way of signing in is unavailable right now. Please use another option.',
    ours: true,
  },

  // ── Wait and retry ────────────────────────────────────────────────────
  over_sms_send_rate_limit: {
    message: 'Too many codes requested for that number. Please wait a minute before asking for another.',
    ours: false,
  },
  over_email_send_rate_limit: {
    message: 'Too many emails requested. Please wait a minute before trying again.',
    ours: false,
  },
  over_request_rate_limit: {
    message: 'Too many attempts. Please wait a minute and try again.',
    ours: false,
  },

  // ── The visitor can fix it ────────────────────────────────────────────
  otp_expired: {
    message: 'That code has expired. Ask for a new one and enter it within a few minutes.',
    ours: false,
  },
  /*
   * Deliberately worded for BOTH causes. GoTrue returns this for a wrong code
   * and for a code that has already been used, and guessing which happened
   * would sometimes tell somebody the wrong thing about their own account.
   */
  otp_disabled: {
    message: 'That code is not valid. Check the digits, or ask for a new code.',
    ours: false,
  },
  invalid_credentials: {
    message: 'That email or phone number and password do not match an account.',
    ours: false,
  },
  user_already_exists: {
    message: 'There is already an account with those details. Try signing in instead.',
    ours: false,
  },
  phone_exists: {
    message: 'There is already an account with that phone number. Try signing in instead.',
    ours: false,
  },
  email_exists: {
    message: 'There is already an account with that email address. Try signing in instead.',
    ours: false,
  },
  weak_password: {
    message: 'That password is too easy to guess. Use at least 8 characters with a mix of letters and numbers.',
    ours: false,
  },
  email_not_confirmed: {
    message: 'Please confirm your email address first — check your inbox for the link we sent.',
    ours: false,
  },
  phone_not_confirmed: {
    message: 'Please enter the code we sent to your phone to finish setting up your account.',
    ours: false,
  },
  validation_failed: {
    message: 'Please check the details you entered and try again.',
    ours: false,
  },
  user_not_found: {
    message: 'We could not find an account with those details.',
    ours: false,
  },
  same_password: {
    message: 'That is your current password. Choose a different one.',
    ours: false,
  },
};

/**
 * Message-text fallbacks, for the codes GoTrue does not send.
 *
 * Matched only on wording the platform controls or that is unambiguous. It is
 * a second chance at a useful message, never a way to pass the raw text
 * through: every branch returns one of OUR strings.
 */
function byMessage(raw: string): Mapped | null {
  const t = raw.toLowerCase();
  if (t.includes('otp') && (t.includes('provider') || t.includes('sending'))) return BY_CODE.sms_send_failed;
  if (t.includes('sms') && t.includes('rate')) return BY_CODE.over_sms_send_rate_limit;
  if (t.includes('already registered') || t.includes('already exists')) return BY_CODE.user_already_exists;
  if (t.includes('invalid login credentials')) return BY_CODE.invalid_credentials;
  if (t.includes('token has expired') || t.includes('expired')) return BY_CODE.otp_expired;
  if (t.includes('invalid') && t.includes('token')) return BY_CODE.otp_disabled;
  if (t.includes('password') && t.includes('should be at least')) return BY_CODE.weak_password;
  if (t.includes('rate limit')) return BY_CODE.over_request_rate_limit;
  return null;
}

/**
 * Turn any auth failure into something safe to show.
 *
 * The real error is logged rather than discarded — the point is that the
 * VISITOR does not see provider internals, not that nobody does. Without the
 * log, the Twilio misconfiguration above becomes invisible instead of merely
 * unreadable, which is worse.
 */
export function authErrorMessage(error: unknown, context = 'auth'): Mapped {
  const e = (error ?? {}) as AuthErrorLike;
  const code = (e.code || e.error_code || '').toLowerCase();
  const raw = typeof e.message === 'string' ? e.message : '';

  // eslint-disable-next-line no-console
  console.error(`[${context}]`, code || e.status || 'unknown', raw || error);

  if (code && BY_CODE[code]) return BY_CODE[code];
  const guessed = raw ? byMessage(raw) : null;
  return guessed ?? GENERIC;
}

/** Shorthand for the common `toast.error(...)` call site. */
export function authErrorText(error: unknown, context = 'auth'): string {
  return authErrorMessage(error, context).message;
}
