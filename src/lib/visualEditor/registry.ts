import { LINK_TARGETS } from './routes';
import type { SlotDef } from './types';

/**
 * The allowlist.
 *
 * Declaring a slot here — and wrapping the copy in `<Editable>` — is the ONLY
 * way to make anything on the platform editable. Nothing is editable by
 * default, so the list of things that must stay system-controlled (verification,
 * Open Now, prices, trust claims, JSON-LD, canonical URLs, customer data) is
 * protected by absence rather than by a rule that has to be remembered when the
 * next component is written.
 *
 * Adoption is per page and incremental. A page with no slots renders exactly as
 * it always has.
 *
 * What is adopted here is the marketing copy — the words someone who works for
 * NowOpen Africa might need to change. Live data (counts, prices, plan
 * features, booking/verification flags), system surfaces (auth, admin, profile,
 * checkout) and anything a trust claim sits on are deliberately not declared,
 * so they are unreachable by the editor rather than merely discouraged.
 */

const H1_SIZES = {
  sm: 'text-2xl md:text-4xl',
  md: 'text-3xl md:text-5xl',
  lg: 'text-4xl md:text-6xl',
} as const;

const LEAD_SIZES = {
  sm: 'text-sm md:text-base',
  md: 'text-base md:text-lg',
  lg: 'text-lg md:text-xl',
} as const;

const H2_SIZES = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-3xl',
} as const;

/** About — the first page adopted. Static, no live data, no JSON-LD. */
const ABOUT: SlotDef[] = [
  {
    id: 'about.hero.title', page: 'about', label: 'Hero headline',
    kind: 'text', maxLength: 90, alignable: true, sizes: H1_SIZES,
    note: 'The first line of the page. Keep it a claim about what NowOpen is.',
  },
  {
    id: 'about.hero.lead', page: 'about', label: 'Hero paragraph',
    kind: 'text', maxLength: 260, alignable: true, sizes: LEAD_SIZES,
  },
  {
    id: 'about.why.heading', page: 'about', label: '"Why we exist" heading',
    kind: 'text', maxLength: 60, sizes: H2_SIZES,
  },
  {
    id: 'about.why.body', page: 'about', label: '"Why we exist" paragraph',
    kind: 'text', maxLength: 700,
    note: 'Do not state numbers of businesses or customers here — those are live figures elsewhere.',
  },
  {
    id: 'about.pillars.heading', page: 'about', label: '"What we do" heading',
    kind: 'text', maxLength: 60, sizes: H2_SIZES,
  },
  // The four pillar cards. The icon is deliberately not editable — it is chosen
  // from a fixed set in the component, and a free icon field is a free way to
  // put a shield next to something that has not been verified.
  ...(['discover', 'advertise', 'create', 'trust'] as const).flatMap((k): SlotDef[] => [
    {
      id: `about.pillar.${k}.title`, page: 'about', label: `Pillar ${k} — title`,
      kind: 'text', maxLength: 24,
    },
    {
      id: `about.pillar.${k}.body`, page: 'about', label: `Pillar ${k} — text`,
      kind: 'text', maxLength: 200,
    },
  ]),
  {
    id: 'about.built.heading', page: 'about', label: '"Built in Africa" heading',
    kind: 'text', maxLength: 60,
  },
  {
    id: 'about.built.body', page: 'about', label: '"Built in Africa" paragraph',
    kind: 'text', maxLength: 700,
  },
  {
    id: 'about.cta.primary', page: 'about', label: 'Primary button',
    kind: 'link', maxLength: 32,
  },
  {
    id: 'about.cta.secondary', page: 'about', label: 'Second button',
    kind: 'link', maxLength: 32, hideable: true,
  },
  {
    id: 'about.cta.tertiary', page: 'about', label: 'Third button',
    kind: 'link', maxLength: 32, hideable: true,
  },
  {
    id: 'about.seo.title', page: 'about', label: 'Search-result title',
    kind: 'text', maxLength: 70,
    note: 'Shown in Google results and the browser tab. Canonical URL and indexing are not editable.',
  },
  {
    id: 'about.seo.description', page: 'about', label: 'Search-result description',
    kind: 'text', maxLength: 160,
  },
];

