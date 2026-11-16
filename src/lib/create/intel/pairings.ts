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
  /* Added 2026-11-16 with the second batch of faces. Each names the job it is for; typeUse.ts holds the rules. */
  { key: 'system', label: 'System', display: 'neutral', text: 'neutral', accent: 'technical',
    suits: 'One neutral family in two weights with a mono for figures: notices, schedules, technology, institutions.' },
  { key: 'broadcast', label: 'Broadcast', display: 'impact', text: 'neutral', accent: 'narrow',
    suits: 'A heavy condensed headline over plain text: sales, sport, rallies and anything read from across a street.' },
  { key: 'atelier', label: 'Atelier', display: 'elegant', text: 'reading', accent: 'neutral',
    suits: 'A light display serif over a text serif: beauty, fashion, hospitality and quiet luxury.' },
  { key: 'monument', label: 'Monument', display: 'classical', text: 'reading', accent: 'neutral',
    suits: 'Inscriptional capitals for a name or title: law, ceremony, heritage, hotels. Short lines only.' },
  { key: 'neighbourhood', label: 'Neighbourhood', display: 'friendly', text: 'friendly', accent: 'neutral',
    suits: 'One round, familiar family: local shops, schools, clinics and community notices.' },
  { key: 'signal', label: 'Signal', display: 'wide', text: 'neutral', accent: 'technical',
    suits: 'A wide display face for a few words, with mono labels: launches, music, technology, retro-future.' },
  { key: 'masthead', label: 'Masthead', display: 'fatface', text: 'reading', accent: 'narrow',
    suits: 'A very heavy serif headline like a magazine cover: food, fashion, culture.' },
  { key: 'works', label: 'Works', display: 'industrial', text: 'neutral', accent: 'technical',
    suits: 'Tall industrial capitals and large numbers: logistics, trades, fitness, sport.' },
  { key: 'studio', label: 'Studio', display: 'expressive', text: 'neutral', accent: 'technical',
    suits: 'A grotesque with visible character: studios, culture and brands that should not look like software.' },
  { key: 'artline', label: 'Artline', display: 'artistic', text: 'neutral', accent: 'neutral',
    suits: 'An unusual wide sans for short lines: galleries, festivals, fashion.' },
  { key: 'playroom', label: 'Playroom', display: 'rounded', text: 'friendly', accent: 'neutral',
    suits: 'Rounded and kind: children, food, care, parties.' },
  { key: 'city', label: 'City', display: 'urban', text: 'neutral', accent: 'narrow',
    suits: 'A confident wide sans: property, retail, fitness and events.' },
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
 * Checked 2026-11-16. All six original gaps are closed: Jost, Bodoni Moda,
 * Zilla Slab and Cormorant Garamond in the first batch; Inter (`neutral`) and
 * Unbounded (`wide`) in the second, once the weight budget was changed to hold
 * only the faces a page loads eagerly and Noto Sans became the glyph fallback.
 * The list stays so the next missing voice has somewhere to be recorded.
 */
export const FACE_GAPS: FaceGap[] = [];
