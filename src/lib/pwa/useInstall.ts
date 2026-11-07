import { useCallback, useEffect, useState } from 'react';

import {
  DISMISS_KEY, installState, isDismissed, type Environment, type InstallState,
} from './install';

/**
 * The browser side of installing — events, registration and the one call a
 * page is allowed to make.
 *
 * The decisions all live in ./install.ts so they can be tested without a
 * browser. What is here is the part that genuinely needs one.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/* Held outside React: the event fires once, often before anything mounts. */
let deferred: BeforeInstallPromptEvent | null = null;
let installedFlag = false;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    /*
     * Chrome's own banner is suppressed so the site's button can offer it
     * instead — but ONLY because that button exists and will call prompt().
     * Preventing the default without a way to re-offer it would remove the
     * only install route the browser had.
     */
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event('nowopen:installable'));
  });
  window.addEventListener('appinstalled', () => {
    installedFlag = true;
    deferred = null;
    window.dispatchEvent(new Event('nowopen:installed'));
  });
}

const readEnvironment = (): Environment => ({
  userAgent: navigator.userAgent,
  standalone: window.matchMedia?.('(display-mode: standalone)')?.matches === true || installedFlag,
  iosStandalone: (navigator as { standalone?: boolean }).standalone === true,
  deferredPrompt: deferred !== null,
  maxTouchPoints: navigator.maxTouchPoints,
});

export interface Install {
  state: InstallState;
  /** Whether the user has recently said "not now". */
  dismissed: boolean;
  /**
   * Ask the browser to show its prompt.
   *
   * Returns what actually happened. A click is NOT an install, and this is
   * the only place that can tell the difference.
   */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismiss: () => void;
}

export function useInstall(): Install {
  const [state, setState] = useState<InstallState>(() => (
    typeof window === 'undefined'
      ? { kind: 'instructions', platform: 'unknown', inAppBrowser: false }
      : installState(readEnvironment())
  ));
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const refresh = () => setState(installState(readEnvironment()));
    refresh();

    try {
      setDismissed(isDismissed(localStorage.getItem(DISMISS_KEY)));
    } catch {
      /* Private mode, or storage blocked. Offering again is the safe side. */
      setDismissed(false);
    }

    window.addEventListener('nowopen:installable', refresh);
    window.addEventListener('nowopen:installed', refresh);
    const media = window.matchMedia?.('(display-mode: standalone)');
    media?.addEventListener?.('change', refresh);

    return () => {
      window.removeEventListener('nowopen:installable', refresh);
      window.removeEventListener('nowopen:installed', refresh);
      media?.removeEventListener?.('change', refresh);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return 'unavailable' as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    /* A prompt can only be shown once; the browser re-fires the event if it
     * still wants to offer installation. */
    deferred = null;
    setState(installState(readEnvironment()));
    return outcome;
  }, []);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* fine */ }
    setDismissed(true);
  }, []);

  return { state, dismissed, promptInstall, dismiss };
}

/**
 * Register the service worker.
 *
 * Without one the browser never offers installation at all — which is why
 * this site has not been installable despite having had a correct manifest
 * and icons the whole time.
 *
 * Deliberately after load: a service worker competing with the first paint
 * for bandwidth makes the first visit slower, and the first visit is the one
 * that decides whether there is a second.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  /* Only over HTTPS or on localhost — anywhere else it cannot register and
   * the attempt is just a console error. */
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* An unregistered worker costs the install prompt, not the site. */
    });
  });
}
