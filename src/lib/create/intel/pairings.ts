// Type pairings the library may use.
//
// Every face here is one we self-host with a recorded licence (typefaces.ts).
// TYPE_PAIRINGS stays as it is, because eleven styles depend on it; the extra
// pairings below exist so a movement is not forced into a voice that is not
// its own.
//
// FACE_GAPS is the honest list of what eleven faces cannot say. Nothing in it
// is installed. Each needs the founder's approval, an OFL licence check and
// Latin Extended coverage (the C3 glyph check) before it can be used.

import { TYPE_PAIRINGS, type TypePairing } from '../../design/typefaces';

export const INTEL_PAIRINGS: TypePairing[] = [
  { key: 'swiss', label: 'Swiss', display: 'grotesk', text: 'humanist', accent: 'mono',
    suits: 'Grid-led, objective work: programmes, institutions, technology.' },
  { key: 'couture', label: 'Couture', display: 'serif', text: 'humanist', accent: 'humanist',
    suits: 'High-contrast serif over a quiet sans: fashion, fragrance, property.' },
  { key: 'gallery', label: 'Gallery', display: 'editorial', text: 'humanist', accent: 'humanist',
    suits: 'Reading-first pages: culture, hospitality, long menus.' },
  { key: 'poster', label: 'Poster', display: 'condensed', text: 'sans', accent: 'condensed',
    suits: 'Tall condensed capitals for dates, line-ups and street posters.' },
  { key: 'craft', label: 'Craft', display: 'soft', text: 'humanist', accent: 'script',
    suits: 'Made-by-hand businesses: bakeries, makers, family trades. Script for one word only.' },
  { key: 'ledger', label: 'Ledger', display: 'sans', text: 'humanist', accent: 'mono',
    suits: 'Facts and figures: price lists, schedules, reports.' },
  /* Added 2026-11-16 with the four faces that closed most of FACE_GAPS. */
  { key: 'bauhaus', label: 'Bauhaus', display: 'geometric', text: 'sans', accent: 'mono',
    suits: 'Constructed, circle-built headlines: schools, studios, playful geometry.' },
  { key: 'deco', label: 'Deco', display: 'geometric', text: 'humanist', accent: 'humanist',
    suits: 'Tall tracked capitals for hotels, bars, galas and invitations.' },
  { key: 'vogue', label: 'Vogue', display: 'didone', text: 'humanist', accent: 'humanist',
    suits: 'Hairline-contrast headlines set large: fashion, fragrance, portraits.' },
  { key: 'workshop', label: 'Workshop', display: 'slab', text: 'humanist', accent: 'mono',
    suits: 'Slab headlines with weight: trades, rallies, labels, raw posters.' },
  { key: 'heirloom', label: 'Heirloom', display: 'oldstyle', text: 'humanist', accent: 'script',
    suits: 'Old-style serif for provenance: makers, tailoring, bridal, institutions.' },
];

export const ALL_PAIRINGS: TypePairing[] = [...TYPE_PAIRINGS, ...INTEL_PAIRINGS];

export const intelPairingOf = (key: string): TypePairing | null =>
  ALL_PAIRINGS.find((p) => p.key === key) ?? null;

export interface FaceGap {
  /** The voice we cannot produce today. */
  voice: string;
  /** Movements that are weaker without it. */
  movements: string[];
  /** A candidate with an open licence. A suggestion to check, not a decision. */
  candidate: string;
  licence: string;
  status: 'proposed';
  /** What was found when the candidate was checked. */
  finding: string;
}

/*
 * Checked 2026-11-16. Four of the six original gaps are closed (Jost, Bodoni
 * Moda, Zilla Slab, Cormorant Garamond; see typefaces.ts). These two remain.
 */
export const FACE_GAPS: FaceGap[] = [
  { voice: 'Neutral neo-grotesque for text and display', movements: ['swiss-international', 'corporate-precision', 'information-design'],
    candidate: 'Inter', licence: 'SIL OFL 1.1 (verified in the upstream OFL.txt)', status: 'proposed',
    finding: 'One weight is 42.8 KB and would fit the 600 KB font budget with under 5 KB to spare. It was held back because it draws the Hausa letters no shipped face has: a test requires that gap list to shrink when a covering face arrives, which means making Inter the glyph fallback in place of Source Sans 3. That is its own piece of work, and it would close the Hausa gap.' },
  { voice: 'Wide, extended display sans', movements: ['retro-futurism', 'gradient-futurism', 'cgi-3d'],
    candidate: 'Unbounded', licence: 'SIL OFL 1.1 (verified in the upstream OFL.txt)', status: 'proposed',
    finding: 'One weight is 63.4 KB, more than the 47 KB left in the 600 KB font budget.' },
];
