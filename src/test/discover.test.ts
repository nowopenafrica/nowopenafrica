import { describe, it, expect } from 'vitest';
import {
  openNow, newest, topRated, hiddenGems, near,
  affinityCategories, recommended, businessHref,
  type DiscoverBusiness,
} from '../lib/discover';

const now = new Date('2026-08-29T12:00:00+01:00');
const ago = (days: number) => new Date(now.getTime() - days * 864e5).toISOString();

const b = (over: Partial<DiscoverBusiness> & { id: string }): DiscoverBusiness => ({
  name: over.id, ...over,
} as DiscoverBusiness);

describe('openNow', () => {
  it('keeps a shop that is closing soon', () => {
    // Closing in twenty minutes is open. Excluding it sends someone away from
    // a place they could still reach.
    const list = [
      b({ id: 'open', opening_hours: 'Mon-Sun 09:00-23:00' }),
      b({ id: 'shut', opening_hours: 'Mon-Sun 01:00-02:00' }),
    ];
    const ids = openNow(list, now).map((x) => x.id);
    expect(ids).toContain('open');
    expect(ids).not.toContain('shut');
  });
});

describe('newest', () => {
  it('returns recent listings newest first', () => {
    const list = [b({ id: 'old', created_at: ago(90) }), b({ id: 'a', created_at: ago(2) }), b({ id: 'c', created_at: ago(10) })];
    expect(newest(list, now).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('skips rows with no or unparseable date rather than ranking them as ancient', () => {
    const list = [b({ id: 'none' }), b({ id: 'junk', created_at: 'not-a-date' }), b({ id: 'ok', created_at: ago(1) })];
    expect(newest(list, now).map((x) => x.id)).toEqual(['ok']);
  });
});

describe('topRated', () => {
  it('will not call one five-star review a top-rated business', () => {
    const list = [
      b({ id: 'thin', rating: 5, review_count: 1 }),
      b({ id: 'real', rating: 4.6, review_count: 40 }),
    ];
    expect(topRated(list).map((x) => x.id)).toEqual(['real']);
  });

  it('excludes an unrated business rather than treating 0 as good', () => {
    expect(topRated([b({ id: 'x', review_count: 10 })])).toEqual([]);
  });
});

describe('hiddenGems', () => {
  it('finds the good-but-unnoticed and leaves out the already-famous', () => {
    const list = [
      b({ id: 'gem', rating: 4.8, review_count: 2 }),
      b({ id: 'famous', rating: 4.8, review_count: 900 }),
      b({ id: 'unrated', rating: 0, review_count: 0 }),
    ];
    expect(hiddenGems(list).map((x) => x.id)).toEqual(['gem']);
  });

  it('does not overlap with topRated at any review count', () => {
    // Regression: the two rails used independent thresholds that both matched
    // at exactly 3 reviews, so one business appeared in both.
    const list = Array.from({ length: 12 }, (_, n) =>
      b({ id: `r${n}`, rating: 4.5, review_count: n }));
    const gems = hiddenGems(list).map((x) => x.id);
    const top = topRated(list).map((x) => x.id);
    expect(gems.filter((g) => top.includes(g))).toEqual([]);
    // And between them they cover every rated business, losing nobody.
    const rated = list.filter((x) => (x.review_count ?? 0) > 0).map((x) => x.id);
    expect([...gems, ...top].sort()).toEqual(rated.sort());
  });
});

describe('near', () => {
  it('matches a district against a city and back', () => {
    const list = [b({ id: 'yaba', location: 'Yaba, Lagos' }), b({ id: 'abuja', location: 'Abuja' })];
    expect(near(list, 'Lagos').map((x) => x.id)).toEqual(['yaba']);
    expect(near(list, 'Yaba, Lagos').map((x) => x.id)).toEqual(['yaba']);
  });

  it('returns nothing for an empty place instead of everything', () => {
    // The dangerous default: an unresolved location silently meaning "all".
    expect(near([b({ id: 'a', location: 'Lagos' })], '  ')).toEqual([]);
  });
});

describe('recommendations', () => {
  it('ranks the categories someone keeps most', () => {
    expect(affinityCategories([
      { category: 'Restaurant' }, { category: 'Barber' }, { category: 'Restaurant' }, { category: '' },
    ])).toEqual(['Restaurant', 'Barber']);
  });

  it('never recommends a business already kept', () => {
    const list = [b({ id: 'kept', category: 'Restaurant', rating: 5 }), b({ id: 'new', category: 'Restaurant', rating: 4 })];
    expect(recommended(list, ['Restaurant'], ['kept']).map((x) => x.id)).toEqual(['new']);
  });

  it('stays silent with nothing to go on', () => {
    expect(recommended([b({ id: 'a', category: 'Restaurant' })], [], [])).toEqual([]);
  });
});

describe('businessHref', () => {
  it('prefers the username', () => {
    expect(businessHref({ id: 'i', username: 'mama' })).toBe('/mama');
    expect(businessHref({ id: 'i', username: null })).toBe('/businesses/i');
  });
});

describe('directionsHref', () => {
  it('includes the name and place so the pin lands on the right shop', async () => {
    const { directionsHref } = await import('../lib/discover');
    const url = directionsHref({ name: 'Mama Put', location: 'Yaba, Lagos' })!;
    expect(url).toContain('Mama%20Put');
    expect(url).toContain('Yaba');
  });

  it('offers nothing when there is no address to point at', async () => {
    const { directionsHref } = await import('../lib/discover');
    expect(directionsHref({ name: 'X', location: null })).toBeNull();
  });
});

describe('card details', () => {
  it('drops blanks and nulls from the secondary categories', async () => {
    const { secondaryCategories } = await import('../lib/discover');
    // The column really does hold nulls; an unfiltered join renders "+ · ".
    expect(secondaryCategories({ secondary_categories: ['Bar', '', null as unknown as string, ' '] }))
      .toEqual(['Bar']);
  });

  it('treats a null column as no extra categories, not a crash', async () => {
    const { secondaryCategories } = await import('../lib/discover');
    expect(secondaryCategories({ secondary_categories: null })).toEqual([]);
    expect(secondaryCategories({})).toEqual([]);
  });

  it('strips the scheme and trailing slash from a website', async () => {
    const { displayWebsite } = await import('../lib/discover');
    expect(displayWebsite('https://goldensandshotel.ng/')).toBe('goldensandshotel.ng');
    expect(displayWebsite('http://Example.com')).toBe('Example.com');
    expect(displayWebsite(null)).toBeNull();
    expect(displayWebsite('https://')).toBeNull();
  });

  it('asks for every column the card renders', async () => {
    const { DISCOVER_SELECT } = await import('../lib/discover');
    // Regression: the first version selected businesses.review_count, which
    // does not exist on that table, and PostgREST rejects the whole query —
    // which shows up as an empty page rather than an error.
    for (const col of ['description', 'phone', 'website', 'verified', 'secondary_categories', 'rating']) {
      expect(DISCOVER_SELECT.split(',')).toContain(col);
    }
    expect(DISCOVER_SELECT.split(',')).not.toContain('review_count');
  });
});

describe('searchBusinesses', () => {
  const list = [
    b({ id: 'mama', name: 'Mama Put Kitchen', category: 'Restaurant', location: 'Yaba, Lagos', description: 'Home cooking' }),
    b({ id: 'cuts', name: 'Sharp Cuts', category: 'Barber', location: 'Lekki, Lagos', description: 'Fades and shaves' }),
    b({ id: 'sew', name: 'Ada Tailoring', category: 'Fashion', secondary_categories: ['Restaurant'], location: 'Abuja', description: 'Bespoke' }),
  ];

  it('finds a business by name', async () => {
    const { searchBusinesses } = await import('../lib/discover');
    expect(searchBusinesses(list, { query: 'mama' }).map((x) => x.id)).toEqual(['mama']);
  });

  it('finds by category, including a secondary one', async () => {
    // A tailor who also does food should turn up under Restaurant.
    const { searchBusinesses } = await import('../lib/discover');
    expect(searchBusinesses(list, { query: 'restaurant' }).map((x) => x.id).sort()).toEqual(['mama', 'sew']);
  });

  it('finds by description and by location text', async () => {
    const { searchBusinesses } = await import('../lib/discover');
    expect(searchBusinesses(list, { query: 'fades' }).map((x) => x.id)).toEqual(['cuts']);
    expect(searchBusinesses(list, { query: 'lekki' }).map((x) => x.id)).toEqual(['cuts']);
  });

  it('combines the filters with AND, not OR', async () => {
    // "restaurants in Lagos" must mean both; OR would return the Abuja tailor.
    const { searchBusinesses } = await import('../lib/discover');
    expect(searchBusinesses(list, { query: 'restaurant', place: 'Lagos' }).map((x) => x.id)).toEqual(['mama']);
  });

  it('filters on an exact category separately from the text box', async () => {
    const { searchBusinesses } = await import('../lib/discover');
    expect(searchBusinesses(list, { category: 'Barber' }).map((x) => x.id)).toEqual(['cuts']);
    expect(searchBusinesses(list, { category: 'Restaurant' }).map((x) => x.id).sort()).toEqual(['mama', 'sew']);
  });

  it('treats empty filters as no filter, so clearing the box restores everything', async () => {
    const { searchBusinesses } = await import('../lib/discover');
    expect(searchBusinesses(list, {})).toHaveLength(3);
    expect(searchBusinesses(list, { query: '   ', place: '', category: '' })).toHaveLength(3);
  });

  it('returns nothing when nothing matches, rather than everything', async () => {
    const { searchBusinesses } = await import('../lib/discover');
    expect(searchBusinesses(list, { query: 'helicopter' })).toEqual([]);
  });

  it('offers only categories the data actually contains', async () => {
    // A dropdown of 31 industries over 32 businesses is mostly dead ends.
    const { availableCategories } = await import('../lib/discover');
    expect(availableCategories(list)).toEqual(['Barber', 'Fashion', 'Restaurant']);
  });
});

describe('searchSuggestions', () => {
  const places = [
    { name: 'Lagos', region: 'Nigeria' },
    { name: 'Lagos Island', region: 'Lagos, Nigeria' },
    { name: 'Lekki', region: 'Lagos, Nigeria' },
    { name: 'Nairobi', region: 'Kenya' },
  ];
  const biz = [
    b({ id: '1', name: 'Lagoon Restaurant', category: 'Restaurant', location: 'Yaba, Lagos', username: 'lagoon' }),
    b({ id: '2', name: 'Mama Put Kitchen', category: 'Restaurant', location: 'Lagos' }),
  ];

  it('suggests the places somebody is part-way through typing', async () => {
    // The example asked for: "la" should offer Lagos and Lagos Island.
    const { searchSuggestions } = await import('../lib/discover');
    const labels = searchSuggestions(biz, places, 'la').filter((s) => s.kind === 'place').map((s) => s.label);
    expect(labels).toContain('Lagos');
    expect(labels).toContain('Lagos Island');
    expect(labels).not.toContain('Nairobi');
  });

  it('carries the region so two similar places can be told apart', async () => {
    const { searchSuggestions } = await import('../lib/discover');
    const island = searchSuggestions(biz, places, 'lagos island').find((s) => s.label === 'Lagos Island');
    expect(island?.detail).toBe('Lagos, Nigeria');
  });

  it('mixes businesses, places and categories in one list', async () => {
    const { searchSuggestions } = await import('../lib/discover');
    const kinds = new Set(searchSuggestions(biz, places, 'la').map((s) => s.kind));
    expect(kinds.has('place')).toBe(true);
    expect(kinds.has('business')).toBe(true);
  });

  it('ranks an exact business name at the top', async () => {
    const { searchSuggestions } = await import('../lib/discover');
    expect(searchSuggestions(biz, places, 'Mama Put Kitchen')[0]).toMatchObject({
      kind: 'business', label: 'Mama Put Kitchen',
    });
  });

  it('gives a business suggestion somewhere to go', async () => {
    const { searchSuggestions } = await import('../lib/discover');
    const s = searchSuggestions(biz, places, 'lagoon').find((x) => x.kind === 'business');
    expect(s?.href).toBe('/lagoon');
    expect(s?.detail).toContain('Restaurant');
  });

  it('suggests a category by name', async () => {
    const { searchSuggestions } = await import('../lib/discover');
    const s = searchSuggestions(biz, places, 'restau').find((x) => x.kind === 'category');
    expect(s?.value).toBe('Restaurant');
  });

  it('stays quiet until there is enough to go on', async () => {
    // One letter matches almost everything; a list of eight guesses after one
    // keystroke is noise that hides the box being typed into.
    const { searchSuggestions } = await import('../lib/discover');
    expect(searchSuggestions(biz, places, 'l')).toEqual([]);
    expect(searchSuggestions(biz, places, ' ')).toEqual([]);
  });

  it('does not repeat the same suggestion twice', async () => {
    const { searchSuggestions } = await import('../lib/discover');
    const dupes = [...places, ...places];
    const out = searchSuggestions(biz, dupes, 'lagos');
    const keys = out.map((s) => `${s.kind}:${s.label}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('respects the limit so the list cannot swallow the page', async () => {
    const { searchSuggestions } = await import('../lib/discover');
    expect(searchSuggestions(biz, places, 'la', 2)).toHaveLength(2);
  });

  it('returns nothing for a query that matches nothing', async () => {
    const { searchSuggestions } = await import('../lib/discover');
    expect(searchSuggestions(biz, places, 'zzzz')).toEqual([]);
  });
});

describe('suggestion relevance', () => {
  it('ranks a place matched by name above one matched only by its region', async () => {
    // Typing "la" should lead with Lagos, not with every district that happens
    // to sit inside Lagos.
    const { searchSuggestions } = await import('../lib/discover');
    const out = searchSuggestions([], [
      { name: 'Agege', region: 'Lagos, Nigeria' },
      { name: 'Lagos', region: 'Nigeria' },
    ], 'la');
    expect(out[0].label).toBe('Lagos');
  });

  it('still offers the related district rather than hiding it', async () => {
    const { searchSuggestions } = await import('../lib/discover');
    const labels = searchSuggestions([], [
      { name: 'Agege', region: 'Lagos, Nigeria' },
      { name: 'Lagos', region: 'Nigeria' },
    ], 'la').map((s) => s.label);
    expect(labels).toContain('Agege');
  });

  it('does not let region matches bury a category', async () => {
    const { searchSuggestions } = await import('../lib/discover');
    const biz = [b({ id: 'x', name: 'Zeta', category: 'Laundry', location: 'Abuja' })];
    const districts = Array.from({ length: 10 }, (_, i) => ({ name: `D${i}`, region: 'Lagos, Nigeria' }));
    const kinds = searchSuggestions(biz, districts, 'la').map((s) => s.kind);
    expect(kinds).toContain('category');
  });
});

describe('suggestion ordering against real place data', () => {
  it('puts Lagos districts above cities that merely contain the letters', async () => {
    // Regression seen on screen: "la" offered Blantyre and Casablanca — which
    // match mid-word — above Ikeja and Agege, which are actually in Lagos.
    const { searchSuggestions } = await import('../lib/discover');
    const labels = searchSuggestions([], [
      { name: 'Blantyre', region: 'Malawi' },
      { name: 'Casablanca', region: 'Morocco' },
      { name: 'Ikeja', region: 'Lagos, Nigeria' },
      { name: 'Lagos', region: 'Nigeria' },
    ], 'la').map((s) => s.label);
    expect(labels[0]).toBe('Lagos');
    expect(labels.indexOf('Ikeja')).toBeLessThan(labels.indexOf('Blantyre'));
  });
});

describe('status filters', () => {
  const at = new Date('2026-08-29T12:00:00+01:00');

  it('counts a shop closing soon as open', async () => {
    // Twenty minutes left is still open; excluding it sends somebody away from
    // a place they could still reach.
    const { matchesStatus } = await import('../lib/discover');
    const soon = b({ id: 's', opening_hours: 'Mon-Sun 09:00-12:30' });
    expect(matchesStatus(soon, 'open', at)).toBe(true);
    expect(matchesStatus(soon, 'closing', at)).toBe(true);
  });

  it('does not count an ordinary open shop as closing soon', async () => {
    const { matchesStatus } = await import('../lib/discover');
    const allDay = b({ id: 'a', opening_hours: 'Mon-Sun 09:00-23:00' });
    expect(matchesStatus(allDay, 'open', at)).toBe(true);
    expect(matchesStatus(allDay, 'closing', at)).toBe(false);
  });

  it('reads 24 hours from the hours, never from a missing value', async () => {
    // 30 of 32 live businesses have no hours at all. Treating that as
    // always-open would put them all under a chip they never claimed.
    const { matchesStatus } = await import('../lib/discover');
    expect(matchesStatus(b({ id: '1', opening_hours: 'Open 24/7' }), 'open24', at)).toBe(true);
    expect(matchesStatus(b({ id: '2' }), 'open24', at)).toBe(false);
    expect(matchesStatus(b({ id: '3', opening_hours: 'Mon-Fri 09:00-17:00' }), 'open24', at)).toBe(false);
  });

  it('filters on the verified flag exactly', async () => {
    const { matchesStatus } = await import('../lib/discover');
    expect(matchesStatus(b({ id: 'v', verified: true }), 'verified', at)).toBe(true);
    expect(matchesStatus(b({ id: 'n', verified: false }), 'verified', at)).toBe(false);
    expect(matchesStatus(b({ id: 'u' }), 'verified', at)).toBe(false);
  });

  it('offers only chips that are backed by real data', async () => {
    const { STATUS_FILTERS } = await import('../lib/discover');
    const keys = STATUS_FILTERS.map((s) => s.key);
    // The directory offers Trending / Responds Fast / Near Me with nothing
    // behind them. None of those belong here.
    expect(keys).toEqual(['open', 'closing', 'open24', 'verified']);
  });

  it('combines status with the other filters', async () => {
    const { searchBusinesses } = await import('../lib/discover');
    const list = [
      b({ id: 'open-lagos', name: 'A', location: 'Lagos', opening_hours: 'Mon-Sun 09:00-23:00' }),
      b({ id: 'shut-lagos', name: 'B', location: 'Lagos', opening_hours: 'Mon-Sun 01:00-02:00' }),
    ];
    expect(searchBusinesses(list, { place: 'Lagos', status: 'open', now: at }).map((x) => x.id))
      .toEqual(['open-lagos']);
  });
});

describe('category groups', () => {
  it('matches a business through its group', async () => {
    const { matchesGroup } = await import('../lib/discover');
    expect(matchesGroup(b({ id: '1', category: 'Restaurant' }), 'Food & Hospitality')).toBe(true);
    expect(matchesGroup(b({ id: '2', category: 'Restaurant' }), 'Technology & Media')).toBe(false);
  });

  it('matches on a secondary category too', async () => {
    const { matchesGroup } = await import('../lib/discover');
    const tailor = b({ id: 't', category: 'Fashion & Apparel', secondary_categories: ['Restaurant'] });
    expect(matchesGroup(tailor, 'Food & Hospitality')).toBe(true);
  });

  it('ignores a group that does not exist rather than matching everything', async () => {
    const { matchesGroup } = await import('../lib/discover');
    expect(matchesGroup(b({ id: '1', category: 'Restaurant' }), 'Nonsense')).toBe(false);
  });

  it('offers only groups with something in them', async () => {
    // A carousel of twelve tiles over four businesses is mostly dead ends.
    const { availableGroups } = await import('../lib/discover');
    const groups = availableGroups([b({ id: '1', category: 'Restaurant' })]);
    expect(groups.map((g) => g.group)).toEqual(['Food & Hospitality']);
    expect(groups[0].n).toBe(1);
  });

  it('filters the list by group', async () => {
    const { searchBusinesses } = await import('../lib/discover');
    const list = [b({ id: 'food', category: 'Restaurant' }), b({ id: 'tech', category: 'Software & IT' })];
    expect(searchBusinesses(list, { group: 'Food & Hospitality' }).map((x) => x.id)).toEqual(['food']);
  });
});

describe('category carousel', () => {
  it('has an icon and a short label for every group', async () => {
    // A renamed group would otherwise fall back to a generic tile and a
    // three-line label, which is only visible if somebody looks.
    const { CATEGORY_GROUPS } = await import('../lib/discover');
    const { GROUP_ICONS, GROUP_SHORT } = await import('../lib/categoryIcons');
    for (const group of CATEGORY_GROUPS) {
      expect(GROUP_ICONS[group], `no icon for ${group}`).toBeTruthy();
      expect(GROUP_SHORT[group], `no short label for ${group}`).toBeTruthy();
    }
    expect(CATEGORY_GROUPS.length).toBe(12);
  });
});
