import { describe, it, expect } from 'vitest';

import {
  categoryForGoogleTypes,
  isRegionPlace,
  cityFromComponents,
  placeToCandidate,
  GOOGLE_SOURCE_KEY,
  type GooglePlace,
} from './google';

describe('categoryForGoogleTypes', () => {
  it('maps a known type to its NowOpen category', () => {
    expect(categoryForGoogleTypes(['restaurant'])).toBe('Restaurant');
    expect(categoryForGoogleTypes(['school'])).toBe('Schools & Training');
    expect(categoryForGoogleTypes(['gas_station'])).toBe('Automotive');
  });

  it('takes the first mapped type in the array order', () => {
    expect(categoryForGoogleTypes(['restaurant', 'cafe'])).toBe('Restaurant');
    expect(categoryForGoogleTypes(['cafe', 'food'])).toBe('Café & Bakery');
  });

  it('falls back to Other for an unmapped type rather than dropping the place', () => {
    expect(categoryForGoogleTypes(['place_of_worship'])).toBe('Other');
  });
});

describe('isRegionPlace', () => {
  it('recognises a searched-for region as not-a-business', () => {
    expect(isRegionPlace(['locality', 'political'])).toBe(true);
    expect(isRegionPlace(['administrative_area_level_1', 'political'])).toBe(true);
  });

  it('keeps anything with a businessish type', () => {
    expect(isRegionPlace(['restaurant'])).toBe(false);
    expect(isRegionPlace(['shopping_mall', 'point_of_interest', 'establishment'])).toBe(false);
  });

  it('does not treat an empty type list as a region', () => {
    expect(isRegionPlace([])).toBe(false);
  });
});

describe('cityFromComponents', () => {
  const components = (parts: [string, string[]][]) =>
    parts.map(([longText, types]) => ({ longText, types }));

  it('prefers the locality component', () => {
    expect(cityFromComponents(components([
      ['Lagos', ['locality', 'political']],
      ['Nigeria', ['country']],
    ]))).toBe('Lagos');
  });

  it('falls back to a district when there is no locality', () => {
    expect(cityFromComponents(components([
      ['Eti-Osa', ['sublocality_level_1', 'sublocality']],
      ['Nigeria', ['country']],
    ]))).toBe('Eti-Osa');
  });

  it('returns null when there is no address component at all', () => {
    expect(cityFromComponents(undefined)).toBeNull();
  });
});

describe('placeToCandidate', () => {
  const place: GooglePlace = {
    displayName: { text: 'Taste Lagos' },
    formattedAddress: '12 Admiralty Way, Lekki, Lagos',
    addressComponents: [
      { longText: 'Lekki', types: ['locality'] },
      { longText: 'Lagos', types: ['administrative_area_level_1'] },
    ],
    nationalPhoneNumber: '+234 801 234 5678',
    websiteUri: 'https://tastelagos.ng',
    types: ['restaurant', 'meal_delivery'],
    location: { latitude: 6.4281, longitude: 3.455 },
    plusPlaceId: 'ChIJtaste',
    googleMapsUri: 'https://maps.google.com/?cid=42',
  };

  it('maps a real place into a stageable candidate with provenance', () => {
    const c = placeToCandidate(place);
    expect(c).not.toBeNull();
    expect(c!.qid).toBe('');
    expect(c!.sourceKey).toBe(GOOGLE_SOURCE_KEY);
    expect(c!.sourceRecordId).toBe('ChIJtaste');
    expect(c!.sourceUrl).toBe('https://maps.google.com/?cid=42');
    expect(c!.name).toBe('Taste Lagos');
    expect(c!.category).toBe('Restaurant');
    expect(c!.city).toBe('Lekki');
    expect(c!.address).toBe('12 Admiralty Way, Lekki, Lagos');
    expect(c!.phone).toBe('+234 801 234 5678');
    expect(c!.website).toBe('https://tastelagos.ng');
    expect(c!.latitude).toBe(6.4281);
    expect(c!.longitude).toBe(3.455);
    expect(c!.email).toBeNull();
    expect(c!.description).toBeNull();
    expect(c!.evidence.name?.method).toBe('api');
    expect(c!.evidence.website?.confidence).toBe(85);
    expect(c!.profile.google_maps_uri).toBe('https://maps.google.com/?cid=42');
  });

  it('refuses a region result — searching a city must not list the city', () => {
    expect(placeToCandidate({
      displayName: { text: 'Lagos' },
      types: ['locality', 'political'],
      plusPlaceId: 'ChIJregion',
    })).toBeNull();
  });

  it('refuses a place with no stable id or no name', () => {
    expect(placeToCandidate({ displayName: { text: 'No Id' } })).toBeNull();
    expect(placeToCandidate({ plusPlaceId: 'ChIJnodisplay' })).toBeNull();
  });
});