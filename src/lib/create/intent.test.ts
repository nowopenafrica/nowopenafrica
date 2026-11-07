import { describe, it, expect } from 'vitest';

import {
  categoryForIntent, classifyIntent, deliverableForIntent, needForIntent,
  quotedText, routeFor,
} from './intent';
import { PRESETS } from '../studio/formats';
import { NEEDS } from './needs';

describe('reading what is being made', () => {
  it('recognises a design', () => {
    for (const ask of [
      'Create an Instagram flyer for my new restaurant opening',
      'I need a poster for Saturday',
      'make me a price list card',
      'design a banner for my shop',
    ]) {
      expect(classifyIntent(ask).kind, ask).toBe('graphic');
    }
  });

  it('recognises the things that are not a design', () => {
    expect(classifyIntent('Create a 20 second promotional video').kind).toBe('video');
    expect(classifyIntent('I want a logo for my brand').kind).toBe('brand');
    expect(classifyIntent('write captions for this week').kind).toBe('copy');
    expect(classifyIntent('launch a campaign for my new collection').kind).toBe('campaign');
  });

  /* A sentence with nothing in it must not be routed anywhere by guessing. */
  it('says it does not know rather than guessing', () => {
    for (const vague of ['hello', 'help me', 'something nice', '']) {
      const i = classifyIntent(vague);
      expect(i.kind, vague).toBe('unknown');
      expect(i.missing.length).toBeGreaterThan(0);
    }
  });

  it('reports how much of the answer came from the words', () => {
    const rich = classifyIntent('premium instagram story flyer for my fashion launch saying "Doors open Friday"');
    const thin = classifyIntent('a flyer');
    expect(rich.confidence).toBeGreaterThan(thin.confidence);
    /* "a flyer" really does carry two of the four signals: what, and what size. */
    expect(thin.confidence).toBeLessThanOrEqual(0.5);
    expect(rich.confidence).toBeGreaterThanOrEqual(0.75);
  });
});

describe('where it will be used', () => {
  it('picks the platform named', () => {
    expect(classifyIntent('an instagram post').platform).toBe('instagram');
    expect(classifyIntent('a whatsapp status graphic').platform).toBe('whatsapp');
    expect(classifyIntent('a youtube thumbnail').platform).toBe('youtube');
  });

  it('knows a story is not a square', () => {
    expect(classifyIntent('instagram post for my sale').formatId).toBe('ig-square');
    expect(classifyIntent('instagram story for my sale').formatId).toBe('ig-story');
    /* A cover is a still, whatever it is a cover of. */
    expect(classifyIntent('a reel cover').formatId).toBe('ig-story');
    expect(classifyIntent('a reel cover').kind).toBe('graphic');
  });

  /*
   * "Instagram flyer" is a square post, not a sheet of A4. The word flyer
   * describes the job; the platform describes where it has to fit.
   */
  it('lets a named platform beat a printed size', () => {
    expect(classifyIntent('instagram flyer for the opening').formatId).toBe('ig-square');
    expect(classifyIntent('flyer for the opening').formatId).toBe('a4');
  });

  it('reads printed sizes', () => {
    expect(classifyIntent('a business card').formatId).toBe('business-card');
    expect(classifyIntent('an A3 poster').formatId).toBe('a3');
    expect(classifyIntent('a menu for my restaurant').formatId).toBe('menu');
  });

  it('only ever names a format the catalogue really has', () => {
    const ids = new Set(PRESETS.map((p) => p.id));
    const asks = ['instagram story', 'a4 flyer', 'business card', 'youtube thumbnail', 'tiktok post',
      'whatsapp status', 'a5 leaflet', 'certificate', 'postcard', 'linkedin post', 'facebook advert'];
    for (const ask of asks) {
      const id = classifyIntent(ask).formatId;
      if (id) expect(ids.has(id), `${ask} -> ${id}`).toBe(true);
    }
  });
});

