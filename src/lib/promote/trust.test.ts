import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  calls: [] as string[][],
  rows: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
  /** 1-based call number that fails; null = every call fails when error is set. */
  failAtCall: null as number | null,
  throwIt: false,
}));

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'placement_trust') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          in: async (col: string, chunk: string[]) => {
            if (col !== 'advert_id') throw new Error(`unexpected column ${col}`);
            if (state.throwIt) throw new Error('network');
            state.calls.push(chunk);
            if (state.error && (state.failAtCall === null || state.calls.length === state.failAtCall)) return { data: null, error: state.error };
            return { data: state.rows.filter((r) => chunk.includes(r.advert_id as string)), error: null };
          },
        }),
      };
    },
  },
}));

import {
  IMPORTED_FALLBACK,
  availabilityText,
  fetchPlacementTrust,
  fetchPlacementTrustResult,
  isListedPlacement,
  ownerWebsiteHref,
  priceBasisParts,
  priceBasisText,
  trustLabelText,
  trustRank,
  type Availability,
  type PlacementTrust,
  type TrustLabel,
} from './trust';

const fmt = (iso: string) => `D(${iso.slice(0, 10)})`;
const make = (over: Partial<PlacementTrust> = {}): PlacementTrust => ({
  ...IMPORTED_FALLBACK('a1'),
  ...over,
});

beforeEach(() => {
  state.calls = [];
  state.rows = [];
  state.error = null;
  state.failAtCall = null;
  state.throwIt = false;
});

describe('trustLabelText', () => {
  it('maps every label verbatim', () => {
    expect(trustLabelText('source_listed')).toBe('Source listed');
    expect(trustLabelText('partner_supplied')).toBe('Partner supplied');
    expect(trustLabelText('partner_verified')).toBe('Partner verified');
  });
});

describe('availabilityText', () => {
  it('reads all six states', () => {
    expect(
      availabilityText(
        make({ availability: 'confirmed_available', availabilityConfirmedAt: '2026-11-03T09:00:00Z', confirmedByName: 'Acme Outdoor' }),
        fmt,
      ),
    ).toBe('Available · confirmed D(2026-11-03) by Acme Outdoor');
    expect(
      availabilityText(
        make({ availability: 'available_from', periodFrom: '2027-03-01', availabilityConfirmedAt: '2026-11-03T09:00:00Z' }),
        fmt,
      ),
    ).toBe('Available from D(2027-03-01) · confirmed D(2026-11-03)');
    expect(availabilityText(make({ availability: 'booked', periodTo: '2026-12-01' }), fmt)).toBe('Booked until D(2026-12-01)');
    expect(availabilityText(make({ availability: 'unavailable' }), fmt)).toBe('Unavailable');
    expect(availabilityText(make({ availability: 'maintenance' }), fmt)).toBe('Under maintenance');
    expect(availabilityText(make({ availability: 'requires_confirmation' }), fmt)).toBe('Availability requires confirmation');
  });

  it('drops "by owner" when the confirmation names no owner', () => {
    expect(
      availabilityText(make({ availability: 'confirmed_available', availabilityConfirmedAt: '2026-11-03', confirmedByName: null }), fmt),
    ).toBe('Available · confirmed D(2026-11-03)');
  });

  it('never attributes an admin or phone check to the linked owner', () => {
    // The linked owner (ownerName) is not who confirmed: only confirmedByName may be named.
    for (const confirmationMethod of ['admin', 'phone', 'email', 'document'] as const) {
      expect(
        availabilityText(
          make({
            availability: 'confirmed_available', availabilityConfirmedAt: '2026-11-03',
            ownerName: 'Acme Outdoor', confirmedByName: null, confirmationMethod,
          }),
          fmt,
        ),
      ).toBe('Available · confirmed D(2026-11-03)');
    }
  });

  it("never 'Available' now for a future period", () => {
    const text = availabilityText(
      make({
        availability: 'available_from', periodFrom: '2027-03-01', availabilityConfirmedAt: '2026-11-03',
        confirmedByName: 'Acme Outdoor', ownerName: 'Acme Outdoor',
      }),
      fmt,
    );
    expect(text).toBe('Available from D(2027-03-01) · confirmed D(2026-11-03)');
    expect(text).not.toMatch(/^Available ·/);
  });

  it('available_from without both dates is unsupported, so requires confirmation', () => {
    expect(availabilityText(make({ availability: 'available_from', periodFrom: null, availabilityConfirmedAt: '2026-11-03' }), fmt))
      .toBe('Availability requires confirmation');
    expect(availabilityText(make({ availability: 'available_from', periodFrom: '2027-03-01', availabilityConfirmedAt: null }), fmt))
      .toBe('Availability requires confirmation');
  });

  it('reads "Booked" when periodTo is null', () => {
    expect(availabilityText(make({ availability: 'booked', periodTo: null }), fmt)).toBe('Booked');
  });

  it('never says Available without a confirmation date', () => {
    expect(availabilityText(make({ availability: 'confirmed_available', availabilityConfirmedAt: null }), fmt)).toBe(
      'Availability requires confirmation',
    );
  });

  it('never starts with "Available" unless confirmed_available or available_from', () => {
    const states: Availability[] = ['booked', 'unavailable', 'maintenance', 'requires_confirmation'];
    const labels: TrustLabel[] = ['source_listed', 'partner_supplied', 'partner_verified'];
    for (const availability of states)
      for (const trustLabel of labels)
        for (const confirmedByName of [null, 'Acme'])
          for (const periodTo of [null, '2026-12-01'])
            for (const availabilityConfirmedAt of [null, '2026-11-03']) {
              const text = availabilityText(
                make({ availability, trustLabel, ownerName: confirmedByName, confirmedByName, periodTo, availabilityConfirmedAt }),
                fmt,
              );
              expect(text.startsWith('Available')).toBe(false);
            }
  });
});

