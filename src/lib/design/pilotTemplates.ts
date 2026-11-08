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
 * - Front and back share one set of shapes (the renderer draws a page as the
 *   template with that page's slots), so every piece of geometry is placed to
 *   work under both sides' words.
 * - A brand slot is one line by contract (nowrap). Each is wide enough for a
 *   40-character name, or has a neighbour close enough below that the fitter
 *   shrinks a long name onto one line instead of cutting it off.
 * - A list slot is drawn downward from its y, so lists are anchored from the
 *   top (or set as a single row), never from the bottom.
 * - A slot's `font` is the face its look actually draws it in, so the width
 *   estimate the fitter shrinks against is the real face's, not Outfit's.
 * - Photo-led designs carry no image of their own: the gallery supplies its
 *   preview photograph at render time (previewMedia.ts) and a business
 *   replaces it with theirs. Opaque `base` panels decide how much of it shows.
 * - Billboard copy is read in about three seconds: a headline, a name and at
 *   most one line to act on, with the headline at 0.13 of the board's height
 *   or larger.
 *
 * Copy lives in create/sampleCopy.ts and is labels only, as everywhere else.
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
    desc: 'Centred serif name over a single brass hairline; the name of the house on the back',
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
     * the black-and-gold every luxury card defaults to. One hairline, centred,
     * is the whole ornament; on the front it parts the name from the role, on
     * the back the name of the house from the contact line.
     */
    look: { palette: 'baobab', type: 'luxury' },
    shapes: [
      { kind: 'rect', x: 0.455, y: 0.5, w: 0.09, h: 0.005, tone: 'primary' },
    ],
    slots: [
      { role: 'brand', x: 0.12, y: 0.13, w: 0.76, size: CARD_TEXT, weight: 600, upper: true, tracking: 0.2, align: 'center', motion: m('fade', 0) },
      { role: 'headline', x: 0.1, y: 0.3, w: 0.8, size: 0.09, weight: 400, tracking: 0.01, align: 'center', font: 'serif', motion: m('rise', 0.2, 0.6) },
      { role: 'eyebrow', x: 0.15, y: 0.57, w: 0.7, size: CARD_TEXT, upper: true, tracking: 0.24, align: 'center', tone: 'secondary', font: 'mono', motion: m('fade', 0.5) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.08, y: 0.27, w: 0.84, size: 0.064, weight: 500, tracking: 0.06, align: 'center', font: 'serif', motion: m('fade', 0) },
        { role: 'subline', x: 0.12, y: 0.4, w: 0.76, size: CARD_TEXT, align: 'center', tone: 'muted', motion: m('fade', 0.2) },
        { role: 'contact', x: 0.1, y: 0.62, w: 0.8, size: CARD_TEXT, direction: 'row', max: 3, tone: 'muted', icons: PHONE_MAIL_WEB, motion: m('fade', 0.4) },
      ],
    }],
  },

  {
    key: 'pilot-card-minimal',
    label: 'Single Mark Card',
    desc: 'One terracotta square and the name, low and to the left; nothing else on the front',
    use: 'business',
    direction: 'minimal',
    iconSet: 'lucide',
    industries: ['Professional Services', 'Technology & Media', 'Arts & Entertainment'],
    styles: ['minimal', 'modern', 'swiss'],
    tags: ['business card', 'minimal', 'clean', 'architect', 'studio', 'two-sided'],
    mood: 'minimal', scheme: 'light', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.04 },
    /*
     * The square sits top right and the name bottom left, so the card holds
     * one diagonal and a field of cream between. The back keeps the square and
     * sets the business and contact on the same left margin as the name.
     */
    look: { palette: 'terracotta-mono', type: 'modern' },
    shapes: [
      { kind: 'rect', x: 0.87, y: 0.1, w: 0.05, h: 0.08, tone: 'primary' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.07, y: 0.58, w: 0.5, size: CARD_TEXT, tracking: 0.04, tone: 'highlight', font: 'mono', motion: m('fade', 0.3) },
      { role: 'headline', x: 0.07, y: 0.68, w: 0.5, size: 0.1, weight: 500, tracking: -0.02, font: 'grotesk', motion: m('rise', 0, 0.6) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.07, y: 0.12, w: 0.7, size: 0.045, weight: 700, motion: m('fade', 0) },
        { role: 'contact', x: 0.07, y: 0.55, w: 0.6, size: CARD_TEXT, gap: 1.6, max: 3, icons: PHONE_MAIL_WEB, motion: m('fade', 0.2) },
      ],
    }],
  },

  {
    key: 'pilot-card-corporate',
    label: 'Header Band Card',
    desc: 'The firm on a pale header band; name, role and a contact column ruled off below',
    use: 'business',
    direction: 'corporate',
    iconSet: 'lucide',
    industries: ['Professional Services', 'Trades & Industry', 'Technology & Media'],
    styles: ['corporate', 'modern', 'premium'],
    tags: ['business card', 'corporate', 'law', 'finance', 'consulting', 'accounting', 'two-sided'],
    mood: 'minimal', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.1 },
    /*
     * Navy with a pale blue band: the firm's name reads first, on the band;
     * the person reads second. A hairline divider makes the grid two columns
     * on both sides: person and contact on the front, the firm's line and its
     * three services on the back.
     */
    look: { palette: 'navy-mono', type: 'modern' },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.3, tone: 'secondary' },
      { kind: 'rect', x: 0, y: 0.3, w: 1, h: 0.012, tone: 'primary' },
      { kind: 'rect', x: 0.58, y: 0.42, w: 0.0025, h: 0.4, tone: 'primary', alpha: 0.6 },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.12, w: 0.76, size: 0.045, weight: 700, upper: true, tracking: 0.08, on: 'secondary', motion: m('fade', 0) },
      { role: 'headline', x: 0.07, y: 0.42, w: 0.46, size: 0.08, weight: 700, tracking: -0.01, font: 'grotesk', motion: m('rise', 0.15, 0.55) },
      { role: 'eyebrow', x: 0.07, y: 0.56, w: 0.46, size: CARD_TEXT, tone: 'secondary', font: 'mono', motion: m('fade', 0.35) },
      { role: 'contact', x: 0.62, y: 0.42, w: 0.3, size: CARD_TEXT, gap: 1.6, max: 3, icons: PHONE_MAIL_WEB, motion: m('fade', 0.5) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.07, y: 0.12, w: 0.76, size: 0.045, weight: 700, upper: true, tracking: 0.08, on: 'secondary', motion: m('fade', 0) },
        { role: 'subline', x: 0.07, y: 0.42, w: 0.46, size: 0.045, weight: 600, motion: m('fade', 0.2) },
        { role: 'services', x: 0.62, y: 0.42, w: 0.3, size: CARD_TEXT, gap: 1.6, bullet: 'bar', max: 3, motion: m('fade', 0.35) },
      ],
    }],
  },

  {
    key: 'pilot-card-editorial',
    label: 'Masthead Card',
    desc: 'A large serif name in the left column, contact in a dotted right column, a spine of colour',
    use: 'business',
    direction: 'editorial',
    iconSet: 'lucide',
    industries: ['Arts & Entertainment', 'Professional Services', 'Education & Community'],
    styles: ['editorial', 'elegant', 'premium'],
    tags: ['business card', 'editorial', 'writer', 'consultant', 'gallery', 'publisher', 'two-sided'],
    mood: 'editorial', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.06 },
    /*
     * Laid out like a magazine page: a red-earth spine on the left edge, a
     * column rule, and a halftone held to the right-hand column at 0.1 so it
     * reads as paper rather than pattern. The serif name is the masthead.
     */
    look: {
      palette: 'red-earth',
      type: 'editorial',
      pattern: { role: 'primary', key: 'halftone', opacity: 0.1, scale: 0.12, zone: 'right' },
    },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.025, h: 1, tone: 'primary' },
      { kind: 'rect', x: 0.6, y: 0.12, w: 0.003, h: 0.6, tone: 'ink', alpha: 0.55 },
    ],
    slots: [
      { role: 'eyebrow', x: 0.07, y: 0.12, w: 0.5, size: CARD_TEXT, upper: true, tracking: 0.14, tone: 'accent', font: 'mono', motion: m('fade', 0) },
      { role: 'headline', x: 0.07, y: 0.24, w: 0.5, size: 0.11, weight: 400, tracking: -0.02, font: 'editorial', motion: m('mask-up', 0.15, 0.7) },
      { role: 'contact', x: 0.64, y: 0.3, w: 0.3, size: CARD_TEXT, gap: 1.6, max: 3, icons: PHONE_MAIL_WEB, motion: m('fade', 0.5) },
      { role: 'brand', x: 0.07, y: 0.8, w: 0.86, size: CARD_BRAND, weight: 700, upper: true, tracking: 0.1, motion: m('fade', 0.6) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'subline', x: 0.07, y: 0.2, w: 0.5, size: 0.07, weight: 400, font: 'editorial', motion: m('fade', 0) },
        { role: 'meta', x: 0.64, y: 0.3, w: 0.3, size: CARD_TEXT, weight: 600, motion: m('fade', 0.1) },
        { role: 'brand', x: 0.07, y: 0.8, w: 0.86, size: CARD_BRAND, weight: 700, upper: true, tracking: 0.1, motion: m('fade', 0.2) },
      ],
    }],
  },

  {
    key: 'pilot-card-bold',
    label: 'Red Band Card',
    desc: 'The name in heavy capitals across a red band on yellow, with a blue slab bleeding off the corner',
    use: 'business',
    direction: 'bold',
    iconSet: 'lucide',
    industries: ['Retail & Commerce', 'Food & Hospitality', 'Arts & Entertainment'],
    styles: ['bold', 'high-contrast', 'street'],
    tags: ['business card', 'bold', 'loud', 'shop', 'events', 'food', 'two-sided'],
    mood: 'bold', scheme: 'light', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.2 },
    /*
     * Sun-and-ink: yellow ground, a red band carrying the name in white, and
     * one blue slab off the bottom-right corner. The band does the same job on
     * the back with the business's one-line promise in it.
     */
    look: { palette: 'sun-and-ink', type: 'impact' },
    shapes: [
      { kind: 'rect', x: 0, y: 0.1, w: 1, h: 0.46, tone: 'primary' },
      { kind: 'rect', x: 0.8, y: 0.62, w: 0.2, h: 0.38, tone: 'secondary' },
    ],
    slots: [
      { role: 'headline', x: 0.07, y: 0.17, w: 0.86, size: 0.14, weight: 800, upper: true, tracking: -0.02, on: 'primary', font: 'heavy', motion: m('slide-right', 0, 0.55) },
      { role: 'eyebrow', x: 0.07, y: 0.4, w: 0.86, size: 0.045, weight: 700, upper: true, tracking: 0.1, on: 'primary', font: 'condensed', motion: m('fade', 0.3) },
      { role: 'brand', x: 0.07, y: 0.66, w: 0.66, size: 0.05, weight: 800, upper: true, tracking: 0.02, motion: m('fade', 0.45) },
      { role: 'contact', x: 0.07, y: 0.78, w: 0.68, size: CARD_TEXT, weight: 700, direction: 'row', max: 2, icons: [L('phone'), HANDLE], motion: m('fade', 0.6) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'subline', x: 0.07, y: 0.2, w: 0.86, size: 0.1, weight: 800, upper: true, tracking: -0.01, on: 'primary', font: 'heavy', motion: m('slide-right', 0, 0.55) },
        { role: 'brand', x: 0.07, y: 0.66, w: 0.66, size: 0.05, weight: 800, upper: true, tracking: 0.02, motion: m('fade', 0.3) },
        { role: 'meta', x: 0.07, y: 0.78, w: 0.68, size: CARD_TEXT, weight: 700, motion: m('fade', 0.45) },
      ],
    }],
  },

  {
    key: 'pilot-card-contemporary',
    label: 'Offset Tile Card',
    desc: 'Right-set name over a fine grid, two colour tiles offset bottom left; a QR code on the back',
    use: 'business',
    direction: 'contemporary',
    iconSet: 'lucide',
    industries: ['Technology & Media', 'Arts & Entertainment', 'Professional Services'],
    styles: ['modern', 'tech', 'youth'],
    tags: ['business card', 'contemporary', 'creator', 'agency', 'startup', 'qr code', 'two-sided'],
    mood: 'street', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.1 },
    /*
     * Near-black with a mint grid at 0.06, a pink tile and a yellow one
     * stepped off it. The name is set to the right-hand column and the tiles
     * hold the left, so the card balances on the diagonal. The front carries
     * only the handle; the back puts the full contact beside a scannable code.
     */
    look: {
      palette: 'electric-lagos',
      type: 'modern',
      pattern: { role: 'secondary', key: 'grid', opacity: 0.06, scale: 0.08 },
    },
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.6, w: 0.18, h: 0.27, tone: 'primary' },
      { kind: 'rect', x: 0.25, y: 0.74, w: 0.08, h: 0.13, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.12, w: 0.62, size: CARD_BRAND, weight: 700, motion: m('fade', 0) },
      { role: 'eyebrow', x: 0.4, y: 0.34, w: 0.54, size: CARD_TEXT, align: 'right', tone: 'secondary', font: 'mono', motion: m('fade', 0.2) },
      { role: 'headline', x: 0.4, y: 0.42, w: 0.54, size: 0.09, weight: 700, tracking: -0.02, align: 'right', font: 'grotesk', motion: m('slide-left', 0.3, 0.6) },
      { role: 'meta', x: 0.58, y: 0.7, w: 0.36, size: CARD_TEXT, tone: 'muted', font: 'mono', icons: [HANDLE], motion: m('fade', 0.5) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'qr', x: 0.07, y: 0.12, w: 0.22, motion: m('pop', 0) },
        { role: 'contact', x: 0.36, y: 0.14, w: 0.58, size: CARD_TEXT, gap: 1.5, max: 3, icons: PHONE_MAIL_WEB, motion: m('fade', 0.2) },
        { role: 'brand', x: 0.36, y: 0.64, w: 0.58, size: CARD_BRAND, weight: 700, motion: m('fade', 0.35) },
      ],
    }],
  },

  {
    key: 'pilot-card-playful',
    label: 'Butter Blob Card',
    desc: 'The name on a soft butter-yellow shape, a lavender sun and a coral dot over polka dots',
    use: 'business',
    direction: 'playful',
    iconSet: 'lucide',
    industries: ['Food & Hospitality', 'Education & Community', 'Home & Personal Services'],
    styles: ['playful', 'soft', 'youth'],
    tags: ['business card', 'playful', 'cafe', 'bakery', 'kids', 'crafts', 'two-sided'],
    mood: 'warm', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.08 },
    /*
     * Butter and lavender with a coral dot: friendly without being childish.
     * The rounded panel holds the name on the front and the business's line
     * on the back; the dots stay at 0.1 so they never fight the type.
     */
    look: {
      palette: 'butter-lavender',
      type: 'warmth',
      pattern: { role: 'secondary', key: 'dots', opacity: 0.1, scale: 0.05 },
    },
    shapes: [
      { kind: 'circle', cx: 0.92, cy: 0.18, r: 0.28, tone: 'secondary' },
      { kind: 'rect', x: 0.05, y: 0.3, w: 0.6, h: 0.38, tone: 'primary', radius: 0.16 },
      { kind: 'circle', cx: 0.78, cy: 0.82, r: 0.08, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.12, w: 0.62, size: CARD_BRAND, weight: 700, motion: m('fade', 0) },
      { role: 'headline', x: 0.09, y: 0.36, w: 0.46, size: 0.1, weight: 600, on: 'primary', font: 'soft', motion: m('pop', 0.2, 0.55) },
      { role: 'eyebrow', x: 0.09, y: 0.555, w: 0.5, size: CARD_TEXT, weight: 600, on: 'primary', motion: m('fade', 0.4) },
      { role: 'contact', x: 0.07, y: 0.76, w: 0.6, size: CARD_TEXT, direction: 'row', max: 2, icons: [L('phone'), L('map-pin')], motion: m('fade', 0.55) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.07, y: 0.12, w: 0.62, size: CARD_BRAND, weight: 700, motion: m('fade', 0) },
        { role: 'subline', x: 0.09, y: 0.38, w: 0.5, size: 0.065, weight: 600, on: 'primary', font: 'soft', motion: m('pop', 0.2, 0.55) },
        { role: 'meta', x: 0.07, y: 0.76, w: 0.6, size: CARD_TEXT, weight: 600, icons: [HANDLE], motion: m('fade', 0.4) },
      ],
    }],
  },

  {
    key: 'pilot-card-industry',
    label: 'Clinic Appointment Card',
    desc: 'A clinic card: the practice on a dark band, the practitioner, a booking panel; hours and the next appointment on the back',
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
     * book: the practice, the practitioner and their specialty, the booking
     * line and the registration number patients are entitled to see. The
     * back is an appointment card: opening hours, and a ruled box to write
     * the next visit in. The box is the same on both sides (front and back
     * share geometry), the booking prompt in it on one, the appointment on
     * the other. It is drawn as four hairlines rather than a tint, so no
     * colour change can sit under its words. A plain plus on the band, not a
     * red cross, which is a protected emblem.
     */
    look: {
      palette: 'glacier',
      type: 'modern',
      pattern: { role: 'primary', key: 'grid', opacity: 0.08, scale: 0.06, zone: 'bottom' },
    },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.27, tone: 'ink' },
      { kind: 'rect', x: 0.86, y: 0.085, w: 0.02, h: 0.1, tone: 'white' },
      { kind: 'rect', x: 0.8385, y: 0.119, w: 0.063, h: 0.032, tone: 'white' },
      { kind: 'rect', x: 0.6, y: 0.36, w: 0.34, h: 0.004, tone: 'primary' },
      { kind: 'rect', x: 0.6, y: 0.816, w: 0.34, h: 0.004, tone: 'primary' },
      { kind: 'rect', x: 0.6, y: 0.36, w: 0.0025, h: 0.46, tone: 'primary' },
      { kind: 'rect', x: 0.9375, y: 0.36, w: 0.0025, h: 0.46, tone: 'primary' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.1, w: 0.7, size: 0.05, weight: 700, on: 'ink', motion: m('fade', 0) },
      { role: 'eyebrow', x: 0.07, y: 0.175, w: 0.7, size: CARD_TEXT, tone: 'muted', on: 'ink', motion: m('fade', 0.15) },
      { role: 'headline', x: 0.07, y: 0.34, w: 0.5, size: 0.075, weight: 700, font: 'grotesk', motion: m('rise', 0.25, 0.5) },
      { role: 'contact', x: 0.07, y: 0.54, w: 0.5, size: CARD_TEXT, gap: 1.6, max: 3, icons: [L('phone'), L('map-pin'), L('globe')], motion: m('fade', 0.4) },
      { role: 'cta', x: 0.63, y: 0.42, w: 0.29, size: CARD_TEXT, weight: 700, treatment: 'pill', motion: m('pop', 0.55) },
      { role: 'meta', x: 0.63, y: 0.62, w: 0.29, size: CARD_TEXT, motion: m('fade', 0.65) },
    ],
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.07, y: 0.1, w: 0.7, size: 0.05, weight: 700, on: 'ink', motion: m('fade', 0) },
        { role: 'eyebrow', x: 0.07, y: 0.175, w: 0.7, size: CARD_TEXT, tone: 'muted', on: 'ink', motion: m('fade', 0.15) },
        { role: 'services', x: 0.07, y: 0.38, w: 0.5, size: CARD_TEXT, gap: 1.6, bullet: 'none', max: 3, icons: [L('clock'), L('clock'), L('phone')], motion: m('fade', 0.3) },
        { role: 'subline', x: 0.63, y: 0.42, w: 0.29, size: 0.045, weight: 700, motion: m('fade', 0.45) },
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
    photoSubject: 'beauty',
    /*
     * A mount, not a crop: opaque plum on four sides leaves a window of about
     * 40% of the post, and the duotone carries the plum into the picture so it
     * belongs to the frame. One lilac hairline sits on the window's sill.
     */
    look: { palette: 'plum-mono', type: 'luxury', duotone: ['ground', 'highlight'] },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.1, h: 1, tone: 'base' },
      { kind: 'rect', x: 0.9, y: 0, w: 0.1, h: 1, tone: 'base' },
      { kind: 'rect', x: 0.1, y: 0, w: 0.8, h: 0.1, tone: 'base' },
      { kind: 'rect', x: 0.1, y: 0.6, w: 0.8, h: 0.4, tone: 'base' },
      { kind: 'rect', x: 0.1, y: 0.6, w: 0.8, h: 0.003, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.035, w: 0.8, size: 0.028, weight: 600, upper: true, tracking: 0.14, align: 'center', motion: m('fade', 0) },
      { role: 'eyebrow', x: 0.15, y: 0.64, w: 0.7, size: 0.026, upper: true, tracking: 0.3, align: 'center', tone: 'secondary', font: 'mono', motion: m('fade', 0.3) },
      { role: 'headline', x: 0.1, y: 0.68, w: 0.8, size: 0.085, weight: 400, align: 'center', font: 'serif', motion: m('rise', 0.45, 0.7) },
      { role: 'subline', x: 0.15, y: 0.87, w: 0.7, size: 0.03, align: 'center', tone: 'muted', motion: m('fade', 0.8) },
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
     * of solid forest green holding a serif title against a brass rule. The
     * duotone ties the picture to the brass.
     */
    look: { palette: 'forest-brass', type: 'editorial', duotone: ['ground', 'primary'] },
    shapes: [
      { kind: 'rect', x: 0.52, y: 0.5, w: 0.48, h: 0.5, tone: 'base' },
      { kind: 'rect', x: 0.52, y: 0.5, w: 0.006, h: 0.5, tone: 'primary' },
    ],
    slots: [
      { role: 'brand', x: 0.06, y: 0.05, w: 0.7, size: 0.026, weight: 700, upper: true, tracking: 0.08, motion: m('fade', 0) },
      { role: 'eyebrow', x: 0.56, y: 0.55, w: 0.38, size: 0.024, upper: true, tracking: 0.22, tone: 'accent', font: 'mono', motion: m('wipe', 0.2, 0.5) },
      { role: 'headline', x: 0.56, y: 0.6, w: 0.38, size: 0.09, weight: 400, font: 'editorial', motion: m('mask-up', 0.35, 0.7) },
      { role: 'subline', x: 0.56, y: 0.83, w: 0.38, size: 0.028, tone: 'muted', motion: m('fade', 0.7) },
    ],
  },

  {
    key: 'pilot-ig-bold',
    label: 'Crimson Statement Post',
    desc: 'Type only: the news in heavy capitals on a crimson block, the detail, a teal call to act and an amber dot beneath',
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
     * sixty per cent with the line in white Archivo Black, cream takes the
     * rest with the detail and a teal call to act, and one amber dot
     * balances the block from the opposite corner.
     */
    look: { palette: 'poppy-field', type: 'impact' },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.62, tone: 'primary' },
      { kind: 'circle', cx: 0.84, cy: 0.8, r: 0.1, tone: 'highlight' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.07, y: 0.045, w: 0.86, size: 0.032, weight: 700, upper: true, tracking: 0.14, on: 'primary', font: 'condensed', motion: m('fade', 0) },
      { role: 'headline', x: 0.07, y: 0.1, w: 0.86, size: 0.19, weight: 800, upper: true, tracking: -0.03, on: 'primary', font: 'heavy', motion: m('mask-up', 0.15, 0.7) },
      { role: 'subline', x: 0.07, y: 0.67, w: 0.56, size: 0.036, weight: 600, motion: m('fade', 0.6) },
      { role: 'cta', x: 0.07, y: 0.8, w: 0.5, size: 0.036, weight: 800, upper: true, tracking: 0.06, treatment: 'pill', tone: 'secondary', icons: [HANDLE], motion: m('pop', 0.8, 0.5) },
      { role: 'brand', x: 0.07, y: 0.06, w: 0.55, size: 0.03, weight: 800, upper: true, tracking: 0.1, fromBottom: true, motion: m('fade', 1) },
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
     * element in the grid, not the background.
     */
    look: { palette: 'deep-sea', type: 'modern' },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.44, h: 1, tone: 'base' },
      { kind: 'rect', x: 0.93, y: 0, w: 0.07, h: 1, tone: 'base' },
      { kind: 'rect', x: 0.44, y: 0, w: 0.49, h: 0.07, tone: 'base' },
      { kind: 'rect', x: 0.44, y: 0.47, w: 0.49, h: 0.53, tone: 'base' },
      { kind: 'rect', x: 0.36, y: 0.4, w: 0.14, h: 0.11, tone: 'primary' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.07, y: 0.56, w: 0.6, size: 0.026, upper: true, tracking: 0.2, tone: 'secondary', font: 'mono', motion: m('fade', 0.2) },
      { role: 'headline', x: 0.07, y: 0.6, w: 0.86, size: 0.1, weight: 700, tracking: -0.03, font: 'grotesk', motion: m('rise', 0.35, 0.6) },
      { role: 'subline', x: 0.07, y: 0.83, w: 0.56, size: 0.03, tone: 'muted', motion: m('fade', 0.6) },
      { role: 'cta', x: 0.66, y: 0.83, w: 0.27, size: 0.03, weight: 700, upper: true, treatment: 'pill', tone: 'accent', motion: m('pop', 0.8) },
      { role: 'brand', x: 0.07, y: 0.05, w: 0.5, size: 0.026, weight: 700, upper: true, tracking: 0.12, fromBottom: true, motion: m('fade', 1) },
    ],
  },

  {
    key: 'pilot-ig-industry',
    label: 'Dish of the Day Post',
    desc: 'A restaurant post: the plate above, then the dish, its price in naira, what is in it and how to order',
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
     * the facts sit on cola-brown, and the order call is a yellow pill
     * beside the dish name.
     */
    look: { palette: 'cola-nut', type: 'warmth' },
    shapes: [
      { kind: 'rect', x: 0, y: 0.56, w: 1, h: 0.44, tone: 'base' },
    ],
    slots: [
      { role: 'brand', x: 0.06, y: 0.045, w: 0.7, size: 0.028, weight: 700, motion: m('fade', 0) },
      { role: 'cta', x: 0.7, y: 0.6, w: 0.24, size: 0.03, weight: 800, upper: true, treatment: 'pill', tone: 'highlight', motion: m('pop', 0.9, 0.5) },
      { role: 'eyebrow', x: 0.06, y: 0.6, w: 0.6, size: 0.026, weight: 700, upper: true, tracking: 0.2, tone: 'accent', motion: m('fade', 0.2) },
      { role: 'headline', x: 0.06, y: 0.64, w: 0.6, size: 0.08, weight: 600, font: 'soft', motion: m('rise', 0.3, 0.6) },
      { role: 'price', x: 0.06, y: 0.79, w: 0.6, size: 0.034, weight: 600, max: 1, motion: m('rise', 0.55) },
      { role: 'subline', x: 0.06, y: 0.855, w: 0.6, size: 0.028, tone: 'muted', motion: m('fade', 0.7) },
      { role: 'contact', x: 0.06, y: 0.915, w: 0.86, size: 0.026, direction: 'row', max: 2, tone: 'muted', icons: [L('phone'), L('map-pin')], motion: m('fade', 0.8) },
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
     * line, set small for a post and held to the left third under a white
     * hairline; the name is the only other word.
     */
    look: { palette: 'graphite', type: 'modern' },
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.71, w: 0.08, h: 0.003, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.06, w: 0.7, size: 0.026, weight: 600, upper: true, tracking: 0.06, motion: m('fade', 0) },
      { role: 'headline', x: 0.07, y: 0.74, w: 0.5, size: 0.074, weight: 500, tracking: -0.01, font: 'grotesk', motion: m('fade', 0.3, 0.8) },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ── 48-sheet billboards (billboard-48-sheet, 3600 x 1800) ──────────────
  // ═══════════════════════════════════════════════════════════════════════

  {
    key: 'pilot-bb-bold',
    label: 'Navy Panel Billboard',
    desc: 'Three heavy words on a navy panel, an orange slash, and the photograph filling the right',
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
     * first; the photograph read second; an orange slash parting them; and
     * the call to act underlined in orange. The name sits small at the top
     * of the panel.
     */
    look: { palette: 'royal-orange', type: 'impact', duotone: ['ground', 'secondary'] },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.55, h: 1, tone: 'base' },
      { kind: 'stripe', x: 0.6, y: 0, w: 0.025, h: 1, angle: 4, tone: 'primary' },
    ],
    slots: [
      { role: 'brand', x: 0.05, y: 0.06, w: 0.48, size: 0.045, weight: 700, upper: true, tracking: 0.2, motion: m('fade', 0) },
      { role: 'headline', x: 0.05, y: 0.14, w: 0.48, size: 0.2, weight: 800, upper: true, tracking: -0.02, font: 'heavy', motion: m('slide-right', 0.2, 0.6) },
      { role: 'cta', x: 0.05, y: 0.72, w: 0.48, size: 0.06, weight: 800, upper: true, tracking: 0.04, treatment: 'underline', motion: m('pop', 0.6, 0.5) },
    ],
  },

  {
    key: 'pilot-bb-minimal',
    label: 'One Line Billboard',
    desc: 'Type only: one line in navy, centred on a pale sheet, a single orange dot above it',
    use: 'marketing',
    direction: 'minimal',
    industries: ['Professional Services', 'Technology & Media', 'Health & Wellness'],
    styles: ['minimal', 'swiss', 'modern'],
    tags: ['billboard', '48-sheet', 'outdoor', 'advertising', 'large format', 'typographic', 'brand'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.04 },
    /*
     * The confident board: one line, the name, and nothing else. A single
     * orange dot gives the eye somewhere to land before it reads.
     */
    look: { palette: 'harbour-blue', type: 'statement' },
    shapes: [
      { kind: 'circle', cx: 0.5, cy: 0.24, r: 0.03, tone: 'secondary' },
    ],
    slots: [
      { role: 'headline', x: 0.1, y: 0.36, w: 0.8, size: 0.2, weight: 800, tracking: -0.03, align: 'center', font: 'heavy', motion: m('rise', 0, 0.7) },
      { role: 'brand', x: 0.25, y: 0.06, w: 0.5, size: 0.05, weight: 700, upper: true, tracking: 0.2, align: 'center', fromBottom: true, motion: m('fade', 0.5) },
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
    photoSubject: 'food',
    /*
     * A hotel or property board: the photograph mounted inside a deep green
     * margin rather than bled, a centred serif line, a short sage rule, and
     * the address. Quiet enough to be read as an invitation, not a shout.
     */
    look: { palette: 'forest-mono', type: 'luxury', duotone: ['ground', 'highlight'] },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.5, h: 1, tone: 'base' },
      { kind: 'rect', x: 0.5, y: 0, w: 0.5, h: 0.08, tone: 'base' },
      { kind: 'rect', x: 0.5, y: 0.92, w: 0.5, h: 0.08, tone: 'base' },
      { kind: 'rect', x: 0.95, y: 0.08, w: 0.05, h: 0.84, tone: 'base' },
      { kind: 'rect', x: 0.22, y: 0.69, w: 0.06, h: 0.004, tone: 'primary' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.06, y: 0.28, w: 0.38, size: 0.035, upper: true, tracking: 0.3, align: 'center', tone: 'secondary', font: 'mono', motion: m('fade', 0) },
      { role: 'headline', x: 0.06, y: 0.36, w: 0.38, size: 0.13, weight: 400, align: 'center', font: 'serif', motion: m('rise', 0.2, 0.8) },
      { role: 'brand', x: 0.05, y: 0.72, w: 0.4, size: 0.045, weight: 600, upper: true, tracking: 0.12, align: 'center', motion: m('fade', 0.6) },
      { role: 'meta', x: 0.06, y: 0.82, w: 0.38, size: 0.03, align: 'center', tone: 'muted', motion: m('fade', 0.8) },
    ],
  },

  {
    key: 'pilot-bb-contemporary',
    label: 'Condensed Sky Billboard',
    desc: 'The photograph almost whole, the line in tall condensed capitals top right, name and number on a foot band',
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
     * nearly four fifths of the board; the words are Bebas Neue, so a short
     * line can stand a third of the board high and still fit; the foot band
     * carries the only two things a driver needs after that.
     */
    look: { palette: 'indigo-dye', type: 'street', duotone: ['ground', 'secondary'] },
    shapes: [
      { kind: 'rect', x: 0, y: 0.78, w: 1, h: 0.22, tone: 'base' },
      { kind: 'rect', x: 0, y: 0.78, w: 0.03, h: 0.22, tone: 'secondary' },
    ],
    slots: [
      { role: 'headline', x: 0.4, y: 0.08, w: 0.55, size: 0.3, weight: 700, upper: true, align: 'right', font: 'condensed', motion: m('mask-up', 0, 0.7) },
      { role: 'brand', x: 0.05, y: 0.84, w: 0.5, size: 0.06, weight: 700, upper: true, tracking: 0.1, motion: m('fade', 0.4) },
      { role: 'contact', x: 0.58, y: 0.84, w: 0.37, size: 0.06, weight: 700, direction: 'row', max: 1, tone: 'accent', icons: [HANDLE], motion: m('fade', 0.6) },
    ],
  },

  {
    key: 'pilot-bb-industry',
    label: 'Delivery Service Billboard',
    desc: 'A logistics board: the rider or van fills it, the delivery promise and how to book sit on a navy card',
    use: 'industry',
    direction: 'industry',
    industries: ['Logistics & Mobility'],
    styles: ['corporate', 'bold', 'modern'],
    tags: ['billboard', '48-sheet', 'outdoor', 'delivery', 'logistics', 'courier', 'dispatch', 'haulage', 'large format'],
    mood: 'bold', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.3 },
    photoLed: true,
    photoSubject: 'work',
    /*
     * Built from what a delivery business is asked before anyone books: what
     * it promises, and how to book (with where it goes, in the same line).
     * Three things a driver can read in three seconds: the promise large and
     * right-set on a navy card floating over the photograph (a rider, a van,
     * a loading bay), the booking line under it, the company name at the
     * foot. Coral and teal, the colours of a dispatch board.
     */
    look: { palette: 'ink-coral', type: 'modern', duotone: ['ground', 'secondary'] },
    shapes: [
      { kind: 'rect', x: 0.52, y: 0.12, w: 0.44, h: 0.76, tone: 'base' },
      { kind: 'rect', x: 0.56, y: 0.27, w: 0.08, h: 0.012, tone: 'primary' },
    ],
    slots: [
      { role: 'headline', x: 0.56, y: 0.34, w: 0.36, size: 0.16, weight: 700, tracking: -0.02, align: 'right', font: 'grotesk', motion: m('rise', 0.1, 0.6) },
      { role: 'cta', x: 0.56, y: 0.78, w: 0.36, size: 0.045, weight: 700, upper: true, align: 'right', treatment: 'pill', tone: 'accent', motion: m('pop', 0.6) },
      { role: 'brand', x: 0.04, y: 0.05, w: 0.44, size: 0.05, weight: 800, upper: true, tracking: 0.02, fromBottom: true, motion: m('fade', 0.8) },
    ],
  },

  {
    key: 'pilot-bb-editorial',
    label: 'Clay Corner Billboard',
    desc: 'A serif headline in an indigo corner block, the photograph running round it in clay duotone',
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
     * it, and adire-style resist dots held to the foot of the board at 0.1.
     */
    look: {
      palette: 'adire-clay',
      type: 'editorial',
      duotone: ['ground', 'primary'],
      pattern: { role: 'highlight', key: 'resist-dots', opacity: 0.1, scale: 0.08, zone: 'bottom' },
    },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.55, h: 0.62, tone: 'base' },
      { kind: 'rect', x: 0.05, y: 0.62, w: 0.12, h: 0.012, tone: 'primary' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.05, y: 0.07, w: 0.45, size: 0.035, upper: true, tracking: 0.2, tone: 'accent', font: 'mono', motion: m('fade', 0) },
      { role: 'headline', x: 0.05, y: 0.14, w: 0.47, size: 0.15, weight: 400, tracking: -0.01, font: 'editorial', motion: m('mask-up', 0.2, 0.8) },
      { role: 'brand', x: 0.56, y: 0.06, w: 0.4, size: 0.05, weight: 700, upper: true, tracking: 0.08, fromBottom: true, motion: m('fade', 0.8) },
    ],
  },
];
