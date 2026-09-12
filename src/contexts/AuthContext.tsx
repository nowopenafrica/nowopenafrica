import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { setTelemetryUser, track } from '../lib/telemetry';
import { sendWelcomePack } from '../lib/onboarding';
import { SignupRole } from '../lib/accountRoles';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  // `identifier` may be an email address OR a phone number — see isEmail below.
  signUp: (identifier: string, password: string, role?: SignupRole, phone?: string) => Promise<void>;
  signIn: (identifier: string, password: string) => Promise<void>;
  // Phone signup confirmation: enter the SMS code, then re-send if needed.
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  resendPhoneOtp: (phone: string) => Promise<void>;
  // Send a password-reset email, and set a new password once the user returns
  // via the emailed link (which puts them in a recovery session).
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  // Sign out of every device/session, not just this one.
  signOutAllDevices: () => Promise<void>;
}

// Best-effort record of a sign-in for the user's Security page. Never throws —
// a failed audit write must not block login.
async function recordLoginEvent(userId: string | undefined, event = 'sign_in') {
  if (!userId) return;
  try {
    await supabase.from('login_events').insert({
      user_id: userId,
      event,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null,
    });
  } catch {
    /* table may not exist yet — ignore */
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Decide whether the value the user typed is an email or a phone number.
export const isEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());
// Normalise a phone number to E.164-ish (digits with a leading +), which is
// what Supabase phone auth expects.
export const normalizePhone = (value: string) => {
  const digits = value.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  /*
   * Who was signed in on the previous auth event, and whether we have seen one.
   *
   * These exist to make `signin` mean what it says. It did not: the event was
   * emitted for every `SIGNED_IN` callback, and Supabase raises that for a
   * restored session and (historically) whenever a tab regains focus, not only
   * when somebody actually authenticates. Measured on production before this
   * fix: 42,910 `signin` events across 64 sessions — about 670 each, and 99.4%
   * of every row in the telemetry table.
   *
   * A genuine sign-in is a transition from nobody to somebody, after the
   * initial session has settled. TOKEN_REFRESHED, USER_UPDATED, a restored
   * session on reload and a refocused tab are all none of those things.
   */
  const seenFirstAuthEvent = useRef(false);
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      // Attribute later events to this user. Set here rather than at the call
      // sites so nothing that fires before a page reads auth is anonymous by
      // accident.
      setTelemetryUser(session?.user?.id ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        const userId = session?.user?.id ?? null;
        setTelemetryUser(userId);

        // Still recorded from the auth event rather than the submit handler, so
        // social and magic-link sign-ins count too — they never touch signIn().
        // But only for a real transition: see seenFirstAuthEvent above.
        if (
          event === 'SIGNED_IN' &&
          seenFirstAuthEvent.current &&
          !previousUserId.current &&
          userId
        ) {
          track('signin');
        }
        previousUserId.current = userId;
        seenFirstAuthEvent.current = true;

        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (identifier: string, password: string, role: SignupRole = 'personal', phone?: string) => {
    const id = identifier.trim();

    // Phone-first signup: create a phone account (Supabase Phone provider must
    // be enabled). The phone doubles as the contact number.
    if (!isEmail(id)) {
      const ph = normalizePhone(id);
      const { data, error } = await supabase.auth.signUp({
        phone: ph,
        password,
        options: { data: { role, phone: ph } },
      });
      if (error) throw error;
      /*
       * The top of the acquisition funnel, and it was never instrumented —
       * `signup` was a declared EventName with zero call sites while eleven
       * accounts existed. Without it there is no denominator: signup →
       * onboarding → business_created → claim cannot be computed at all.
       *
       * Role and method only. The identifier is never sent; sanitizeProps
       * would drop it by key, but relying on the blocklist to catch what the
       * caller should not have passed is the wrong way round.
       */
      track('signup', { role, method: 'phone' });
      // Fire the onboarding welcome pack (best-effort, backgrounded). For phone
      // signups the follow-up WhatsApp lands on the same number.
      if (data.user) sendWelcomePack({ userId: data.user.id, phone: ph, role });
      return;
    }

    // Email-first signup (unchanged) — `phone` is an optional contact number.
    const email = id.toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          phone: phone?.trim() || null,
        },
      },
    });
    if (error) throw error;
    track('signup', { role, method: 'email' });

    // The database trigger (handle_new_user) creates the profile row on
    // signup. This upsert is a best-effort fallback for projects where the
    // trigger migration hasn't been applied yet. It must never fail the
    // signup: with email confirmation enabled there is no session yet, so
    // RLS will (correctly) reject this write.
    if (data.user && data.session) {
      const { error: profileError } = await supabase
        .from('users')
        .upsert(
          { id: data.user.id, email: data.user.email, role, phone: phone?.trim() || null },
          { onConflict: 'id' }
        );

      if (profileError) {
        console.warn('Could not create profile row (trigger should handle it):', profileError.message);
      }
    }

    // Fire the onboarding welcome pack (best-effort, backgrounded): a branded
    // email now, plus a follow-up WhatsApp if a contact number was provided.
    if (data.user) {
      sendWelcomePack({ userId: data.user.id, email, phone: phone?.trim() || undefined, role });
    }
  };

  const signIn = async (identifier: string, password: string) => {
    const id = identifier.trim();
    const { data, error } = isEmail(id)
      ? await supabase.auth.signInWithPassword({ email: id.toLowerCase(), password })
      : await supabase.auth.signInWithPassword({ phone: normalizePhone(id), password });
    if (error) throw error;
    recordLoginEvent(data.user?.id);
  };

  // Confirm a phone signup with the 6-digit SMS code. On success Supabase
  // returns a session, so the onAuthStateChange listener signs the user in.
  const verifyPhoneOtp = async (phone: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ phone: normalizePhone(phone), token: token.trim(), type: 'sms' });
    if (error) throw error;
  };

  const resendPhoneOtp = async (phone: string) => {
    const { error } = await supabase.auth.resend({ type: 'sms', phone: normalizePhone(phone) });
    if (error) throw error;
  };

  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  // Requires the provider to be enabled in Supabase (Authentication →
  // Providers); otherwise Supabase returns an error shown by the modal.
  const signInWithOAuth = async (provider: 'google' | 'github') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signInWithGoogle = () => signInWithOAuth('google');
  const signInWithGitHub = () => signInWithOAuth('github');

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const signOutAllDevices = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, verifyPhoneOtp, resendPhoneOtp, requestPasswordReset, updatePassword, signInWithGoogle, signInWithGitHub, signOut, signOutAllDevices }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