describe('priceBasisText', () => {
  it('source listed is indicative', () => {
    expect(priceBasisText(make({ priceBasis: 'source_listed' }), fmt)).toBe('indicative · published rate card');
  });
  it('no pricing source row is just "indicative", never a published rate card', () => {
    expect(priceBasisText(make({ priceBasis: null }), fmt)).toBe('indicative');
  });
  it('partner and verified carry the date', () => {
    expect(priceBasisText(make({ priceBasis: 'partner_supplied', priceAsOf: '2026-10-01' }), fmt)).toBe('partner price · D(2026-10-01)');
    expect(priceBasisText(make({ priceBasis: 'verified', priceAsOf: '2026-10-01' }), fmt)).toBe('partner price · D(2026-10-01)');
  });
  it('omits the date when none was recorded', () => {
    expect(priceBasisText(make({ priceBasis: 'partner_supplied', priceAsOf: null }), fmt)).toBe('partner price');
  });
});

describe('IMPORTED_FALLBACK', () => {
  it('is honest', () => {
    const t = IMPORTED_FALLBACK('x');
    expect(t.advertId).toBe('x');
    expect(trustLabelText(t.trustLabel)).toBe('Source listed');
    expect(availabilityText(t, fmt)).toBe('Availability requires confirmation');
    // Unknown basis: indicative, with no claim about where the price came from.
    expect(priceBasisText(t, fmt)).toBe('indicative');
    expect(t.confirmedByName).toBeNull();
    expect(t.periodFrom).toBeNull();
  });
  it('carries no availabilityValidUntil (unused, so not mapped)', () => {
    expect('availabilityValidUntil' in IMPORTED_FALLBACK('x')).toBe(false);
  });
});

describe('priceBasisParts', () => {
  it('splits the basis into the indicative flag and its detail', () => {
    expect(priceBasisParts(make({ priceBasis: 'source_listed' }), fmt)).toEqual({ indicative: true, detail: 'published rate card' });
    expect(priceBasisParts(make({ priceBasis: null }), fmt)).toEqual({ indicative: true, detail: null });
    expect(priceBasisParts(make({ priceBasis: 'partner_supplied', priceAsOf: '2026-10-01' }), fmt))
      .toEqual({ indicative: false, detail: 'partner price · D(2026-10-01)' });
    expect(priceBasisParts(make({ priceBasis: 'verified', priceAsOf: null }), fmt)).toEqual({ indicative: false, detail: 'partner price' });
  });
});

