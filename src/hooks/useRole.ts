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
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setRole(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const loadRole = async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        setRole(data?.role ?? null);
        setChecking(false);
      } catch {
        if (!cancelled) {
          setRole(null);
          setChecking(false);
        }
      }
    };
    void loadRole();
    return () => { cancelled = true; };
  }, [user]);

  return { role, checking };
}
