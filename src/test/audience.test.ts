import { readFileSync } from 'node:fs';

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveAudience, isSeller, canSwitchAudience,
  readAudiencePreference, writeAudiencePreference, clearAudiencePreference,
} from '../lib/audience';
import {
  PRIMARY_NAV, NAV_ACCENT_CLASS, AFRICA_MENU, PEOPLE_MENU, BUSINESS_MENU,
  menuFor, menuLabel, isNavItemActive,
} from '../lib/navigation';

beforeEach(() => localStorage.clear());

describe('resolveAudience', () => {
  it('gives a plain visitor the people experience', () => {
    expect(resolveAudience({ ownedBusinesses: 0 })).toBe('people');
  });

  it('gives an owner the business experience by default', () => {
    expect(resolveAudience({ ownedBusinesses: 1 })).toBe('business');
  });

  it('treats a media-service owner as a seller too', () => {
    expect(resolveAudience({ ownedBusinesses: 0, ownedMediaServices: 2 })).toBe('business');
  });

  it('does not put someone who registered as a business but listed nothing into an empty dashboard', () => {
    // role is a signup answer, not a fact about what they have.
    expect(resolveAudience({ ownedBusinesses: 0, role: 'business' })).toBe('people');
  });

  it('lands an admin where they work', () => {
    expect(resolveAudience({ ownedBusinesses: 0, role: 'admin' })).toBe('business');
  });

  it('lets an owner choose to browse as a person', () => {
    expect(resolveAudience({ ownedBusinesses: 1, preference: 'people' })).toBe('people');
  });

  it('ignores a business preference from someone who owns nothing', () => {
    // Otherwise deleting your last business strands you in a dashboard for a
    // business that no longer exists.
    expect(resolveAudience({ ownedBusinesses: 0, preference: 'business' })).toBe('people');
  });

  it('offers the switch only to people who are both', () => {
    expect(canSwitchAudience({ ownedBusinesses: 1 })).toBe(true);
    expect(canSwitchAudience({ ownedBusinesses: 0 })).toBe(false);
    expect(isSeller({ ownedBusinesses: 0, ownedMediaServices: 1 })).toBe(true);
  });
});

describe('audience preference', () => {
  it('round-trips', () => {
    writeAudiencePreference('people');
    expect(readAudiencePreference()).toBe('people');
    clearAudiencePreference();
    expect(readAudiencePreference()).toBeNull();
  });

  it('ignores a junk value rather than trusting it', () => {
    localStorage.setItem('nowopen.audience', 'admin');
    expect(readAudiencePreference()).toBeNull();
  });
});

describe('the primary lineup', () => {
  it('is the platform lineup, in order', () => {
    expect(PRIMARY_NAV.map((i) => i.label)).toEqual(['Discover', 'Create', 'Promote']);
  });

  it('leaves the supply link out of PRIMARY and both audience menus', () => {
    /*
     * It lives in the "Africa is NowOpen" menu — where the platform's own
     * invitations already sit, shown in either audience, and without adding a
     * fourth item to a three-item bar. A business owner browsing as a customer
     * is exactly who this has to reach, and the Manage menu is invisible to
     * them.
     */
    for (const list of [PRIMARY_NAV, PEOPLE_MENU, BUSINESS_MENU]) {
      expect(list.some((i) => i.to === '/send-business')).toBe(false);
    }
    expect(AFRICA_MENU.some((i) => i.to === '/send-business')).toBe(true);
  });

  it('is shown to everyone, so nothing in it may require an account', () => {
    // A primary link that vanishes when signed out leaves a gap in the bar.
    expect(PRIMARY_NAV.every((i) => !i.authOnly)).toBe(true);
  });

  /*
   * The hubs paint their pages: Promote orange, Create green. A header that
   * turns every current tab blue contradicts the page in front of it, so the
   * item has to carry the section's colour rather than the platform's.
   */
  it('gives each section the colour its pages are painted in', () => {
    const accentOf = (to: string) => PRIMARY_NAV.find((i) => i.to === to)?.accent ?? 'blue';
    expect(accentOf('/adverts')).toBe('orange');
    expect(accentOf('/media')).toBe('green');
    // Discover owns no colour; blue is the platform's default.
    expect(accentOf('/discover')).toBe('blue');
  });

  it('applies that colour to the current item in the header', () => {
    const nav = readFileSync('src/components/layout/Navigation.tsx', 'utf8');
    expect(nav, 'the active item must use its own accent').toMatch(/active \? accent\.active : accent\.idle/);
    expect(nav, 'the mobile menu must agree with the bar').toMatch(/accent\.active} bg-gray-100/);
    // 700 on white clears AA for the label; 300 carries it on the dark bar.
    expect(NAV_ACCENT_CLASS.green.active).toContain('text-green-700');
    expect(NAV_ACCENT_CLASS.green.active).toContain('dark:text-green-300');
    expect(NAV_ACCENT_CLASS.orange.active).toContain('text-orange-700');
    expect(NAV_ACCENT_CLASS.orange.active).toContain('dark:text-orange-300');
  });
});