describe('trustRank', () => {
  it('orders best to worst, 0 to 8; available_from ranks after confirmed_available', () => {
    const r = (trustLabel: TrustLabel, availability: Availability) => trustRank(make({ trustLabel, availability }));
    expect(r('partner_verified', 'confirmed_available')).toBe(0);
    expect(r('partner_verified', 'available_from')).toBe(1);
    expect(r('partner_verified', 'booked')).toBe(2);
    expect(r('partner_supplied', 'confirmed_available')).toBe(3);
    expect(r('partner_supplied', 'available_from')).toBe(4);
    expect(r('partner_supplied', 'requires_confirmation')).toBe(5);
    expect(r('source_listed', 'confirmed_available')).toBe(6);
    expect(r('source_listed', 'available_from')).toBe(7);
    expect(r('source_listed', 'requires_confirmation')).toBe(8);
  });
});

describe('isListedPlacement', () => {
  it('hides rejected, archived and pending_review; anything else (or no lifecycle) is listed', () => {
    expect(isListedPlacement({ lifecycle: 'rejected' })).toBe(false);
    expect(isListedPlacement({ lifecycle: 'archived' })).toBe(false);
    // An unverified owner's new placement waits for an admin; it is not public.
    expect(isListedPlacement({ lifecycle: 'pending_review' })).toBe(false);
    for (const lifecycle of ['imported', 'discovered', 'partner_supplied', 'partner_verified', null, undefined]) {
      expect(isListedPlacement({ lifecycle })).toBe(true);
    }
    expect(isListedPlacement({})).toBe(true);
  });
});

describe('ownerWebsiteHref', () => {
  it('only for partner_verified, and only an http(s) website', () => {
    expect(ownerWebsiteHref(make({ trustLabel: 'partner_verified', ownerWebsite: 'https://acme.example' }))).toBe('https://acme.example');
    expect(ownerWebsiteHref(make({ trustLabel: 'partner_supplied', ownerWebsite: 'https://acme.example' }))).toBeNull();
    expect(ownerWebsiteHref(make({ trustLabel: 'source_listed', ownerWebsite: 'https://acme.example' }))).toBeNull();
    expect(ownerWebsiteHref(make({ trustLabel: 'partner_verified', ownerWebsite: 'javascript:alert(1)' }))).toBeNull();
    expect(ownerWebsiteHref(make({ trustLabel: 'partner_verified', ownerWebsite: null }))).toBeNull();
  });
});

