// NowOpen Studio — voiceover preview (Web Speech API).
//
// The studio previews the scripted voiceover using the browser's built-in
// speech synthesis — no API key, no network. `voiceoverProfile` maps the
// selected voiceover key (e.g. "female-nigerian") to a language + pitch +
// rate, and `pickPreviewVoice` deterministically chooses the closest installed
// voice (prefer exact language, then the requested gender). Browsers without a
// local voice for an African accent fall back to the nearest English voice.

import { VOICEOVER_OPTIONS } from './videoCreator';

const ACCENT_LANGS: Record<string, string> = {
  'Nigerian English': 'en-NG',
  'Kenyan English': 'en-KE',
  'South African English': 'en-ZA',
  'Ghanaian English': 'en-GH',
  American: 'en-US',
  British: 'en-GB',
  French: 'fr-FR',
  Arabic: 'ar',
  Swahili: 'sw',
  Yoruba: 'yo',
  Igbo: 'ig',
  Hausa: 'ha',
};

// Common gender-coded voice names across Chrome/Edge/Safari/Firefox.
const FEMALE_HINTS = ['female', 'zira', 'samantha', 'ava', 'jenny', 'aria', 'susan', 'kate', 'michelle', 'moira', 'tessa'];
const MALE_HINTS = ['male', 'david', 'mark', 'james', 'guy', 'george', 'daniel', 'alex', 'fred', 'ryan', 'thomas', 'rishi'];

export interface VoicePreviewProfile {
  lang: string;
  gender: 'Male' | 'Female';
  pitch: number;
  rate: number;
}

export function voiceoverProfile(key: string): VoicePreviewProfile {
  const opt = VOICEOVER_OPTIONS.find((o) => o.key === key);
  const lang = (opt && ACCENT_LANGS[opt.accent]) || 'en';
  const gender = opt?.gender ?? 'Female';
  return { lang, gender, pitch: gender === 'Female' ? 1.08 : 0.95, rate: 1.05 };
}

/**
 * Pick the best installed voice: exact language first, then language family,
 * then the requested gender; falls back to the first available voice. Returns
 * null only when the platform exposes no voices at all.
 */
export function pickPreviewVoice(
  voices: SpeechSynthesisVoice[],
  gender: 'Male' | 'Female',
  lang: string,
): SpeechSynthesisVoice | null {
  const langPrefix = lang.toLowerCase().split('-')[0];
  const langPool = voices.filter(
    (v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()) || v.lang.toLowerCase().startsWith(langPrefix),
  );
  const pool = langPool.length ? langPool : voices;
  const hints = gender === 'Female' ? FEMALE_HINTS : MALE_HINTS;
  for (const hint of hints) {
    const hit = pool.find((v) => v.name.toLowerCase().includes(hint));
    if (hit) return hit;
  }
  return pool[0] ?? null;
}
