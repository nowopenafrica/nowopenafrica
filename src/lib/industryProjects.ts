/**
 * What a strong portfolio entry looks like, per industry.
 *
 * ── WHAT THESE ARE, AND WHAT THEY ARE NOT ────────────────────────────────
 *
 * DEMONSTRATIONS. They sit on /platform's industry example pages, which are
 * explicitly "the layout, filled from the shipped module config, named after
 * the INDUSTRY and never after a business". These follow the same rule: no
 * sample names a real business, a real client or a real address, because
 * this product has already served eighteen invented studios with fabricated
 * ratings to the public once.
 *
 * The precedent is `lib/create/sampleCopy.ts`, which gives each of the 66
 * design layouts demonstration copy so a gallery of them does not read as
 * one blue poster twelve times. Same problem here: a portfolio section that
 * shows "Project one / Project two" for forty-two industries teaches nobody
 * what to write.
 *
 * ── WHY ARCHETYPES RATHER THAN 84 HAND-WRITTEN ENTRIES ───────────────────
 *
 * Forty-two industries at two entries each is eighty-four strings, and the
 * failure mode of eighty-four strings written in one sitting is that sixty
 * of them are the same sentence with a different noun — which is precisely
 * the bug sampleCopy.ts was written to fix.
 *
 * So the work is grouped by WHAT THE JOB IS. A builder, a fabricator and a
 * solar installer all deliver a thing that was built, at a scale, over a
 * span of time; the anatomy of a good entry is identical and only the nouns
 * move. Industries whose work has a genuinely different shape get their own.
 *
 * ── WHAT MAKES A PORTFOLIO ENTRY WORTH LOOKING AT ────────────────────────
 *
 * Every sample carries all four, because an entry missing any of them is the
 * reason most portfolios are boring:
 *
 *   1. A SPECIFIC title. "Website" tells you nothing; "Booking site for a
 *      14-room lodge" tells you what you would be buying.
 *   2. SCALE. The number that says how big the job was.
 *   3. WHAT WAS ACTUALLY DONE — the work, not the adjectives.
 *   4. An OUTCOME or a constraint met: a deadline, a budget, a result.
 */

import { INDUSTRIES } from '../data/industrySystems';

export interface SampleProject {
  title: string;
  /** Client and place, described generically. Never a real business. */
  meta: string;
  /** What was done, and what came of it. */
  summary: string;
  tags: string[];
}

/**
 * The shapes of work, and a demonstration pair for each.
 *
 * Written to be read by a business owner thinking "what do I put here?" —
 * so each one is concrete enough to copy the STRUCTURE of, and generic
 * enough that it is plainly not somebody's real job.
 */