describe('fetchPlacementTrust', () => {
  const row = (id: string) => ({
    advert_id: id,
    trust_label: 'partner_verified',
    availability: 'confirmed_available',
    availability_confirmed_at: '2026-11-03T09:00:00Z',
    availability_valid_until: '2026-11-10T09:00:00Z',
    period_to: null,
    owner_name: 'Acme Outdoor',
    owner_website: 'https://acme.example',
    price_basis: 'verified',
    price_as_of: '2026-10-01',
    period_from: '2026-11-01',
    confirmed_by_name: 'Acme Outdoor',
    confirmation_method: 'email',
  });

  it('maps snake_case rows to camelCase', async () => {
    state.rows = [row('a1')];
    const map = await fetchPlacementTrust(['a1', 'a2']);
    expect(map.size).toBe(1);
    expect(map.get('a1')).toEqual({
      advertId: 'a1',
      trustLabel: 'partner_verified',
      availability: 'confirmed_available',
      availabilityConfirmedAt: '2026-11-03T09:00:00Z',
      periodFrom: '2026-11-01',
      periodTo: null,
      confirmedByName: 'Acme Outdoor',
      confirmationMethod: 'email',
      ownerName: 'Acme Outdoor',
      ownerWebsite: 'https://acme.example',
      priceBasis: 'verified',
      priceAsOf: '2026-10-01',
    });
  });

  it('maps available_from, and a null price_basis stays null', async () => {
    state.rows = [{ ...row('a1'), availability: 'available_from', period_from: '2027-03-01', price_basis: null }];
    const t = (await fetchPlacementTrust(['a1'])).get('a1')!;
    expect(t.availability).toBe('available_from');
    expect(t.periodFrom).toBe('2027-03-01');
    expect(t.priceBasis).toBeNull();
  });

  it('a row from the v1 view (no new columns) reads with nobody named', async () => {
    const v1: Record<string, unknown> = { ...row('a1') };
    delete v1.period_from;
    delete v1.confirmed_by_name;
    delete v1.confirmation_method;
    state.rows = [v1];
    const t = (await fetchPlacementTrust(['a1'])).get('a1')!;
    expect(t.confirmedByName).toBeNull();
    expect(t.confirmationMethod).toBeNull();
    expect(availabilityText(t, fmt)).toBe('Available · confirmed D(2026-11-03)');
  });

  it('chunks 450 ids into 3 calls of 200, 200, 50', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id${i}`);
    await fetchPlacementTrust(ids);
    expect(state.calls.map((c) => c.length)).toEqual([200, 200, 50]);
  });

  it('dedupes ids and makes no call for an empty list', async () => {
    expect((await fetchPlacementTrust([])).size).toBe(0);
    expect(state.calls).toEqual([]);
    await fetchPlacementTrust(['a', 'a', 'b']);
    expect(state.calls).toEqual([['a', 'b']]);
  });

  it('returns an empty Map when a later chunk fails, discarding rows from the earlier one', async () => {
    state.rows = [row('id0')];
    state.error = { message: 'relation does not exist' };
    state.failAtCall = 2;
    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`);
    const map = await fetchPlacementTrust(ids);
    expect(state.calls.length).toBe(2);
    expect(map.size).toBe(0);
  });

  it('returns an empty Map if the client throws', async () => {
    state.throwIt = true;
    expect((await fetchPlacementTrust(['a'])).size).toBe(0);
  });

  it('treats an unrecognised value as the honest default', async () => {
    state.rows = [{ ...row('a1'), trust_label: 'weird', availability: 'weird', price_basis: 'weird', confirmation_method: 'weird' }];
    const t = (await fetchPlacementTrust(['a1'])).get('a1')!;
    expect(t.trustLabel).toBe('source_listed');
    expect(t.availability).toBe('requires_confirmation');
    expect(t.priceBasis).toBeNull();
    expect(t.confirmationMethod).toBeNull();
  });
});

describe('fetchPlacementTrustResult', () => {
  const row2 = (id: string) => ({
    advert_id: id, trust_label: 'source_listed', availability: 'requires_confirmation',
    availability_confirmed_at: null, availability_valid_until: null, period_to: null,
    owner_name: null, owner_website: null, price_basis: 'source_listed', price_as_of: null,
  });

  it('a successful read with no rows is not a failure', async () => {
    const out = await fetchPlacementTrustResult(['gone']);
    expect(out.failed).toBe(false);
    expect(out.map.size).toBe(0);
  });

  it('a successful read returns its rows', async () => {
    state.rows = [row2('a1')];
    const out = await fetchPlacementTrustResult(['a1', 'a2']);
    expect(out.failed).toBe(false);
    expect([...out.map.keys()]).toEqual(['a1']);
  });

  it('an error is a failure, with an empty Map', async () => {
    state.rows = [row2('a1')];
    state.error = { message: 'boom' };
    const out = await fetchPlacementTrustResult(['a1']);
    expect(out).toEqual({ map: new Map(), failed: true });
  });

  it('a later chunk failing is a failure, never a partial Map', async () => {
    state.rows = [row2('id0')];
    state.error = { message: 'boom' };
    state.failAtCall = 2;
    const out = await fetchPlacementTrustResult(Array.from({ length: 250 }, (_, i) => `id${i}`));
    expect(out.failed).toBe(true);
    expect(out.map.size).toBe(0);
  });

  it('a throwing client is a failure', async () => {
    state.throwIt = true;
    expect((await fetchPlacementTrustResult(['a'])).failed).toBe(true);
  });

  it('an empty id list makes no call and is not a failure', async () => {
    expect(await fetchPlacementTrustResult([])).toEqual({ map: new Map(), failed: false });
    expect(state.calls).toEqual([]);
  });

  it('fetchPlacementTrust is the same read, returning the Map', async () => {
    state.rows = [row2('a1')];
    expect([...(await fetchPlacementTrust(['a1'])).keys()]).toEqual(['a1']);
  });
});
