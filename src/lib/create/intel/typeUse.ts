// What each typeface is for, and what each kind of piece asks of its type.
//
// A library of thirty faces is thirty ways to get it wrong. A hairline serif
// at six points on a business card, a script in capitals, a wide display face
// asked to carry a twelve-word headline: each is a face used outside the job
// it was drawn for. This file writes the jobs down, and the concept engine
// reads it (compose/concepts.ts picks a pairing with it, compose/typeChecks.ts
// checks the result), so the knowledge is applied and not only documented.
//
// SOURCES. These are principles, never copied designs (Ruling AJ). They are
// the working rules of type practice, checked on 2026-11-16 against what
// current identity and web work is doing: Behance's most-appreciated brand
// identity projects that week were tagged "variable grotesque type", "bold
// light grotesk", "sans serif typeface" and "black white contrast"; the
// Awwwards typography collection filters by grotesques, condensed display
// faces, editorial serifs and monospace; and the 2026 type forecasts agree on
// editorial serifs returning, monospace moving into branding, and restraint
// (two families at most). Pinterest was read on 2026-11-17, signed in as the
// founder: its brand boards name a heading face, a sub-heading face and a body
// face, which is the rule added last below.
// The full list is in docs/creative-intelligence/typography.md.

import type { TypefaceKey } from '../../design/typefaces';

/** How small a face may be set and still do its job. */
export type Smallest =
  /** Six-point labels and small print. Sturdy, open, even in colour. */
  | 'small'
  /** Running text, from about eight points. Too fine or too tight for labels. */
  | 'text'
  /** Headlines only. Set under about eighteen points it breaks up or closes in. */
  | 'display';

export interface FaceUse {
  smallest: Smallest;
  /** 'only': the face has no lower case, or is drawn to be set in capitals. 'never': capitals in it are unreadable (scripts). */
  capitals: 'either' | 'only' | 'never';
  /** Reads comfortably over several lines. */
  paragraphs: boolean;
  /** Holds up at speed from a road: heavy enough, open enough, no hairlines. */
  distance: boolean;
  /** The most words it should be asked to carry as a headline. Absent means no particular limit. */
  maxWords?: number;
  /** Good for figures in columns: prices, times, quantities. */
  figures: boolean;
}

const job = (smallest: Smallest, capitals: FaceUse['capitals'], paragraphs: boolean, distance: boolean, figures: boolean, maxWords?: number): FaceUse =>
  ({ smallest, capitals, paragraphs, distance, figures, ...(maxWords && { maxWords }) });

export const FACE_USE: Record<TypefaceKey, FaceUse> = {
  /* The first fifteen. */
  sans: job('small', 'either', true, true, true),
  serif: job('display', 'either', false, false, false),
  mono: job('small', 'either', false, false, true),
  condensed: job('display', 'only', false, true, true),
  editorial: job('display', 'either', false, false, false),
  soft: job('display', 'either', false, false, false),
  grotesk: job('text', 'either', true, true, true),
  heavy: job('display', 'either', false, true, false, 8),
  humanist: job('small', 'either', true, true, true),
  script: job('display', 'never', false, false, false, 4),
  geometric: job('text', 'either', false, true, true),
  didone: job('display', 'either', false, false, false),
  slab: job('text', 'either', false, true, true),
  oldstyle: job('display', 'either', false, false, false),
  coolvetica: job('display', 'either', false, true, false),
  /* The second batch. */
  neutral: job('small', 'either', true, true, true),
  wide: job('display', 'either', false, true, false, 5),
  impact: job('display', 'either', false, true, true),
  narrow: job('text', 'either', false, true, true),
  elegant: job('display', 'either', false, false, false),
  classical: job('display', 'only', false, false, false, 6),
  reading: job('text', 'either', true, false, true),
  friendly: job('small', 'either', true, true, true),
  urban: job('text', 'either', false, true, true),
  rounded: job('display', 'either', false, true, false),
  handwritten: job('display', 'never', false, false, false, 6),
  retro: job('display', 'never', false, false, false, 3),
  technical: job('small', 'either', false, false, true),
  expressive: job('display', 'either', false, true, false),
  fatface: job('display', 'either', false, false, false, 6),
  industrial: job('display', 'either', false, true, true),
  artistic: job('display', 'either', false, true, false, 5),
  universal: job('small', 'either', true, true, true),
  /* Added 2026-11-17. */
  gentle: job('text', 'either', true, false, true),
  clean: job('small', 'either', true, true, true),
};

