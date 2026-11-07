import { Suspense, lazy, useEffect, useState } from 'react';

import { ALWAYS_LISTEN_KEY } from '../lib/voiceWake';

/**
 * The always-on overlays, loaded only when they are actually wanted.
 *
 * ── THE PROBLEM, MEASURED 2026-10-10 ─────────────────────────────────────
 *
 * `ChatBot`, `VoiceAssistant` and `TrialPromoModal` were imported eagerly by
 * App.tsx, so every visitor on every route downloaded and parsed them before
 * the first screen could paint — including the large majority who never open
 * any of them. VoiceAssistant alone is 607 lines and pulls three voice
 * runtime modules behind it.
 *
 * This platform's audience is African mobile, frequently on slow or metered
 * connections. Shipping an unopened chat panel and a speech-recognition
 * runtime to those devices is the most expensive thing on the page that
 * nobody asked for.
 *
 * ── WHY NOT SIMPLY lazy() THEM ───────────────────────────────────────────
 *
 * VoiceAssistant restores `alwaysListen` from localStorage: a user who has
 * opted in expects listening to resume by itself when the site opens. Hiding
 * it behind a click would silently remove a feature they switched on.
 *
 * So the opt-in flag is read here — one localStorage key, no component — and
 * anyone who opted in gets the real thing immediately. Everyone else gets it
 * on first interaction, or when the browser is idle, whichever comes first.
 *
 * `CookieConsent` is deliberately NOT deferred. It is 56 lines, and a consent
 * notice that appears late is worse than one that costs a little.
 */

const ChatBot = lazy(() => import('./ChatBot'));
const VoiceAssistant = lazy(() => import('./VoiceAssistant'));
const TrialPromoModal = lazy(() => import('./TrialPromoModal'));

/** Did this visitor already turn always-listening on? */
function hasOptedIntoVoice(): boolean {
  try {
    return localStorage.getItem(ALWAYS_LISTEN_KEY) === '1';
  } catch {
    /* Private mode, blocked storage. Not opted in, as far as we can tell. */
    return false;
  }
}

export default function DeferredOverlays() {
  /*
   * Start true only for a visitor who opted into voice, so their setting is
   * honoured on the very first paint exactly as it was before.
   */
  const [ready, setReady] = useState(hasOptedIntoVoice);

  useEffect(() => {
    if (ready) return undefined;

    let cancelled = false;
    const load = () => { if (!cancelled) setReady(true); };

    /*
     * Any sign of engagement, and the overlays come in. These fire long
     * before someone reaches for the chat button, so the panel is already
     * there when they do — the deferral is invisible to the user, and only
     * visible on the network tab of someone who bounces.
     */
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    for (const e of events) window.addEventListener(e, load, { once: true, passive: true });

    /*
     * And a floor: if nobody touches anything, load them once the browser is
     * genuinely idle, so a reader who sits still still ends up with a working
     * chat button. requestIdleCallback is absent on Safari, hence the timeout.
     */
    const idle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(load, { timeout: 4000 })
      : window.setTimeout(load, 2500);

    return () => {
      cancelled = true;
      for (const e of events) window.removeEventListener(e, load);
      if (typeof window.cancelIdleCallback === 'function' && typeof idle === 'number') {
        window.cancelIdleCallback(idle);
      } else {
        window.clearTimeout(idle as number);
      }
    };
  }, [ready]);

  if (!ready) return null;

  /*
   * No fallback UI. These are overlays anchored to the corners of the
   * viewport; a spinner or a placeholder box appearing there would be a
   * layout shift announcing a load nobody requested.
   */
  return (
    <Suspense fallback={null}>
      <ChatBot />
      <VoiceAssistant />
      <TrialPromoModal />
    </Suspense>
  );
}
