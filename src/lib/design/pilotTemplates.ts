/**
 * The pilot collection (Task 18, 2026-11-08).
 *
 * Twenty designs for the three products the catalogue gate is piloted on:
 * eight business cards (one per creative direction, front and back), six
 * Instagram portrait posts and six 48-sheet billboards. Each one is directed
 * (design/directions.ts) and written to clear the automated half of the
 * quality standard (design/quality) at its true canvas.
 *
 * ── HOW THEY ARE KEPT APART ──────────────────────────────────────────────
 *
 * The founder's brief: "not 30 versions of one layout". Within each product
 * every pair differs in at least three of the seven composition features
 * (composition.ts): headline anchor, headline size step, image share, number
 * of text blocks, alignment, pattern and whether the headline sits in a
 * container. No palette is used twice across the twenty, and no direction
 * appears twice in one product.
 *
 * ── RULES THESE WERE WRITTEN TO ──────────────────────────────────────────
 *
 * - A card is 1011x638 at 300 dpi, so 6 pt is 25 px: every word on a card is
 *   set at 0.04 of the short edge (26 px) or larger, and everything sits at
 *   least 5 mm inside the trim (x 0.06-0.94, y 0.095-0.905).
 * - Front and back share their shapes unless a shape names its side
 *   (`side: 'back'`, Task 18c S3); pageTemplate() builds each side, so a back
 *   can carry geometry of its own, like the clinic card's write-in lines.
 * - A brand slot is one line by contract (nowrap). Each is wide enough for a
 *   40-character name, or has a neighbour close enough below that the fitter
 *   shrinks a long name onto one line instead of cutting it off.
 * - A list slot is drawn downward from its y, so lists are anchored from the
 *   top (or set as a single row), never from the bottom.
 * - A slot's `font` is the face its look actually draws it in, so the width
 *   estimate the fitter shrinks against is the real face's, not Outfit's.
 * - Photo-led designs carry no image of their own: the gallery supplies its
 *   preview photograph at render time (previewMedia.ts) and a business
 *   replaces it with theirs. A photo box (`photo`, Task 18c S2) says where it
 *   goes; the window is no longer built from abutting opaque panels, which
 *   left hairline seams. When there is no photograph (a subject the pool
 *   cannot supply, Ruling AH) each draws its designed no-photo state there
 *   (`photo.fallback`, S1): a fill, a pattern clipped to the box, geometry,
 *   and on two of them the business name's initial (Ruling AP).
 * - Billboard copy is read in about three seconds: a headline, a name and at
 *   most one line to act on, with the headline at 0.13 of the board's height
 *   or larger, every other line at 0.07 or larger and the name at 0.08 (S5),
 *   and no more than seven words besides the name and the action line.
 *
 * Copy lives in create/sampleCopy.ts: finished, claim-free lines for the
 * headline, line and call to act (D1), labels for names and contacts.
 * Spread into DESIGN_TEMPLATES; types only are imported (see catalogueTemplates.ts).
 */

import type { DesignTemplate, MotionIn, SlotMotion } from '../designTemplates';
import type { LucideName, SlotIcon } from './icons';

/** A slot's arrival, in one call. */
const m = (kind: MotionIn, at: number, dur = 0.45): SlotMotion => ({ in: kind, at, dur });

/*
 * Icons (Task 18b). Lucide outlines lead the contact and hours rows; a handle
 * row leads with its platform's mark, Instagram unless the visitor picks
 * another in the customiser. The rules (one colour, beside a handle only, at
 * least the words' cap height) are design/icons.ts and platformMarks.ts.
 * These per-row icons are hints: the renderers read each row's icon from its
 * own words, and fall back to the hint only on the template's sample rows.
 */
const L = (name: LucideName): SlotIcon => ({ set: 'lucide', name });
const HANDLE: SlotIcon = { set: 'platform', name: 'instagram' };
/** Phone, email, website: the contact rows most cards carry, in that order. */
const PHONE_MAIL_WEB = [L('phone'), L('mail'), L('globe')];

/* Type steps on a business card, in short-edge units (638 px). 0.04 is 26 px. */
const CARD_TEXT = 0.04;
const CARD_BRAND = 0.042;

