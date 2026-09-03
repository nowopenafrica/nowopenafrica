import { useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { toFlagMap, isEnabled, type FlagMap, type FlagKey } from '../lib/featureFlags';

/**
 * The current feature flags.
 *
 * Reads once and caches in module scope, because every surface on the platform
 * asks the same question and none of them should cost a round trip. Flags
 * change when an operator flips one — rarely, and deliberately — so a refresh
 * on navigation would be waste.
 *
 * A read failure is not an error state here. `toFlagMap` already falls back to
 * the per-flag default, so the app carries on with the product working and
 * outbound messaging silent. That is the whole point: the flags must not become
 * a new way for the platform to break.
 */
let cache: FlagMap | null = null;
let inflight: Promise<FlagMap> | null = null;

async function load(): Promise<FlagMap> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase.from('feature_flags').select('key,enabled');
      cache = toFlagMap(data as Array<{ key: string; enabled: boolean }> | null);
    } catch {
      cache = toFlagMap(null);
    } finally {
      inflight = null;
    }
    return cache!;
  })();
  return inflight;
}

/** Drop the cache so the next read hits the table. Used after an admin toggle. */
export function invalidateFlags(): void {
  cache = null;
}

export function useFeatureFlags(): { flags: FlagMap; ready: boolean } {
  const [flags, setFlags] = useState<FlagMap>(() => cache ?? toFlagMap(null));
  const [ready, setReady] = useState<boolean>(() => cache !== null);

  useEffect(() => {
    let cancelled = false;
    void load().then((f) => {
      if (cancelled) return;
      setFlags(f);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  return { flags, ready };
}

/**
 * Is one surface on?
 *
 * Returns the fallback while loading rather than false, so a feature does not
 * flicker out of existence on every cold start.
 */
export function useFeature(key: FlagKey): boolean {
  const { flags } = useFeatureFlags();
  return isEnabled(flags, key);
}
