// The five benchmark briefs (spec §7), with the copy used to render them.
//
// TEST FIXTURES, NOT PRODUCT CONTENT. Nothing here is shown to a customer.
//
// - The requests are the founder's five briefs, word for word.
// - No business is invented: the brand is the label "Your brand" and facts are
//   labels ("Your launch date"), as founder decision D1 (2026-11-09) requires.
// - The headlines and supporting lines were written by hand for this
//   benchmark, one voice per concept, standing in for what the copy model
//   (decision D2) will propose. They make no claim about any real product.
// - `photos` name files in the licensed pilot set (Pexels, evidence on file in
//   nowopen-creative-intel-assets). They are stock stand-ins, never presented
//   as the customer's own. A brief with no relevant licensed photograph has
//   none, and its concepts are type-led.

import type { ConceptCopy } from './archetypes';

export interface BenchmarkBrief {
  key: string;
  request: string;
  copy: Partial<ConceptCopy>[];
  /** File names under pilot-assets/files, one per concept; undefined for a type-led concept. */
  photos: (string | undefined)[];
}

export const BENCHMARK: BenchmarkBrief[] = [
  {
    key: 'b1', request: 'Launch poster for a luxury Nigerian skincare brand',
    copy: [
      { eyebrow: 'The first collection', headline: 'Skin, kept simple.', support: 'A new Nigerian skincare house. The essentials, and nothing your skin does not need.', cta: 'Your launch date', details: ['Your product names', 'Your stockists', 'Your launch date'] },
      { eyebrow: 'New Nigerian skincare', headline: 'Good skin takes its time.', support: 'Slow-made skincare, arriving this season. Meet the first collection.', cta: 'Your stockists', details: ['Your product names', 'Your stockists', 'Your launch date'] },
      { eyebrow: 'Launching soon', headline: 'Glow is a birthright.', support: 'New Nigerian skincare, made for every shade of us.', cta: 'Your launch date', details: ['Your product names', 'Your stockists', 'Your launch date'] },
    ],
    photos: ['pexels-28635266.jpeg', 'pexels-16152597.jpeg', undefined],
  },
  {
    key: 'b2', request: 'Billboard for high-end Lagos real estate',
    copy: [
      { eyebrow: 'Lagos', headline: 'Above Lagos. Apart from it.', support: 'Private residences. Viewing by appointment.', cta: 'Your website', details: ['Your location', 'Price on request'] },
      { eyebrow: 'Now selling', headline: 'Lagos has a new address.', support: 'Residences for people who have arrived.', cta: 'Your website', details: ['Your location', 'Price on request'] },
      { eyebrow: 'Private residences', headline: 'Where the city exhales.', support: 'Space, light and quiet, in the middle of Lagos.', cta: 'Your website', details: ['Your location', 'Price on request'] },
    ],
    photos: [undefined, undefined, undefined],
  },
  {
    key: 'b3', request: 'Brand identity for a premium African fashion label',
    copy: [
      { brand: 'Your label', eyebrow: 'Collection one', headline: 'Cut slow. Worn long.', support: 'Clothes made in small runs, to be kept.', cta: 'Your stockists' },
      { brand: 'Your label', eyebrow: 'The new season', headline: 'Made to be noticed twice.', support: 'Tailoring with a memory of where it comes from.', cta: 'View the collection' },
      { brand: 'Your label', eyebrow: 'Atelier', headline: 'Cloth with a memory.', support: 'A fashion house rooted in the continent, cut for anywhere.', cta: 'Your website' },
    ],
    photos: ['pexels-18789516.jpeg', 'pexels-28959523.jpeg', 'pexels-33968170.jpeg'],
  },
  {
    key: 'b4', request: 'Social posts for an international tech conference',
    copy: [
      { eyebrow: 'Your conference · Your dates', headline: 'The people building what comes next.', support: 'Founders, engineers and investors in one room.', cta: 'Register', details: ['Dates: Your dates', 'City: Your city', 'Venue: Your venue', 'Tickets: Your website'] },
      { eyebrow: 'Your conference', headline: 'Tomorrow has a guest list.', support: 'Talks, demos and the people you came to meet.', cta: 'Get your pass', details: ['Dates: Your dates', 'City: Your city', 'Venue: Your venue', 'Tickets: Your website'] },
      { eyebrow: 'Registration open', headline: 'One room. Everyone building.', support: 'An international gathering for people who ship.', cta: 'Register now', details: ['Dates: Your dates', 'City: Your city', 'Venue: Your venue', 'Tickets: Your website'] },
    ],
    photos: [undefined, undefined, undefined],
  },
  {
    key: 'b5', request: 'Instagram post for a contemporary restaurant opening',
    copy: [
      { eyebrow: 'Opening soon', headline: 'Pull up a chair.', support: 'A new kitchen opens its doors. Come hungry.', cta: 'Book a table', details: ['Your opening date', 'Your address', 'Your booking line'] },
      { eyebrow: 'A new restaurant', headline: 'The table is set.', support: 'Doors open soon. Be among the first to sit down.', cta: 'Reserve', details: ['Your opening date', 'Your address', 'Your booking line'] },
      { eyebrow: 'Now taking bookings', headline: 'First service.', support: 'A new kitchen, a short menu, and a room built for long dinners.', cta: 'Book a table', details: ['Opening: Your opening date', 'Where: Your address', 'Book: Your booking line'] },
    ],
    photos: ['pexels-38127716.jpeg', undefined, 'pexels-17952748.jpeg'],
  },
];
