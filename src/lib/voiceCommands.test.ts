import { describe, it, expect } from 'vitest';
import {
  stripWakePhrase, parseVoiceCommand, matchCategory, searchUrlFor, replyFor,
  openNowUrl, spokenOpenState, WAKE_PHRASES,
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
    // The example leads with the open-now question now, because that is the one
    // the product is named after and the one the assistant answers best.
    expect(replyFor({ kind: 'unknown', spoken: 'mumble' })).toMatch(/open near me/);
  });
});

describe('asking whether somewhere is open', () => {
  it('recognises the product\u2019s own question', () => {
    for (const said of ['is mama put open', 'is mama put still open', 'are golden gem open now', 'is lens and light open?']) {
      const intent = parseVoiceCommand(said);
      expect(intent.kind, said).toBe('business');
      if (intent.kind === 'business') expect(intent.action).toBe('status');
    }
  });

  it('keeps the business name clean of the question around it', () => {
    const intent = parseVoiceCommand('is the mama put kitchen still open today');
    expect(intent.kind).toBe('business');
    if (intent.kind === 'business') expect(intent.name).toBe('mama put kitchen');
  });

  it('does not treat "is anywhere open" as a business called anywhere', () => {
    const intent = parseVoiceCommand('is anywhere open near me');
    expect(intent.kind).toBe('open-now');
  });
});

describe('what is open now', () => {
  it('recognises the phrasings people actually use', () => {
    for (const said of ["what's open near me", 'who is open right now', 'what is open now', "who's open"]) {
      expect(parseVoiceCommand(said).kind, said).toBe('open-now');
    }
  });

  it('keeps a category when one was named', () => {
    const intent = parseVoiceCommand("what's open near me for food");
    expect(intent.kind).toBe('open-now');
    if (intent.kind === 'open-now') {
      expect(intent.nearMe).toBe(true);
      expect(intent.query).toContain('food');
    }
  });

  it('has no query when none was named', () => {
    const intent = parseVoiceCommand("what's open right now");
    if (intent.kind === 'open-now') expect(intent.query).toBeNull();
  });

  it('matches the longest phrasing first', () => {
    // "who is open right now" must not be eaten by the shorter "open now" and
    // left with a stray "who is".
    const intent = parseVoiceCommand('who is open right now');
    if (intent.kind === 'open-now') expect(intent.query).toBeNull();
  });

  it('filters the directory to open, not just search it', () => {
    expect(openNowUrl(null)).toContain('status=open');
    expect(openNowUrl('barber', 'Yaba')).toContain('search=barber');
    expect(openNowUrl('barber', 'Yaba')).toContain('location=Yaba');
  });
});

describe('acting on a business', () => {
  it('recognises a call', () => {
    const intent = parseVoiceCommand('call mama put kitchen');
    expect(intent.kind).toBe('business');
    if (intent.kind === 'business') {
      expect(intent.action).toBe('call');
      expect(intent.name).toBe('mama put kitchen');
    }
  });

  it('recognises directions', () => {
    const intent = parseVoiceCommand('directions to golden gem jewellers');
    if (intent.kind === 'business') expect(intent.action).toBe('directions');
  });

  it('does not hijack navigation phrased as a place', () => {
    // "where is the dashboard" is a route, not a business.
    expect(parseVoiceCommand('where is dashboard').kind).toBe('navigate');
    expect(parseVoiceCommand('take me to pricing').kind).toBe('navigate');
  });
});

describe('spokenOpenState', () => {
  it('leads with the answer, because speech cannot be skimmed', () => {
    expect(spokenOpenState('Mama Put', { kind: 'open', detail: 'Open until 8:00 PM' }))
      .toMatch(/^Yes, Mama Put is open/);
    expect(spokenOpenState('Mama Put', { kind: 'closed', detail: 'Opens tomorrow at 9:00 AM' }))
      .toMatch(/^No, Mama Put is closed/);
  });

  it('warns when they are about to shut', () => {
    expect(spokenOpenState('X', { kind: 'closing-soon', detail: 'Closes in 20 minutes' }))
      .toContain('closing soon');
  });

  it('refuses to claim open when the hours could not be read', () => {
    // On a directory, guessing is how someone ends up outside a shut shop.
    const said = spokenOpenState('X', { kind: 'unknown', detail: '' });
    expect(said).toMatch(/can't say for sure/);
    expect(said).not.toMatch(/\bis open\b/);
  });
});

describe('help', () => {
  it('answers "what can you do" with things that actually work', () => {
    const intent = parseVoiceCommand('what can you do');
    expect(intent.kind).toBe('help');
    const said = replyFor(intent);
    expect(said).toContain('open near me');
    expect(said).toContain('call');
  });
});