const ARCHETYPES: Record<string, SampleProject[]> = {
  built: [
    {
      title: '4-bedroom duplex, foundation to handover',
      meta: 'Private client · Lagos mainland · 2025',
      summary: 'Structure, roofing, plumbing and finishing over nine months. Handed over two weeks before the agreed date.',
      tags: ['residential', 'full build'],
    },
    {
      title: 'Warehouse roof replacement without closing the business',
      meta: 'Logistics company · 2024',
      summary: '1,400m² of sheeting replaced in phased night work, so loading continued through the day.',
      tags: ['commercial', 'phased'],
    },
  ],
  shot: [
    {
      title: 'Wedding, 600 guests, two photographers',
      meta: 'Private client · 2026',
      summary: 'Full day from traditional rites to reception. 180 edited images delivered in five days, plus a same-night preview set for the family.',
      tags: ['wedding', 'same-week delivery'],
    },
    {
      title: 'Product set for a skincare launch — 24 SKUs',
      meta: 'Beauty brand · studio · 2025',
      summary: 'Two shooting days, consistent lighting across the range, cut-outs and lifestyle crops supplied for web and print.',
      tags: ['product', 'e-commerce'],
    },
  ],
  designed: [
    {
      title: 'Brand identity for a 3-site restaurant group',
      meta: 'Hospitality client · 2025',
      summary: 'Logo, colour, type and signage, plus menu and packaging artwork. Delivered as print-ready files and a one-page guide the staff actually use.',
      tags: ['identity', 'print-ready'],
    },
    {
      title: 'Rebrand rolled out across 16 touchpoints',
      meta: 'Retail chain client · 2024',
      summary: 'Shopfront, uniforms, receipts, social templates and vehicle livery, sequenced so no store traded with mixed branding.',
      tags: ['rollout', 'multi-site'],
    },
  ],
  made: [
    {
      title: '12-piece bridal party, fitted in 3 weeks',
      meta: 'Private client · 2026',
      summary: 'Measured, cut and finished to one colour story across twelve different body shapes. Two fittings each, final alterations on site.',
      tags: ['bridal', 'bespoke'],
    },
    {
      title: 'Staff uniforms for a 40-seat restaurant',
      meta: 'Hospitality client · 2025',
      summary: 'Hard-wearing fabric chosen for daily washing, embroidered rather than printed so the logo survives the laundry.',
      tags: ['uniforms', 'durable'],
    },
  ],
  staged: [
    {
      title: 'Conference for 300, single room turnaround',
      meta: 'Corporate client · 2025',
      summary: 'Staging, sound and seating reset from lecture to banquet in forty minutes between sessions.',
      tags: ['corporate', 'turnaround'],
    },
    {
      title: 'Outdoor wedding with a weather contingency that was used',
      meta: 'Private client · 2026',
      summary: 'Marquee, power and lighting for 250 guests. Rain plan triggered at 4pm and the ceremony started on time.',
      tags: ['wedding', 'contingency'],
    },
  ],
  shipped: [
    {
      title: 'Booking site for a 14-room lodge',
      meta: 'Hospitality client · 2025',
      summary: 'Rooms, rates and availability with payment on arrival. Replaced a WhatsApp booking process that was double-booking weekends.',
      tags: ['web', 'booking'],
    },
    {
      title: 'Stock and sales tracking across 3 branches',
      meta: 'Retail client · 2024',
      summary: 'One dashboard across branches, built to work on the phones the staff already had. Stock counts went from weekly to live.',
      tags: ['internal tool', 'multi-branch'],
    },
  ],
  transformed: [
    {
      title: 'Bridal hair and makeup for a party of eight',
      meta: 'Private client · 2026',
      summary: 'On-site from 5am, all eight finished before the 10am ceremony, with touch-up kits left for the day.',
      tags: ['bridal', 'on-site'],
    },
    {
      title: 'Colour correction over 3 appointments',
      meta: 'Private client · 2025',
      summary: 'Box-dye damage lifted over 3 sittings rather than 1, to keep the hair. Before and after shot at each stage.',
      tags: ['colour', 'restoration'],
    },
  ],
  sold: [
    {
      title: '3-bedroom flat let in 11 days',
      meta: 'Landlord · 2026',
      summary: 'Priced against 4 comparable lets, photographed the same week, 12 viewings arranged across 2 blocks.',
      tags: ['letting', 'fast turnaround'],
    },
    {
      title: 'Off-plan units sold ahead of completion',
      meta: 'Developer · 2025',
      summary: 'Launch materials, site visits and staged payment plans. 18 of 24 units committed before handover.',
      tags: ['off-plan', 'new build'],
    },
  ],
  taught: [
    {
      title: 'Twelve-week programme for a cohort of 45',
      meta: 'Corporate client · 2025',
      summary: 'Evening sessions designed around shift work, with assessment at week six so nobody reached the end unprepared.',
      tags: ['cohort', 'workplace'],
    },
    {
      title: 'Certification course taken to a 2nd city',
      meta: 'Open enrolment · 2026',
      summary: 'Same syllabus, local instructors trained first. Pass rates held within 2 points of the original site.',
      tags: ['certification', 'expansion'],
    },
  ],
  advised: [
    {
      title: 'Land title regularised across 6 family plots',
      meta: 'Private client · 2024',
      summary: 'Searches, documentation and a disputed boundary resolved without going to court. Clean title issued in 8 months.',
      tags: ['property', 'resolved'],
    },
    {
      title: 'Company formation and 12 months of compliance',
      meta: 'Start-up client · 2025',
      summary: 'Registration, shareholder agreement and tax set-up, with a calendar of what falls due and when.',
      tags: ['formation', 'compliance'],
    },
  ],
  served: [
    {
      title: 'Community screening day — 400 people seen',
      meta: 'Open to the public · 2025',
      summary: 'Free checks run with a volunteer team, with follow-up appointments booked on the spot for anyone flagged.',
      tags: ['outreach', 'community'],
    },
    {
      title: 'Workplace health programme for 120 staff',
      meta: 'Corporate client · 2026',
      summary: 'On-site clinics over four weeks, arranged around shifts so nobody lost pay to attend.',
      tags: ['workplace', 'programme'],
    },
  ],
  supplied: [
    {
      title: 'Standing weekly order for a 40-cover kitchen',
      meta: 'Restaurant client · 2025',
      summary: 'Fixed delivery window five mornings a week, with substitutions agreed in advance so service was never short.',
      tags: ['wholesale', 'recurring'],
    },
    {
      title: 'Event order delivered to a tight window',
      meta: 'Event client · 2026',
      summary: '600 units produced overnight and delivered before 7am, to a venue with no storage.',
      tags: ['event', 'overnight'],
    },
  ],
};

/**
 * Which shape of work each industry does.
 *
 * Anything unlisted falls back to `built`, which is the most universal
 * anatomy — a job, at a scale, finished by a date.
 */
const INDUSTRY_ARCHETYPE: Record<string, keyof typeof ARCHETYPES> = {
  'real-estate': 'sold',
  'car-dealers': 'sold',
  'car-rentals': 'sold',
  restaurants: 'supplied',
  bakeries: 'supplied',
  'bars-lounges': 'staged',
  'food-vendors': 'supplied',
  hotels: 'staged',
  hospitals: 'served',
  pharmacy: 'served',
  dental: 'served',
  veterinary: 'served',
  'spa-wellness': 'transformed',
  'beauty-salon': 'transformed',
  barbers: 'transformed',
  fashion: 'made',
  tailors: 'made',
  retail: 'supplied',
  'creative-agencies': 'designed',
  designers: 'designed',
  photographers: 'shot',
  videographers: 'shot',
  musicians: 'staged',
  'event-vendors': 'staged',
  'event-entertainment': 'staged',
  transport: 'supplied',
  courier: 'supplied',
  'travel-agencies': 'staged',
  schools: 'taught',
  training: 'taught',
  lawyers: 'advised',
  finance: 'advised',
  government: 'advised',
  construction: 'built',
  agriculture: 'supplied',
  manufacturing: 'built',
  fitness: 'taught',
  'service-providers': 'built',
  'home-services': 'built',
  repairs: 'built',
  'software-it': 'shipped',
  'religious-organizations': 'served',
};

/**
 * Demonstration portfolio entries for an industry.
 *
 * Always returns at least two: a section showing one entry demonstrates a
 * card, not a portfolio, and the thing being taught here is what a *set* of
 * entries looks like.
 */
export function sampleProjectsFor(slug: string): SampleProject[] {
  const archetype = INDUSTRY_ARCHETYPE[slug] ?? 'built';
  return ARCHETYPES[archetype];
}

/** Every industry on /platform, for the test that none is left without one. */
export const INDUSTRY_SLUGS: string[] = INDUSTRIES.map((i) => i.slug);

export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);