export const PILOT_TEMPLATES: DesignTemplate[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // ── Business cards (business-card, 85.6 x 54 mm) ───────────────────────
  // ═══════════════════════════════════════════════════════════════════════

  {
    key: 'pilot-card-luxury',
    label: 'Brass Hairline Card',
    desc: 'Centred serif name over a single brass hairline, the house as a quiet folio; the name of the house on the back',
    use: 'business',
    direction: 'luxury',
    iconSet: 'lucide',
    industries: ['Fashion & Beauty', 'Professional Services', 'Food & Hospitality'],
    styles: ['luxury', 'premium', 'elegant'],
    tags: ['business card', 'luxury', 'premium', 'hotel', 'salon', 'real estate', 'two-sided'],
    mood: 'luxe', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.2 },
    /*
     * Deep baobab brown with brass: the warmth of leather and wood rather than
     * the black-and-gold every luxury card defaults to. The identity group is
     * optically centred, name, hairline, role, and the house sits at the foot
     * in brass as a folio. The role is tracked capitals in the text sans (a
     * mono there read as code). On the back the same hairline parts the
     * house and its line from the contact row, which is centred under it.
     */
    look: { palette: 'baobab', type: 'luxury' },
    shapes: [
      { kind: 'rect', x: 0.455, y: 0.535, w: 0.09, h: 0.005, tone: 'primary' },
    ],
    slots: [
      { role: 'headline', x: 0.1, y: 0.36, w: 0.8, size: 0.1, weight: 400, tracking: 0.01, align: 'center', font: 'serif', maxLines: 2, motion: m('rise', 0.2, 0.6) },
      { role: 'eyebrow', x: 0.15, y: 0.6, w: 0.7, size: CARD_TEXT, weight: 600, upper: true, tracking: 0.24, align: 'center', tone: 'muted', face: 'text', font: 'sans', motion: m('fade', 0.5) },
      { role: 'brand', x: 0.1, y: 0.13, w: 0.8, size: CARD_TEXT, weight: 600, upper: true, tracking: 0.2, align: 'center', tone: 'primary', fromBottom: true, motion: m('fade', 0) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.08, y: 0.24, w: 0.84, size: 0.064, weight: 500, tracking: 0.06, align: 'center', font: 'serif', motion: m('fade', 0) },
        { role: 'subline', x: 0.12, y: 0.38, w: 0.76, size: CARD_TEXT, weight: 600, upper: true, tracking: 0.24, align: 'center', tone: 'muted', motion: m('fade', 0.2) },
        { role: 'contact', x: 0.08, y: 0.63, w: 0.84, size: CARD_TEXT, direction: 'row', max: 3, align: 'center', tone: 'muted', tabular: true, icons: PHONE_MAIL_WEB, motion: m('fade', 0.4) },
      ],
    }],
  },

  {
    key: 'pilot-card-minimal',
    label: 'Single Mark Card',
    desc: 'One terracotta square and the name, low and to the left; on the back, one element in each quarter',
    use: 'business',
    direction: 'minimal',
    iconSet: 'lucide',
    industries: ['Professional Services', 'Technology & Media', 'Arts & Entertainment'],
    styles: ['minimal', 'modern', 'swiss'],
    tags: ['business card', 'minimal', 'clean', 'architect', 'studio', 'two-sided'],
    mood: 'minimal', scheme: 'light', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.04 },
    /*
     * One family, two weights. The square sits on the safe line top right and
     * the name, large, bottom left with the role under it, so the front holds
     * one diagonal and a field of cream between. The back is a composed
     * diagonal too: the house top left, the square top right, the contact
     * bottom left.
     */
    look: { palette: 'terracotta-mono', type: 'modern' },
    shapes: [
      { kind: 'rect', x: 0.89, y: 0.115, w: 0.05, h: 0.079, tone: 'primary' },
    ],
    slots: [
      { role: 'headline', x: 0.07, y: 0.68, w: 0.6, size: 0.12, weight: 500, tracking: -0.02, font: 'grotesk', maxLines: 2, motion: m('rise', 0, 0.6) },
      { role: 'eyebrow', x: 0.07, y: 0.83, w: 0.6, size: CARD_TEXT, weight: 500, tracking: 0.02, tone: 'muted', face: 'display', font: 'grotesk', motion: m('fade', 0.3) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.07, y: 0.115, w: 0.7, size: 0.045, weight: 500, face: 'display', font: 'grotesk', motion: m('fade', 0) },
        { role: 'contact', x: 0.07, y: 0.68, w: 0.6, size: CARD_TEXT, weight: 500, gap: 1.6, max: 3, face: 'display', font: 'grotesk', icons: PHONE_MAIL_WEB, motion: m('fade', 0.2) },
      ],
    }],
  },

  {
    key: 'pilot-card-corporate',
    label: 'Brand Bar Card',
    desc: 'The firm over a thin blue bar; the person low on the left, the contact column ruled off on the right',
    use: 'business',
    direction: 'corporate',
    iconSet: 'lucide',
    industries: ['Professional Services', 'Trades & Industry', 'Technology & Media'],
    styles: ['corporate', 'modern', 'premium'],
    tags: ['business card', 'corporate', 'law', 'finance', 'consulting', 'accounting', 'two-sided'],
    mood: 'minimal', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.1 },
    /*
     * A letterhead in navy. The firm sits over a thin brand bar; the person
     * is anchored low on the left with the role under the name, and the
     * contact column, in tabular figures, is ruled off on the right. The air
     * between the house and the person is deliberate. The back keeps the bar
     * and the rule: the firm's question large on the left, its three services
     * on the right.
     */
    look: { palette: 'navy-mono', type: 'modern' },
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.23, w: 0.86, h: 0.006, tone: 'primary' },
      { kind: 'rect', x: 0.58, y: 0.58, w: 0.0025, h: 0.32, tone: 'primary', alpha: 0.6 },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.12, w: 0.76, size: 0.045, weight: 700, upper: true, tracking: 0.08, motion: m('fade', 0) },
      { role: 'headline', x: 0.07, y: 0.6, w: 0.48, size: 0.09, weight: 700, tracking: -0.01, font: 'grotesk', motion: m('rise', 0.15, 0.55) },
      { role: 'eyebrow', x: 0.07, y: 0.75, w: 0.48, size: CARD_TEXT, weight: 600, tone: 'secondary', face: 'text', font: 'sans', motion: m('fade', 0.35) },
      { role: 'contact', x: 0.62, y: 0.6, w: 0.32, size: CARD_TEXT, gap: 1.6, max: 3, tabular: true, icons: PHONE_MAIL_WEB, motion: m('fade', 0.5) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.07, y: 0.12, w: 0.76, size: 0.045, weight: 700, upper: true, tracking: 0.08, motion: m('fade', 0) },
        { role: 'subline', x: 0.07, y: 0.6, w: 0.48, size: 0.075, weight: 700, tracking: -0.01, font: 'grotesk', motion: m('fade', 0.2) },
        { role: 'services', x: 0.62, y: 0.6, w: 0.32, size: CARD_TEXT, gap: 1.6, bullet: 'bar', max: 3, motion: m('fade', 0.35) },
      ],
    }],
  },

  {
    key: 'pilot-card-editorial',
    label: 'Masthead Card',
    desc: 'A large serif name in the left column, the website as a folio, a spine of colour; the contact on the back',
    use: 'business',
    direction: 'editorial',
    iconSet: 'lucide',
    industries: ['Arts & Entertainment', 'Professional Services', 'Education & Community'],
    styles: ['editorial', 'elegant', 'premium'],
    tags: ['business card', 'editorial', 'writer', 'consultant', 'gallery', 'publisher', 'two-sided'],
    mood: 'editorial', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.06 },
    /*
     * Laid out like a magazine page: a red-earth spine, a column rule, a
     * coarser halftone in the right-hand column at 0.12 (the most a pattern
     * under words may carry) so it reads as a printed screen, and the serif name as the masthead. Identity on the front (the
     * website as the folio), action on the back (Ruling AO): the full
     * contact in the right column beside the studio's line. A hairline over
     * the studio name makes it a credit line on both sides.
     */
    look: {
      palette: 'red-earth',
      type: 'editorial',
      pattern: { role: 'primary', key: 'halftone', opacity: 0.12, scale: 0.16, zone: 'right' },
    },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.025, h: 1, tone: 'primary' },
      { kind: 'rect', x: 0.6, y: 0.12, w: 0.003, h: 0.6, tone: 'ink', alpha: 0.55 },
      { kind: 'rect', x: 0.07, y: 0.74, w: 0.49, h: 0.003, tone: 'ink', alpha: 0.55 },
    ],
    slots: [
      { role: 'eyebrow', x: 0.07, y: 0.12, w: 0.5, size: CARD_TEXT, upper: true, tracking: 0.14, tone: 'accent', font: 'mono', motion: m('fade', 0) },
      { role: 'headline', x: 0.07, y: 0.24, w: 0.5, size: 0.13, weight: 400, tracking: -0.02, font: 'editorial', maxLines: 3, motion: m('mask-up', 0.15, 0.7) },
      { role: 'meta', x: 0.64, y: 0.12, w: 0.3, size: CARD_TEXT, weight: 600, icons: [L('globe')], motion: m('fade', 0.5) },
      { role: 'brand', x: 0.07, y: 0.8, w: 0.86, size: CARD_BRAND, weight: 700, upper: true, tracking: 0.1, motion: m('fade', 0.6) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'subline', x: 0.07, y: 0.2, w: 0.5, size: 0.07, weight: 400, font: 'editorial', balance: true, motion: m('fade', 0) },
        { role: 'contact', x: 0.64, y: 0.3, w: 0.3, size: CARD_TEXT, gap: 1.6, max: 3, tabular: true, icons: PHONE_MAIL_WEB, motion: m('fade', 0.1) },
        { role: 'brand', x: 0.07, y: 0.8, w: 0.86, size: CARD_BRAND, weight: 700, upper: true, tracking: 0.1, motion: m('fade', 0.2) },
      ],
    }],
  },

  {
    key: 'pilot-card-bold',
    label: 'Red Band Card',
    desc: 'The name in heavy capitals across a bled red band on yellow, a black slab off the corner; the greeting and contact on the back',
    use: 'business',
    direction: 'bold',
    iconSet: 'lucide',
    industries: ['Retail & Commerce', 'Food & Hospitality', 'Arts & Entertainment'],
    styles: ['bold', 'high-contrast', 'street'],
    tags: ['business card', 'bold', 'loud', 'shop', 'events', 'food', 'two-sided'],
    mood: 'bold', scheme: 'light', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.2 },
    /*
     * Two hues and black: a red band bled off the top carrying the name in
     * white Archivo Black across most of the card, yellow beneath, one black
     * slab off the bottom-right corner. Two families: the heavy display and
     * the text grotesk. The front is identity with one contact row (Ruling
     * AO); the back is the band's greeting and the full contact.
     */
    look: { palette: 'sun-and-ink', type: 'impact' },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.58, tone: 'primary' },
      { kind: 'rect', x: 0.8, y: 0.62, w: 0.2, h: 0.38, tone: 'ink' },
    ],
    slots: [
      { role: 'headline', x: 0.07, y: 0.15, w: 0.86, size: 0.19, weight: 800, upper: true, tracking: -0.03, on: 'primary', font: 'heavy', maxLines: 2, motion: m('slide-right', 0, 0.55) },
      { role: 'eyebrow', x: 0.07, y: 0.43, w: 0.86, size: 0.045, weight: 700, upper: true, tracking: 0.12, on: 'primary', face: 'text', font: 'grotesk', motion: m('fade', 0.3) },
      { role: 'brand', x: 0.07, y: 0.66, w: 0.66, size: 0.05, weight: 800, upper: true, tracking: 0.02, motion: m('fade', 0.45) },
      { role: 'contact', x: 0.07, y: 0.78, w: 0.68, size: CARD_TEXT, weight: 700, direction: 'row', max: 1, tabular: true, icons: [L('phone')], motion: m('fade', 0.6) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'subline', x: 0.07, y: 0.2, w: 0.86, size: 0.12, weight: 800, upper: true, tracking: -0.02, on: 'primary', font: 'heavy', maxLines: 2, motion: m('slide-right', 0, 0.55) },
        { role: 'brand', x: 0.07, y: 0.66, w: 0.66, size: 0.05, weight: 800, upper: true, tracking: 0.02, motion: m('fade', 0.3) },
        { role: 'contact', x: 0.07, y: 0.78, w: 0.7, size: CARD_TEXT, weight: 700, direction: 'row', max: 2, tabular: true, icons: [L('phone'), HANDLE], motion: m('fade', 0.45) },
      ],
    }],
  },

  {
    key: 'pilot-card-contemporary',
    label: 'Offset Tile Card',
    desc: 'Right-set name over a fine grid, the handle on its edge, two rounded tiles offset bottom left; a QR code on the back',
    use: 'business',
    direction: 'contemporary',
    iconSet: 'lucide',
    industries: ['Technology & Media', 'Arts & Entertainment', 'Professional Services'],
    styles: ['modern', 'tech', 'youth'],
    tags: ['business card', 'contemporary', 'creator', 'agency', 'startup', 'qr code', 'two-sided'],
    mood: 'street', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.1 },
    /*
     * Near-black with a mint grid that registers at 0.1, a pink tile and a
     * yellow one stepped off it, softly rounded. The name, its role and the
     * handle all close on the right edge, so the card balances on the
     * diagonal against the tiles. Pink and yellow are the only brights. The
     * back puts the full contact beside a scannable code, and the house on
     * the tiles' baseline.
     */
    look: {
      palette: 'electric-lagos',
      type: 'modern',
      pattern: { role: 'secondary', key: 'grid', opacity: 0.1, scale: 0.08 },
    },
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.6, w: 0.18, h: 0.27, tone: 'primary', radius: 0.03 },
      { kind: 'rect', x: 0.25, y: 0.74, w: 0.08, h: 0.13, tone: 'highlight', radius: 0.03 },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.12, w: 0.62, size: CARD_BRAND, weight: 700, motion: m('fade', 0) },
      { role: 'eyebrow', x: 0.4, y: 0.34, w: 0.54, size: CARD_TEXT, align: 'right', tone: 'muted', font: 'mono', motion: m('fade', 0.2) },
      { role: 'headline', x: 0.4, y: 0.42, w: 0.54, size: 0.09, weight: 700, tracking: -0.02, align: 'right', font: 'grotesk', maxLines: 2, motion: m('slide-left', 0.3, 0.6) },
      { role: 'meta', x: 0.4, y: 0.66, w: 0.54, size: CARD_TEXT, align: 'right', tone: 'muted', font: 'mono', icons: [HANDLE], motion: m('fade', 0.5) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'qr', x: 0.07, y: 0.12, w: 0.22, motion: m('pop', 0) },
        { role: 'contact', x: 0.36, y: 0.12, w: 0.58, size: CARD_TEXT, gap: 1.5, max: 3, tabular: true, icons: PHONE_MAIL_WEB, motion: m('fade', 0.2) },
        { role: 'brand', x: 0.36, y: 0.13, w: 0.58, size: CARD_BRAND, weight: 700, fromBottom: true, motion: m('fade', 0.35) },
      ],
    }],
  },

  {
    key: 'pilot-card-playful',
    label: 'Butter Blob Card',
    desc: 'The name in chunky type on a soft butter panel, a lavender sun in the corner and coral dots; a greeting and contact on the back',
    use: 'business',
    direction: 'playful',
    iconSet: 'lucide',
    industries: ['Food & Hospitality', 'Education & Community', 'Home & Personal Services'],
    styles: ['playful', 'soft', 'youth'],
    tags: ['business card', 'playful', 'cafe', 'bakery', 'kids', 'crafts', 'two-sided'],
    mood: 'warm', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.08 },
    /*
     * Butter and lavender with coral dots: friendly without being childish.
     * The rounded panel is the focal point, holding the name in a chunky
     * 800-weight sans (a high-contrast serif read as luxury); the lavender
     * circle is a corner sun, and the coral dot repeats, the one shape the
     * playful direction repeats on purpose. One left edge for panel, brand
     * and contact. The front keeps one contact row (Ruling AO); the back
     * greets, and carries the full contact.
     */
    look: {
      palette: 'butter-lavender',
      type: 'warmth',
      pattern: { role: 'secondary', key: 'dots', opacity: 0.1, scale: 0.05 },
    },
    shapes: [
      { kind: 'circle', cx: 0.98, cy: 0.04, r: 0.24, tone: 'secondary' },
      { kind: 'rect', x: 0.07, y: 0.3, w: 0.58, h: 0.38, tone: 'primary', radius: 0.16 },
      { kind: 'circle', cx: 0.62, cy: 0.2, r: 0.035, tone: 'highlight' },
      { kind: 'circle', cx: 0.82, cy: 0.8, r: 0.08, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.12, w: 0.62, size: CARD_BRAND, weight: 700, motion: m('fade', 0) },
      { role: 'headline', x: 0.11, y: 0.36, w: 0.5, size: 0.1, weight: 800, on: 'primary', face: 'text', font: 'sans', maxLines: 2, motion: m('pop', 0.2, 0.55) },
      { role: 'eyebrow', x: 0.11, y: 0.555, w: 0.5, size: CARD_TEXT, weight: 600, on: 'primary', face: 'text', font: 'sans', motion: m('fade', 0.4) },
      { role: 'contact', x: 0.07, y: 0.76, w: 0.6, size: CARD_TEXT, direction: 'row', max: 1, tabular: true, icons: [L('phone')], motion: m('fade', 0.55) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.07, y: 0.12, w: 0.62, size: CARD_BRAND, weight: 700, motion: m('fade', 0) },
        { role: 'subline', x: 0.11, y: 0.38, w: 0.5, size: 0.065, weight: 800, on: 'primary', face: 'text', font: 'sans', maxLines: 2, motion: m('pop', 0.2, 0.55) },
        { role: 'contact', x: 0.07, y: 0.71, w: 0.6, size: CARD_TEXT, weight: 600, gap: 1.5, max: 3, tabular: true, icons: [L('phone'), HANDLE, L('map-pin')], motion: m('fade', 0.4) },
      ],
    }],
  },

  {
    key: 'pilot-card-industry',
    label: 'Clinic Appointment Card',
    desc: 'A clinic card: the practice on a dark band, the practitioner, a booking panel; hours and a write-in appointment on the back',
    use: 'industry',
    direction: 'industry',
    iconSet: 'lucide',
    industries: ['Health & Wellness'],
    styles: ['corporate', 'minimal', 'modern'],
    tags: ['business card', 'appointment card', 'clinic', 'doctor', 'dentist', 'physiotherapy', 'hospital', 'two-sided'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.04 },
    /*
     * Built from what a clinic card is for. The front answers who and how to
     * book: the practice, the practitioner and their specialty, a solid
     * booking button and the registration number patients are entitled to
     * see. The back is an appointment card: opening hours in tabular figures,
     * and the ruled box with two write-in lines for the next visit (back
     * only). A plain thin plus on the band, not a red cross, which is a
     * protected emblem.
     */
    look: {
      palette: 'glacier',
      type: 'modern',
      pattern: { role: 'primary', key: 'grid', opacity: 0.08, scale: 0.06, zone: 'bottom' },
    },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.27, tone: 'ink' },
      { kind: 'rect', x: 0.8626, y: 0.085, w: 0.0148, h: 0.1, tone: 'white' },
      { kind: 'rect', x: 0.8385, y: 0.1232, w: 0.063, h: 0.0235, tone: 'white' },
      { kind: 'rect', x: 0.6, y: 0.36, w: 0.34, h: 0.004, tone: 'primary' },
      { kind: 'rect', x: 0.6, y: 0.816, w: 0.34, h: 0.004, tone: 'primary' },
      { kind: 'rect', x: 0.6, y: 0.36, w: 0.0025, h: 0.46, tone: 'primary' },
      { kind: 'rect', x: 0.9375, y: 0.36, w: 0.0025, h: 0.46, tone: 'primary' },
      // The back only (S3): two write-in lines in the appointment box.
      { kind: 'rect', x: 0.65, y: 0.62, w: 0.25, h: 0.003, tone: 'primary', alpha: 0.5, side: 'back' },
      { kind: 'rect', x: 0.65, y: 0.74, w: 0.25, h: 0.003, tone: 'primary', alpha: 0.5, side: 'back' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.1, w: 0.7, size: 0.05, weight: 700, on: 'ink', motion: m('fade', 0) },
      { role: 'eyebrow', x: 0.07, y: 0.175, w: 0.7, size: CARD_TEXT, weight: 400, tone: 'muted', on: 'ink', face: 'text', font: 'sans', motion: m('fade', 0.15) },
      { role: 'headline', x: 0.07, y: 0.34, w: 0.5, size: 0.075, weight: 700, font: 'grotesk', maxLines: 2, motion: m('rise', 0.25, 0.5) },
      { role: 'contact', x: 0.07, y: 0.56, w: 0.5, size: CARD_TEXT, gap: 1.6, max: 3, tabular: true, icons: [L('phone'), L('map-pin'), L('globe')], motion: m('fade', 0.4) },
      { role: 'cta', x: 0.63, y: 0.42, w: 0.29, size: CARD_TEXT, weight: 700, treatment: 'pill', pillStyle: 'solid', maxLines: 2, motion: m('pop', 0.55) },
      { role: 'meta', x: 0.63, y: 0.7, w: 0.29, size: CARD_TEXT, tone: 'muted', motion: m('fade', 0.65) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.07, y: 0.1, w: 0.7, size: 0.05, weight: 700, on: 'ink', motion: m('fade', 0) },
        { role: 'eyebrow', x: 0.07, y: 0.175, w: 0.7, size: CARD_TEXT, weight: 400, tone: 'muted', on: 'ink', face: 'text', font: 'sans', motion: m('fade', 0.15) },
        { role: 'services', x: 0.07, y: 0.4, w: 0.5, size: CARD_TEXT, gap: 1.6, bullet: 'none', max: 3, tabular: true, icons: [L('clock'), L('clock'), L('phone')], motion: m('fade', 0.3) },
        { role: 'subline', x: 0.65, y: 0.42, w: 0.27, size: 0.045, weight: 700, motion: m('fade', 0.45) },
      ],
    }],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ── Instagram posts (instagram-post, 4:5 portrait, 1080 x 1350) ────────
  // ═══════════════════════════════════════════════════════════════════════

  {
    key: 'pilot-ig-luxury',
    label: 'Framed Collection Post',
    desc: 'The photograph framed in plum like a print in a mount, a serif title centred beneath',
    use: 'social',
    direction: 'luxury',
    industries: ['Fashion & Beauty', 'Food & Hospitality', 'Professional Services'],
    styles: ['luxury', 'elegant', 'fashion'],
    tags: ['instagram', 'collection', 'launch', 'fashion', 'hotel', 'jewellery', 'portrait post'],
    mood: 'luxe', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.3 },
    photoLed: true,
    /*
     * A product or detail crop, not a face: the plum duotone must never land
     * on skin, where tone carries identity (premium-design-brief §4).
     */
    photoSubject: 'fashion-detail',
    /*
     * A mount, not a crop: a plum mount on four sides leaves a window of 40%
     * of the post, and the duotone carries the plum into the picture so it
     * belongs to the frame. A short lilac hairline belongs to the type stack
     * under the window. With no photograph the window is an embossed mount:
     * a soft plum glow, a keyline bevel and, once the owner has named the
     * house, its initial.
     */
    look: { palette: 'plum-mono', type: 'luxury', duotone: ['ground', 'highlight'] },
    photo: {
      x: 0.1, y: 0.1, w: 0.8, h: 0.5,
      fallback: {
        layers: [
          { kind: 'flat', tone: { role: 'ground' } },
          { kind: 'radial', cx: 0.5, cy: 0.45, r: 0.75, stops: [{ role: 'primary', alpha: 0.24 }, { role: 'primary', alpha: 0 }] },
        ],
        keyline: { inset: 0.015, tone: { role: 'highlight', alpha: 0.3 } },
        monogram: { font: 'serif', size: 0.34, tone: { role: 'primary', alpha: 0.55 } },
      },
    },
    shapes: [
      { kind: 'rect', x: 0.42, y: 0.632, w: 0.16, h: 0.003, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.035, w: 0.8, size: 0.028, weight: 600, upper: true, tracking: 0.14, align: 'center', maxLines: 1, motion: m('fade', 0) },
      { role: 'eyebrow', x: 0.15, y: 0.655, w: 0.7, size: 0.026, weight: 600, upper: true, tracking: 0.3, align: 'center', tone: 'secondary', face: 'text', font: 'sans', motion: m('fade', 0.3) },
      { role: 'headline', x: 0.1, y: 0.7, w: 0.8, size: 0.085, weight: 400, align: 'center', font: 'serif', maxLines: 2, balance: true, motion: m('rise', 0.45, 0.7) },
      { role: 'subline', x: 0.15, y: 0.86, w: 0.7, size: 0.03, align: 'center', tone: 'muted', motion: m('fade', 0.8) },
    ],
  },

  {
    key: 'pilot-ig-editorial',
    label: 'Feature Corner Post',
    desc: 'The photograph runs to three edges; the feature title sits in a forest-green corner with a brass rule',
    use: 'social',
    direction: 'editorial',
    industries: ['Arts & Entertainment', 'Professional Services', 'Education & Community'],
    styles: ['editorial', 'cinematic', 'premium'],
    tags: ['instagram', 'feature', 'story', 'interview', 'magazine', 'blog', 'portrait post'],
    mood: 'editorial', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.3 },
    photoLed: true,
    photoSubject: 'craft',
    /*
     * Asymmetric on purpose: about three quarters photograph, and one corner
     * of solid forest green holding a serif title against a brass rule, the
     * line stacked under it with room to breathe. The duotone ties the
     * picture to the brass.
     */
    look: { palette: 'forest-brass', type: 'editorial', duotone: ['ground', 'primary'] },
    /*
     * No photograph: a drop initial at poster size, the house's own first
     * letter in brass at a whisper, on forest with a light grain. Set low
     * on the left, clear of the name at the top, and only once the owner
     * has typed a name (Ruling AW).
     */
    photo: {
      x: 0, y: 0, w: 1, h: 1,
      fallback: {
        layers: [
          { kind: 'flat', tone: { role: 'ground' } },
          { kind: 'linear', angle: 160, stops: [{ role: 'secondary', alpha: 0.16 }, { role: 'secondary', alpha: 0 }] },
        ],
        pattern: { key: 'grain', role: 'ink', opacity: 0.07, scale: 0.2 },
        // An aperture in brass hairlines: structure that needs no name and implies no picture.
        shapes: [
          { kind: 'ring', cx: 0.62, cy: 0.27, r: 0.34, thickness: 0.004, tone: 'primary', alpha: 0.55 },
          { kind: 'ring', cx: 0.62, cy: 0.27, r: 0.25, thickness: 0.003, tone: 'primary', alpha: 0.35 },
        ],
        monogram: { font: 'editorial', size: 0.9, tone: { role: 'primary', alpha: 0.16 }, cx: 0.26, cy: 0.78 },
      },
    },
    shapes: [
      { kind: 'rect', x: 0.52, y: 0.5, w: 0.48, h: 0.5, tone: 'base' },
      { kind: 'rect', x: 0.52, y: 0.5, w: 0.006, h: 0.5, tone: 'primary' },
    ],
    slots: [
      { role: 'brand', x: 0.06, y: 0.05, w: 0.7, size: 0.026, weight: 700, upper: true, tracking: 0.08, maxLines: 1, motion: m('fade', 0) },
      { role: 'eyebrow', x: 0.56, y: 0.55, w: 0.38, size: 0.024, upper: true, tracking: 0.22, tone: 'accent', font: 'mono', motion: m('wipe', 0.2, 0.5) },
      { role: 'headline', x: 0.56, y: 0.6, w: 0.38, size: 0.078, weight: 400, font: 'editorial', maxLines: 2, balance: true, motion: m('mask-up', 0.35, 0.7) },
      { role: 'subline', x: 0.56, y: 0.79, w: 0.38, size: 0.028, tone: 'muted', maxLines: 3, motion: m('fade', 0.7) },
    ],
  },

  {
    key: 'pilot-ig-bold',
    label: 'Crimson Statement Post',
    desc: 'Type only: the news in heavy capitals on a crimson block, the detail, a solid teal call to act and an amber sticker on the seam',
    use: 'social',
    direction: 'bold',
    iconSet: 'platform',
    industries: ['Retail & Commerce', 'Food & Hospitality', 'Arts & Entertainment'],
    styles: ['bold', 'high-contrast', 'youth'],
    tags: ['instagram', 'announcement', 'news', 'statement', 'typographic', 'portrait post'],
    mood: 'bold', scheme: 'light', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.1 },
    /*
     * The typographic one of the six: no photograph. Crimson takes the top
     * sixty per cent with the news in white Archivo Black sat on the block's
     * foot, cream takes the rest with the detail and a solid teal call to
     * act, and an amber disc straddles the seam like a sticker.
     */
    look: { palette: 'poppy-field', type: 'impact' },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.62, tone: 'primary' },
      { kind: 'circle', cx: 0.82, cy: 0.62, r: 0.11, tone: 'highlight' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.07, y: 0.17, w: 0.6, size: 0.032, weight: 700, upper: true, tracking: 0.14, on: 'primary', font: 'condensed', motion: m('fade', 0) },
      { role: 'headline', x: 0.07, y: 0.23, w: 0.62, size: 0.19, weight: 800, upper: true, tracking: -0.03, on: 'primary', font: 'heavy', maxLines: 2, balance: true, motion: m('mask-up', 0.15, 0.7) },
      { role: 'subline', x: 0.07, y: 0.68, w: 0.56, size: 0.036, weight: 600, maxLines: 2, motion: m('fade', 0.6) },
      { role: 'cta', x: 0.07, y: 0.8, w: 0.5, size: 0.036, weight: 800, upper: true, tracking: 0.06, treatment: 'pill', pillStyle: 'solid', tone: 'secondary', icons: [HANDLE], motion: m('pop', 0.8, 0.5) },
      { role: 'brand', x: 0.07, y: 0.06, w: 0.55, size: 0.03, weight: 800, upper: true, tracking: 0.1, fromBottom: true, maxLines: 1, motion: m('fade', 1) },
    ],
  },

  {
    key: 'pilot-ig-contemporary',
    label: 'Offset Window Post',
    desc: 'A small photograph window set off the grid at top right, a pinned tile, the line large across the foot',
    use: 'social',
    direction: 'contemporary',
    industries: ['Technology & Media', 'Home & Personal Services', 'Health & Wellness'],
    styles: ['modern', 'tech', 'youth'],
    tags: ['instagram', 'booking', 'service', 'launch', 'agency', 'portrait post'],
    mood: 'street', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.2 },
    photoLed: true,
    photoSubject: 'work',
    /*
     * The photograph is a window, under a fifth of the post, offset to the
     * top right with a blue tile pinned over its corner: the picture is one
     * element in the grid, not the background. The focal point sits toward
     * the tile, so a subject is never dead centre.
     */
    look: { palette: 'deep-sea', type: 'modern' },
    /*
     * One clipped picture, where four abutting panels used to leave a
     * hairline of photograph at x 0.447 and 0.93. With no photograph the
     * window is a graphic module: a lifted blue field with the grid clipped
     * to it, the tile still pinning its corner.
     */
    photo: {
      x: 0.44, y: 0.07, w: 0.49, h: 0.4,
      focal: [0.4, 0.45],
      fallback: {
        layers: [
          { kind: 'flat', tone: { role: 'ground' } },
          { kind: 'flat', tone: { role: 'primary', alpha: 0.12 } },
        ],
        pattern: { key: 'grid', role: 'primary', opacity: 0.14, scale: 0.06 },
      },
    },
    shapes: [
      { kind: 'rect', x: 0.36, y: 0.4, w: 0.14, h: 0.11, tone: 'primary' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.07, y: 0.56, w: 0.6, size: 0.026, upper: true, tracking: 0.2, tone: 'secondary', font: 'mono', motion: m('fade', 0.2) },
      { role: 'headline', x: 0.07, y: 0.6, w: 0.86, size: 0.1, weight: 700, tracking: -0.03, font: 'grotesk', maxLines: 2, balance: true, motion: m('rise', 0.35, 0.6) },
      { role: 'subline', x: 0.07, y: 0.83, w: 0.56, size: 0.03, tone: 'muted', motion: m('fade', 0.6) },
      { role: 'cta', x: 0.66, y: 0.83, w: 0.27, size: 0.03, weight: 700, upper: true, treatment: 'pill', tone: 'accent', motion: m('pop', 0.8) },
      { role: 'brand', x: 0.07, y: 0.05, w: 0.5, size: 0.026, weight: 700, upper: true, tracking: 0.12, fromBottom: true, maxLines: 1, motion: m('fade', 1) },
    ],
  },

  {
    key: 'pilot-ig-industry',
    label: 'Dish of the Day Post',
    desc: 'A restaurant post: the plate above, then the dish, its price in naira with a solid order button, what is in it and where',
    use: 'industry',
    direction: 'industry',
    iconSet: 'lucide',
    industries: ['Food & Hospitality'],
    styles: ['organic', 'bold', 'afro-modern'],
    tags: ['instagram', 'menu', 'special', 'restaurant', 'food', 'buka', 'price', 'order', 'portrait post'],
    mood: 'warm', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.2 },
    photoLed: true,
    photoSubject: 'food',
    /*
     * Built from what a food post has to say: what the dish is, what it
     * costs, what is in it and how to get it. The plate gets the top half
     * untinted (no duotone: food photographed in two colours looks spoiled),
     * the facts sit on cola-brown in one tight stack, and the order button
     * is a solid yellow pill on the price row, where the action is.
     */
    look: { palette: 'cola-nut', type: 'warmth' },
    /*
     * No photograph: a plate drawn, not faked. A warm glow and two
     * concentric rims in the primary, with grain, read as a plate and are
     * plainly a graphic. Never a duotone on food.
     */
    photo: {
      x: 0, y: 0, w: 1, h: 0.56,
      fallback: {
        layers: [
          { kind: 'flat', tone: { role: 'ground' } },
          { kind: 'radial', cx: 0.5, cy: 0.52, r: 0.28, stops: [{ role: 'primary', alpha: 0.2 }, { role: 'primary', alpha: 0 }] },
        ],
        pattern: { key: 'grain', role: 'ink', opacity: 0.06, scale: 0.2 },
        shapes: [
          { kind: 'ring', cx: 0.5, cy: 0.29, r: 0.22, thickness: 0.012, tone: 'primary', alpha: 0.55 },
          { kind: 'ring', cx: 0.5, cy: 0.29, r: 0.15, thickness: 0.006, tone: 'primary', alpha: 0.4 },
        ],
      },
    },
    slots: [
      { role: 'brand', x: 0.06, y: 0.045, w: 0.7, size: 0.028, weight: 700, maxLines: 1, motion: m('fade', 0) },
      { role: 'eyebrow', x: 0.06, y: 0.6, w: 0.6, size: 0.026, weight: 700, upper: true, tracking: 0.2, tone: 'accent', motion: m('fade', 0.2) },
      { role: 'headline', x: 0.06, y: 0.635, w: 0.62, size: 0.08, weight: 600, font: 'soft', maxLines: 2, balance: true, motion: m('rise', 0.3, 0.6) },
      { role: 'price', x: 0.06, y: 0.785, w: 0.58, size: 0.034, weight: 600, max: 1, tabular: true, motion: m('rise', 0.55) },
      { role: 'cta', x: 0.7, y: 0.785, w: 0.24, size: 0.03, weight: 800, upper: true, treatment: 'pill', pillStyle: 'solid', tone: 'highlight', motion: m('pop', 0.9, 0.5) },
      { role: 'subline', x: 0.06, y: 0.835, w: 0.6, size: 0.026, tone: 'muted', maxLines: 2, motion: m('fade', 0.7) },
      { role: 'contact', x: 0.06, y: 0.915, w: 0.86, size: 0.026, direction: 'row', max: 2, tone: 'muted', tabular: true, icons: [L('phone'), L('map-pin')], motion: m('fade', 0.8) },
    ],
  },

  {
    key: 'pilot-ig-minimal',
    label: 'Quiet Caption Post',
    desc: 'The photograph, whole; one short line low on the left under a hairline, and the name at the top',
    use: 'social',
    direction: 'minimal',
    industries: ['Fashion & Beauty', 'Arts & Entertainment', 'Home & Personal Services'],
    styles: ['minimal', 'monochrome', 'cinematic'],
    tags: ['instagram', 'photo', 'caption', 'portfolio', 'minimal', 'portrait post'],
    mood: 'minimal', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.3 },
    photoLed: true,
    photoSubject: 'beauty',
    /*
     * The picture is the post. Graphite only darkens it enough to carry one
     * line, held to the left third under a white hairline at a size that
     * survives the thumbnail; the name is the only other word. The subject
     * belongs in the right two thirds, leaving the line its negative space.
     */
    look: { palette: 'graphite', type: 'modern' },
    /*
     * No photograph: a studio backdrop, seamless paper under one soft light,
     * with grain. Plainly not a picture, and not an empty plane either.
     */
    photo: {
      x: 0, y: 0, w: 1, h: 1,
      focal: [0.65, 0.45],
      fallback: {
        layers: [
          { kind: 'flat', tone: { role: 'ground' } },
          { kind: 'linear', angle: 200, stops: [{ role: 'secondary', alpha: 0.14 }, { role: 'secondary', alpha: 0 }] },
          { kind: 'radial', cx: 0.3, cy: 0.25, r: 0.6, stops: [{ role: 'ink', alpha: 0.08 }, { role: 'ink', alpha: 0 }] },
        ],
        pattern: { key: 'grain', role: 'ink', opacity: 0.06, scale: 0.2 },
      },
    },
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.69, w: 0.08, h: 0.003, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.06, w: 0.7, size: 0.026, weight: 600, upper: true, tracking: 0.06, maxLines: 1, motion: m('fade', 0) },
      { role: 'headline', x: 0.07, y: 0.72, w: 0.5, size: 0.085, weight: 500, tracking: -0.01, font: 'grotesk', maxLines: 2, balance: true, motion: m('fade', 0.3, 0.8) },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ── 48-sheet billboards (billboard-48-sheet, 3600 x 1800) ──────────────
  // ═══════════════════════════════════════════════════════════════════════

  {
    key: 'pilot-bb-bold',
    label: 'Navy Panel Billboard',
    desc: 'Four heavy words on a navy panel, an orange slash, and the photograph (or a flood of orange) filling the right',
    use: 'marketing',
    direction: 'bold',
    industries: ['Retail & Commerce', 'Food & Hospitality', 'Local & Everyday Business'],
    styles: ['bold', 'high-contrast', 'street'],
    tags: ['billboard', '48-sheet', 'outdoor', 'roadside', 'advertising', 'large format', 'opening'],
    mood: 'bold', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.3 },
    photoLed: true,
    photoSubject: 'retail',
    /*
     * Seen from a moving car: the line in white Archivo Black on navy, read
     * first; the photograph read second, its subject toward the right third;
     * an orange slash parting them; and the call to act underlined in
     * orange. The name sits at the top of the panel, large enough for the
     * road.
     */
    look: { palette: 'royal-orange', type: 'impact', duotone: ['ground', 'secondary'] },
    /*
     * No photograph: a colour split. Orange floods everything right of the
     * slash, which becomes the edge between navy and orange, with a navy
     * ring set into it: 50/40/10, one focal point, the line.
     */
    photo: {
      x: 0.55, y: 0, w: 0.45, h: 1,
      focal: [0.65, 0.5],
      fallback: {
        layers: [{ kind: 'flat', tone: { role: 'ground' } }],
        // Leaning with the 4 degree slash: tan 4 x the board height, over its width.
        shapes: [
          { kind: 'rect', x: 0.595, y: 0, w: 0.45, h: 1, skew: 0.0699, tone: 'primary' },
          { kind: 'ring', cx: 0.84, cy: 0.5, r: 0.3, thickness: 0.03, tone: 'base', alpha: 0.9 },
        ],
      },
    },
    shapes: [
      { kind: 'stripe', x: 0.6, y: 0, w: 0.025, h: 1, angle: 4, tone: 'primary' },
    ],
    slots: [
      { role: 'brand', x: 0.05, y: 0.05, w: 0.48, size: 0.08, weight: 700, upper: true, tracking: 0.2, face: 'text', font: 'grotesk', maxLines: 1, motion: m('fade', 0) },
      { role: 'headline', x: 0.05, y: 0.17, w: 0.48, size: 0.2, weight: 800, upper: true, tracking: -0.02, font: 'heavy', maxLines: 3, balance: true, motion: m('slide-right', 0.2, 0.6) },
      { role: 'cta', x: 0.05, y: 0.8, w: 0.48, size: 0.08, weight: 800, upper: true, tracking: 0.04, treatment: 'underline', font: 'heavy', maxLines: 1, motion: m('pop', 0.6, 0.5) },
    ],
  },

  {
    key: 'pilot-bb-minimal',
    label: 'One Line Billboard',
    desc: 'Type only: one line in navy, set left on a pale sheet, a single orange dot over its edge, the name on the exit edge',
    use: 'marketing',
    direction: 'minimal',
    industries: ['Professional Services', 'Technology & Media', 'Health & Wellness'],
    styles: ['minimal', 'swiss', 'modern'],
    tags: ['billboard', '48-sheet', 'outdoor', 'advertising', 'large format', 'typographic', 'brand'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.04 },
    /*
     * The confident board: one line, the name, and nothing else, set
     * asymmetrically on the grid rather than centred. A single orange dot
     * over the line's left edge gives the eye somewhere to land; the name
     * closes on the bottom-right exit edge.
     */
    look: { palette: 'harbour-blue', type: 'statement' },
    shapes: [
      { kind: 'circle', cx: 0.1, cy: 0.22, r: 0.03, tone: 'secondary' },
    ],
    slots: [
      { role: 'headline', x: 0.08, y: 0.34, w: 0.72, size: 0.22, weight: 800, tracking: -0.03, font: 'heavy', maxLines: 2, balance: true, motion: m('rise', 0, 0.7) },
      { role: 'brand', x: 0.56, y: 0.845, w: 0.36, size: 0.08, weight: 700, upper: true, tracking: 0.2, align: 'right', face: 'text', font: 'sans', maxLines: 1, motion: m('fade', 0.5) },
    ],
  },

  {
    key: 'pilot-bb-luxury',
    label: 'Mounted Photograph Billboard',
    desc: 'A framed photograph on the right, a centred serif line in a deep green column on the left',
    use: 'marketing',
    direction: 'luxury',
    industries: ['Food & Hospitality', 'Fashion & Beauty', 'Professional Services'],
    styles: ['luxury', 'elegant', 'premium'],
    tags: ['billboard', '48-sheet', 'outdoor', 'hotel', 'property', 'real estate', 'large format'],
    mood: 'luxe', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.3 },
    photoLed: true,
    /* A room or a building inside: the board is for a hotel or a property. */
    photoSubject: 'interior',
    /*
     * A hotel or property board: the photograph mounted inside a deep green
     * margin rather than bled, a centred serif line, a short sage rule, the
     * name and the address: three things to read from a road. With no
     * photograph the mount holds arches (architecture, for a building) in
     * a lifted green with a keyline bevel.
     */
    look: { palette: 'forest-mono', type: 'luxury', duotone: ['ground', 'highlight'] },
    photo: {
      x: 0.5, y: 0.08, w: 0.45, h: 0.84,
      fallback: {
        layers: [
          { kind: 'flat', tone: { role: 'ground' } },
          { kind: 'flat', tone: { role: 'highlight', alpha: 0.06 } },
        ],
        pattern: { key: 'arches', role: 'highlight', opacity: 0.09, scale: 0.12 },
        keyline: { inset: 0.02, tone: { role: 'highlight', alpha: 0.3 } },
      },
    },
    shapes: [
      { kind: 'rect', x: 0.22, y: 0.69, w: 0.06, h: 0.004, tone: 'primary' },
    ],
    slots: [
      { role: 'headline', x: 0.04, y: 0.36, w: 0.42, size: 0.15, weight: 400, align: 'center', font: 'serif', maxLines: 2, balance: true, motion: m('rise', 0.2, 0.8) },
      { role: 'brand', x: 0.05, y: 0.72, w: 0.4, size: 0.08, weight: 600, upper: true, tracking: 0.12, align: 'center', face: 'text', font: 'sans', maxLines: 1, motion: m('fade', 0.6) },
      { role: 'meta', x: 0.06, y: 0.83, w: 0.38, size: 0.07, align: 'center', tone: 'muted', motion: m('fade', 0.8) },
    ],
  },

  {
    key: 'pilot-bb-contemporary',
    label: 'Condensed Sky Billboard',
    desc: 'The photograph almost whole, the line in tall condensed capitals top right, name and handle on a foot band',
    use: 'marketing',
    direction: 'contemporary',
    iconSet: 'platform',
    industries: ['Technology & Media', 'Arts & Entertainment', 'Retail & Commerce'],
    styles: ['modern', 'street', 'youth'],
    tags: ['billboard', '48-sheet', 'outdoor', 'launch', 'campaign', 'event', 'large format'],
    mood: 'street', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.3 },
    photoLed: true,
    photoSubject: 'retail',
    /*
     * Indigo duotone with orange: current and graphic. The photograph keeps
     * nearly four fifths of the board; the words are Bebas Neue, held to two
     * lines at 0.26 so the line ends well above the band; the band carries
     * the name on the left and the handle closing on the right exit edge.
     */
    look: { palette: 'indigo-dye', type: 'street', duotone: ['ground', 'secondary'] },
    /*
     * With no photograph, one large flat orange arch rises behind the band
     * on the left, and the line stands on indigo to its right: image and
     * colour block, done flat. An arch rather than a disc because its edge
     * is a fraction of the width, so it stays clear of the line on every
     * format.
     */
    photo: {
      x: 0, y: 0, w: 1, h: 0.78,
      fallback: {
        layers: [{ kind: 'flat', tone: { role: 'ground' } }],
        shapes: [{ kind: 'rect', x: 0.02, y: 0.12, w: 0.28, h: 0.88, radius: 0.5, tone: 'secondary' }],
      },
    },
    shapes: [
      { kind: 'rect', x: 0, y: 0.78, w: 0.03, h: 0.22, tone: 'secondary' },
    ],
    slots: [
      { role: 'headline', x: 0.35, y: 0.08, w: 0.6, size: 0.26, weight: 700, upper: true, align: 'right', font: 'condensed', maxLines: 2, balance: true, motion: m('mask-up', 0, 0.7) },
      { role: 'brand', x: 0.05, y: 0.84, w: 0.45, size: 0.08, weight: 700, upper: true, tracking: 0.1, face: 'text', font: 'grotesk', maxLines: 1, motion: m('fade', 0.4) },
      { role: 'contact', x: 0.5, y: 0.84, w: 0.45, size: 0.07, weight: 700, direction: 'row', max: 1, align: 'right', tone: 'accent', icons: [HANDLE], motion: m('fade', 0.6) },
    ],
  },

  {
    key: 'pilot-bb-industry',
    label: 'Delivery Service Billboard',
    desc: 'A logistics board: the rider or van fills it; the line, a solid booking button and the company sit on a navy card',
    use: 'industry',
    direction: 'industry',
    industries: ['Logistics & Mobility'],
    styles: ['corporate', 'bold', 'modern'],
    tags: ['billboard', '48-sheet', 'outdoor', 'delivery', 'logistics', 'courier', 'dispatch', 'haulage', 'large format'],
    mood: 'bold', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.3 },
    photoLed: true,
    /*
     * A rider, a van or a loading bay. The pool has no such photograph yet,
     * so this previews with none (Ruling AH) rather than over a gavel, which
     * is what `work` matched.
     */
    photoSubject: 'delivery',
    /*
     * Built from what a delivery business is asked before anyone books:
     * where it goes, and how to book. Everything a driver needs sits on one
     * navy card, so nothing is set over a busy photograph: the line large and
     * right-set, a solid coral booking button under it, and the company on
     * the card's foot, the exit edge. Coral and teal, the colours of a
     * dispatch board.
     */
    look: { palette: 'ink-coral', type: 'modern', duotone: ['ground', 'secondary'] },
    /* No photograph: a map-like topography in teal, the areas served, abstract and with no icon. */
    photo: {
      x: 0, y: 0, w: 1, h: 1,
      focal: [0.3, 0.5],
      fallback: {
        // A teal-tinted map, so the navy card reads as a card on it.
        layers: [{ kind: 'flat', tone: { role: 'ground' } }, { kind: 'flat', tone: { role: 'secondary', alpha: 0.12 } }],
        pattern: { key: 'topography', role: 'secondary', opacity: 0.14, scale: 0.18 },
      },
    },
    shapes: [
      { kind: 'rect', x: 0.46, y: 0.11, w: 0.5, h: 0.78, tone: 'base' },
      { kind: 'rect', x: 0.84, y: 0.19, w: 0.08, h: 0.012, tone: 'primary' },
    ],
    slots: [
      { role: 'headline', x: 0.5, y: 0.24, w: 0.42, size: 0.16, weight: 700, tracking: -0.02, align: 'right', font: 'grotesk', maxLines: 3, balance: true, motion: m('rise', 0.1, 0.6) },
      { role: 'cta', x: 0.5, y: 0.66, w: 0.42, size: 0.07, weight: 700, upper: true, align: 'right', treatment: 'pill', pillStyle: 'solid', tone: 'accent', maxLines: 1, motion: m('pop', 0.6) },
      { role: 'brand', x: 0.5, y: 0.78, w: 0.42, size: 0.08, weight: 800, upper: true, tracking: 0.02, align: 'right', face: 'text', font: 'sans', maxLines: 1, motion: m('fade', 0.8) },
    ],
  },

  {
    key: 'pilot-bb-editorial',
    label: 'Clay Corner Billboard',
    desc: 'A serif headline in an indigo corner block, the photograph (or a clay field of resist dots) running round it',
    use: 'marketing',
    direction: 'editorial',
    industries: ['Arts & Entertainment', 'Education & Community', 'Fashion & Beauty'],
    styles: ['editorial', 'afro-modern', 'premium'],
    tags: ['billboard', '48-sheet', 'outdoor', 'exhibition', 'season', 'campaign', 'large format'],
    mood: 'editorial', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.3 },
    photoLed: true,
    photoSubject: 'craft',
    /*
     * A poster for a season or a show: the headline in DM Serif in an indigo
     * block at top left, the photograph in clay duotone round two sides of
     * it, adire-style resist dots held to the foot at 0.1, and the name on
     * the bottom-right exit edge.
     */
    look: {
      palette: 'adire-clay',
      type: 'editorial',
      duotone: ['ground', 'primary'],
      pattern: { role: 'highlight', key: 'resist-dots', opacity: 0.1, scale: 0.08, zone: 'bottom' },
    },
    /*
     * No photograph: a two-tone indigo and clay poster. The L around the
     * indigo block is clay with resist dots clipped to it, the heritage
     * pattern used as structure rather than a border, and an indigo moon
     * rising off the right edge answers the block. The name sits on the
     * clay, so it takes the ink measured for clay, on any palette.
     */
    photo: {
      x: 0, y: 0, w: 1, h: 1,
      fallback: {
        layers: [{ kind: 'flat', tone: { role: 'primary' } }],
        pattern: { key: 'resist-dots', role: 'ink', opacity: 0.12, scale: 0.08 },
        shapes: [{ kind: 'circle', cx: 0.93, cy: 0.28, r: 0.3, tone: 'base' }],
      },
    },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.55, h: 0.62, tone: 'base' },
      { kind: 'rect', x: 0.05, y: 0.62, w: 0.12, h: 0.012, tone: 'primary' },
    ],
    slots: [
      { role: 'headline', x: 0.05, y: 0.12, w: 0.47, size: 0.17, weight: 400, tracking: -0.01, font: 'editorial', maxLines: 3, balance: true, motion: m('mask-up', 0.2, 0.8) },
      { role: 'brand', x: 0.55, y: 0.81, w: 0.4, size: 0.08, weight: 700, upper: true, tracking: 0.08, align: 'right', on: 'primary', face: 'text', font: 'sans', maxLines: 1, motion: m('fade', 0.8) },
    ],
  },
];