describe('words are matched whole, never as fragments', () => {
  /*
   * "ig" is an Instagram alias and it sits inside "des-ig-n". With substring
   * matching, "make me a design" was read as an Instagram request and handed
   * a square canvas — a confidently wrong answer, which is worse than no
   * answer because nothing looks broken.
   */
  it('does not find Instagram inside the word design', () => {
    const i = classifyIntent('make me a design');
    expect(i.platform).toBeNull();
    expect(i.formatId).toBeNull();
  });

  it('does not find other short aliases inside longer words', () => {
    expect(classifyIntent('a ready made poster').platform).toBeNull();
    expect(classifyIntent('signage for my shop').platform).toBeNull();
    expect(classifyIntent('a big banner').platform).toBeNull();
  });

  it('still finds them when they are really there', () => {
    expect(classifyIntent('post it on ig').platform).toBe('instagram');
    expect(classifyIntent('an fb cover').platform).toBe('facebook');
  });
});

describe('style and section', () => {
  it('reads the look asked for', () => {
    expect(classifyIntent('something premium').styleTag).toBe('premium');
    expect(classifyIntent('keep it minimal and clean').styleTag).toBe('minimal');
    expect(classifyIntent('a bold loud advert').styleTag).toBe('bold');
  });

  it('reads which part of the catalogue it belongs to', () => {
    expect(classifyIntent('grand opening flyer').use).toBe('event');
    expect(classifyIntent('weekend sale post').use).toBe('marketing');
    expect(classifyIntent('a price list').use).toBe('business');
  });

  it('leaves them null when nothing was said', () => {
    const i = classifyIntent('a flyer');
    expect(i.styleTag).toBeNull();
    expect(i.use).toBeNull();
  });
});

describe('the words the user wants on it', () => {
  /*
   * Quoted text is the one piece of content that must survive untouched. The
   * brief is explicit that invented business facts are forbidden, and a
   * headline the owner typed is a fact.
   */
  it('takes quoted text exactly as written', () => {
    expect(quotedText('a flyer saying "Opening Saturday 9am"')).toBe('Opening Saturday 9am');
    expect(quotedText('post with “Half price all weekend”')).toBe('Half price all weekend');
    expect(classifyIntent('flyer "Grand Opening"').headline).toBe('Grand Opening');
  });

  it('returns nothing when nothing was quoted', () => {
    expect(quotedText('a flyer for my shop')).toBeNull();
    expect(classifyIntent('a flyer for my shop').headline).toBeNull();
  });

  it('asks for the words when none were given', () => {
    expect(classifyIntent('instagram flyer').missing.join(' ')).toMatch(/what should it say/i);
  });

  it('does not ask for what was already supplied', () => {
    const i = classifyIntent('instagram flyer saying "Doors open Friday"');
    expect(i.missing.join(' ')).not.toMatch(/what should it say/i);
    expect(i.missing.join(' ')).not.toMatch(/where will it be used/i);
  });
});

describe('what the product will actually do', () => {
  it('sends a design request to the design engine', () => {
    expect(routeFor(classifyIntent('instagram flyer for my sale')).action).toBe('design');
    expect(routeFor(classifyIntent('launch a campaign for my collection')).action).toBe('design');
  });

  it('asks when it cannot tell', () => {
    const r = routeFor(classifyIntent('hello'));
    expect(r.action).toBe('ask');
    if (r.action === 'ask') expect(r.questions.length).toBeGreaterThan(0);
  });

  /*
   * ── THE HONEST BOUNDARY ──────────────────────────────────────────────
   *
   * No model is connected to this account. A video request must not come
   * back as a "video", and a storyboard must never be presented as a film.
   * The route says what can be done and what cannot.
   */
  it('refuses to pretend it can make a video', () => {
    const r = routeFor(classifyIntent('make me a 20 second promotional video'));
    expect(r.action).toBe('explain');
    if (r.action === 'explain') {
      expect(r.cannotDo).toMatch(/render a finished video/i);
      expect(r.canDo).toMatch(/design the frames/i);
    }
  });

  it('refuses to pretend it can draw a logo', () => {
    const r = routeFor(classifyIntent('design a logo for my company'));
    expect(r.action).toBe('explain');
    if (r.action === 'explain') expect(r.cannotDo).toMatch(/image model/i);
  });

  it('refuses to pretend it can write the copy', () => {
    const r = routeFor(classifyIntent('write captions for my posts'));
    expect(r.action).toBe('explain');
    if (r.action === 'explain') expect(r.cannotDo).toMatch(/language model/i);
  });

  it('always says why it routed where it did', () => {
    for (const ask of ['instagram flyer', 'a video', 'a logo', 'captions', 'hello']) {
      expect(classifyIntent(ask).reason.length, ask).toBeGreaterThan(5);
    }
  });
});

