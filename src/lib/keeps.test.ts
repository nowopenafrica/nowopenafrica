import { describe, it, expect, beforeEach } from 'vitest';

import {
  KEEP_TOPICS, ALL_TOPICS, DEFAULT_TOPICS, topicLabel, normaliseTopics, toggleTopic,
  keepLabel, keepsSummary, audienceSummary, reachFor, KEEPS_SHOWN_FROM,
  rememberPendingKeep, takePendingKeep, clearPendingKeep,
  type KeepTopic,
} from './keeps';

describe('KEEP_TOPICS', () => {
  it('gives every topic a distinct key, a label and a real example', () => {
    const keys = KEEP_TOPICS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of KEEP_TOPICS) {
      expect(t.label.length).toBeGreaterThan(3);
      // The example is what makes the checkbox mean something concrete.
      expect(t.example.length).toBeGreaterThan(5);
    }
  });

  it('does not opt anyone into opening updates by default', () => {
    // A daily trader opening and closing is fourteen notifications a week —
    // the fastest way to teach someone to turn all of this off.
    expect(DEFAULT_TOPICS).not.toContain('openings');
    expect(ALL_TOPICS).toContain('openings');
  });

  it('opts into the rest, so a plain Keep is still worth something', () => {
    expect(DEFAULT_TOPICS).toContain('promotions');
    expect(DEFAULT_TOPICS).toContain('products');
    expect(DEFAULT_TOPICS.length).toBe(ALL_TOPICS.length - 1);
  });
});

describe('normaliseTopics', () => {
  it('keeps what it understands', () => {
    expect(normaliseTopics(['promotions', 'events'])).toEqual(['promotions', 'events']);
  });

  it('drops anything it does not, rather than storing it', () => {
    // These become a consent record; an unrecognised value in it means nothing
    // and could be honoured by accident later.
    expect(normaliseTopics(['promotions', 'spam', 42, null])).toEqual(['promotions']);
  });

  it('de-duplicates', () => {
    expect(normaliseTopics(['events', 'events'])).toEqual(['events']);
  });

  it('returns a stable order so the UI does not reshuffle', () => {
    expect(normaliseTopics(['events', 'promotions'])).toEqual(normaliseTopics(['promotions', 'events']));
  });

  it('treats a missing or malformed value as no consent at all', () => {
    expect(normaliseTopics(undefined)).toEqual([]);
    expect(normaliseTopics('promotions')).toEqual([]);
    expect(normaliseTopics(null)).toEqual([]);
  });
});

describe('toggleTopic', () => {
  it('adds and removes', () => {
    expect(toggleTopic([], 'events')).toEqual(['events']);
    expect(toggleTopic(['events'], 'events')).toEqual([]);
  });

  it('allows turning everything off — that is a real choice', () => {
    // "Keep this business but do not message me" is legitimate, and not the
    // same as not keeping.
    let topics: KeepTopic[] = [...ALL_TOPICS];
    for (const t of ALL_TOPICS) topics = toggleTopic(topics, t);
    expect(topics).toEqual([]);
  });

  it('does not mutate the array it was given', () => {
    const before: KeepTopic[] = ['events'];
    toggleTopic(before, 'promotions');
    expect(before).toEqual(['events']);
  });
});

describe('topicLabel', () => {
  it('names a topic for a person', () => {
    expect(topicLabel('promotions')).toMatch(/offers/i);
  });

  it('falls back to the key rather than rendering blank', () => {
    expect(topicLabel('nonsense')).toBe('nonsense');
  });
});

describe('keepLabel', () => {
  it('uses the ongoing tense — the relationship has not finished', () => {
    expect(keepLabel(true)).toBe('Keeping');
    expect(keepLabel(false)).toBe('Keep');
  });
});

describe('keepsSummary', () => {
  it('counts the relationships in the words someone would use', () => {
    expect(keepsSummary(18)).toBe('You are keeping 18 businesses');
    expect(keepsSummary(1)).toBe('You are keeping 1 business');
  });

  it('says nothing discouraging at zero', () => {
    expect(keepsSummary(0)).toMatch(/not keeping any/);
    expect(keepsSummary(-3)).toMatch(/not keeping any/);
  });
});

describe('audienceSummary', () => {
  it('stays silent until the number is worth showing', () => {
    // "Kept by 2 people" makes a new listing look abandoned rather than new.
    for (let n = 0; n < KEEPS_SHOWN_FROM; n += 1) expect(audienceSummary(n)).toBe('');
  });

  it('shows it once there is an audience', () => {
    expect(audienceSummary(18)).toBe('Kept by 18 people');
  });
});

describe('reachFor', () => {
  const rows = [
    { topics: ['promotions', 'products'] },
    { topics: ['promotions'] },
    { topics: [] },
    { topics: 'broken' },
  ];

  it('counts only the people who agreed to that topic', () => {
    expect(reachFor(rows, 'promotions')).toBe(2);
    expect(reachFor(rows, 'products')).toBe(1);
    expect(reachFor(rows, 'events')).toBe(0);
  });

  it('does not count someone whose consent record is unreadable', () => {
    expect(reachFor([{ topics: 'broken' }], 'promotions')).toBe(0);
  });

  it('copes with no audience', () => {
    expect(reachFor([], 'promotions')).toBe(0);
  });
});

describe('a Keep that survives signing in', () => {
  beforeEach(() => localStorage.clear());

  it('completes on return rather than making someone do it twice', () => {
    rememberPendingKeep('biz-1');
    expect(takePendingKeep('biz-1')).toBe(true);
  });

  it('fires once, not on every render of the profile', () => {
    rememberPendingKeep('biz-1');
    expect(takePendingKeep('biz-1')).toBe(true);
    expect(takePendingKeep('biz-1')).toBe(false);
  });

  it('does not keep a different business than the one that was tapped', () => {
    rememberPendingKeep('biz-1');
    expect(takePendingKeep('biz-2')).toBe(false);
    // And the original intent survives for when they reach it.
    expect(takePendingKeep('biz-1')).toBe(true);
  });

  it('can be abandoned', () => {
    rememberPendingKeep('biz-1');
    clearPendingKeep();
    expect(takePendingKeep('biz-1')).toBe(false);
  });

  it('does not throw where storage is unavailable', () => {
    expect(() => takePendingKeep('biz-1')).not.toThrow();
  });
});
