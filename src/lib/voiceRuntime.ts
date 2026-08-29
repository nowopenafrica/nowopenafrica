/**
 * What voice can actually do on THIS device, and what to do when it cannot.
 *
 * The assistant used to render nothing at all when `SpeechRecognition` was
 * missing. That is most of Firefox, every in-app browser that strips it, and
 * older iOS — so on those devices NowOpen AI did not exist, with no explanation.
 * The answer engine never needed speech: it takes a string. So the rule here is
 * that the assistant is always available, and only its INPUT degrades.
 *
 *   full    — recognition works; hands-free wake word, speak or type
 *   typed   — no recognition; the same assistant, typed
 *
 * Everything in this file is pure so the per-device behaviour can be tested
 * without a browser, which is the only practical way to cover devices we do not
 * have in front of us.
 */

export type VoiceMode = 'full' | 'typed';

export interface VoiceCapability {
  mode: VoiceMode;
  /** Speech-to-text available. */
  recognition: boolean;
  /** Speak answers back. */
  synthesis: boolean;
  /**
   * iOS ends recognition on every utterance and is unreliable about restarting
   * without a fresh user gesture, so hands-free is not offered there — a toggle
   * that silently stops working is worse than one that was never shown.
   */
  handsFree: boolean;
  /** Shown to the user when input is degraded. Null when nothing is wrong. */
  reason: string | null;
}

interface CapabilityInput {
  hasRecognition: boolean;
  hasSynthesis: boolean;
  isIOS: boolean;
}

export function capabilityFrom(input: CapabilityInput): VoiceCapability {
  if (!input.hasRecognition) {
    return {
      mode: 'typed',
      recognition: false,
      synthesis: input.hasSynthesis,
      handsFree: false,
      reason: 'This browser cannot listen, so ask by typing. Chrome or Edge can hear you.',
    };
  }
  return {
    mode: 'full',
    recognition: true,
    synthesis: input.hasSynthesis,
    handsFree: !input.isIOS,
    reason: input.isIOS
      ? 'iPhone and iPad need a tap before each question — hands-free is not available here.'
      : null,
  };
}

/** iPad pretends to be a Mac, so touch points are the reliable half of this. */
export function detectIOS(ua: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

export function detectCapability(win: typeof globalThis & Record<string, unknown> = globalThis as never): VoiceCapability {
  const nav = (win as { navigator?: Navigator }).navigator;
  return capabilityFrom({
    hasRecognition: Boolean(win.SpeechRecognition || win.webkitSpeechRecognition),
    hasSynthesis: Boolean((win as { speechSynthesis?: unknown }).speechSynthesis),
    isIOS: detectIOS(nav?.userAgent ?? '', nav?.maxTouchPoints ?? 0),
  });
}

/**
 * Which language to ask the engine for.
 *
 * en-NG first: the audience is Nigerian and the engine's accent model matters
 * more than anything else for accuracy. But not every engine ships it, and an
 * unsupported tag can yield silence rather than an error — so the browser's own
 * language and a plain en-US sit behind it as fallbacks.
 */
export function languageChain(navigatorLanguage?: string): string[] {
  const chain = ['en-NG'];
  const own = (navigatorLanguage || '').trim();
  if (own && !chain.includes(own)) chain.push(own);
  for (const fallback of ['en-GB', 'en-US']) {
    if (!chain.includes(fallback)) chain.push(fallback);
  }
  return chain;
}

export type ErrorAction = 'ignore' | 'retry' | 'next-language' | 'fatal';

export interface ErrorVerdict {
  action: ErrorAction;
  /** Shown to the user. Null means say nothing — most errors are routine. */
  message: string | null;
}

/**
 * What a recognition error means.
 *
 * The important distinction is between errors that are part of normal operation
 * and errors that should stop the loop. `no-speech` fires every time somebody
 * pauses, and treating it as a failure would put a toast on screen for the
 * ordinary act of not talking. `not-allowed` is the only one the user must act
 * on. `network` and `audio-capture` are worth retrying but not forever — the
 * caller applies backoff.
 */
export function classifyRecognitionError(error?: string): ErrorVerdict {
  switch (error) {
    case 'no-speech':
    case 'aborted':
      return { action: 'ignore', message: null };
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        action: 'fatal',
        message: 'Microphone access is blocked. Allow it in your browser settings to use voice.',
      };
    case 'language-not-supported':
    case 'bad-grammar':
      return { action: 'next-language', message: null };
    case 'audio-capture':
      return { action: 'fatal', message: 'No microphone found. Plug one in, or type your question.' };
    case 'network':
      return { action: 'retry', message: null };
    default:
      return { action: 'retry', message: null };
  }
}

/** Restarts are capped; past this the loop stops and offers typing instead. */
export const MAX_RESTART_ATTEMPTS = 6;

/**
 * How long to wait before restarting after a failure.
 *
 * A bare `start()` inside `onend` is a tight loop whenever the cause is
 * persistent — a dropped network on Chrome's transcription service will spin it
 * as fast as the event loop allows, burning battery and mobile data on a device
 * that has neither to spare. This backs off to two seconds and stays there.
 */
export function restartDelay(attempt: number): number {
  if (attempt <= 0) return 0;
  return Math.min(2000, 150 * 2 ** (attempt - 1));
}

/** Give up on the microphone and let the person type. */
export function shouldFallBackToTyping(attempt: number): boolean {
  return attempt >= MAX_RESTART_ATTEMPTS;
}
