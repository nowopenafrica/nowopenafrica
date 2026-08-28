import { describe, it, expect } from 'vitest';

import {
  locationOpenState, locationAddress, locationPhone, sortLocations, primaryLocation,
  locationsSummary, distanceKm, distanceLabel, nearestLocation, normaliseLocation,
  type BusinessLocation, type LocationFallback,
} from './locations';

const parent: LocationFallback = {
  location: 'Yaba, Lagos',
  phone: '08031234567',
  opening_hours: 'Mon-Sat: 9AM-8PM',
  timezone: 'Africa/Lagos',
  open_status: null,
};

const branch = (over: Partial<BusinessLocation> = {}): BusinessLocation => ({
  id: 'l1', name: 'Yaba', ...over,
});

// Lagos is UTC+1 with no DST, so these instants are exact.
const wed10 = new Date('2026-08-26T09:00:00Z');
const wed1935 = new Date('2026-08-26T18:35:00Z');
const sun = new Date('2026-08-23T09:00:00Z');

describe('locationOpenState', () => {
  it('uses the branch hours when it has them', () => {
    const late = branch({ opening_hours: 'Mon-Sun: 9AM-11PM' });
    expect(locationOpenState(late, parent, wed1935).kind).toBe('open');
  });

  it('falls back to the parent hours when the branch set none', () => {
    // A chain usually keeps the same hours everywhere; making every branch
    // restate the timetable would guarantee they drift out of date.
    expect(locationOpenState(branch(), parent, wed10).kind).toBe('open');
    expect(locationOpenState(branch(), parent, sun).kind).toBe('closed');
  });

  it('falls back field by field, not all or nothing', () => {
    // Branch sets only a timezone; the parent's hours still apply, read in the
    // branch's zone.
    const abroad = branch({ timezone: 'Pacific/Honolulu' });
    expect(locationOpenState(abroad, parent, wed10).kind).toBe('closed');
  });

  it("lets the branch's own override win outright", () => {
    // That field exists precisely to say "today is different here".
    expect(locationOpenState(branch({ open_status: 'closed' }), parent, wed10).kind).toBe('closed');
    expect(locationOpenState(branch({ open_status: 'open' }), parent, sun).kind).toBe('open');
  });

  it('reports closing soon per branch', () => {
    expect(locationOpenState(branch(), parent, wed1935).kind).toBe('closing-soon');
  });

  it('says it does not know when neither branch nor parent has readable hours', () => {
    expect(locationOpenState(branch(), { timezone: 'Africa/Lagos' }, wed10).kind).toBe('unknown');
  });
});

describe('inherited fields', () => {
  it('shows the branch address and phone when set', () => {
    const b = branch({ address: '12 Adeola Odeku, VI', phone: '08099887766' });
    expect(locationAddress(b, parent)).toBe('12 Adeola Odeku, VI');
    expect(locationPhone(b, parent)).toBe('08099887766');
  });

  it('falls back to the parent when not', () => {
    expect(locationAddress(branch(), parent)).toBe('Yaba, Lagos');
    expect(locationPhone(branch(), parent)).toBe('08031234567');
  });

  it('treats whitespace as unset', () => {
    expect(locationAddress(branch({ address: '   ' }), parent)).toBe('Yaba, Lagos');
  });
});

describe('sortLocations', () => {
  const list = [
    branch({ id: 'c', name: 'Closed branch', open_status: 'closed' }),
    branch({ id: 'z', name: 'Zaria', open_status: 'open' }),
    branch({ id: 'p', name: 'Head office', is_primary: true }),
    branch({ id: 'a', name: 'Abeokuta', open_status: 'open' }),
  ];

  it('puts the flagship first, then what is open, then the rest', () => {
    const order = sortLocations(list, parent, wed10).map((l) => l.id);
    expect(order[0]).toBe('p');
    expect(order.slice(1, 3).sort()).toEqual(['a', 'z']);
    expect(order[3]).toBe('c');
  });

  it('breaks ties alphabetically so the list is stable', () => {
    const open = sortLocations(list, parent, wed10).filter((l) => l.open_status === 'open');
    expect(open.map((l) => l.name)).toEqual(['Abeokuta', 'Zaria']);
  });

  it('does not mutate what it was given', () => {
    const before = list.map((l) => l.id);
    sortLocations(list, parent, wed10);
    expect(list.map((l) => l.id)).toEqual(before);
  });

  it('copes with an empty list', () => {
    expect(sortLocations([], parent, wed10)).toEqual([]);
  });
});