export const faceUse = (key: TypefaceKey): FaceUse => FACE_USE[key] ?? FACE_USE.sans;

/** May this face set small tracked labels (eyebrows, calls to action, table heads)? */
export const setsLabels = (key: TypefaceKey): boolean => {
  const u = faceUse(key);
  return u.capitals !== 'never' && u.smallest !== 'display';
};

/* ── what a piece asks of its type ────────────────────────────────────────── */

export interface TypeContext {
  /** Read at speed from a road. */
  distance?: boolean;
  /** A format whose text sits at or near six points: a business card, a label. */
  smallPrint?: boolean;
  /** Words in the headline. */
  headlineWords?: number;
  /** The movement sets its headlines in capitals. */
  capitals?: boolean;
}

export interface PairingFaces { display: TypefaceKey; text: TypefaceKey; accent: TypefaceKey }

/** Why this pairing is wrong for this piece. Empty means it suits. */
export function pairingProblems(p: PairingFaces, ctx: TypeContext): string[] {
  const out: string[] = [];
  const d = faceUse(p.display);
  const t = faceUse(p.text);
  if (ctx.distance && !d.distance) out.push(`${p.display} has hairlines or strokes too fine to read from a road`);
  if (ctx.capitals && d.capitals === 'never') out.push(`${p.display} cannot be set in capitals`);
  if (d.maxWords && (ctx.headlineWords ?? 0) > d.maxWords) out.push(`${p.display} should carry at most ${d.maxWords} words; the headline has ${ctx.headlineWords}`);
  if (t.smallest === 'display') out.push(`${p.text} is a display face and cannot set supporting text`);
  if (ctx.smallPrint && t.smallest !== 'small') out.push(`${p.text} is too fine for text near six points`);
  if (ctx.smallPrint && d.smallest === 'display' && !d.distance) out.push(`${p.display} has hairlines that close up at the size a small format sets its headline`);
  if (!t.paragraphs && !ctx.distance) out.push(`${p.text} does not read comfortably over several lines`);
  return out;
}

/* ── use cases, for the document and the reviewer ─────────────────────────── */

export interface TypeUseCase {
  key: string;
  name: string;
  /** What the reader is doing, which is what decides everything else. */
  reading: string;
  headline: string;
  text: string;
  avoid: string;
}

export const TYPE_USE_CASES: TypeUseCase[] = [
  { key: 'billboard', name: 'Billboard and roadside board', reading: 'About three seconds, moving, from far away.',
    headline: 'Heavy or condensed sans, or a sturdy slab. Seven words at most. At least a fifth of the board’s height.',
    text: 'None. The name and one line to act on, both large.',
    avoid: 'Hairline serifs, scripts, light weights, and any second message.' },
  { key: 'business-card', name: 'Business card and small label', reading: 'Held in the hand, read once, kept for the number.',
    headline: 'The name, in a face with some character, no larger than it needs.',
    text: 'A sturdy sans or mono at six to eight points: the phone number has to survive a bad printer.',
    avoid: 'Display serifs and scripts for the details. Anything under six points. More than two families.' },
  { key: 'social-post', name: 'Social post and story', reading: 'A thumb pause on a phone, one idea, then gone.',
    headline: 'One confident face used large. Character matters more than neutrality here.',
    text: 'One or two short lines in a clear sans.',
    avoid: 'Paragraphs. Small type near the edges the platform crops.' },
  { key: 'poster-flyer', name: 'Poster and flyer', reading: 'Glanced at on a wall, then read up close if the glance worked.',
    headline: 'A strong display face; the size steps down steeply to everything else.',
    text: 'A reading sans or serif for the what, where and when. Figures that line up.',
    avoid: 'Three or more families. A headline and details at nearly the same size.' },
  { key: 'menu-price-list', name: 'Menu and price list', reading: 'Scanned in rows; the eye runs from a name to its price.',
    headline: 'A face with the place’s character, for section names.',
    text: 'A reading serif or humanist sans for dishes; figures in a face where digits align, such as a mono.',
    avoid: 'Scripts for dish names. Prices in a face whose digits do not line up.' },
  { key: 'identity', name: 'Brand name and identity', reading: 'Seen thousands of times at every size, from a sign to a favicon.',
    headline: 'One distinctive face for the name, tested small as well as large.',
    text: 'A neutral partner that will not compete with it.',
    avoid: 'A face chosen because it is fashionable this year. Effects standing in for a real choice.' },
  { key: 'invitation', name: 'Invitation and ceremony', reading: 'Read slowly, kept, sometimes framed.',
    headline: 'Classical capitals, an old-style serif, or a script for one or two words.',
    text: 'A text serif with room around it.',
    avoid: 'A script for the date and address. Capitals in a script.' },
  { key: 'information', name: 'Notices, schedules and reports', reading: 'Looked up, not read through: the reader wants one fact.',
    headline: 'Plain and clear; the structure does the work.',
    text: 'A neutral sans with a tall x-height, and a mono or tabular face for figures.',
    avoid: 'Display faces anywhere. Centred text in tables.' },
];

