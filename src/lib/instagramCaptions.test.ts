/**
 * Reading captions — and, mostly, refusing to read into them.
 *
 * The assertions that matter here are the negative ones. A directory that
 * invents a service for a business which has not claimed its listing does
 * real harm, and a caption is a rich source of things that merely sound like
 * services.
 */

import { describe, it, expect } from 'vitest';

import { readCaptions } from './instagramCaptions';

const post = (caption: string) => ({ caption, permalink: 'https://www.instagram.com/p/X/' });

describe('it only reports what the business wrote', () => {
  it('takes offerings from a list the business itself marked', () => {
    const f = readCaptions([post('Services: Braiding, Gele, Makeup')]);
    expect(f.offerings).toEqual(['Braiding', 'Gele', 'Makeup']);
  });

  it('reads bulleted lines as the list items they are', () => {
    const f = readCaptions([post('New in store\n• Ankara shirts\n• Kaftans\n• Agbada')]);
    expect(f.offerings).toEqual(expect.arrayContaining(['Ankara shirts', 'Kaftans', 'Agbada']));
  });

  it('does NOT invent a service from a sentence that merely mentions one', () => {
    /*
     * The decisive test. "We went to a wedding" is not a wedding service, and
     * a reader clever enough to extract one from it is exactly what must not
     * ship. Nothing is marked, so nothing is offered.
     */
    const f = readCaptions([post('We went to a wedding at the weekend and it was lovely.')]);
    expect(f.offerings).toEqual([]);
  });

  it('does not treat ordinary prose under a marker as a list for ever', () => {
    // The list stops at the first full sentence, not at the end of the post.
    const f = readCaptions([post(
      'Services: Braiding\nGele\nWe have been serving Lagos since 2014 and we love it.',
    )]);
    expect(f.offerings).toEqual(expect.arrayContaining(['Braiding', 'Gele']));
    expect(f.offerings.join(' ')).not.toMatch(/serving Lagos/);
  });

  it('never returns a price, only that one was mentioned', () => {
    /*
     * A caption's price is true the week it was posted and misleading after.
     * The flag tells a reviewer to ask the owner; the number is not carried.
     */
    const f = readCaptions([post('Ankara shirts now ₦15,000 only!')]);
    expect(f.mentionsPrices).toBe(true);
    expect(JSON.stringify(f)).not.toContain('15,000');
    expect(JSON.stringify(f)).not.toContain('15000');
  });
});

describe('contact details, which are facts', () => {
  it('finds a phone number however it is written', () => {
    const f = readCaptions([
      post('Call 0801 234 5678 to order'),
      post('WhatsApp +234-801-234-5678'),
    ]);
    // Both spellings are the same number and are reported once...
    expect(f.phones).toHaveLength(1);
    // ...keeping the international form, which a directory serving twenty
    // markets needs and the local 0801 form does not carry.
    expect(f.phones[0]).toMatch(/\+234/);
  });

  it('ignores digit runs that are not phone numbers', () => {
    const f = readCaptions([post('Serving Lagos since 2014. 50% off this week. Order 3 for 2.')]);
    expect(f.phones).toEqual([]);
  });

  it('finds emails and WhatsApp links', () => {
    const f = readCaptions([post('Email hello@ada.ng or https://wa.me/2348012345678')]);
    expect(f.emails).toEqual(['hello@ada.ng']);
    expect(f.whatsapp[0]).toMatch(/wa\.me/);
  });

  it('collects outbound links but not self-links', () => {
    const f = readCaptions([post(
      'Shop https://adafabrics.ng and follow https://instagram.com/adafabrics',
    )]);
    expect(f.links).toEqual(['https://adafabrics.ng']);
  });

  it('strips trailing punctuation from a link', () => {
    const f = readCaptions([post('Order at https://adafabrics.ng.')]);
    expect(f.links).toEqual(['https://adafabrics.ng']);
  });
});

describe('hashtags', () => {
  it('collects them lowercased and de-duplicated', () => {
    const f = readCaptions([post('#Lagos #lagos #AnkaraStyles')]);
    expect(f.hashtags).toEqual(['ankarastyles', 'lagos']);
  });
});

describe('it survives real input', () => {
  it('handles empty and missing captions', () => {
    const f = readCaptions([
      { caption: null, permalink: null },
      { caption: '', permalink: 'https://x' },
    ]);
    expect(f.offerings).toEqual([]);
    expect(f.phones).toEqual([]);
    expect(f.mentionsPrices).toBe(false);
  });

  it('keeps offerings short enough to be a service name', () => {
    // A 300-character bullet is a paragraph, not a service.
    const f = readCaptions([post(`• ${'x'.repeat(300)}`)]);
    expect(f.offerings).toEqual([]);
  });
});

describe('services and products are split by the word the business chose', () => {
  const post = (caption: string) => [{ caption, permalink: 'https://instagram.com/p/A/' }];

  it('treats a "Menu:" list as products', () => {
    // A restaurant writing "Menu:" is naming things it sells.
    const f = readCaptions(post('Menu:\n- Jollof Rice\n- Suya Platter'));
    expect(f.productOfferings).toEqual(['Jollof Rice', 'Suya Platter']);
  });

  it('treats a "Services:" list as services, not products', () => {
    const f = readCaptions(post('Services:\n- Bridal makeup\n- Gele tying'));
    expect(f.offerings).toEqual(['Bridal makeup', 'Gele tying']);
    expect(f.productOfferings).toEqual([]);
  });

  it('keeps productOfferings a strict subset of offerings', () => {
    const f = readCaptions(post('Products:\n- Shea butter\n- Black soap'));
    for (const p of f.productOfferings) expect(f.offerings).toContain(p);
  });

  it('does not call an unlabelled item a product', () => {
    /*
     * Naming something a product implies a thing that can be bought.
     * Asserting that about a business which has not claimed its listing is a
     * claim too far, so unlabelled means service.
     */
    const f = readCaptions(post('• Home delivery\n• Same day pickup'));
    expect(f.offerings.length).toBeGreaterThan(0);
    expect(f.productOfferings).toEqual([]);
  });

  it('does not let one caption\'s Menu leak into the next list', () => {
    const f = readCaptions([
      { caption: 'Menu:\n- Jollof Rice', permalink: 'https://instagram.com/p/A/' },
      { caption: 'Services:\n- Catering', permalink: 'https://instagram.com/p/B/' },
    ]);
    expect(f.productOfferings).toEqual(['Jollof Rice']);
    expect(f.offerings).toContain('Catering');
  });

  it('still invents nothing when the business listed nothing', () => {
    const f = readCaptions(post('Great weather today in Lekki!'));
    expect(f.offerings).toEqual([]);
    expect(f.productOfferings).toEqual([]);
  });
});