/** Home — the marketplace landing page. Live data (counts, listings) stays coded. */
const HOME: SlotDef[] = [
  { id: 'home.seo.title', page: 'home', label: 'Search-result title', kind: 'text', maxLength: 70,
    note: 'Shown in Google results and the browser tab. Canonical URL and indexing are not editable.' },
  { id: 'home.seo.description', page: 'home', label: 'Search-result description', kind: 'text', maxLength: 160 },
  { id: 'home.hero.badge', page: 'home', label: 'Hero badge', kind: 'text', maxLength: 40 },
  { id: 'home.hero.heading', page: 'home', label: 'Hero headline', kind: 'text', maxLength: 60, alignable: true },
  { id: 'home.hero.heading.accent', page: 'home', label: 'Hero accent line', kind: 'text', maxLength: 40, alignable: true },
  { id: 'home.hero.lead', page: 'home', label: 'Hero paragraph', kind: 'text', maxLength: 200, alignable: true },
  { id: 'home.hero.cta.primary', page: 'home', label: 'Hero primary button', kind: 'link', maxLength: 24, hideable: true },
  { id: 'home.hero.cta.secondary', page: 'home', label: 'Hero second button', kind: 'link', maxLength: 24, hideable: true },
  { id: 'home.directory.badge', page: 'home', label: 'Directory badge', kind: 'text', maxLength: 40 },
  { id: 'home.directory.heading', page: 'home', label: 'Directory heading', kind: 'text', maxLength: 60 },
  { id: 'home.directory.body', page: 'home', label: 'Directory paragraph', kind: 'text', maxLength: 240 },
  { id: 'home.directory.cta.primary', page: 'home', label: 'Directory primary button', kind: 'link', maxLength: 24, hideable: true },
  { id: 'home.directory.cta.secondary', page: 'home', label: 'Directory second button', kind: 'link', maxLength: 24, hideable: true },
  { id: 'home.features.heading', page: 'home', label: 'Features heading', kind: 'text', maxLength: 60 },
  { id: 'home.features.sub', page: 'home', label: 'Features subheading', kind: 'text', maxLength: 160, alignable: true },
  ...(['claimed', 'booking', 'targeted', 'tracking'] as const).flatMap((k): SlotDef[] => [
    { id: `home.feature.${k}.title`, page: 'home', label: `Feature ${k} — title`, kind: 'text', maxLength: 40 },
    { id: `home.feature.${k}.body`, page: 'home', label: `Feature ${k} — text`, kind: 'text', maxLength: 200 },
  ]),
  { id: 'home.cta.heading', page: 'home', label: 'Bottom CTA heading', kind: 'text', maxLength: 60, alignable: true },
  { id: 'home.cta.body', page: 'home', label: 'Bottom CTA paragraph', kind: 'text', maxLength: 240, alignable: true },
  { id: 'home.cta.primary', page: 'home', label: 'Bottom CTA primary button', kind: 'link', maxLength: 24 },
  { id: 'home.cta.secondary', page: 'home', label: 'Bottom CTA second button', kind: 'link', maxLength: 24 },
  { id: 'home.brands.label', page: 'home', label: 'Brands row label', kind: 'text', maxLength: 100, alignable: true },
];

/** Contact — the pitch copy. The channels themselves (email/phone/location) are facts, not copy. */
const CONTACT: SlotDef[] = [
  { id: 'contact.seo.title', page: 'contact', label: 'Search-result title', kind: 'text', maxLength: 70 },
  { id: 'contact.seo.description', page: 'contact', label: 'Search-result description', kind: 'text', maxLength: 160 },
  { id: 'contact.hero.title', page: 'contact', label: 'Page heading', kind: 'text', maxLength: 60, alignable: true },
  { id: 'contact.hero.lead', page: 'contact', label: 'Intro paragraph', kind: 'text', maxLength: 200, alignable: true },
];

