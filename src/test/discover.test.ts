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
