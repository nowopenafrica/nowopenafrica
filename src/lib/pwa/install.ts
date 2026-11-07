/**
 * Installing NowOpen Africa — the decisions, apart from the browser.
 *
 * ── WHAT A WEBSITE CAN AND CANNOT DO ─────────────────────────────────────
 *
 * It cannot install itself. On Chromium the browser MAY offer a prompt, and
 * a page may ask for that prompt to be shown — once, in response to a tap.
 * On iOS there is no such API at all: installation is Share → Add to Home
 * Screen, performed by the person, in Safari.
 *
 * So there are exactly three honest things a button can do, and this module
 * decides which:
 *
 *   prompt       the browser gave us a deferred prompt; show it.
 *   instructions no API exists here; explain the real steps for this browser.
 *   installed    already running as an app; offer nothing.
 *
 * A fourth — claiming an install happened — is never available. The
 * `appinstalled` event and display-mode are the only evidence, and a tap on
 * a button is not evidence of anything.
 *
 * ── WHY DETECTION IS CONSERVATIVE ────────────────────────────────────────
 *
 * User-agent sniffing is wrong often enough to matter: an iPad reports itself
 * as a Mac, Chrome on iOS is Safari underneath and cannot install at all, and
 * an in-app browser (Instagram, Facebook) has no Share → Add to Home Screen
 * at all. Where a capability can be tested it is tested; where it cannot, the
 * result is "unknown" and the user gets the generic instructions rather than
 * confident instructions for the wrong browser.
 */

export type Platform = 'ios' | 'android' | 'desktop' | 'unknown';

export type InstallState =
  /** A deferred prompt is in hand. The button can open it. */
  | { kind: 'prompt' }
  /** No API here. Show the steps that actually work on this platform. */
  | { kind: 'instructions'; platform: Platform; inAppBrowser: boolean }
  /** Already running as an installed app. */
  | { kind: 'installed' };

export interface Environment {
  userAgent: string;
  /** window.matchMedia('(display-mode: standalone)').matches */
  standalone: boolean;
  /** navigator.standalone — iOS Safari's own flag, absent elsewhere. */
  iosStandalone?: boolean;
  /** Whether a beforeinstallprompt event has been captured. */
  deferredPrompt: boolean;
  /** Touch points, which is how an iPad pretending to be a Mac is caught. */
  maxTouchPoints?: number;
}

/**
 * Which platform this is, as far as can honestly be told.
 *
 * iPadOS 13+ reports a Mac user-agent, so a desktop-looking Safari WITH touch
 * points is an iPad. Getting that wrong means showing a tablet user desktop
 * instructions that mention a menu they do not have.
 */
export function platformOf(env: Environment): Platform {
  const ua = (env.userAgent || '').toLowerCase();

  if (/iphone|ipod/.test(ua)) return 'ios';
  if (/ipad/.test(ua)) return 'ios';
  /* The iPad-as-Mac case: Safari on macOS has no touch screen. */
  if (/macintosh/.test(ua) && (env.maxTouchPoints ?? 0) > 1) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/windows|macintosh|linux|cros/.test(ua)) return 'desktop';
  return 'unknown';
}

/**
 * A browser embedded in another app.
 *
 * Instagram, Facebook, TikTok and LinkedIn open links in their own web view,
 * which has NO Share → Add to Home Screen and no install prompt. Telling
 * somebody in there to tap Share sends them looking for a button that is not
 * on their screen, so they are told to open the site in their real browser
 * first. A large share of African mobile traffic arrives exactly this way.
 */
export function isInAppBrowser(userAgent: string): boolean {
  const ua = (userAgent || '').toLowerCase();
  return /\b(fban|fbav|fb_iab|instagram|line|micromessenger|tiktok|linkedinapp|twitter)\b/.test(ua)
    /* These two appear without word boundaries in some builds. */
    || ua.includes('fbav') || ua.includes('instagram');
}

/** Already running as an installed app? */
export const isInstalled = (env: Environment): boolean =>
  env.standalone || env.iosStandalone === true;

/** What the button should do, right now. */
export function installState(env: Environment): InstallState {
  if (isInstalled(env)) return { kind: 'installed' };
  /*
   * A captured prompt beats everything. It is the only signal that is
   * actually a capability rather than an inference from a string.
   */
  if (env.deferredPrompt) return { kind: 'prompt' };
  return {
    kind: 'instructions',
    platform: platformOf(env),
    inAppBrowser: isInAppBrowser(env.userAgent),
  };
}

/** The words on the button, matching exactly what the tap will do. */
export function installLabel(state: InstallState): string {
  switch (state.kind) {
    case 'installed': return 'Open the app';
    case 'prompt': return 'Install the app';
    default: return 'Add to home screen';
  }
}

export interface Step {
  text: string;
  /** A glyph to draw beside the step, where one helps find the control. */
  icon?: 'share' | 'add' | 'done';
}

/**
 * The real steps, per platform.
 *
 * Written without screen coordinates or icon positions, because those change
 * between OS versions and a confidently wrong instruction is worse than a
 * general one.
 */
export function instructionsFor(platform: Platform, inAppBrowser: boolean): Step[] {
  if (inAppBrowser) {
    return [
      { text: 'This page is open inside another app, which cannot add to your home screen.' },
      { text: 'Tap the menu in the corner and choose "Open in browser".' },
      { text: 'Then come back to this page and tap the button again.' },
    ];
  }

  switch (platform) {
    case 'ios':
      /*
       * Three steps, and they cannot become one.
       *
       * iOS provides NO API for a website to trigger installation — not a
       * permission to request, not a prompt to call. Share → Add to Home
       * Screen, performed by the person, is the only route Apple allows, and
       * every "one-tap iPhone install" on the web is either a native App
       * Store app or a lie. The honest thing is to make the three steps as
       * short and as findable as possible, which is what the share glyph in
       * the sheet is for.
       */
      return [
        { text: 'In Safari, tap the Share button in the toolbar.', icon: 'share' },
        { text: 'Scroll and choose "Add to Home Screen".', icon: 'add' },
        { text: 'Tap "Add" — NowOpen joins your other apps.', icon: 'done' },
      ];
    case 'android':
      return [
        { text: 'Open your browser menu.' },
        { text: 'Choose "Install app" or "Add to Home screen".' },
        { text: 'Confirm, and NowOpen appears with your other apps.' },
      ];
    case 'desktop':
      return [
        { text: 'Look for the install icon at the right of the address bar.' },
        { text: 'Or open the browser menu and choose "Install NowOpen Africa".' },
        { text: 'It opens in its own window, without browser tabs.' },
      ];
    default:
      return [
        { text: 'Open your browser menu.' },
        { text: 'Look for "Install app", "Add to Home screen" or a similar option.' },
        { text: 'If you cannot find it, the website works exactly the same in your browser.' },
      ];
  }
}

/** Remembers a dismissal, so the offer is not made again and again. */
export const DISMISS_KEY = 'nowopen.install.dismissed';

/**
 * How long a "not now" lasts.
 *
 * Long enough not to nag, short enough that somebody who changes their mind
 * in a month is offered it again.
 */
export const DISMISS_DAYS = 30;

export function isDismissed(stored: string | null, now = Date.now()): boolean {
  if (!stored) return false;
  const at = Number(stored);
  if (!Number.isFinite(at)) return false;
  return now - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}
