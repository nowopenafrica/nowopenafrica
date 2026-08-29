import { describe, it, expect } from 'vitest';
import {
  stringList, faqList, teamList, credentialList, policyEntries, socialEntries,
  yearsInBusiness, profileCompleteness, visibleSections,
} from '../lib/businessProfile';

const now = new Date('2026-08-29T12:00:00+01:00');

describe('reading owner-entered JSON', () => {
  it('survives a column that is not a list at all', () => {
    // These are owner-entered and arrive as unknown; a page that throws is
    // worse than a section that renders short.
    for (const junk of [null, undefined, 'text', 42, {}]) {
      expect(stringList(junk)).toEqual([]);
      expect(faqList(junk)).toEqual([]);
      expect(teamList(junk)).toEqual([]);
      expect(credentialList(junk)).toEqual([]);
    }
  });

  it('drops blanks from a list of claims', () => {
    expect(stringList(['Same-day delivery', '', '  ', 'Wholesale pricing', 7]))
      .toEqual(['Same-day delivery', 'Wholesale pricing']);
  });

  it('drops a question with no answer', () => {
    expect(faqList([{ q: 'Do you deliver?', a: 'Yes' }, { q: 'Hours?', a: '' }, { q: '', a: 'x' }]))
      .toEqual([{ q: 'Do you deliver?', a: 'Yes' }]);
  });

  it('keeps a team member with only a name', () => {
    expect(teamList([{ name: 'Ade' }, { role: 'Chef' }])).toEqual([{ name: 'Ade' }]);
  });

  it('keeps only policies with text behind them', () => {
    expect(policyEntries({ refund: 'Within 7 days', delivery: '   ', returns: null }))
      .toEqual([{ key: 'refund', text: 'Within 7 days' }]);
  });

  it('refuses a social value that is not a URL', () => {
    // A handle rendered as a link goes nowhere and looks broken.
    expect(socialEntries({ instagram: 'https://instagram.com/x', facebook: '@notalink' }))
      .toEqual([{ key: 'instagram', url: 'https://instagram.com/x' }]);
  });
});

describe('yearsInBusiness', () => {
  it('counts the years', () => {
    expect(yearsInBusiness(2018, now)).toBe(8);
  });

  it('refuses a future year and a first part-year', () => {
    // "0 years in business" is not a credential, and 2027 is a typo.
    expect(yearsInBusiness(2027, now)).toBeNull();
    expect(yearsInBusiness(2026, now)).toBeNull();
    expect(yearsInBusiness(null, now)).toBeNull();
  });
});

describe('completeness', () => {
  const bare = { name: 'Shop', category: 'Retail Store' };

  it('does not report a bare listing as nearly done', () => {
    expect(profileCompleteness(bare, now).percent).toBeLessThan(15);
  });

  it('rounds down, so 99% never reads as finished', () => {
    const c = profileCompleteness(bare, now);
    expect(Number.isInteger(c.percent)).toBe(true);
    expect(c.percent).toBeLessThan(100);
  });

  it('offers three next steps, heaviest first', () => {
    const next = profileCompleteness(bare, now).next;
    expect(next).toHaveLength(3);
    expect(next[0].weight).toBeGreaterThanOrEqual(next[2].weight);
    expect(next[0].hint).toBeTruthy();
  });

  it('does not ask a mechanic for a mission statement', () => {
    // A meter that demands one is a meter people learn to ignore.
    const keys = profileCompleteness({ ...bare, category: 'Roadside Mechanic' }, now).missing.map((f) => f.key);
    expect(keys).not.toContain('mission');
    expect(keys).not.toContain('vision');
  });

  it('does ask an NGO for one', () => {
    const keys = profileCompleteness({ ...bare, category: 'Non-profit & NGO' }, now).missing.map((f) => f.key);
    expect(keys).toContain('vision');
    expect(keys).toContain('mission');
  });

  it('asks a law firm to introduce the team, and a supermarket not to', () => {
    const law = profileCompleteness({ ...bare, category: 'Legal Services' }, now).missing.map((f) => f.key);
    const shop = profileCompleteness({ ...bare, category: 'Supermarket' }, now).missing.map((f) => f.key);
    expect(law).toContain('team');
    expect(shop).not.toContain('team');
  });

  it('counts a filled profile as complete', () => {
    const full = {
      ...bare,
      logo_url: 'l', image_url: 'i', tagline: 't', about: 'a', opening_hours: 'Mon-Fri 9-5',
      location: 'Lagos', phone: '080', story: 's', core_values: ['Quality'],
      payment_methods: ['Cash'], why_us: ['a', 'b', 'c'],
      faqs: [{ q: '1', a: '1' }, { q: '2', a: '2' }, { q: '3', a: '3' }],
      founded_year: 2018, productCount: 4, galleryCount: 5,
    };
    expect(profileCompleteness(full, now).percent).toBe(100);
  });
});

describe('visibleSections', () => {
  it('shows nothing it has no content for', () => {
    // A page of empty headings says the business could not be bothered.
    const s = visibleSections({ name: 'x', category: 'Retail Store' });
    expect(s).not.toContain('faqs');
    expect(s).not.toContain('team');
    expect(s).not.toContain('why_us');
    expect(s).not.toContain('gallery');
  });

  it('always keeps contact, because that is the point of the page', () => {
    expect(visibleSections({ name: 'x' })).toContain('contact');
  });

  it('shows a section as soon as it has something', () => {
    const s = visibleSections({
      name: 'x', why_us: ['Fast'], faqs: [{ q: 'a', a: 'b' }],
      productCount: 2, reviewCount: 5, isLive: true,
    });
    expect(s).toEqual(expect.arrayContaining(['why_us', 'faqs', 'products', 'reviews', 'live']));
  });

  it('counts any one story field as enough for About', () => {
    expect(visibleSections({ name: 'x', vision: 'To grow' })).toContain('about');
    expect(visibleSections({ name: 'x', core_values: ['Trust'] })).toContain('about');
  });
});

describe('About does not duplicate the header', () => {
  it('still counts a description as covering About for completeness', async () => {
    // The two are different jobs: completeness asks "have you said what you
    // do?", the section asks "is there more to say than the header?".
    const { profileCompleteness } = await import('../lib/businessProfile');
    const withDesc = profileCompleteness({ name: 'x', category: 'Retail Store', description: 'We sell things' }, now);
    expect(withDesc.missing.map((f) => f.key)).not.toContain('about');
  });
});