/** Pricing — the offer wording, never the numbers. Prices, plan features, fees and rates stay coded. */
const PRICING: SlotDef[] = [
  { id: 'pricing.seo.title', page: 'pricing', label: 'Search-result title', kind: 'text', maxLength: 70 },
  { id: 'pricing.seo.description', page: 'pricing', label: 'Search-result description', kind: 'text', maxLength: 160 },
  { id: 'pricing.hero.pill', page: 'pricing', label: 'Hero badge', kind: 'text', maxLength: 60 },
  { id: 'pricing.hero.title', page: 'pricing', label: 'Page heading', kind: 'text', maxLength: 60, alignable: true },
  { id: 'pricing.hero.sub', page: 'pricing', label: 'Hero paragraph', kind: 'text', maxLength: 240, alignable: true },
  { id: 'pricing.plans.heading', page: 'pricing', label: 'Business plans heading', kind: 'text', maxLength: 60, alignable: true },
  { id: 'pricing.plans.sub', page: 'pricing', label: 'Business plans subheading', kind: 'text', maxLength: 160, alignable: true },
  { id: 'pricing.marketplace.heading', page: 'pricing', label: 'Marketplace section heading', kind: 'text', maxLength: 60, alignable: true },
  ...(['placements', 'creative', 'bookings'] as const).flatMap((k): SlotDef[] => [
    { id: `pricing.marketplace.${k}.title`, page: 'pricing', label: `Marketplace ${k} — title`, kind: 'text', maxLength: 40 },
    { id: `pricing.marketplace.${k}.body`, page: 'pricing', label: `Marketplace ${k} — text`, kind: 'text', maxLength: 200 },
  ]),
  { id: 'pricing.cta.heading', page: 'pricing', label: 'Bottom CTA heading', kind: 'text', maxLength: 60, alignable: true },
  { id: 'pricing.cta.body', page: 'pricing', label: 'Bottom CTA paragraph', kind: 'text', maxLength: 240, alignable: true },
  { id: 'pricing.cta.primary', page: 'pricing', label: 'Bottom CTA button', kind: 'link', maxLength: 24 },
];

/** Founder — the personal editorial copy. The name, role, bio facts and timeline stay coded. */
const FOUNDER: SlotDef[] = [
  { id: 'founder.seo.title', page: 'founder', label: 'Search-result title', kind: 'text', maxLength: 70 },
  { id: 'founder.seo.description', page: 'founder', label: 'Search-result description', kind: 'text', maxLength: 160 },
  { id: 'founder.hero.intro', page: 'founder', label: 'Hero paragraph', kind: 'text', maxLength: 240, alignable: true },
  // The story's second and fourth paragraphs carry emphasised spans inside them,
  // so they cannot be wrapped without losing the emphasis — only the plain ones
  // are adopted.
  { id: 'founder.story.p1', page: 'founder', label: 'Story — first paragraph', kind: 'text', maxLength: 400 },
  { id: 'founder.story.p3', page: 'founder', label: 'Story — third paragraph', kind: 'text', maxLength: 400 },
  { id: 'founder.quote', page: 'founder', label: 'Pull quote', kind: 'text', maxLength: 200 },
  ...(['design', 'technology', 'africa', 'entrepreneurship', 'leadership', 'innovation', 'community'] as const).flatMap((k): SlotDef[] => [
    { id: `founder.philosophy.${k}.title`, page: 'founder', label: `Philosophy ${k} — title`, kind: 'text', maxLength: 40 },
    { id: `founder.philosophy.${k}.body`, page: 'founder', label: `Philosophy ${k} — text`, kind: 'text', maxLength: 300 },
  ]),
  { id: 'founder.press.body', page: 'founder', label: 'Press-intro paragraph', kind: 'text', maxLength: 300 },
  { id: 'founder.connect.heading', page: 'founder', label: 'Connect heading', kind: 'text', maxLength: 60, alignable: true },
  { id: 'founder.connect.body', page: 'founder', label: 'Connect paragraph', kind: 'text', maxLength: 240, alignable: true },
];

