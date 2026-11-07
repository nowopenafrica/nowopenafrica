/**
 * Putting a business in the category it gave itself.
 *
 * The assertions that matter are the ones about REFUSING. A classifier that
 * always answers is worse than "Other": "Other" is visibly unknown, and a
 * confidently wrong category hides a business from the customers looking for
 * it while looking perfectly correct on screen.
 *
 * The bios quoted below are real, taken from listings on file 2026-10-09.
 */

import { describe, it, expect } from 'vitest';

import {
  categoryFromSelfDescription, emittedCategories, isRealCategory,
  SELF_DESCRIPTION_CATEGORY,
} from './instagramCategory';

const cat = (...t: Array<string | null>) => categoryFromSelfDescription(...t)?.category ?? null;

describe('every category it can emit is a category NowOpen has', () => {
  it('names no category outside the real list', () => {
    /*
     * The silent failure this prevents: a category renamed in categories.ts
     * while this map still files businesses under the old name. They would
     * vanish from every filter, and nothing would error.
     */
    const bogus = emittedCategories().filter((c) => !isRealCategory(c));
    expect(bogus).toEqual([]);
  });

  it('is actually checking something', () => {
    // A guard that silently matches nothing passes forever.
    expect(emittedCategories().length).toBeGreaterThan(40);
    expect(isRealCategory('Restaurant')).toBe(true);
    expect(isRealCategory('Food & Hospitality'), 'group names are not categories').toBe(false);
  });
});

describe('it reads real bios the way a person would', () => {
  it.each([
    ['Cleaning Service Company', 'Cleaning Services'],
    ['Aluko & Oyebode is a top-tier Nigerian law firm, providing world-class legal services', 'Legal Services'],
    ["Africa's Premier Digital Marketing Agency with 500+ clients", 'Digital Marketing'],
    // The apostrophe here is U+2019, as Instagram actually stores it.
    ['⚡ Premium Men’s Wear\n👔 Made For Men With Presence', 'Fashion & Apparel'],
    ['Top Furniture Brand in Nigeria | Home, Office & Outdoor', 'Furniture & Home'],
    ['We are your preferred Meat distribution center! Steadily delivering fresh meat', 'Meat & Poultry Shop'],
    ["Africa's fastest growing QSR brand.", 'Fast Food'],
    ["Nigeria's No.1 Shopping Destination.", 'Online Store / E-commerce'],
    ['Jobberman is a leading career development and recruitment solutions company', 'Recruitment & HR'],
    /*
     * Only one trade phrase matches here: the bio says "HAIR COLOURING AND
     * STYLING", which is not the phrase "hair styling". It is a wig shop that
     * also styles, and "wigs" is the only thing it states as its trade.
     */
    ['📍WE SELL QUALITY HAIRS & wigs\n📍 HAIR COLOURING AND STYLING', 'Wig & Hair Extensions'],
  ])('reads %j as %s', (bio, expected) => {
    expect(cat(bio)).toBe(expected);
  });

  it.each([
    ['We are a cleaning, janitorial service and fumigation services company.'],
    ['Family owned and operated Towing, Recovery, Mechanical and Body shop!'],
    ['Safe, transparent, and reliable logistics services. From freight forwarding to last-mile delivery'],
  ])('sends %j to a reviewer, because it names more than one trade', (bio) => {
    /*
     * These are all real listings, and every one of them genuinely does two
     * things. Nothing in the text says which is the business's primary trade,
     * so there is no reading that produces an answer — only a judgement, and
     * a judgement belongs to a person.
     *
     * An earlier draft of this file expected a category for each of them and
     * got one, by breaking the tie on which matched phrase happened to be
     * longer. That is not evidence, and it filed a towing company under
     * "Automotive" because "body shop" is two characters longer than
     * "towing".
     */
    expect(cat(bio)).toBeNull();
  });

  it('reads across the fields it is given, not just one', () => {
    // Bio, hashtags and offerings all describe the same business.
    expect(cat('We keep your home spotless', '#deepcleaning', 'Deep cleaning')).toBe('Cleaning Services');
  });
});

describe('it refuses rather than guesses', () => {
  it('returns nothing for a bio that names no trade', () => {
    /*
     * The common case, and the one where a clever classifier does damage.
     * Saying nothing leaves the field for a reviewer.
     */
    for (const bio of [
      'Welcome to our page! DM to order 💕',
      'Living my best life ✨ Lagos 🇳🇬',
      'Link in bio',
      '',
      null,
    ]) {
      expect(cat(bio), String(bio)).toBeNull();
    }
  });

  it('returns nothing when two trades are named equally', () => {
    /*
     * A real business may be both, and picking one would be asserting
     * something about a company that has not claimed its listing.
     */
    expect(cat('Our restaurant and our hair salon')).toBeNull();
  });

  it('still answers when one trade is clearly the stronger claim', () => {
    // Mentioning a gym once does not outweigh three cleaning phrases.
    expect(cat('Deep cleaning, janitorial and post construction cleaning. We also clean gyms.'))
      .toBe('Cleaning Services');
  });

  it('does not match a phrase inside a longer word', () => {
    /*
     * Word boundaries, or "ngo" matches "Ngozi" and a woman's name files a
     * business as a charity.
     */
    expect(cat('Ngozi fabrics, Aba')).not.toBe('Non-profit & NGO');
    expect(cat('Our gymnasium equipment is imported')).not.toBe('Fitness & Gym');
  });
});

describe('what it hands back', () => {
  it('reports the phrases it matched, so the evidence is visible', () => {
    const m = categoryFromSelfDescription('Deep cleaning and janitorial work across Lagos');
    expect(m?.matched).toContain('deep cleaning');
  });

  it('maps every phrase to a non-empty category', () => {
    for (const [phrase, category] of Object.entries(SELF_DESCRIPTION_CATEGORY)) {
      expect(category.trim(), phrase).not.toBe('');
    }
  });
});

describe('a trade word inside an address is not a trade', () => {
  it('does not file a person as a hospital because of a street name', () => {
    /*
     * MEASURED on a real listing: "Odanye Mary Adetoun" was filed under
     * Hospital & Clinic because its bio lists Ibadan addresses and one reads
     * "No 4, new adeoyo hospital road off ringroad". Wrong in a way that
     * looks entirely plausible in a list, which is the dangerous kind.
     */
    expect(cat('📍No 4, new adeoyo hospital road off ringroad. IBADAN')).toBeNull();
  });

  it('ignores the other address shapes too', () => {
    for (const bio of [
      'Find us at 12 Church Street, Yaba',
      'Opposite the school junction, Aba',
      'Near Market Road bus stop',
    ]) {
      expect(cat(bio), bio).toBeNull();
    }
  });

  it('still reads a real hospital that says it is one', () => {
    expect(cat('A private hospital offering 24-hour care in Lekki')).toBe('Hospital & Clinic');
  });

  it('no longer guesses between a skin clinic and a shop selling creams', () => {
    // "skincare" cannot tell those apart, and both exist on the platform.
    expect(cat('Start your journey to great skin. Nationwide delivery for a fee')).toBeNull();
  });
});
