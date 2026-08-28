import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ALWAYS_LISTEN_KEY } from '../lib/voiceWake';

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock('../lib/geolocation', () => ({
  isGeolocationSupported: () => false,
  detectLocation: vi.fn(),
}));

/** One business the assistant can find, with hours it can reason about. */
let dbRows: Record<string, unknown>[] = [];
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        ilike: () => ({
          order: () => ({
            limit: async () => ({ data: dbRows }),
          }),
        }),
      }),
    }),
  },
}));

import VoiceAssistant from '../components/VoiceAssistant';

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = ''; continuous = false; interimResults = false; maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() { FakeRecognition.instances.push(this); }
  start() {} stop() { this.onend?.(); } abort() {}
  say(transcript: string) { this.onresult?.({ results: [[{ transcript }]] }); }
}
const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

/** What the assistant said out loud. */
let spoken: string[] = [];

beforeEach(() => {
  FakeRecognition.instances = [];
  navigateSpy.mockClear();
  localStorage.clear();
  spoken = [];
  dbRows = [{
    id: 'b1', name: 'Mama Put Kitchen', username: 'mama-put', location: 'Yaba, Lagos',
    phone: '08031234567', opening_hours: 'Mon-Sat: 9AM-8PM', hours: null,
    timezone: 'Africa/Lagos', open_status: null,
  }];
  (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
  (window as unknown as Record<string, unknown>).speechSynthesis = {
    cancel: () => {},
    speak: (u: { text: string }) => { spoken.push(u.text); },
  };
  (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance =
    class { text: string; rate = 1; constructor(t: string) { this.text = t; } };
  (navigator as unknown as { permissions: unknown }).permissions = {
    query: async () => ({ state: 'granted', addEventListener: () => {}, removeEventListener: () => {} }),
  };
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  localStorage.setItem(ALWAYS_LISTEN_KEY, '1');
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
});

const mount = () => render(<MemoryRouter><VoiceAssistant /></MemoryRouter>);
const ask = async (said: string) => {
  mount();
  await waitFor(() => expect(latest()).toBeTruthy());
  latest().say(`nowopen ai ${said}`);
};

describe('VoiceAssistant — answering, not just navigating', () => {
  it('answers "is X open" out loud instead of opening a results page', async () => {
    // The whole point. A yes-or-no question deserves a yes-or-no answer, and
    // handing back a page to read is a worse response than a sentence.
    await ask('is mama put open');
    await waitFor(() => expect(spoken.join(' ')).toMatch(/Mama Put Kitchen is (open|closed)/));
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('says when they close, not just that they are open', async () => {
    await ask('is mama put open');
    await waitFor(() => expect(spoken.length).toBeGreaterThan(0));
    const answer = spoken.join(' ');
    expect(answer).toMatch(/Open until|Opens|closing soon/i);
  });

  it('will not claim open for a business whose hours cannot be read', async () => {
    // Guessing is how someone ends up outside a shut shop.
    dbRows = [{ ...dbRows[0], opening_hours: 'Call ahead', hours: null }];
    await ask('is mama put open');
    await waitFor(() => expect(spoken.length).toBeGreaterThan(0));
    expect(spoken.join(' ')).toMatch(/can't say for sure/);
  });

  it('sends "what\u2019s open near me" to the directory already filtered', async () => {
    await ask("what's open near me");
    await waitFor(() => expect(navigateSpy).toHaveBeenCalled());
    expect(navigateSpy.mock.calls[0][0]).toContain('status=open');
  });

  it('falls back to a search when the spoken name matches nothing', async () => {
    dbRows = [];
    await ask('is nowhere kitchen open');
    await waitFor(() => expect(navigateSpy).toHaveBeenCalled());
    expect(navigateSpy.mock.calls[0][0]).toContain('/businesses?search=');
    expect(spoken.join(' ')).toMatch(/couldn't find/i);
  });

  it('answers "what can you do" without going anywhere', async () => {
    await ask('what can you do');
    await waitFor(() => expect(spoken.length).toBeGreaterThan(0));
    expect(spoken.join(' ')).toContain('open near me');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('still handles a plain search, so the old path did not regress', async () => {
    await ask('i need a barber');
    await waitFor(() => expect(navigateSpy).toHaveBeenCalled());
    expect(navigateSpy.mock.calls[0][0]).toContain('/businesses?search=');
  });
});
