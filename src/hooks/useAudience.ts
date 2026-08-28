import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRole } from './useRole';
import {
  Audience, resolveAudience, canSwitchAudience,
  readAudiencePreference, writeAudiencePreference,
} from '../lib/audience';

/**
 * Which experience to show, and whether this person may switch.
 *
 * Counts only — `head: true` with an exact count asks the database how many
 * rows there are without sending any of them, because the answer needed here is
 * "any?" and pulling every business someone owns to call `.length` on it is
 * work nobody sees.
 *
 * Signed-out visitors are people. That is not a fallback; it is correct.
 */
export function useAudience(): {
  audience: Audience;
  canSwitch: boolean;
  setAudience: (a: Audience) => void;
  checking: boolean;
} {
  const { user } = useAuth();
  const { role } = useRole();
  const [owned, setOwned] = useState({ businesses: 0, media: 0 });
  const [preference, setPreference] = useState<Audience | null>(() => readAudiencePreference());
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setOwned({ businesses: 0, media: 0 });
      setChecking(false);
      return;
    }
    setChecking(true);
    (async () => {
      const [b, m] = await Promise.all([
        supabase.from('businesses').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('media_services').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      if (cancelled) return;
      setOwned({ businesses: b.count ?? 0, media: m.count ?? 0 });
      setChecking(false);
    })().catch(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [user]);

  const input = {
    ownedBusinesses: owned.businesses,
    ownedMediaServices: owned.media,
    role,
    preference,
  };

  const setAudience = useCallback((a: Audience) => {
    writeAudiencePreference(a);
    setPreference(a);
  }, []);

  return {
    audience: resolveAudience(input),
    canSwitch: canSwitchAudience(input),
    setAudience,
    checking,
  };
}