/** NowOpen OS — the story of how the company runs. Ledger table names stay coded. */
const OS: SlotDef[] = [
  { id: 'os.seo.title', page: 'os', label: 'Search-result title', kind: 'text', maxLength: 70 },
  { id: 'os.seo.description', page: 'os', label: 'Search-result description', kind: 'text', maxLength: 160 },
  { id: 'os.hero.pill', page: 'os', label: 'Hero badge', kind: 'text', maxLength: 40 },
  { id: 'os.hero.title', page: 'os', label: 'Page heading', kind: 'text', maxLength: 60, alignable: true },
  { id: 'os.hero.lead', page: 'os', label: 'Hero paragraph', kind: 'text', maxLength: 240, alignable: true },
  { id: 'os.hero.cta.founder', page: 'os', label: 'Hero founder button', kind: 'link', maxLength: 24, hideable: true },
  { id: 'os.ledgers.eyebrow', page: 'os', label: 'Ledgers eyebrow', kind: 'text', maxLength: 40 },
  { id: 'os.ledgers.heading', page: 'os', label: 'Ledgers heading', kind: 'text', maxLength: 60 },
  { id: 'os.ledgers.body', page: 'os', label: 'Ledgers paragraph', kind: 'text', maxLength: 240 },
  ...(['workforce', 'work', 'approvals', 'knowledge', 'launches', 'partners', 'press', 'campaigns'] as const).flatMap((k): SlotDef[] => [
    { id: `os.ledger.${k}.name`, page: 'os', label: `Ledger ${k} — name`, kind: 'text', maxLength: 30 },
    { id: `os.ledger.${k}.blurb`, page: 'os', label: `Ledger ${k} — text`, kind: 'text', maxLength: 220 },
  ]),
  { id: 'os.principles.heading', page: 'os', label: 'Principles heading', kind: 'text', maxLength: 60 },
  ...(['source', 'admins', 'record'] as const).flatMap((k): SlotDef[] => [
    { id: `os.principle.${k}.title`, page: 'os', label: `Principle ${k} — title`, kind: 'text', maxLength: 40 },
    { id: `os.principle.${k}.body`, page: 'os', label: `Principle ${k} — text`, kind: 'text', maxLength: 300 },
  ]),
];

/** Platform — the industry-OS pitch. Industry/module names and feature lists stay coded. */
const PLATFORM: SlotDef[] = [
  { id: 'platform.seo.title', page: 'platform', label: 'Search-result title', kind: 'text', maxLength: 70 },
  { id: 'platform.seo.description', page: 'platform', label: 'Search-result description', kind: 'text', maxLength: 160 },
  { id: 'platform.hero.pill', page: 'platform', label: 'Hero badge', kind: 'text', maxLength: 40 },
  { id: 'platform.hero.title', page: 'platform', label: 'Page heading', kind: 'text', maxLength: 60, alignable: true },
  { id: 'platform.hero.sub', page: 'platform', label: 'Hero paragraph', kind: 'text', maxLength: 240, alignable: true },
  { id: 'platform.cta.heading', page: 'platform', label: 'Bottom CTA heading', kind: 'text', maxLength: 60, alignable: true },
  { id: 'platform.cta.body', page: 'platform', label: 'Bottom CTA paragraph', kind: 'text', maxLength: 240, alignable: true },
  { id: 'platform.cta.link', page: 'platform', label: 'Bottom CTA button', kind: 'link', maxLength: 24 },
];

