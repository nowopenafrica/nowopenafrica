import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { ALWAYS_LISTEN_KEY } from '../lib/voiceWake';

/*
 * The overlays were in the entry bundle, so every visitor downloaded an
 * unopened chat panel and a speech-recognition runtime before first paint.
 * MEASURED 2026-10-10: deferring them moved the entry from 151.94 kB to
 * 140.18 kB gzip.
 *
 * The risk this guards is not the saving, it is the regression: a visitor who
 * switched always-listening ON expects it to resume by itself.
 */

vi.mock('../components/ChatBot', () => ({ default: () => <div data-testid="chatbot" /> }));
vi.mock('../components/VoiceAssistant', () => ({ default: () => <div data-testid="voice" /> }));
vi.mock('../components/TrialPromoModal', () => ({ default: () => <div data-testid="promo" /> }));

const APP = readFileSync('src/App.tsx', 'utf8');

async function mount() {
  const { default: DeferredOverlays } = await import('../components/DeferredOverlays');
  return render(<DeferredOverlays />);
}

describe('deferred overlays', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  it('renders nothing for a visitor who has not interacted', async () => {
    await mount();
    expect(screen.queryByTestId('chatbot')).toBeNull();
    expect(screen.queryByTestId('voice')).toBeNull();
  });

  /*
   * The one that matters. Opting in is a setting the user turned on; hiding
   * it behind a click would quietly remove it.
   */
  it('loads immediately for a visitor who opted into always-listening', async () => {
    localStorage.setItem(ALWAYS_LISTEN_KEY, '1');
    await mount();
    await waitFor(() => expect(screen.getByTestId('voice')).toBeTruthy());
  });

  it('loads on the first sign of interaction', async () => {
    await mount();
    expect(screen.queryByTestId('chatbot')).toBeNull();
    fireEvent.pointerDown(window);
    await waitFor(() => expect(screen.getByTestId('chatbot')).toBeTruthy());
  });

  it('survives storage being unreadable', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await expect(mount()).resolves.toBeTruthy();
    spy.mockRestore();
  });

  /*
   * A re-added eager import would silently undo all of this and nothing on
   * screen would differ.
   */
  it('App.tsx does not import the heavy overlays eagerly', () => {
    expect(APP).toMatch(/import DeferredOverlays from/);
    expect(APP).not.toMatch(/^import ChatBot from/m);
    expect(APP).not.toMatch(/^import VoiceAssistant from/m);
    expect(APP).not.toMatch(/^import TrialPromoModal from/m);
  });

  /*
   * Consent is deliberately NOT deferred: a notice that appears late is worse
   * than one that costs a little.
   */
  it('leaves the cookie consent notice eager', () => {
    expect(APP).toMatch(/^import CookieConsent from/m);
  });
});