describe('the "Africa is NowOpen" menu', () => {
  const nav = readFileSync('src/components/layout/Navigation.tsx', 'utf8');

  /*
   * Written twice, it drifted: Instagram and "Add your business" reached the
   * desktop dropdown but never the mobile menu, so a phone could not take
   * either invitation. One array, rendered by both, is what stops that
   * recurring — and the drift is invisible on whichever device you are not
   * holding, which is why it is pinned here rather than left to review.
   */
  it('is rendered by both the dropdown and the mobile menu', () => {
    const renderers = nav.match(/AFRICA_MENU\.map\(/g) ?? [];
    expect(renderers, 'both menus must map the shared array').toHaveLength(2);
    // A slice or filter is how one side quietly loses an item again.
    expect(nav).not.toMatch(/AFRICA_MENU\.(slice|filter)\(/);
  });

  it('carries every invitation, including the two the phone used to miss', () => {
    for (const dest of [
      '/platform', '/os', '/forms', '/waitlist',
      '/send-business', '/instagram', '/pricing',
    ]) {
      expect(AFRICA_MENU.some((i) => i.to === dest), `${dest} is missing`).toBe(true);
    }
  });

  it('takes its words from the dictionary, so French gets the whole list', () => {
    for (const item of AFRICA_MENU) {
      expect(item.labelKey, `${item.to} has a hard-coded label`).toMatch(/^(nav|footer)\./);
      if (item.descKey) expect(item.descKey).toMatch(/^nav\./);
      if (item.mobileLabelKey) expect(item.mobileLabelKey).toMatch(/^nav\./);
    }
  });
});

describe('the two menus stay apart', () => {
  it('keeps seller surfaces out of the people menu', () => {
    const peoplePaths = PEOPLE_MENU.map((i) => i.to);
    for (const seller of ['/pricing', '/adverts', '/platform', '/os', '/forms', '/waitlist', '/dashboard', '/studio']) {
      expect(peoplePaths).not.toContain(seller);
    }
  });

  it('keeps discovery surfaces out of the business menu', () => {
    const businessPaths = BUSINESS_MENU.map((i) => i.to);
    for (const consumer of ['/discover', '/keeps', '/nearby', '/open-now']) {
      expect(businessPaths).not.toContain(consumer);
    }
  });

  it('shares no destination between the two', () => {
    const overlap = PEOPLE_MENU.map((i) => i.to).filter((p) => BUSINESS_MENU.some((b) => b.to === p));
    expect(overlap).toEqual([]);
  });

  it('never duplicates a primary link inside a menu', () => {
    // The same destination in the bar and the dropdown reads as two places.
    const primary = PRIMARY_NAV.map((i) => i.to);
    for (const item of [...PEOPLE_MENU, ...BUSINESS_MENU]) {
      expect(primary).not.toContain(item.to);
    }
  });

  it('returns the right menu and names it', () => {
    expect(menuFor('people')).toBe(PEOPLE_MENU);
    expect(menuFor('business')).toBe(BUSINESS_MENU);
    expect(menuLabel('people')).toBe('For you');
    expect(menuLabel('business')).toBe('Manage');
  });

  it('gates only Keeps on having an account', () => {
    expect(PEOPLE_MENU.filter((i) => i.authOnly).map((i) => i.label)).toEqual(['Keeps']);
  });
});

describe('isNavItemActive', () => {
  const overview = BUSINESS_MENU[0];
  const customers = BUSINESS_MENU.find((i) => i.label === 'Customers')!;

  it('marks Overview active only with no tab selected', () => {
    expect(isNavItemActive(overview, '/dashboard', '')).toBe(true);
    expect(isNavItemActive(overview, '/dashboard', '?tab=customers')).toBe(false);
  });

  it('matches a tabbed destination on its tab', () => {
    expect(isNavItemActive(customers, '/dashboard', '?tab=customers')).toBe(true);
    expect(isNavItemActive(customers, '/dashboard', '?tab=orders')).toBe(false);
  });

  it('does not match a different path', () => {
    expect(isNavItemActive(customers, '/studio', '?tab=customers')).toBe(false);
  });

  it('matches a plain path', () => {
    expect(isNavItemActive(PRIMARY_NAV[0], '/discover', '')).toBe(true);
  });
});
