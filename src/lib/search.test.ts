import { describe, it, expect } from 'vitest';
import { normalize, matchScore, rankMatches, splitMatch } from './search';

describe('search', () => {
  it('normalize lowercases, strips accents and trims', () => {
    expect(normalize('  CÔTE  ')).toBe('cote');
    expect(normalize('Lagos')).toBe('lagos');
  });

  it('scores relevance from exact → substring → none', () => {
    expect(matchScore('Lagos', 'lagos')).toBe(100); // exact
    expect(matchScore('Lagos', 'lag')).toBe(80); // prefix
    expect(matchScore('Lekki, Lagos', 'lag')).toBe(60); // a word starts with query
    expect(matchScore('Ikeja', 'kej')).toBe(40); // substring
    expect(matchScore('Lagos', 'xyz')).toBe(0); // no match
  });

  it('ranks matches best-first and respects the limit', () => {
    const out = rankMatches(['Abuja', 'Lagos', 'Lagos Island'], 'lag', (x) => [x], 5);
    expect(out).toEqual(['Lagos', 'Lagos Island']);
    expect(rankMatches(['Abuja', 'Lagos'], 'lag', (x) => [x], 1)).toHaveLength(1);
  });

  it('splitMatch returns [before, match, after] for highlighting', () => {
    expect(splitMatch('Lagos', 'ago')).toEqual(['L', 'ago', 's']);
    expect(splitMatch('Lagos', 'zzz')).toBeNull();
  });
});
