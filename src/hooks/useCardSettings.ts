import { useCallback, useEffect, useState } from 'react';
import {
  CardSettings, DEFAULT_CARD_SETTINGS,
  loadCardSettings, saveCardSettings, resetCardSettings,
} from '../lib/cardSettings';

// Per-business editable card settings shared by Brand Card Studio (editor +
// preview) and the Export Centre (so exports match what the owner saved).
export function useCardSettings(businessId: string) {
  const [settings, setSettings] = useState<CardSettings>(() => loadCardSettings(businessId));

  useEffect(() => {
    setSettings(loadCardSettings(businessId));
  }, [businessId]);

  const update = useCallback((patch: Partial<CardSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveCardSettings(businessId, next);
      return next;
    });
  }, [businessId]);

  const reset = useCallback(() => {
    resetCardSettings(businessId);
    setSettings({ ...DEFAULT_CARD_SETTINGS });
  }, [businessId]);

  return { settings, update, reset };
}
