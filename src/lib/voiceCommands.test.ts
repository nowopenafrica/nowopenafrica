import { describe, it, expect } from 'vitest';
import {
  stripWakePhrase, parseVoiceCommand, matchCategory, searchUrlFor, replyFor,
  WAKE_PHRASES,
} from './voiceCommands';

describe('stripWakePhrase', () => {
  it('accepts every wake variant', () => {
    for (const phrase of WAKE_PHRASES) {
      expect(stripWakePhrase(`${phrase} find a barber`), phrase).toBe('find a barber');
    }
  });

  it('is case and punctuation insensitive', () => {
    expect(stripWakePhrase('Hey NowOpen, find a barber!')).toBe('find a barber');
  });

  it('tolerates the recogniser splitting the brand name', () => {
    // "Hey NowOpen" comes back as "hey now open" constantly.
    expect(stripWakePhrase('hey now open i need a plumber')).toBe('i need a plumber');
  });

  it('finds the wake phrase mid-utterance', () => {
    expect(stripWakePhrase('umm okay hey nowopen open my dashboard')).toBe('open my dashboard');
  });

  it('returns null when not addressed, so the mic keeps waiting', () => {
    expect(stripWakePhrase('find a barber')).toBeNull();
    expect(stripWakePhrase('')).toBeNull();
  });

  it('returns an empty command when only the wake phrase was said', () => {
    expect(stripWakePhrase('hey nowopen')).toBe('');
  });
});

describe('parseVoiceCommand — searching', () => {
  it('handles the example command', () => {
    const intent = parseVoiceCommand('i need barber in my area');
    expect(intent).toMatchObject({ kind: 'search', query: 'barber', nearMe: true });
  });

  it('strips the many ways people open a request', () => {
    for (const phrase of [
      'i need a barber',
      'find me a barber',
      "i'm looking for a barber",
      'show me barbers',
      'is there a barber',
      'please find a barber',
      'where can i find a barber',
    ]) {
      const intent = parseVoiceCommand(phrase);
      expect(intent.kind, phrase).toBe('search');
      expect((intent as any).query, phrase).toMatch(/^barbers?$/);
    }
  });

  it('detects every phrasing of "near me" without leaving it in the query', () => {
    for (const phrase of ['near me', 'nearby', 'in my area', 'around me', 'closest', 'nearest']) {
      const intent = parseVoiceCommand(`find a barber ${phrase}`) as any;
      expect(intent.nearMe, phrase).toBe(true);
      expect(intent.query, phrase).toBe('barber');
    }
  });

  it('leaves nearMe false when no location was implied', () => {
    expect(parseVoiceCommand('find a barber')).toMatchObject({ nearMe: false });
  });

  it('keeps a multi-word trade intact', () => {
    expect(parseVoiceCommand('i need a wedding photographer near me'))
      .toMatchObject({ query: 'wedding photographer', nearMe: true });
  });

  it('is unknown for an empty or meaningless utterance', () => {
    expect(parseVoiceCommand('').kind).toBe('unknown');
    expect(parseVoiceCommand('i need').kind).toBe('unknown');
  });
});

describe('parseVoiceCommand — navigating', () => {
  it('opens the places a person would ask for by name', () => {
    const cases: [string, string][] = [
      ['open my dashboard', '/dashboard'],
      ['go to pricing', '/pricing'],
      ['take me to the studio', '/studio'],
      ['open adverts', '/adverts'],
      ['go to creative services', '/media'],
      ['open the waitlist', '/waitlist'],
    ];
    for (const [said, path] of cases) {
      const intent = parseVoiceCommand(said);
      expect(intent.kind, said).toBe('navigate');
      expect((intent as any).path, said).toBe(path);
    }
  });

  it('accepts a bare destination name', () => {
    expect(parseVoiceCommand('dashboard')).toMatchObject({ kind: 'navigate', path: '/dashboard' });
  });

  it('does not turn "show me a barber" into navigation', () => {
    // "show" is both a nav verb and a search opener; searching must win when the
    // target isn't a known destination.
    expect(parseVoiceCommand('show me a barber')).toMatchObject({ kind: 'search', query: 'barber' });
  });
});

describe('matchCategory', () => {
  it('maps a spoken trade onto a real platform category', () => {
    expect(matchCategory('barber')).toMatch(/Barber/);
    expect(matchCategory('hotel')).toMatch(/Hotel/);
    expect(matchCategory('pharmacy')).toMatch(/Pharmacy/);
  });

  it('returns null when nothing sensible matches, so it falls back to free text', () => {
    expect(matchCategory('zzzzqqq')).toBeNull();
    expect(matchCategory('')).toBeNull();
  });
});

describe('searchUrlFor', () => {
  it('builds the URL the directory already understands', () => {
    expect(searchUrlFor('barber')).toBe('/businesses?search=barber');
    expect(searchUrlFor('barber', 'Lagos, Nigeria'))
      .toBe('/businesses?search=barber&location=Lagos%2C+Nigeria');
  });

  it('escapes a multi-word query', () => {
    expect(searchUrlFor('wedding photographer')).toBe('/businesses?search=wedding+photographer');
  });
});

describe('replyFor', () => {
  it('confirms what it understood', () => {
    expect(replyFor({ kind: 'search', query: 'barber', nearMe: true, spoken: '' }, 'Lagos'))
      .toBe('Looking for barber near Lagos');
    expect(replyFor({ kind: 'search', query: 'barber', nearMe: false, spoken: '' }))
      .toBe('Searching for barber');
    expect(replyFor({ kind: 'navigate', path: '/pricing', label: 'pricing', spoken: '' }))
      .toBe('Opening pricing');
  });

  it('offers an example when it did not understand', () => {
    expect(replyFor({ kind: 'unknown', spoken: 'mumble' })).toMatch(/barber near me/);
  });
});