/** Waitlist — the joining pitch. Form behaviours and options stay coded. */
const WAITLIST: SlotDef[] = [
  { id: 'waitlist.seo.title', page: 'waitlist', label: 'Search-result title', kind: 'text', maxLength: 70 },
  { id: 'waitlist.seo.description', page: 'waitlist', label: 'Search-result description', kind: 'text', maxLength: 160 },
  { id: 'waitlist.hero.pill', page: 'waitlist', label: 'Hero badge', kind: 'text', maxLength: 60 },
  { id: 'waitlist.hero.title', page: 'waitlist', label: 'Page heading', kind: 'text', maxLength: 60, alignable: true },
  { id: 'waitlist.hero.lead', page: 'waitlist', label: 'Hero paragraph', kind: 'text', maxLength: 200, alignable: true },
  { id: 'waitlist.hero.note', page: 'waitlist', label: 'Line under the pitch', kind: 'text', maxLength: 160, alignable: true },
  ...(['pricing', 'badge', 'early'] as const).flatMap((k): SlotDef[] => [
    { id: `waitlist.perk.${k}.title`, page: 'waitlist', label: `Perk ${k} — title`, kind: 'text', maxLength: 40 },
    { id: `waitlist.perk.${k}.text`, page: 'waitlist', label: `Perk ${k} — text`, kind: 'text', maxLength: 160 },
  ]),
  { id: 'waitlist.form.title', page: 'waitlist', label: 'Form card heading', kind: 'text', maxLength: 60, alignable: true },
  { id: 'waitlist.form.sub', page: 'waitlist', label: 'Form card subheading', kind: 'text', maxLength: 80, alignable: true },
  { id: 'waitlist.steps.heading', page: 'waitlist', label: 'How-it-works heading', kind: 'text', maxLength: 60, alignable: true },
  ...(['1', '2', '3'] as const).flatMap((k): SlotDef[] => [
    { id: `waitlist.step.${k}.title`, page: 'waitlist', label: `Step ${k} — title`, kind: 'text', maxLength: 40 },
    { id: `waitlist.step.${k}.text`, page: 'waitlist', label: `Step ${k} — text`, kind: 'text', maxLength: 200 },
  ]),
];

/** Digital Forms — the onboarding landing copy. Nothing on the form itself is editable. */
const DIGITAL_FORMS: SlotDef[] = [
  { id: 'digital-forms.seo.title', page: 'digital-forms', label: 'Search-result title', kind: 'text', maxLength: 70 },
  { id: 'digital-forms.seo.description', page: 'digital-forms', label: 'Search-result description', kind: 'text', maxLength: 160 },
  { id: 'digital-forms.hero.title', page: 'digital-forms', label: 'Page heading', kind: 'text', maxLength: 60 },
  { id: 'digital-forms.hero.lead', page: 'digital-forms', label: 'Intro paragraph', kind: 'text', maxLength: 240 },
];

export const SLOTS: SlotDef[] = [
  ...ABOUT, ...HOME, ...CONTACT, ...PRICING, ...FOUNDER, ...OS, ...PLATFORM, ...WAITLIST, ...DIGITAL_FORMS,
];

/** Pages that have been adopted, in the order the editor should list them. */
export const EDITABLE_PAGES: Array<{ page: string; label: string; path: string }> = [
  { page: 'about', label: 'About', path: '/about' },
  { page: 'home', label: 'Home', path: '/' },
  { page: 'contact', label: 'Contact', path: '/contact' },
  { page: 'digital-forms', label: 'Digital Forms', path: '/digital-forms' },
  { page: 'founder', label: 'Founder', path: '/founder' },
  { page: 'os', label: 'NowOpen OS', path: '/os' },
  { page: 'platform', label: 'Platform', path: '/platform' },
  { page: 'pricing', label: 'Pricing', path: '/pricing' },
  { page: 'waitlist', label: 'Waitlist', path: '/waitlist' },
];

const BY_ID = new Map(SLOTS.map((s) => [s.id, s]));

export function slotById(id: string): SlotDef | undefined {
  return BY_ID.get(id);
}

export function slotsForPage(page: string): SlotDef[] {
  return SLOTS.filter((s) => s.page === page);
}

export { LINK_TARGETS };
