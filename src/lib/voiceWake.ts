// Always-listening state for the NowOpen AI assistant.
//
// WHAT "ALWAYS LISTENING" CAN AND CANNOT MEAN ON THE WEB
//
// It CAN mean: no tapping. Microphone permission is remembered per origin, so
// once it has been granted, later visits may start recognition programmatically
// — the page opens and is already waiting for "NowOpen AI", with no click.
//
// It CANNOT mean: listening while the browser or tab is closed. A web page does
// not run then, and there is no background wake-word service available to one.
// That needs a native app or an OS assistant integration; no amount of web code
// gets around it, and it is a deliberate platform boundary, not a gap.
//
// Two further reasons this is opt-in and clearly indicated rather than on by
// default:
//   • Chrome's SpeechRecognition streams captured audio to a Google service for
//     transcription. Leaving that running permanently is a privacy and mobile
//     data decision that belongs to the user, not to us.
//   • Continuous recognition keeps the microphone and radio awake, which costs
//     battery — it should stop when the tab is not in front.

export const ALWAYS_LISTEN_KEY = 'nowopen_voice_always_listen';

export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

/** Has the user asked for hands-free listening? */
export function loadAlwaysListen(): boolean {
  try {
    return localStorage.getItem(ALWAYS_LISTEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveAlwaysListen(on: boolean): void {
  try {
    if (on) localStorage.setItem(ALWAYS_LISTEN_KEY, '1');
    else localStorage.removeItem(ALWAYS_LISTEN_KEY);
  } catch {
    /* private mode — the preference just won't survive the session */
  }
}

/**
 * Current microphone permission, without prompting for it.
 *
 * The Permissions API is the only way to know whether recognition can be started
 * without a user gesture. Safari has historically not implemented the
 * 'microphone' descriptor, hence 'unknown' — which callers must treat as "ask
 * first", never as "granted".
 */
export async function micPermissionState(): Promise<MicPermission> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    const state = status.state;
    if (state === 'granted' || state === 'denied' || state === 'prompt') return state;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * May the assistant start listening on its own, with no interaction?
 *
 * Only when the user opted in AND the browser already holds permission. An
 * 'unknown' state deliberately does not qualify: guessing there would trigger a
 * permission prompt nobody asked for, on page load.
 */
export function canAutoListen(alwaysListen: boolean, permission: MicPermission): boolean {
  return alwaysListen && permission === 'granted';
}

/**
 * Should the microphone be running right now?
 *
 * Folded into one function so the component has a single source of truth across
 * the several events that can change the answer — opting in or out, permission
 * being revoked in browser settings, and the tab being hidden or restored.
 */
export function shouldListen(opts: {
  alwaysListen: boolean;
  permission: MicPermission;
  tabVisible: boolean;
  /** True while the user has the assistant panel open (an explicit session). */
  panelOpen: boolean;
}): boolean {
  if (opts.permission === 'denied') return false;
  // An open panel is an explicit request; keep listening even if hands-free is
  // off, but still stop when the tab goes away.
  if (opts.panelOpen) return opts.tabVisible;
  return canAutoListen(opts.alwaysListen, opts.permission) && opts.tabVisible;
}