describe('keywords for searching the catalogue', () => {
  it('keeps the words that mean something', () => {
    const k = classifyIntent('create a flyer for my restaurant grand opening').keywords;
    expect(k).toContain('restaurant');
    expect(k).toContain('opening');
  });

  it('drops the words that do not', () => {
    const k = classifyIntent('please create a design for me').keywords;
    for (const noise of ['please', 'create', 'design', 'for', 'me']) {
      expect(k, noise).not.toContain(noise);
    }
  });

  it('does not return an essay', () => {
    expect(classifyIntent('a '.repeat(200) + 'restaurant opening flyer').keywords.length).toBeLessThanOrEqual(8);
  });
});

describe('the sentence also moves the gallery', () => {
  /*
   * The defining connection: the library is not a separate shelf of pretty
   * things beneath a prompt. Asking for a menu leaves the menus on screen,
   * so somebody who would rather browse can carry on from where the sentence
   * got them.
   */
  const where = (text: string) => categoryForIntent(classifyIntent(text));

  it('sends a menu request to menus', () => {
    expect(where('I need a food menu for my restaurant')).toBe('menus');
    expect(where('a price list for my salon')).toBe('menus');
  });

  it('sends stationery and logos to branding', () => {
    expect(where('business cards and letterheads for my company')).toBe('branding');
    expect(where('design a logo for my brand')).toBe('branding');
  });

  it('sends offers to campaigns and posts to social', () => {
    expect(where('a weekend sale poster')).toBe('campaigns');
    expect(where('an instagram carousel about our new arrivals')).toBe('social');
  });

  it('sends documents and tickets to their own shelves', () => {
    expect(where('a company profile cover')).toBe('documents');
    expect(where('tickets for our conference')).toBe('events');
  });

  it('uses the platform when nothing else is said', () => {
    expect(where('something for instagram')).toBe('social');
  });

  /* A guess that narrows the whole library is worse than not narrowing it. */
  it('returns nothing when the words point nowhere', () => {
    expect(where('hello')).toBeNull();
    expect(where('make me something nice')).toBeNull();
  });
});

describe('asking for a specific thing', () => {
  const thing = (t: string) => deliverableForIntent(classifyIntent(t));

  /*
   * A category is not a good enough answer to "I need a business card" — the
   * branding shelf also holds portfolio and report covers, so the request
   * would land beside things that are not cards.
   */
  it('recognises a business card however it is asked for', () => {
    for (const ask of [
      'I need a business card for my company',
      'design a visiting card',
      'complimentary card for my agency',
      'a company card please',
      'contact card with a QR code',
    ]) {
      expect(thing(ask), ask).toBe('business-card');
    }
  });

  it('does not claim every card is a business card', () => {
    expect(thing('a postcard for my shop')).toBeNull();
    expect(thing('a loyalty card for customers')).toBeNull();
  });

  it('returns nothing when no specific thing was named', () => {
    expect(thing('something nice')).toBeNull();
  });
});

