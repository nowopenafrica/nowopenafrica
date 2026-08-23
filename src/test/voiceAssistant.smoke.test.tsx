import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ALWAYS_LISTEN_KEY } from '../lib/voiceWake';

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

// Geolocation is irrelevant here and would hang; keep it out of the way.
vi.mock('../lib/geolocation', () => ({
  isGeolocationSupported: () => false,
  detectLocation: vi.fn(),
}));

import VoiceAssistant from '../components/VoiceAssistant';

/** Stand-in for the browser recogniser, so the loop can be driven directly. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static startCount = 0;
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() { FakeRecognition.instances.push(this); }
  start() { FakeRecognition.startCount += 1; }
  stop() { this.onend?.(); }
  abort() {}
  say(transcript: string) { this.onresult?.({ results: [[{ transcript }]] }); }
}

const setPermission = (state: string) => {
  (navigator as unknown as { permissions: unknown }).permissions = {
    query: async () => ({ state, addEventListener: () => {}, removeEventListener: () => {} }),
  };
};

const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

beforeEach(() => {
  FakeRecognition.instances = [];
  FakeRecognition.startCount = 0;
  navigateSpy.mockClear();
  localStorage.clear();
  (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
});

const mount = () => render(<MemoryRouter><VoiceAssistant /></MemoryRouter>);

describe('VoiceAssistant — hands-free activation', () => {
  it('starts listening on load, with nothing clicked, once opted in and permitted', async () => {
    // Exactly a returning visitor: preference saved, microphone already granted.
    localStorage.setItem(ALWAYS_LISTEN_KEY, '1');
    setPermission('granted');
    mount();
    await waitFor(() => expect(FakeRecognition.startCount).toBeGreaterThan(0));
    // And it says so, rather than listening silently.
    expect(await screen.findByLabelText('NowOpen AI is listening')).toBeInTheDocument();
  });

  it('acts on "NowOpen AI …" with no click anywhere in the flow', async () => {
    localStorage.setItem(ALWAYS_LISTEN_KEY, '1');
    setPermission('granted');
    mount();
    await waitFor(() => expect(latest()).toBeTruthy());
    latest().say('nowopen ai i need a barber');
    await waitFor(() => expect(navigateSpy).toHaveBeenCalled());
    expect(navigateSpy.mock.calls[0][0]).toContain('/businesses?search=');
  });

  it('ignores speech that is not addressed to it', async () => {
    localStorage.setItem(ALWAYS_LISTEN_KEY, '1');
    setPermission('granted');
    mount();
    await waitFor(() => expect(latest()).toBeTruthy());
    latest().say('so then I told him the price was too high');
    await new Promise((r) => setTimeout(r, 50));
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('keeps the loop alive: recognition ending restarts it', async () => {
    localStorage.setItem(ALWAYS_LISTEN_KEY, '1');
    setPermission('granted');
    mount();
    await waitFor(() => expect(FakeRecognition.startCount).toBe(1));
    // Recognisers stop after silence; hands-free depends on this restart.
    latest().onend?.();
    await waitFor(() => expect(FakeRecognition.startCount).toBeGreaterThan(1));
  });

  it('does NOT listen on load without the opt-in', async () => {
    setPermission('granted');
    mount();
    await new Promise((r) => setTimeout(r, 80));
    expect(FakeRecognition.startCount).toBe(0);
    expect(screen.getByLabelText('Voice search')).toBeInTheDocument();
  });

  it('does NOT provoke a permission prompt on load', async () => {
    // Opted in, but permission not yet granted: starting would pop a dialog the
    // visitor never asked for.
    localStorage.setItem(ALWAYS_LISTEN_KEY, '1');
    setPermission('prompt');
    mount();
    await new Promise((r) => setTimeout(r, 80));
    expect(FakeRecognition.startCount).toBe(0);
  });

  it('stays silent when the microphone is blocked for the site', async () => {
    localStorage.setItem(ALWAYS_LISTEN_KEY, '1');
    setPermission('denied');
    mount();
    await new Promise((r) => setTimeout(r, 80));
    expect(FakeRecognition.startCount).toBe(0);
  });

  it('hides itself entirely where SpeechRecognition is missing', async () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    setPermission('granted');
    const { container } = mount();
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toBe('');
  });

  it('opting in from the panel persists, so later visits need no tap', async () => {
    setPermission('granted');
    mount();
    fireEvent.click(screen.getByLabelText('Voice search'));
    const toggle = await screen.findByRole('checkbox');
    fireEvent.click(toggle);
    expect(localStorage.getItem(ALWAYS_LISTEN_KEY)).toBe('1');
    await waitFor(() => expect(FakeRecognition.startCount).toBeGreaterThan(0));
  });
});