/** The rules that hold whatever the piece is. */
export const TYPE_RULES: string[] = [
  'Two families at most on one piece, and a reason for the second.',
  'One face leads. The step in size from the headline to the next line is steep, never timid.',
  'A display face is for a few words set large. It never sets small text.',
  'A script is for one to four words. It is never set in capitals and never tracked.',
  'Small capitals are tracked open; a headline in lower case is tracked slightly tight.',
  'Text near six points needs a sturdy, open face. Hairlines disappear in print at that size.',
  'Figures that are compared (prices, times) are set in a face whose digits share one width.',
  'From a road: heavy or condensed, seven words, no hairlines.',
  'A face with no lower case is for names and titles, never sentences.',
  'Every character the customer types must have a glyph. The fallback face draws what the chosen face cannot.',
  'The type is a named system: one face for the headline, one for the text, one for the labels. A customer is told which is which.',
];

/** Where the rules above were checked against current practice. Principles only (Ruling AJ). */
export const TYPE_REFERENCES: { where: string; found: string }[] = [
  { where: 'Behance, most-appreciated brand identity projects of the week (behance.net, search "brand identity typography")',
    found: 'The related tags were "variable grotesque type", "bold light grotesk", "sans serif typeface", "black white contrast", "logo design fonts" and "kinetic motion designer". Identity work is leading with one grotesque family used at two contrasting weights. Answered here by Inter in two weights (`system`) and Bricolage Grotesque (`studio`).' },
  { where: 'Awwwards, the Typography collection (awwwards.com/websites/typography)',
    found: 'Its font filter is dominated by grotesques, condensed display faces (Anton, Bebas, Barlow, Druk), editorial serifs (Cormorant, Bodoni Moda, Canela, Editorial New) and monospace. The page states that consistency is key in the use of typography. Anton, Bebas Neue, Cormorant Garamond and Bodoni Moda are in the library; the commercial faces are not imitated.' },
  { where: 'Pinterest, search "branding typography" (read 2026-11-17, signed in as the founder; one results page)',
    found: 'Pinterest suggests narrowing the search by trade (luxury, fashion, beauty, food, coffee, skincare, tech, streetwear, perfume) and by "guidelines", "system" and "layout": people look for type by the business it is for, and expect it presented as a system. The brand boards shown name three levels outright, for example a heading face, a sub-heading face and a body face. Two treatments recur: heavy or condensed sans headlines for impact, and high-contrast serifs for luxury and beauty. Many boards use one saturated colour on black or white. Open faces named on the boards include Inter, Montserrat, Playfair Display, Bebas Neue and Bodoni, all in the library; Quicksand and DM Sans are named and are not. A second search timed out and was not read.' },
  { where: 'Type forecasts for 2026 (Creative Bloq, Muzli, Design and Paper, type.today)',
    found: 'Agreed points: editorial and "curvy" serifs returning; monospace moving into branding; variable fonts now ordinary; expressive display type; and restraint, with two families at most. Disagreed or unusable here: distorted and kinetic lettering, which a static layout engine cannot honestly produce. These are opinion pieces, not measurements.' },
  { where: 'Muzli, "Best free Google Fonts for 2026"',
    found: 'Named Inter, Lora, Oswald, Anton, Montserrat, Bebas Neue, Zilla Slab, Pacifico, Dancing Script and JetBrains Mono among its picks, all now in the library, with the advice to use scripts in short bursts and to load only the weights used.' },
];
