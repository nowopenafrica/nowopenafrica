import { useCallback, useEffect, useState } from 'react';
import {
  BrandIdentity, DEFAULT_BRAND_IDENTITY,
  loadBrandIdentity, saveBrandIdentity, resetBrandIdentity,
} from '../lib/brandIdentity';

// Per-business editable brand identity shared across the Brand OS. Saved to
// localStorage so guidelines, signatures, letterheads and banners all read the
// exact same identity the owner set.
export function useBrandIdentity(businessId: string) {
  const [identity, setIdentity] = useState<BrandIdentity>(() => loadBrandIdentity(businessId));

  useEffect(() => {
    setIdentity(loadBrandIdentity(businessId));
  }, [businessId]);

  const update = useCallback((patch: Partial<BrandIdentity>) => {
    setIdentity((prev) => {
      const next = { ...prev, ...patch };
      saveBrandIdentity(businessId, next);
      return next;
    });
  }, [businessId]);

  const toggleVoice = useCallback((key: string) => {
    setIdentity((prev) => {
      const has = prev.voice.includes(key);
      const next = { ...prev, voice: has ? prev.voice.filter((k) => k !== key) : [...prev.voice, key] };
      saveBrandIdentity(businessId, next);
      return next;
    });
  }, [businessId]);

  const reset = useCallback(() => {
    resetBrandIdentity(businessId);
    setIdentity({ ...DEFAULT_BRAND_IDENTITY });
  }, [businessId]);

  return { identity, update, toggleVoice, reset };
}
