// Fire-and-forget trigger for the automatic onboarding welcome pack (email +
// follow-up WhatsApp with the NowOpen Africa brand kit). Backed by the
// `send-onboarding` edge function, which resolves the recipient's contact
// details server-side from the user id and de-duplicates per user, so it's
// safe to call on every signup / first sign-in.
//
// Best-effort by design: it must never block or fail the auth flow. Any error
// (function not deployed, provider unconfigured, network) is swallowed with a
// console warning — the function itself also no-ops gracefully when the email/
// WhatsApp providers aren't configured yet.

interface OnboardingPayload {
  userId: string;
  email?: string;
  phone?: string;
  name?: string;
  businessName?: string;
  username?: string;
  role?: string;
}

export function sendWelcomePack(payload: OnboardingPayload): void {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !payload.userId) return;

  // Don't await — this runs in the background off the signup path.
  void fetch(`${supabaseUrl}/functions/v1/send-onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch((err) => {
    console.warn('Onboarding welcome pack could not be triggered:', err);
  });
}
