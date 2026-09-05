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

export const SLOTS: SlotDef[] = [...ABOUT];

/** Pages that have been adopted, in the order the editor should list them. */
export const EDITABLE_PAGES: Array<{ page: string; label: string; path: string }> = [
  { page: 'about', label: 'About', path: '/about' },
];

const BY_ID = new Map(SLOTS.map((s) => [s.id, s]));

export function slotById(id: string): SlotDef | undefined {
  return BY_ID.get(id);
}

export function slotsForPage(page: string): SlotDef[] {
  return SLOTS.filter((s) => s.page === page);
}

export { LINK_TARGETS };
