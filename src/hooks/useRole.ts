import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// The signed-in user's role from the users table. The auth user object only
// carries metadata; the authoritative role lives in the profile row, so we
// read it the same way the dashboard and admin pages do. Unknown users (and
// query failures) report null so callers hide admin-only UI by default.
export function useRole(): { role: string | null; checking: boolean } {
  const { user } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  /*
   * WHICH user the role in state belongs to — not a boolean.
   *
   * THE BUG THIS FIXES, reproduced on production: a full page load of /admin
   * redirected a genuine admin to /dashboard every time. In-app navigation
   * worked, so the console looked fine until somebody bookmarked it or hit
   * reload.
   *
   * It was an effect-ordering race, and a `checking` boolean could not avoid
   * it. On a cold load:
   *
   *   1. `user` is null, so the effect takes the early return and sets
   *      `checking = false`, `role = null`.
   *   2. Auth resolves and `user` becomes set. React RENDERS — with `user`
   *      truthy, `checking` still false and `role` still null.
   *   3. AdminRoute evaluates on exactly that render, sees `role !== 'admin'`
   *      with nothing pending, and navigates away.
   *   4. The effect then runs and sets `checking = true`. Far too late; the
   *      redirect has already happened.
   *
   * Deriving it removes the window rather than narrowing it: we are "checking"
   * whenever we do not yet hold a result for the CURRENT user id, which is
   * true on that render by construction. State that says which user it
   * describes cannot be stale about a different one.
   */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setRole(null);
      setLoadedFor(null);
      return;
    }
    const loadRole = async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        setRole(data?.role ?? null);
      } catch {
        if (!cancelled) setRole(null);
      } finally {
        // Marked resolved either way: a failed lookup is an answer (no role),
        // and leaving it unresolved would spin forever.
        if (!cancelled) setLoadedFor(user.id);
      }
    };
    void loadRole();
    return () => { cancelled = true; };
  }, [user]);

  // Signed out is a resolved state, not a pending one.
  const checking = user ? loadedFor !== user.id : false;

  return { role, checking };
}
