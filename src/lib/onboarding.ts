// Fire-and-forget trigger for the automatic onboarding welcome pack (email +
// follow-up WhatsApp with the NowOpen Africa brand kit) and the business-
// level profile education drain. Backed by the `send-onboarding` edge
// function, which resolves the recipient's contact details server-side from
// the authenticated user id and de-duplicates per user.
//
// Best-effort by design: it must never block or fail the auth / business-
// create flow. Any error (function not deployed, provider unconfigured,
// network) is swallowed with a console warning — the function itself also
// no-ops gracefully when the email / WhatsApp providers aren't configured yet.

import { supabase } from "./supabase";

interface OnboardingPayload {
  userId: string;
  email?: string;
  phone?: string;
  name?: string;
  businessName?: string;
  username?: string;
  role?: string;
  /** The calling user's session JWT — required for the business welcome
   *  drain so the sender can authenticate who to send on behalf of. */
  accessToken?: string;
}

export function sendWelcomePack(payload: OnboardingPayload): void {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !payload.userId) return;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${payload.accessToken || supabaseAnonKey}`,
  };

  // Don't await — this runs in the background off the signup / create path.
  void fetch(`${supabaseUrl}/functions/v1/send-onboarding`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch((err) => {
    console.warn("Onboarding welcome pack could not be triggered:", err);
  });
}

// Direct transport for the `send-onboarding` edge function used by admin
// screens (manual welcome / preview / social shared links).
//
// Deliberately NOT supabase.functions.invoke: that SDK path attaches the
// client's `apikey` + `Authorization` global headers, and the functions
// gateway chokes on `apikey`-bearing requests to this --no-verify-jwt
// function with a CORS-less 401/500 that the browser reports as "Failed to
// send a request to the Edge Function". A raw fetch carrying ONLY the session
// JWT reaches the function normally (verified in production), matches the
// CORS headers the function itself returns, and keeps admin authority intact.

export async function invokeSendOnboarding<T>(
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { data: null, error: "The onboarding function could not be reached (Supabase is not configured)." };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? supabaseAnonKey;

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/send-onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { data: null, error: "The onboarding function could not be reached." };
  }

  type FunctionBody = { error?: string | null; message?: string };

  let payload: FunctionBody | null = null;
  try {
    payload = (await res.json()) as FunctionBody;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const detail = payload?.error || payload?.message || `HTTP ${res.status}`;
    return { data: null, error: detail };
  }

  return { data: (payload as T | null) ?? null, error: null };
}