describe('primaryLocation', () => {
  it('finds the flagship', () => {
    expect(primaryLocation([branch({ id: 'a' }), branch({ id: 'b', is_primary: true })])?.id).toBe('b');
  });

  it('falls back to the first rather than nothing', () => {
    expect(primaryLocation([branch({ id: 'a' })])?.id).toBe('a');
    expect(primaryLocation([])).toBeNull();
  });
});

describe('locationsSummary', () => {
  it('says how many can be reached right now', () => {
    const list = [branch({ id: 'a' }), branch({ id: 'b', open_status: 'closed' })];
    expect(locationsSummary(list, parent, wed10)).toBe('1 of 2 open now');
  });

  it('counts closing soon as open, matching the directory filter', () => {
    const list = [branch({ id: 'a' })];
    expect(locationsSummary(list, parent, wed1935)).toBe('1 of 1 open now');
  });

  it('will not claim "0 of 5 open" when it simply cannot tell', () => {
    const unknownParent: LocationFallback = { timezone: 'Africa/Lagos' };
    const list = [branch({ id: 'a' }), branch({ id: 'b' })];
    expect(locationsSummary(list, unknownParent, wed10)).toBe('2 branches');
  });

  it('says nothing for no branches', () => {
    expect(locationsSummary([], parent, wed10)).toBe('');
  });

  it('does not say "1 branches"', () => {
    expect(locationsSummary([branch()], { timezone: 'Africa/Lagos' }, wed10)).toBe('1 branch');
  });
});

describe('distance', () => {
  it('measures a known short hop', () => {
    // Yaba to Victoria Island, roughly 10 km.
    const km = distanceKm(6.5158, 3.3898, 6.4281, 3.4219);
    expect(km).toBeGreaterThan(8);
    expect(km).toBeLessThan(13);
  });

  it('is zero for the same point', () => {
    expect(distanceKm(6.5, 3.3, 6.5, 3.3)).toBe(0);
  });

  it('returns null rather than a number it cannot justify', () => {
    expect(distanceKm(null, 3.3, 6.5, 3.3)).toBeNull();
    expect(distanceKm(6.5, 3.3, undefined, 3.3)).toBeNull();
    expect(distanceKm(NaN, 3.3, 6.5, 3.3)).toBeNull();
  });

  it('labels metres under a kilometre', () => {
    expect(distanceLabel(0.4)).toBe('400 m away');
    expect(distanceLabel(2.3)).toBe('2.3 km away');
    expect(distanceLabel(null)).toBe('');
  });
});

describe('nearestLocation', () => {
  const list = [
    branch({ id: 'far', latitude: 6.4281, longitude: 3.4219 }),
    branch({ id: 'near', latitude: 6.5158, longitude: 3.3898 }),
    branch({ id: 'nogeo' }),
  ];

  it('finds the closest branch that has coordinates', () => {
    expect(nearestLocation(list, 6.5160, 3.3900)?.location.id).toBe('near');
  });

  it('returns null rather than guessing when nothing has coordinates', () => {
    // A "nearest" that is really "first in the list" sends someone the wrong way.
    expect(nearestLocation([branch({ id: 'nogeo' })], 6.5, 3.3)).toBeNull();
    expect(nearestLocation(list, null, null)).toBeNull();
  });
});

describe('normaliseLocation', () => {
  it('trims and drops the blanks', () => {
    const out = normaliseLocation({ name: '  Lekki  ', address: '   ', phone: ' 0803 ' });
    expect(out.name).toBe('Lekki');
    expect(out.address).toBeNull();
    expect(out.phone).toBe('0803');
  });

  it('never saves a nameless branch', () => {
    expect(normaliseLocation({ name: '   ' }).name).toBe('Branch');
  });

  it("turns an empty select into null, not a value the CHECK would reject", () => {
    expect(normaliseLocation({ open_status: '' as unknown as 'open' }).open_status).toBeNull();
    expect(normaliseLocation({ open_status: 'open' }).open_status).toBe('open');
  });

  it('bounds the name', () => {
    expect(normaliseLocation({ name: 'x'.repeat(200) }).name).toHaveLength(80);
  });
});
