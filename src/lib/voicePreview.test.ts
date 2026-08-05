import { describe, it, expect } from 'vitest';
import { voiceoverProfile, pickPreviewVoice } from './voicePreview';

function voice(name: string, lang: string): SpeechSynthesisVoice {
  return { name, lang, localService: true, default: false, voiceURI: name };
}

describe('voiceoverProfile', () => {
  it('maps a Nigerian English female voiceover to en-NG with female pitch', () => {
    const p = voiceoverProfile('female-nigerian');
    expect(p.lang).toBe('en-NG');
    expect(p.gender).toBe('Female');
    expect(p.pitch).toBeGreaterThan(1);
  });

  it('maps a British male voiceover to en-GB with male pitch', () => {
    const p = voiceoverProfile('male-british');
    expect(p.lang).toBe('en-GB');
    expect(p.gender).toBe('Male');
    expect(p.pitch).toBeLessThan(1);
  });

  it('maps French and Swahili accents to their languages', () => {
    expect(voiceoverProfile('female-french').lang).toBe('fr-FR');
    expect(voiceoverProfile('female-swahili').lang).toBe('sw');
  });

  it('falls back to plain English for an unknown key', () => {
    const p = voiceoverProfile('nope');
    expect(p.lang).toBe('en');
    expect(p.gender).toBe('Female');
  });
});

describe('pickPreviewVoice', () => {
  const voices = [
    voice('Microsoft Zira - English (United States)', 'en-US'),
    voice('Google UK English Male', 'en-GB'),
    voice('Google US English', 'en-US'),
    voice('Google français', 'fr-FR'),
  ];

  it('prefers an exact-language voice matching the gender', () => {
    const hit = pickPreviewVoice(voices, 'Male', 'en-GB');
    expect(hit?.name).toBe('Google UK English Male');
  });

  it('falls back to the language family (en) when the exact locale is missing', () => {
    // en-NG is almost never installed; should still land on a female English voice.
    const hit = pickPreviewVoice(voices, 'Female', 'en-NG');
    expect(hit?.lang.startsWith('en')).toBe(true);
    expect(hit?.name.toLowerCase()).toContain('zira');
  });

  it('matches a gender hint inside the language pool before other languages', () => {
    // en-US pool has Zira (female) and Google US English (no hint) — female hint wins.
    const hit = pickPreviewVoice(voices, 'Female', 'en-US');
    expect(hit?.name).toBe('Microsoft Zira - English (United States)');
  });

  it('returns the first voice when nothing matches hints', () => {
    const only = [voice('Some Weird Voice', 'xx-XX')];
    expect(pickPreviewVoice(only, 'Male', 'zz-ZZ')?.name).toBe('Some Weird Voice');
  });

  it('returns null when there are no voices at all', () => {
    expect(pickPreviewVoice([], 'Female', 'en')).toBeNull();
  });
});
