import { describe, it, expect } from 'vitest';
import {
  capabilityFrom, detectIOS, languageChain, classifyRecognitionError,
  restartDelay, shouldFallBackToTyping, MAX_RESTART_ATTEMPTS,
} from '../lib/voiceRuntime';

describe('capability', () => {
  it('still offers the assistant when the browser cannot listen', () => {
    // The whole point: Firefox used to get no assistant at all.
    const cap = capabilityFrom({ hasRecognition: false, hasSynthesis: true, isIOS: false });
    expect(cap.mode).toBe('typed');
    expect(cap.reason).toMatch(/typing/i);
  });

  it('names a browser that would work instead of just refusing', () => {
    const cap = capabilityFrom({ hasRecognition: false, hasSynthesis: false, isIOS: false });
    expect(cap.reason).toMatch(/Chrome|Edge/);
  });

  it('gives a capable browser the full experience', () => {
    const cap = capabilityFrom({ hasRecognition: true, hasSynthesis: true, isIOS: false });
    expect(cap).toMatchObject({ mode: 'full', handsFree: true, reason: null });
  });

  it('does not offer hands-free on iOS, and says why', () => {
    // A toggle that silently stops working is worse than one never shown.
    const cap = capabilityFrom({ hasRecognition: true, hasSynthesis: true, isIOS: true });
    expect(cap.mode).toBe('full');
    expect(cap.handsFree).toBe(false);
    expect(cap.reason).toMatch(/iPhone|iPad/);
  });

  it('keeps voice input on iOS even without hands-free', () => {
    expect(capabilityFrom({ hasRecognition: true, hasSynthesis: true, isIOS: true }).recognition).toBe(true);
  });
});

describe('detectIOS', () => {
  it('spots iPhone and iPad', () => {
    expect(detectIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe(true);
    expect(detectIOS('Mozilla/5.0 (iPad; CPU OS 16_0)')).toBe(true);
  });

  it('spots an iPad claiming to be a Mac', () => {
    // iPadOS reports Macintosh; touch points are what give it away.
    expect(detectIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
  });

  it('does not mistake a real Mac for one', () => {
    expect(detectIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
  });

  it('does not mistake Android for iOS', () => {
    expect(detectIOS('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe(false);
  });
});

describe('languageChain', () => {
  it('asks for the audience accent first', () => {
    expect(languageChain('en-GB')[0]).toBe('en-NG');
  });

  it('falls back through the browser language to plain English', () => {
    expect(languageChain('fr-FR')).toEqual(['en-NG', 'fr-FR', 'en-GB', 'en-US']);
  });

  it('never repeats a tag', () => {
    const chain = languageChain('en-NG');
    expect(new Set(chain).size).toBe(chain.length);
  });

  it('copes with no browser language', () => {
    expect(languageChain(undefined)).toEqual(['en-NG', 'en-GB', 'en-US']);
  });
});

describe('classifyRecognitionError', () => {
  it('treats a pause as normal, not a failure', () => {
    // no-speech fires whenever somebody stops talking; a toast there would be
    // an error message for the act of thinking.
    expect(classifyRecognitionError('no-speech')).toEqual({ action: 'ignore', message: null });
    expect(classifyRecognitionError('aborted').action).toBe('ignore');
  });

  it('stops and explains when the microphone is blocked', () => {
    const v = classifyRecognitionError('not-allowed');
    expect(v.action).toBe('fatal');
    expect(v.message).toMatch(/blocked/i);
  });

  it('offers typing when there is no microphone at all', () => {
    expect(classifyRecognitionError('audio-capture').message).toMatch(/type/i);
  });

  it('tries another language tag when the engine rejects this one', () => {
    expect(classifyRecognitionError('language-not-supported').action).toBe('next-language');
  });

  it('retries a network blip quietly', () => {
    expect(classifyRecognitionError('network')).toEqual({ action: 'retry', message: null });
  });

  it('retries an unknown error rather than dying', () => {
    expect(classifyRecognitionError('something-new').action).toBe('retry');
    expect(classifyRecognitionError(undefined).action).toBe('retry');
  });
});

describe('restart backoff', () => {
  it('restarts immediately after a clean end', () => {
    expect(restartDelay(0)).toBe(0);
  });

  it('backs off instead of spinning', () => {
    // A bare start() in onend is a tight loop when the cause is persistent.
    const delays = [1, 2, 3, 4, 5, 6].map(restartDelay);
    expect(delays).toEqual([150, 300, 600, 1200, 2000, 2000]);
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
  });

  it('is capped so a long outage does not become a long wait', () => {
    expect(restartDelay(99)).toBe(2000);
  });

  it('eventually gives up and lets the person type', () => {
    expect(shouldFallBackToTyping(MAX_RESTART_ATTEMPTS - 1)).toBe(false);
    expect(shouldFallBackToTyping(MAX_RESTART_ATTEMPTS)).toBe(true);
  });
});