describe('the request box speaks needs', () => {
  const pair = (t: string) => {
    const i = classifyIntent(t);
    return [needForIntent(i), deliverableForIntent(i)];
  };

  it.each([
    ['I need a business card', 'stationery', 'business-card'],
    ['visiting card', 'stationery', 'business-card'],
    ['menu for my restaurant', 'menus', 'menu'],
    ['wedding invitation', 'events', 'invitation'],
    ['whatsapp status for new arrivals', 'social', 'story'],
    ['shop sign', 'outdoor', 'shopfront-sign'],
    ['an instagram post', 'social', 'instagram-post'],
    ['a flyer for my restaurant', 'flyers', 'flyer'],
    ['concert poster', 'events', 'event-poster'],
  ])('%s -> %s + %s', (ask, need, item) => {
    expect(pair(ask)).toEqual([need, item]);
  });

  /* The sale wins the need; promotions has no plain "flyer", so its own offer flyer is the item. */
  it('gives a flyer for a sale to promotions, as an offer flyer', () => {
    expect(pair('flyer for my weekend sale')).toEqual(['promotions', 'offer-flyer']);
  });

  it('says nothing for what the library does not make', () => {
    expect(pair('logo animation')).toEqual([null, null]);
    expect(pair('hello')).toEqual([null, null]);
  });

  /*
   * Exact pairs, not "belongs to". Every row is a need and an item that
   * must both be right, so a wrong need with a valid-looking item fails,
   * and so does a null where an answer is owed.
   */
  it.each([
    ['letterhead', 'stationery', 'letterhead'],
    ['weekend sale poster', 'promotions', 'offer-flyer'],
    ['sale instagram post', 'promotions', 'sale-post'],
    ['instagram flyer', 'social', 'instagram-post'],
    ['whatsapp flyer', 'social', 'story'],
    ['price list for my salon', 'menus', 'price-list'],
    ['business card for my restaurant', 'stationery', 'business-card'],
    ['poster for my church event', 'events', 'event-poster'],
    ['a poster for Saturday', 'flyers', 'poster'],
    ['roll up banner', 'outdoor', 'roll-up'],
    ['a banner', 'outdoor', 'banner'],
    ['company profile', 'documents', 'company-profile'],
    ['certificate', 'documents', 'certificate'],
    ['gift voucher', 'promotions', 'gift-voucher'],
    ['youtube thumbnail', 'social', 'youtube-thumbnail'],
    ['reel cover', 'social', 'reels-cover'],
    ['carousel', 'social', 'carousel'],
    ['product label', 'brand', 'product-label'],
    ['tickets for our conference', 'events', 'ticket'],
    ['notice', 'flyers', 'notice'],
    ['a card', 'stationery', 'business-card'],
    ['invitation card', 'events', 'invitation'],
    ['wedding card', 'events', 'invitation'],
    ['wedding IV', 'events', 'invitation'],
    ['wedding', 'events', 'invitation'],
    ['wedding invite for Saturday', 'events', 'invitation'],
  ])('%s -> %s + %s (exact)', (ask, need, item) => {
    expect(pair(ask)).toEqual([need, item]);
    expect(NEEDS.find((n) => n.slug === need)?.deliverables.map((d) => d.slug)).toContain(item);
  });

  /* Cards that are not business cards must not be handed the business-card templates. */
  it.each([
    'birthday card', 'thank you card', 'greeting card', 'ID card', 'bank card', 'loyalty card',
    'a postcard for my shop',
  ])('%s -> nothing', (ask) => {
    expect(pair(ask)).toEqual([null, null]);
  });

  it.each([
    'video for my shop', 'photoshoot for my brand', 'build me a website', 'birthday card',
  ])('%s is off-catalogue', (ask) => {
    expect(pair(ask)).toEqual([null, null]);
  });

  /* A sale or a platform alone still names the need, with no item. */
  it('names the need when no item is named', () => {
    expect(pair('something for instagram')).toEqual(['social', null]);
    expect(pair('big discount this weekend')).toEqual(['promotions', null]);
  });
});
