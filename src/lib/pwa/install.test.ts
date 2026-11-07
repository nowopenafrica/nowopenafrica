import { describe, it, expect } from 'vitest';

import {
  DISMISS_DAYS, installLabel, installState, instructionsFor, isDismissed,
  isInAppBrowser, isInstalled, platformOf, type Environment,
} from './install';

const env = (over: Partial<Environment> = {}): Environment => ({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
  standalone: false,
  deferredPrompt: false,
  ...over,
});

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile';

describe('knowing which device this is', () => {
  it('recognises the obvious cases', () => {
    expect(platformOf(env({ userAgent: IPHONE }))).toBe('ios');
    expect(platformOf(env({ userAgent: ANDROID }))).toBe('android');
    expect(platformOf(env())).toBe('desktop');
  });

  /*
   * ── THE IPAD THAT SAYS IT IS A MAC ───────────────────────────────────
   *
   * iPadOS 13 and later report a desktop Safari user-agent. Taking that at
   * face value shows a tablet user desktop instructions about an install
   * icon in the address bar, which their browser does not have. Safari on a
   * real Mac has no touch screen, so the touch points settle it.
   */
  it('catches an iPad pretending to be a Mac', () => {
    expect(platformOf(env({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }))).toBe('ios');
    expect(platformOf(env({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0 }))).toBe('desktop');
  });

  it('says unknown rather than guessing', () => {
    expect(platformOf(env({ userAgent: 'SomeBrowser/1.0' }))).toBe('unknown');
  });
});

describe('a browser inside another app', () => {
  /*
   * A large share of African mobile traffic arrives from a link in Instagram
   * or Facebook. Those web views have no Share → Add to Home Screen, so
   * telling somebody to tap Share sends them hunting for a button that is
   * not on their screen.
   */
  it('is recognised for the apps people actually arrive from', () => {
    expect(isInAppBrowser(`${IPHONE} Instagram 300.0`)).toBe(true);
    expect(isInAppBrowser(`${IPHONE} [FBAV/400.0]`)).toBe(true);
    expect(isInAppBrowser(IPHONE)).toBe(false);
    expect(isInAppBrowser(ANDROID)).toBe(false);
  });

  it('is told to open a real browser first, before anything about Share', () => {
    const steps = instructionsFor('ios', true).map((s) => s.text.toLowerCase());
    expect(steps[0]).toMatch(/another app/);
    expect(steps.join(' ')).toMatch(/open in browser/);
    expect(steps[0]).not.toMatch(/share/);
  });
});

describe('what the button does', () => {
  it('offers the real prompt when the browser gave us one', () => {
    expect(installState(env({ userAgent: ANDROID, deferredPrompt: true })).kind).toBe('prompt');
  });

  /*
   * No API exists on iOS. A button claiming to install would be a button
   * that does nothing, so it opens the real steps instead.
   */
  it('falls back to instructions where no API exists', () => {
    const state = installState(env({ userAgent: IPHONE }));
    expect(state.kind).toBe('instructions');
    if (state.kind === 'instructions') expect(state.platform).toBe('ios');
  });

  it('offers nothing once it is already installed', () => {
    expect(installState(env({ standalone: true, deferredPrompt: true })).kind).toBe('installed');
    expect(installState(env({ iosStandalone: true })).kind).toBe('installed');
  });

  it('prefers a captured prompt over anything inferred from a string', () => {
    /* A real capability beats a guess about the platform. */
    expect(installState(env({ userAgent: IPHONE, deferredPrompt: true })).kind).toBe('prompt');
  });

  it('labels itself with what will actually happen', () => {
    expect(installLabel({ kind: 'prompt' })).toMatch(/install/i);
    expect(installLabel({ kind: 'installed' })).toMatch(/open/i);
    expect(installLabel({ kind: 'instructions', platform: 'ios', inAppBrowser: false }))
      .toMatch(/home screen/i);
  });
});

describe('the instructions themselves', () => {
  it('tell an iPhone user the one thing that actually blocks them', () => {
    /* Chrome and Firefox on iOS cannot add to the home screen at all. */
    expect(instructionsFor('ios', false)[0].text).toMatch(/safari/i);
  });

  it('never points at a position on screen', () => {
    for (const p of ['ios', 'android', 'desktop', 'unknown'] as const) {
      const text = instructionsFor(p, false).map((s) => s.text).join(' ').toLowerCase();
      /* Icon positions move between OS versions; a confidently wrong
         instruction is worse than a general one. */
      expect(text, p).not.toMatch(/top right|bottom right|top left|bottom left/);
    }
  });

  it('still says something useful when the platform is unknown', () => {
    const steps = instructionsFor('unknown', false);
    expect(steps.length).toBeGreaterThan(1);
    /* And admits the site is fine as a website, rather than insisting. */
    expect(steps.map((s) => s.text).join(' ')).toMatch(/works exactly the same/i);
  });
});

describe('not nagging', () => {
  it('remembers a dismissal for a while, then offers again', () => {
    const now = Date.now();
    expect(isDismissed(String(now), now)).toBe(true);
    const old = now - (DISMISS_DAYS + 1) * 24 * 60 * 60 * 1000;
    expect(isDismissed(String(old), now)).toBe(false);
  });

  it('treats nothing stored, or nonsense, as not dismissed', () => {
    expect(isDismissed(null)).toBe(false);
    expect(isDismissed('not-a-date')).toBe(false);
  });
});

describe('claiming an install', () => {
  /*
   * The ONLY evidence is display-mode or the appinstalled event. A tap on a
   * button is not evidence, and a page that says "installed!" on click is
   * lying to somebody who will discover it on their home screen.
   */
  it('requires real evidence, not a button press', () => {
    expect(isInstalled(env({ deferredPrompt: true }))).toBe(false);
    expect(isInstalled(env({ standalone: true }))).toBe(true);
    expect(isInstalled(env({ iosStandalone: true }))).toBe(true);
  });
});
