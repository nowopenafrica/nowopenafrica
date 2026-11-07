/**
 * The Template Catalogue layouts (2026-10-29).
 *
 * Built from the NowOpen Studio "Template catalogue" design canvas: its 73
 * concepts across branding, campaigns, social, banners and print.
 *
 * ── WHY THESE ARE WRITTEN, NOT IMPORTED ──────────────────────────────────
 *
 * The canvas artboards were run through the Template Manager importer first.
 * 88 of 90 converted, and they arrived as three or four slots reading "Your
 * headline here" — because the importer correctly drops an artboard's words
 * and colours, and with them most of what made each concept a specific
 * deliverable. Published, they would have been 88 cards that look alike.
 *
 * Each layout here keeps a concept's composition and its job, and gains what
 * the slot model offers that an artboard cannot carry: its own demonstration
 * copy (create/sampleCopy.ts), a canvas (deliverables.ts) and all eleven
 * styles. They are the things people actually order — a letterhead, a hang
 * tag, a roll-up, a 728x90, an invoice — rather than more square posts.
 *
 * A `look` PatternSpec is written `{ role, key, ... }`, never `{ key, ... }`:
 * scripts/audit-templates.mjs finds templates with the crude pattern
 * `{ key: '...'`, and a pattern whose key came first was counted as a
 * template with no slots.
 *
 * Spread into DESIGN_TEMPLATES, so nothing downstream knows they live here.
 * Types only are imported from designTemplates.ts: a value import would be a
 * cycle, and this module would read its constants before they exist.
 */

import type { DesignTemplate } from '../designTemplates';

/* The same named steps designTemplates.ts uses, for the same reason. */
const SUB = 0.036;
const EYEBROW = 0.024;
const META = 0.022;

export const CATALOGUE_TEMPLATES: DesignTemplate[] = [
  // ── Branding ─────────────────────────────────────────────────────────

  {
    key: 'brand-intro-reveal',
    label: 'Brand Reveal',
    desc: 'The name, centred and large, inside an orbit — a launch, not an ad',
    use: 'business',
    styles: ['premium', 'minimal', 'luxury'], tags: ['brand launch', 'introducing', 'rebrand', 'new brand', 'logo reveal'],
    mood: 'luxe', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'spotlight', intensity: 0.55, vignette: 0.3 },
    /*
     * A deep violet ground, a serif name, and film grain over all of it. No
     * ground gradient, on purpose: not one dark palette has an accent that
     * carries its own ink at 4.5:1, so any gradient toward an accent would put
     * light type on a light stop. The depth comes from the grain, the two
     * orbits and, behind a photograph, the duotone.
     */
    look: {
      palette: 'midnight-silk',
      type: 'luxury',
      pattern: { role: 'ink', key: 'grain', opacity: 0.09, scale: 0.18 },
      duotone: ['ground', 'highlight'],
    },
    camera: { move: 'push', amount: 0.03 },
    shapes: [
      { kind: 'ring', cx: 0.5, cy: 0.4, r: 0.3, tone: 'accent', alpha: 0.5, thickness: 0.004 },
      { kind: 'ring', cx: 0.5, cy: 0.4, r: 0.36, tone: 'white', alpha: 0.12, thickness: 0.002 },
    ],
    slots: [
      { role: 'eyebrow', x: 0.1, y: 0.12, w: 0.8, size: EYEBROW, upper: true, tracking: 0.34, align: 'center', motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'brand', x: 0.1, y: 0.35, w: 0.8, size: 0.1, weight: 800, tracking: -0.04, align: 'center', motion: { in: 'scale-out', at: 0.3, dur: 0.8, ease: 'spring' } },
      { role: 'headline', x: 0.12, y: 0.64, w: 0.76, size: 0.05, weight: 500, align: 'center', motion: { in: 'rise', at: 0.8, dur: 0.6 } },
      { role: 'subline', x: 0.15, y: 0.75, w: 0.7, size: 0.03, align: 'center', tone: 'muted', motion: { in: 'fade', at: 1, dur: 0.5 } },
      { role: 'meta', x: 0.1, y: 0.07, w: 0.8, size: META, align: 'center', fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1.2, dur: 0.5 } },
    ],
  },

  {
    key: 'brand-guidelines-cover',
    look: { palette: 'terracotta-clay', type: 'editorial' },
    label: 'Brand Guidelines Cover',
    desc: 'Title page for a brand book: statement left, a full-height colour field right',
    use: 'business',
    styles: ['corporate', 'swiss', 'minimal'], tags: ['brand guidelines', 'brand book', 'identity', 'style guide', 'deck'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.08 },
    shapes: [
      { kind: 'rect', x: 0.64, y: 0, w: 0.36, h: 1, tone: 'secondary' },
      { kind: 'rect', x: 0.64, y: 0.78, w: 0.36, h: 0.22, tone: 'highlight' },
      { kind: 'rect', x: 0.06, y: 0.3, w: 0.06, h: 0.008, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.06, y: 0.12, w: 0.5, size: 0.03, weight: 700, upper: true, tracking: 0.2, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.06, y: 0.36, w: 0.52, size: 0.11, weight: 800, tracking: -0.04, motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'eyebrow', x: 0.06, y: 0.7, w: 0.5, size: EYEBROW, upper: true, tracking: 0.24, tone: 'secondary', motion: { in: 'wipe', at: 0.5, dur: 0.5 } },
      { role: 'meta', x: 0.06, y: 0.1, w: 0.5, size: META, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.7, dur: 0.4 } },
    ],
  },

  {
    key: 'letterhead-edge',
    look: { palette: 'harmattan-sand', type: 'modern' },
    label: 'Edge Letterhead',
    desc: 'A4 letterhead: a colour edge, the name top-left and contact set in a column',
    use: 'business',
    styles: ['corporate', 'minimal', 'modern'], tags: ['letterhead', 'stationery', 'letter', 'a4', 'office'],
    industries: ['Professional Services'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.04 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.014, h: 1, tone: 'accent' },
      { kind: 'rect', x: 0.08, y: 0.955, w: 0.84, h: 0.0015, tone: 'ink', alpha: 0.2 },
      { kind: 'rect', x: 0.014, y: 0.7, w: 0.006, h: 0.3, tone: 'secondary' },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.05, w: 0.5, size: 0.036, weight: 800, tracking: -0.01, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.08, y: 0.078, w: 0.5, size: 0.016, upper: true, tracking: 0.22, tone: 'secondary', motion: { in: 'fade', at: 0.1, dur: 0.4 } },
      { role: 'contact', x: 0.6, y: 0.05, w: 0.32, size: 0.015, align: 'right', tone: 'muted', max: 3, motion: { in: 'fade', at: 0.2, dur: 0.4 } },
      { role: 'headline', x: 0.08, y: 0.2, w: 0.6, size: 0.03, weight: 700, motion: { in: 'rise', at: 0.3, dur: 0.5 } },
      { role: 'subline', x: 0.08, y: 0.235, w: 0.7, size: 0.018, tone: 'muted', motion: { in: 'fade', at: 0.4, dur: 0.4 } },
      { role: 'meta', x: 0.08, y: 0.03, w: 0.84, size: 0.013, align: 'center', fromBottom: true, motion: { in: 'fade', at: 0.5, dur: 0.4 } },
    ],
  },

  {
    key: 'email-signature-bar',
    look: { palette: 'kente-field', type: 'modern' },
    label: 'Email Signature',
    desc: 'Name, role and company beside a colour rule; contact on the right',
    use: 'business',
    styles: ['corporate', 'minimal', 'modern'], tags: ['email signature', 'signature', 'email', 'contact', 'stationery'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.04 },
    shapes: [
      { kind: 'rect', x: 0.04, y: 0.2, w: 0.007, h: 0.6, tone: 'accent' },
    ],
    slots: [
      { role: 'headline', x: 0.07, y: 0.17, w: 0.52, size: 0.16, weight: 700, tracking: -0.01, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.07, y: 0.45, w: 0.52, size: 0.08, tone: 'accent', motion: { in: 'fade', at: 0.1, dur: 0.4 } },
      { role: 'brand', x: 0.07, y: 0.62, w: 0.52, size: 0.085, weight: 600, motion: { in: 'fade', at: 0.2, dur: 0.4 } },
      { role: 'contact', x: 0.62, y: 0.2, w: 0.34, size: 0.072, align: 'right', tone: 'muted', max: 3, motion: { in: 'fade', at: 0.3, dur: 0.4 } },
    ],
  },

  {
    key: 'shopfront-fascia',
    look: { palette: 'royal-orange', type: 'impact' },
    label: 'Shopfront Sign',
    desc: 'Fascia proportions: the name across the board, trade above, contact right',
    use: 'business',
    styles: ['bold', 'modern', 'high-contrast'], tags: ['signage', 'shop sign', 'fascia', 'storefront', 'signboard'],
    industries: ['Retail & Commerce', 'Local & Everyday Business'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 90, intensity: 0.7 },
    shapes: [
      { kind: 'rect', x: 0, y: 0.88, w: 0.7, h: 0.12, tone: 'primary' },
      { kind: 'rect', x: 0.7, y: 0.88, w: 0.3, h: 0.12, tone: 'secondary' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.05, y: 0.14, w: 0.5, size: 0.07, upper: true, tracking: 0.3, tone: 'muted', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.05, y: 0.32, w: 0.58, size: 0.2, weight: 800, upper: true, tracking: -0.03, motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'contact', x: 0.68, y: 0.3, w: 0.27, size: 0.06, align: 'right', tone: 'muted', max: 3, motion: { in: 'fade', at: 0.5, dur: 0.4 } },
    ],
  },

  {
    key: 'product-label-arch',
    look: { palette: 'peach-sky', type: 'editorial', pattern: { key: 'dots', role: 'secondary', opacity: 0.1, scale: 0.06, zone: 'left' } },
    label: 'Product Label',
    desc: 'A rounded colour panel beside the product name, ingredients and batch line',
    use: 'industry',
    styles: ['organic', 'soft', 'premium'], tags: ['label', 'packaging', 'product', 'jar', 'bottle', 'skincare'],
    industries: ['Fashion & Beauty', 'Food & Hospitality', 'Health & Wellness'],
    mood: 'warm', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.14 },
    shapes: [
      { kind: 'rect', x: 0.05, y: 0.07, w: 0.34, h: 0.86, tone: 'accent', radius: 0.16 },
    ],
    slots: [
      { role: 'brand', x: 0.45, y: 0.1, w: 0.5, size: 0.03, weight: 700, upper: true, tracking: 0.22, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.45, y: 0.2, w: 0.5, size: 0.085, weight: 500, font: 'serif', motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'subline', x: 0.45, y: 0.47, w: 0.48, size: 0.03, tone: 'muted', motion: { in: 'fade', at: 0.4, dur: 0.4 } },
      { role: 'meta', x: 0.45, y: 0.6, w: 0.48, size: 0.024, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 0.5, dur: 0.4 } },
      { role: 'contact', x: 0.45, y: 0.08, w: 0.5, size: 0.022, direction: 'row', max: 2, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
    ],
  },

  {
    key: 'hang-tag',
    look: { palette: 'baobab', type: 'luxury', pattern: { key: 'mud-marks', role: 'primary', opacity: 0.07, scale: 0.18, zone: 'bottom' } },
    label: 'Hang Tag',
    desc: 'A swing tag with its punch hole: brand, collection, price and care line',
    use: 'industry',
    styles: ['fashion', 'luxury', 'minimal'], tags: ['hang tag', 'swing tag', 'clothing', 'price tag', 'packaging'],
    industries: ['Fashion & Beauty', 'Retail & Commerce'],
    mood: 'luxe', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.4 },
    shapes: [
      { kind: 'ring', cx: 0.5, cy: 0.09, r: 0.045, tone: 'white', alpha: 0.9, thickness: 0.01 },
      { kind: 'rect', x: 0.3, y: 0.2, w: 0.4, h: 0.003, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.26, w: 0.8, size: 0.065, weight: 700, upper: true, tracking: 0.3, align: 'center', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.1, y: 0.41, w: 0.8, size: 0.12, font: 'editorial', align: 'center', motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'price', x: 0.15, y: 0.66, w: 0.7, size: 0.065, weight: 700, max: 1, motion: { in: 'pop', at: 0.5, dur: 0.5 } },
      { role: 'meta', x: 0.1, y: 0.08, w: 0.8, size: 0.042, align: 'center', fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.7, dur: 0.4 } },
    ],
  },

  {
    key: 'merch-slogan',
    look: { palette: 'carnival', type: 'street', pattern: { key: 'confetti', role: 'highlight', opacity: 0.1, scale: 0.2 } },
    label: 'Merch Slogan',
    desc: 'T-shirt or tote artwork: one condensed slogan inside a ring',
    use: 'business',
    styles: ['street', 'youth', 'bold'], tags: ['t-shirt', 'merchandise', 'tote', 'apparel', 'print'],
    industries: ['Fashion & Beauty', 'Arts & Entertainment'],
    mood: 'street', scheme: 'dark', font: 'condensed',
    surface: { kind: 'solid', intensity: 0.2 },
    shapes: [
      { kind: 'ring', cx: 0.5, cy: 0.5, r: 0.38, tone: 'secondary', alpha: 0.5, thickness: 0.012 },
    ],
    slots: [
      { role: 'eyebrow', x: 0.2, y: 0.27, w: 0.6, size: 0.03, upper: true, tracking: 0.4, align: 'center', tone: 'accent', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.14, y: 0.36, w: 0.72, size: 0.16, upper: true, align: 'center', motion: { in: 'pop', at: 0.2, dur: 0.6 } },
      { role: 'brand', x: 0.2, y: 0.66, w: 0.6, size: 0.034, upper: true, tracking: 0.3, align: 'center', motion: { in: 'fade', at: 0.5, dur: 0.4 } },
      { role: 'meta', x: 0.2, y: 0.72, w: 0.6, size: 0.022, upper: true, tracking: 0.2, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
    ],
  },

  {
    key: 'profile-banner',
    look: { palette: 'poppy-field', type: 'modern' },
    label: 'Profile Banner',
    desc: 'LinkedIn or X header: the line sits clear of the profile photo, colour on the right',
    use: 'social',
    styles: ['corporate', 'modern', 'minimal'], tags: ['linkedin', 'cover', 'header', 'banner', 'profile'],
    industries: ['Professional Services', 'Technology & Media'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'gradient', angle: 90, intensity: 0.25 },
    shapes: [
      { kind: 'circle', cx: 0.98, cy: 0.5, r: 0.3, tone: 'accent', alpha: 0.55 },
      { kind: 'ring', cx: 0.98, cy: 0.5, r: 0.42, tone: 'secondary', alpha: 0.3, thickness: 0.006 },
    ],
    slots: [
      { role: 'eyebrow', x: 0.32, y: 0.2, w: 0.34, size: 0.06, upper: true, tracking: 0.24, tone: 'secondary', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.32, y: 0.34, w: 0.34, size: 0.14, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'contact', x: 0.32, y: 0.18, w: 0.34, size: 0.05, direction: 'row', max: 3, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.5, dur: 0.4 } },
    ],
  },

  // ── Campaigns ────────────────────────────────────────────────────────

  {
    key: 'campaign-key-visual',
    look: { palette: 'lagos-sunset', type: 'impact', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Campaign Key Visual',
    desc: 'The campaign photograph carries it; one big idea anchored low',
    use: 'marketing',
    styles: ['cinematic', 'bold', 'premium'], tags: ['campaign', 'key visual', 'launch', 'brand campaign', 'hero'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 180, intensity: 0.55, vignette: 0.35 },
    camera: { move: 'drift', amount: 0.04 },
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.585, w: 0.1, h: 0.008, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.06, w: 0.5, size: 0.026, weight: 800, upper: true, tracking: 0.2, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.07, y: 0.615, w: 0.7, size: EYEBROW, upper: true, tracking: 0.26, tone: 'accent', motion: { in: 'wipe', at: 0.3, dur: 0.5 } },
      { role: 'headline', x: 0.07, y: 0.655, w: 0.86, size: 0.095, weight: 800, tracking: -0.035, motion: { in: 'mask-up', at: 0.5, dur: 0.7 } },
      { role: 'cta', x: 0.07, y: 0.065, w: 0.4, size: 0.03, weight: 800, upper: true, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1, dur: 0.5 } },
      { role: 'meta', x: 0.52, y: 0.08, w: 0.41, size: META, align: 'right', fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1.1, dur: 0.4 } },
    ],
  },

  {
    key: 'launch-split-wide',
    photoLed: true,
    label: 'Launch Split',
    desc: 'Landscape launch: the offer on a solid column, the product photograph beside it',
    use: 'marketing',
    styles: ['modern', 'premium', 'tech'], tags: ['launch', 'new product', 'banner', 'website', 'announcement'],
    industries: ['Technology & Media', 'Retail & Commerce'],
    mood: 'editorial', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.1 },
    camera: { move: 'pan-left', amount: 0.03 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.46, h: 1, tone: 'base' },
      { kind: 'rect', x: 0.06, y: 0.2, w: 0.06, h: 0.008, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.06, y: 0.08, w: 0.36, size: 0.03, weight: 800, upper: true, tracking: 0.2, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.06, y: 0.24, w: 0.36, size: EYEBROW, upper: true, tracking: 0.24, tone: 'accent', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.06, y: 0.3, w: 0.36, size: 0.1, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'subline', x: 0.06, y: 0.6, w: 0.36, size: 0.032, tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
      { role: 'cta', x: 0.06, y: 0.09, w: 0.2, size: 0.03, weight: 800, upper: true, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 0.8, dur: 0.5 } },
    ],
  },

  {
    key: 'tiered-sale',
    label: 'Tiered Sale',
    desc: 'Three discount tiers side by side under a serif sale title',
    use: 'marketing',
    styles: ['elegant', 'editorial', 'premium'], tags: ['sale', 'season sale', 'discount', 'black friday', 'tiers', 'clearance'],
    industries: ['Retail & Commerce', 'Fashion & Beauty'],
    mood: 'editorial', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 160, intensity: 0.7 },
    /*
     * A warm plum ground with a full-bleed ribbon across the top, painted from
     * secondary into primary, carrying the brand and the occasion. The ribbon is
     * where the ink-on-a-colour rule is exercised: both words sit `on:
     * 'secondary'`, so they take the ink measured for the ribbon, not the
     * ground's. The stats stay on the ground, where their primary-coloured
     * values read at 6.9:1; on a coloured panel they could only be muted, which
     * the renderer draws at 0.72 alpha and which falls to about 2.5:1.
     */
    look: {
      palette: 'lagos-sunset',
      type: 'editorial',
      pattern: { role: 'highlight', key: 'halftone', opacity: 0.1, scale: 0.14, zone: 'bottom' },
    },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.215, tone: 'secondary', fill: { kind: 'linear', stops: ['secondary', 'primary'], angle: 90 } },
      { kind: 'rect', x: 0.08, y: 0.56, w: 0.84, h: 0.002, tone: 'white', alpha: 0.3 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.07, w: 0.84, size: 0.026, weight: 700, upper: true, tracking: 0.3, align: 'center', on: 'secondary', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.08, y: 0.17, w: 0.84, size: EYEBROW, upper: true, tracking: 0.3, align: 'center', on: 'secondary', motion: { in: 'fade', at: 0.15, dur: 0.4 } },
      { role: 'headline', x: 0.08, y: 0.23, w: 0.84, size: 0.12, font: 'editorial', align: 'center', motion: { in: 'rise', at: 0.3, dur: 0.6 } },
      { role: 'stats', x: 0.08, y: 0.61, w: 0.84, size: 0.044, direction: 'row', max: 3, align: 'center', motion: { in: 'pop', at: 0.6, dur: 0.6 } },
      { role: 'meta', x: 0.08, y: 0.8, w: 0.84, size: META, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.9, dur: 0.4 } },
      { role: 'cta', x: 0.3, y: 0.07, w: 0.4, size: 0.03, weight: 800, upper: true, align: 'center', treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.5 } },
    ],
  },

  {
    key: 'app-download',
    look: { palette: 'lilac-mint', type: 'modern' },
    label: 'App Download',
    desc: 'A phone drawn in brand colour, the pitch on the left and a code to scan',
    use: 'marketing',
    styles: ['tech', 'modern', 'minimal'], tags: ['app', 'download', 'mobile', 'launch', 'fintech', 'qr'],
    industries: ['Technology & Media'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'wash', intensity: 0.3 },
    shapes: [
      { kind: 'rect', x: 0.61, y: 0.12, w: 0.3, h: 0.8, tone: 'ink', radius: 0.06 },
      { kind: 'rect', x: 0.635, y: 0.17, w: 0.25, h: 0.68, tone: 'accent', radius: 0.035 },
      { kind: 'rect', x: 0.72, y: 0.875, w: 0.08, h: 0.008, tone: 'white', alpha: 0.6, radius: 0.004 },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.08, w: 0.48, size: 0.026, weight: 800, upper: true, tracking: 0.18, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.07, y: 0.24, w: 0.48, size: EYEBROW, upper: true, tracking: 0.24, motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.07, y: 0.29, w: 0.49, size: 0.08, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'subline', x: 0.07, y: 0.56, w: 0.46, size: 0.032, tone: 'muted', motion: { in: 'fade', at: 0.55, dur: 0.4 } },
      { role: 'qr', x: 0.07, y: 0.08, w: 0.14, fromBottom: true, motion: { in: 'pop', at: 0.8, dur: 0.5 } },
      { role: 'cta', x: 0.25, y: 0.12, w: 0.3, size: 0.028, weight: 800, upper: true, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 0.9, dur: 0.5 } },
    ],
  },

  {
    key: 'donation-appeal',
    photoLed: true,
    label: 'Donation Appeal',
    desc: 'A photograph of the cause above a calm panel: the ask, then where to give',
    use: 'marketing',
    styles: ['soft', 'editorial', 'organic'], tags: ['donation', 'charity', 'fundraising', 'appeal', 'nonprofit', 'church'],
    industries: ['Education & Community'],
    mood: 'warm', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 180, intensity: 0.5, vignette: 0.4 },
    camera: { move: 'push', amount: 0.03 },
    shapes: [
      { kind: 'rect', x: 0, y: 0.62, w: 1, h: 0.38, tone: 'base', alpha: 0.94 },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.06, w: 0.6, size: 0.026, weight: 800, upper: true, tracking: 0.2, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.07, y: 0.66, w: 0.6, size: EYEBROW, upper: true, tracking: 0.26, tone: 'accent', motion: { in: 'fade', at: 0.3, dur: 0.4 } },
      { role: 'headline', x: 0.07, y: 0.7, w: 0.86, size: 0.068, weight: 700, tracking: -0.02, motion: { in: 'rise', at: 0.45, dur: 0.6 } },
      { role: 'subline', x: 0.07, y: 0.155, w: 0.56, size: 0.028, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.7, dur: 0.4 } },
      { role: 'cta', x: 0.66, y: 0.07, w: 0.27, size: 0.028, weight: 800, upper: true, align: 'center', treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 0.9, dur: 0.5 } },
      { role: 'meta', x: 0.07, y: 0.075, w: 0.55, size: META, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1, dur: 0.4 } },
    ],
  },

  {
    key: 'hotel-stay',
    look: { palette: 'forest-brass', type: 'luxury', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Hotel Stay Offer',
    desc: 'Framed photograph, a serif offer centred low and a price from',
    use: 'industry',
    styles: ['luxury', 'elegant', 'cinematic'], tags: ['hotel', 'stay', 'getaway', 'resort', 'travel', 'offer'],
    industries: ['Food & Hospitality'],
    mood: 'luxe', scheme: 'dark', font: 'sans',
    surface: { kind: 'frame', frame: 0.03, intensity: 0.35, vignette: 0.5 },
    camera: { move: 'drift', amount: 0.04 },
    shapes: [
      { kind: 'rect', x: 0, y: 0.985, w: 1, h: 0.015, tone: 'secondary' },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.1, w: 0.8, size: 0.026, weight: 600, upper: true, tracking: 0.4, align: 'center', motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.1, y: 0.57, w: 0.8, size: EYEBROW, upper: true, tracking: 0.3, align: 'center', tone: 'accent', motion: { in: 'fade', at: 0.3, dur: 0.4 } },
      { role: 'headline', x: 0.1, y: 0.62, w: 0.8, size: 0.09, font: 'editorial', align: 'center', motion: { in: 'rise', at: 0.45, dur: 0.7 } },
      { role: 'price', x: 0.25, y: 0.79, w: 0.5, size: 0.04, max: 1, motion: { in: 'fade', at: 0.8, dur: 0.5 } },
      { role: 'cta', x: 0.32, y: 0.08, w: 0.36, size: 0.026, upper: true, tracking: 0.2, align: 'center', treatment: 'outline', fromBottom: true, motion: { in: 'fade', at: 1, dur: 0.5 } },
    ],
  },

  {
    key: 'shop-product-card',
    look: { palette: 'terracotta-clay', type: 'modern', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Product Card',
    desc: 'Online-store square: product photograph, then name, price and a cart button',
    use: 'marketing',
    styles: ['modern', 'minimal', 'soft'], tags: ['ecommerce', 'product', 'online store', 'shop', 'new in', 'add to cart'],
    industries: ['Retail & Commerce', 'Fashion & Beauty'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.08 },
    shapes: [
      { kind: 'rect', x: 0, y: 0.6, w: 1, h: 0.4, tone: 'base' },
    ],
    slots: [
      { role: 'brand', x: 0.06, y: 0.06, w: 0.6, size: 0.026, weight: 800, upper: true, tracking: 0.18, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.06, y: 0.64, w: 0.5, size: EYEBROW, upper: true, tracking: 0.24, motion: { in: 'fade', at: 0.2, dur: 0.4 } },
      { role: 'headline', x: 0.06, y: 0.69, w: 0.58, size: 0.062, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.35, dur: 0.5 } },
      { role: 'price', x: 0.06, y: 0.83, w: 0.54, size: 0.042, weight: 700, max: 1, tone: 'secondary', motion: { in: 'pop', at: 0.6, dur: 0.5 } },
      { role: 'cta', x: 0.64, y: 0.085, w: 0.3, size: 0.028, weight: 800, upper: true, align: 'center', treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 0.8, dur: 0.5 } },
    ],
  },

  // ── Social ───────────────────────────────────────────────────────────

  {
    key: 'carousel-cover-number',
    look: { palette: 'glacier', type: 'modern' },
    label: 'Carousel Cover',
    desc: 'First slide of a carousel: the count, a heavy title and a swipe cue',
    use: 'social',
    styles: ['bold', 'modern', 'swiss'], tags: ['carousel', 'linkedin', 'instagram', 'slides', 'tips', 'cover'],
    mood: 'bold', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.06 },
    shapes: [
      { kind: 'circle', cx: 0.86, cy: 0.13, r: 0.06, tone: 'accent' },
      { kind: 'rect', x: 0.07, y: 0.88, w: 0.86, h: 0.003, tone: 'ink', alpha: 0.25 },
    ],
    slots: [
      { role: 'eyebrow', x: 0.07, y: 0.09, w: 0.5, size: 0.028, upper: true, tracking: 0.12, font: 'mono', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.07, y: 0.3, w: 0.82, size: 0.115, weight: 900, font: 'heavy', tracking: -0.04, motion: { in: 'mask-up', at: 0.2, dur: 0.6 } },
      { role: 'subline', x: 0.07, y: 0.66, w: 0.7, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.5, dur: 0.4 } },
      { role: 'brand', x: 0.07, y: 0.055, w: 0.5, size: 0.026, weight: 700, fromBottom: true, motion: { in: 'fade', at: 0.7, dur: 0.4 } },
      { role: 'cta', x: 0.55, y: 0.055, w: 0.38, size: 0.028, upper: true, tracking: 0.2, align: 'right', fromBottom: true, motion: { in: 'slide-left', at: 0.8, dur: 0.5 } },
    ],
  },

  {
    key: 'insight-stat',
    look: { palette: 'navy-mono', type: 'statement' },
    label: 'Insight Stat',
    desc: 'One number, very large, with what it means beneath it',
    use: 'social',
    styles: ['corporate', 'tech', 'high-contrast'], tags: ['statistic', 'insight', 'data', 'linkedin', 'report', 'number'],
    industries: ['Professional Services', 'Technology & Media'],
    mood: 'bold', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'gradient', angle: 135, intensity: 0.6 },
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.2, w: 0.012, h: 0.24, tone: 'accent' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.1, y: 0.14, w: 0.8, size: EYEBROW, upper: true, tracking: 0.26, tone: 'accent', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.1, y: 0.19, w: 0.82, size: 0.24, weight: 800, tracking: -0.05, motion: { in: 'pop', at: 0.2, dur: 0.6, ease: 'spring' } },
      { role: 'subline', x: 0.1, y: 0.5, w: 0.76, size: 0.045, weight: 500, motion: { in: 'rise', at: 0.5, dur: 0.5 } },
      { role: 'meta', x: 0.1, y: 0.66, w: 0.76, size: META, tone: 'muted', motion: { in: 'fade', at: 0.7, dur: 0.4 } },
      { role: 'brand', x: 0.1, y: 0.07, w: 0.6, size: 0.026, weight: 700, fromBottom: true, motion: { in: 'fade', at: 0.8, dur: 0.4 } },
    ],
  },

  {
    key: 'reels-cover-centre',
    look: { palette: 'electric-lagos', type: 'street' },
    label: 'Reels Cover',
    desc: 'Cover for a reel or short: everything inside the centre safe area',
    use: 'social',
    styles: ['bold', 'youth', 'modern'], tags: ['reels', 'tiktok', 'shorts', 'video cover', 'episode', 'story'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'spotlight', intensity: 0.6, vignette: 0.3 },
    camera: { move: 'push', amount: 0.03 },
    shapes: [
      { kind: 'rect', x: 0.42, y: 0.68, w: 0.16, h: 0.006, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.09, w: 0.8, size: 0.03, weight: 700, upper: true, tracking: 0.24, align: 'center', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.15, y: 0.38, w: 0.7, size: 0.03, upper: true, tracking: 0.3, align: 'center', tone: 'accent', motion: { in: 'fade', at: 0.2, dur: 0.4 } },
      { role: 'headline', x: 0.1, y: 0.42, w: 0.8, size: 0.1, weight: 800, tracking: -0.03, align: 'center', motion: { in: 'pop', at: 0.35, dur: 0.6 } },
      { role: 'subline', x: 0.15, y: 0.71, w: 0.7, size: 0.032, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
    ],
  },

  {
    key: 'status-order',
    look: { palette: 'sun-and-ink', type: 'impact' },
    label: 'Order Status',
    desc: 'WhatsApp status that sells: what is available, three prices, how to order',
    use: 'social',
    styles: ['modern', 'bold', 'playful'], tags: ['whatsapp', 'status', 'order', 'available', 'prices', 'story'],
    industries: ['Food & Hospitality', 'Local & Everyday Business', 'Retail & Commerce'],
    mood: 'bold', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.1 },
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.15, w: 0.86, h: 0.002, tone: 'ink', alpha: 0.2 },
      { kind: 'rect', x: 0.07, y: 0.47, w: 0.12, h: 0.006, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.09, w: 0.6, size: 0.036, weight: 800, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.07, y: 0.2, w: 0.8, size: 0.03, upper: true, tracking: 0.24, motion: { in: 'fade', at: 0.15, dur: 0.4 } },
      { role: 'headline', x: 0.07, y: 0.24, w: 0.86, size: 0.105, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.3, dur: 0.6 } },
      { role: 'price', x: 0.07, y: 0.51, w: 0.86, size: 0.045, max: 3, tone: 'secondary', motion: { in: 'rise', at: 0.55, dur: 0.6 } },
      { role: 'cta', x: 0.07, y: 0.13, w: 0.5, size: 0.034, weight: 800, upper: true, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 0.9, dur: 0.5 } },
      { role: 'contact', x: 0.07, y: 0.07, w: 0.86, size: 0.026, direction: 'row', max: 2, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1, dur: 0.4 } },
    ],
  },

  {
    key: 'thumbnail-split',
    photoLed: true,
    label: 'Thumbnail Split',
    desc: 'Video thumbnail: two heavy words on an angled block, the photograph on the right',
    use: 'social',
    styles: ['bold', 'high-contrast', 'youth'], tags: ['youtube', 'thumbnail', 'video', 'podcast', 'episode'],
    industries: ['Technology & Media', 'Arts & Entertainment'],
    mood: 'street', scheme: 'dark', font: 'heavy',
    surface: { kind: 'gradient', angle: 90, intensity: 0.5 },
    shapes: [
      { kind: 'rect', x: -0.04, y: 0, w: 0.6, h: 1, tone: 'base', skew: 0.08 },
    ],
    slots: [
      { role: 'eyebrow', x: 0.05, y: 0.12, w: 0.3, size: 0.045, weight: 800, upper: true, tracking: 0.1, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.05, y: 0.27, w: 0.46, size: 0.17, upper: true, tracking: -0.02, motion: { in: 'pop', at: 0.15, dur: 0.5 } },
      { role: 'brand', x: 0.05, y: 0.08, w: 0.4, size: 0.04, weight: 700, upper: true, tracking: 0.16, fromBottom: true, motion: { in: 'fade', at: 0.4, dur: 0.4 } },
    ],
  },

  {
    key: 'pin-checklist',
    label: 'Checklist Pin',
    desc: 'Tall Pinterest guide: a serif title over a five-point checklist',
    use: 'social',
    styles: ['editorial', 'soft', 'organic'], tags: ['pinterest', 'checklist', 'guide', 'how to', 'tips', 'list'],
    industries: ['Home & Personal Services', 'Health & Wellness', 'Education & Community'],
    mood: 'warm', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.12 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.045, tone: 'accent' },
      { kind: 'rect', x: 0.08, y: 0.36, w: 0.84, h: 0.002, tone: 'ink', alpha: 0.2 },
    ],
    slots: [
      { role: 'eyebrow', x: 0.08, y: 0.1, w: 0.84, size: 0.03, upper: true, tracking: 0.3, tone: 'accent', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.08, y: 0.15, w: 0.84, size: 0.1, font: 'editorial', motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'services', x: 0.08, y: 0.4, w: 0.84, size: 0.04, bullet: 'check', max: 5, motion: { in: 'rise', at: 0.5, dur: 0.7 } },
      { role: 'brand', x: 0.08, y: 0.06, w: 0.42, size: 0.03, weight: 700, fromBottom: true, motion: { in: 'fade', at: 0.9, dur: 0.4 } },
      { role: 'meta', x: 0.5, y: 0.065, w: 0.42, size: META, align: 'right', fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1, dur: 0.4 } },
    ],
  },

  {
    key: 'class-timetable',
    label: 'Class Timetable',
    desc: 'A week of sessions, day and time on every row',
    use: 'industry',
    styles: ['modern', 'tech', 'bold'], tags: ['timetable', 'schedule', 'classes', 'gym', 'fitness', 'week'],
    industries: ['Health & Wellness', 'Education & Community'],
    mood: 'bold', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'gradient', angle: 150, intensity: 0.55 },
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.33, w: 0.86, h: 0.003, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.06, w: 0.6, size: 0.028, weight: 800, upper: true, tracking: 0.18, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.07, y: 0.14, w: 0.6, size: EYEBROW, upper: true, tracking: 0.26, tone: 'accent', motion: { in: 'fade', at: 0.15, dur: 0.4 } },
      { role: 'headline', x: 0.07, y: 0.18, w: 0.86, size: 0.085, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.3, dur: 0.6 } },
      { role: 'price', x: 0.07, y: 0.37, w: 0.86, size: 0.034, max: 6, motion: { in: 'rise', at: 0.5, dur: 0.8 } },
      { role: 'meta', x: 0.07, y: 0.07, w: 0.86, size: META, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1, dur: 0.4 } },
    ],
  },

  {
    key: 'facebook-cover-clean',
    label: 'Page Cover',
    desc: 'Facebook page cover: the line left, a colour field right, contact along the foot',
    use: 'social',
    styles: ['modern', 'minimal', 'corporate'], tags: ['facebook', 'cover', 'page cover', 'banner', 'header'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.06 },
    shapes: [
      { kind: 'rect', x: 0.6, y: 0, w: 0.4, h: 1, tone: 'accent', alpha: 0.92 },
      { kind: 'circle', cx: 0.6, cy: 0.5, r: 0.14, tone: 'base' },
    ],
    slots: [
      { role: 'brand', x: 0.06, y: 0.14, w: 0.44, size: 0.036, weight: 800, upper: true, tracking: 0.2, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.06, y: 0.3, w: 0.44, size: 0.1, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'subline', x: 0.06, y: 0.62, w: 0.42, size: 0.032, tone: 'muted', motion: { in: 'fade', at: 0.4, dur: 0.4 } },
      { role: 'contact', x: 0.06, y: 0.1, w: 0.5, size: 0.026, direction: 'row', max: 3, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
    ],
  },

  // ── Banners and display ──────────────────────────────────────────────

  {
    key: 'web-hero',
    label: 'Website Hero',
    desc: 'Wide website banner: headline and button left, a large disc of colour right',
    use: 'marketing',
    styles: ['modern', 'minimal', 'tech'], tags: ['website', 'hero', 'banner', 'landing page', 'header'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'wash', intensity: 0.3 },
    shapes: [
      { kind: 'circle', cx: 0.85, cy: 0.5, r: 0.55, tone: 'accent', alpha: 0.55 },
      { kind: 'ring', cx: 0.85, cy: 0.5, r: 0.72, tone: 'accent', alpha: 0.25, thickness: 0.006 },
    ],
    slots: [
      { role: 'brand', x: 0.05, y: 0.1, w: 0.3, size: 0.045, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.05, y: 0.28, w: 0.56, size: 0.14, weight: 800, tracking: -0.035, motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'subline', x: 0.05, y: 0.66, w: 0.5, size: 0.048, tone: 'muted', motion: { in: 'fade', at: 0.45, dur: 0.4 } },
      { role: 'cta', x: 0.05, y: 0.08, w: 0.22, size: 0.06, weight: 800, upper: true, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 0.7, dur: 0.5 } },
    ],
  },

  {
    key: 'leaderboard-ad',
    label: 'Leaderboard Ad',
    desc: '728 by 90 display ad: name, one line and a button, left to right',
    use: 'marketing',
    styles: ['modern', 'bold', 'high-contrast'], tags: ['display ad', 'leaderboard', 'banner ad', '728x90', 'web ad'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.15 },
    slots: [
      { role: 'brand', x: 0.03, y: 0.38, w: 0.19, size: 0.15, weight: 800, upper: true, tracking: 0.1, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.23, y: 0.25, w: 0.52, size: 0.34, weight: 800, tracking: -0.02, motion: { in: 'slide-left', at: 0.2, dur: 0.5 } },
      { role: 'cta', x: 0.78, y: 0.28, w: 0.19, size: 0.2, weight: 800, upper: true, align: 'center', treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.5, dur: 0.4 } },
    ],
  },

  {
    key: 'mpu-ad',
    label: 'MPU Ad',
    desc: '300 by 250 display ad, centred: offer, one line of detail, a button',
    use: 'marketing',
    styles: ['modern', 'bold', 'minimal'], tags: ['display ad', 'mpu', 'banner ad', '300x250', 'web ad'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.15 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.035, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.1, w: 0.8, size: 0.065, weight: 800, upper: true, tracking: 0.2, align: 'center', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.06, y: 0.26, w: 0.88, size: 0.15, weight: 800, tracking: -0.03, align: 'center', motion: { in: 'pop', at: 0.2, dur: 0.5 } },
      { role: 'subline', x: 0.1, y: 0.58, w: 0.8, size: 0.06, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.4, dur: 0.4 } },
      { role: 'cta', x: 0.25, y: 0.08, w: 0.5, size: 0.07, weight: 800, upper: true, align: 'center', treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 0.6, dur: 0.4 } },
    ],
  },

  {
    key: 'rollup-clean',
    look: { palette: 'deep-sea', type: 'modern' },
    label: 'Clean Roll-up',
    desc: 'Pull-up banner read top to bottom: name, claim, three reasons, a code at eye level',
    use: 'marketing',
    styles: ['corporate', 'modern', 'premium'], tags: ['roll-up', 'pull-up banner', 'exhibition', 'stand', 'event banner'],
    industries: ['Professional Services', 'Education & Community'],
    mood: 'editorial', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 180, intensity: 0.6 },
    shapes: [
      { kind: 'rect', x: 0.08, y: 0.18, w: 0.2, h: 0.006, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.06, w: 0.84, size: 0.06, weight: 800, tracking: -0.01, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.84, size: 0.03, upper: true, tracking: 0.26, tone: 'accent', motion: { in: 'fade', at: 0.15, dur: 0.4 } },
      { role: 'headline', x: 0.08, y: 0.24, w: 0.84, size: 0.13, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.3, dur: 0.6 } },
      { role: 'services', x: 0.08, y: 0.5, w: 0.84, size: 0.045, bullet: 'check', max: 3, motion: { in: 'rise', at: 0.55, dur: 0.6 } },
      { role: 'qr', x: 0.08, y: 0.12, w: 0.22, fromBottom: true, motion: { in: 'pop', at: 0.8, dur: 0.5 } },
      { role: 'contact', x: 0.36, y: 0.12, w: 0.56, size: 0.03, tone: 'muted', max: 3, fromBottom: true, motion: { in: 'fade', at: 0.9, dur: 0.4 } },
    ],
  },

  {
    key: 'billboard-statement',
    look: { palette: 'electric-lagos', type: 'impact' },
    label: 'Billboard Statement',
    desc: 'Roadside proportions: one line readable at speed, the name and a number',
    use: 'marketing',
    styles: ['bold', 'high-contrast', 'street'], tags: ['billboard', 'outdoor', 'roadside', 'advertising', 'large format'],
    mood: 'bold', scheme: 'dark', font: 'heavy',
    surface: { kind: 'solid', intensity: 0.35 },
    shapes: [
      { kind: 'rect', x: 0.76, y: 0.12, w: 0.2, h: 0.76, tone: 'accent', radius: 0.04 },
    ],
    slots: [
      { role: 'brand', x: 0.04, y: 0.12, w: 0.5, size: 0.07, weight: 700, upper: true, tracking: 0.14, font: 'sans', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.04, y: 0.3, w: 0.68, size: 0.2, upper: true, tracking: -0.02, motion: { in: 'slide-right', at: 0.2, dur: 0.6 } },
      { role: 'contact', x: 0.04, y: 0.12, w: 0.68, size: 0.06, weight: 700, direction: 'row', max: 2, fromBottom: true, font: 'sans', motion: { in: 'fade', at: 0.5, dur: 0.4 } },
    ],
  },

  // ── Print ────────────────────────────────────────────────────────────

  {
    key: 'swiss-event-poster',
    label: 'Swiss Event Poster',
    desc: 'A4 poster on a strict grid: condensed title, rules, a disc, details in the foot',
    use: 'event',
    styles: ['swiss', 'editorial', 'modern'], tags: ['poster', 'event', 'a4', 'concert', 'exhibition', 'talk'],
    industries: ['Arts & Entertainment', 'Education & Community'],
    mood: 'editorial', scheme: 'light', font: 'condensed',
    surface: { kind: 'solid', intensity: 0.06 },
    /*
     * Cobalt on a pale blue sheet that warms to orange at the foot. The stepped
     * heritage motif is held to the middle band, where the poster has most air,
     * at 0.1: a headline set at 0.2 can still wrap into it, and 0.12 is the
     * ceiling for a pattern under type.
     */
    look: {
      palette: 'cobalt-pop',
      type: 'street',
      gradient: { kind: 'linear', stops: ['ground', 'secondary'], angle: 180 },
      pattern: { role: 'primary', key: 'step', opacity: 0.1, scale: 0.12, zone: 'band' },
    },
    shapes: [
      { kind: 'rect', x: 0.06, y: 0.06, w: 0.88, h: 0.004, tone: 'ink' },
      { kind: 'circle', cx: 0.74, cy: 0.62, r: 0.14, tone: 'accent' },
      { kind: 'rect', x: 0.06, y: 0.74, w: 0.88, h: 0.004, tone: 'ink' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.06, y: 0.08, w: 0.6, size: 0.022, upper: true, tracking: 0.2, font: 'mono', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.06, y: 0.12, w: 0.88, size: 0.2, upper: true, tracking: -0.01, motion: { in: 'mask-up', at: 0.2, dur: 0.7 } },
      { role: 'subline', x: 0.06, y: 0.77, w: 0.56, size: 0.032, weight: 600, font: 'sans', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
      // Plain, not muted: the foot of the sheet is the coral stop, where the ink
      // at 0.72 alpha measures 4.14:1. Size and the 0.82 position still set it
      // back from the subline.
      { role: 'meta', x: 0.06, y: 0.82, w: 0.56, size: 0.024, font: 'sans', motion: { in: 'fade', at: 0.7, dur: 0.4 } },
      { role: 'qr', x: 0.76, y: 0.06, w: 0.18, fromBottom: true, motion: { in: 'pop', at: 0.9, dur: 0.5 } },
      { role: 'brand', x: 0.06, y: 0.06, w: 0.5, size: 0.022, upper: true, tracking: 0.2, font: 'mono', fromBottom: true, motion: { in: 'fade', at: 1, dur: 0.4 } },
    ],
  },

  {
    key: 'flyer-services-photo',
    look: { palette: 'ink-coral', type: 'modern', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Services Flyer',
    desc: 'A5 flyer: photograph above, the offer and three services on a solid panel',
    use: 'business',
    styles: ['modern', 'corporate', 'bold'], tags: ['flyer', 'services', 'a5', 'handout', 'leaflet'],
    industries: ['Home & Personal Services', 'Trades & Industry', 'Health & Wellness'],
    mood: 'editorial', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.4 },
    shapes: [
      { kind: 'rect', x: 0, y: 0.48, w: 1, h: 0.52, tone: 'base' },
      { kind: 'rect', x: 0.07, y: 0.53, w: 0.1, h: 0.006, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.05, w: 0.6, size: 0.03, weight: 800, upper: true, tracking: 0.18, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.07, y: 0.56, w: 0.6, size: EYEBROW, upper: true, tracking: 0.24, tone: 'accent', motion: { in: 'fade', at: 0.2, dur: 0.4 } },
      { role: 'headline', x: 0.07, y: 0.6, w: 0.86, size: 0.08, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'services', x: 0.07, y: 0.74, w: 0.56, size: 0.03, bullet: 'dot', max: 3, motion: { in: 'rise', at: 0.55, dur: 0.6 } },
      { role: 'cta', x: 0.66, y: 0.15, w: 0.27, size: 0.03, weight: 800, upper: true, align: 'center', treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 0.8, dur: 0.5 } },
      { role: 'contact', x: 0.07, y: 0.05, w: 0.86, size: 0.022, direction: 'row', max: 3, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.9, dur: 0.4 } },
    ],
  },

  {
    key: 'invoice-modern',
    look: { palette: 'harbour-blue', type: 'modern' },
    label: 'Modern Invoice',
    desc: 'A4 invoice: company and contact left, the word Invoice right, line items and a total',
    use: 'business',
    styles: ['corporate', 'minimal', 'swiss'], tags: ['invoice', 'bill', 'receipt', 'quotation', 'a4', 'accounts'],
    industries: ['Professional Services', 'Trades & Industry'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.04 },
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.2, w: 0.86, h: 0.003, tone: 'accent' },
      { kind: 'rect', x: 0.07, y: 0.77, w: 0.86, h: 0.0015, tone: 'ink', alpha: 0.3 },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.06, w: 0.46, size: 0.036, weight: 800, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'contact', x: 0.07, y: 0.1, w: 0.42, size: 0.016, tone: 'muted', max: 3, motion: { in: 'fade', at: 0.1, dur: 0.4 } },
      { role: 'headline', x: 0.55, y: 0.06, w: 0.38, size: 0.07, weight: 800, tracking: -0.03, align: 'right', motion: { in: 'fade', at: 0.15, dur: 0.4 } },
      { role: 'meta', x: 0.55, y: 0.125, w: 0.38, size: 0.017, align: 'right', tone: 'muted', font: 'mono', motion: { in: 'fade', at: 0.25, dur: 0.4 } },
      { role: 'eyebrow', x: 0.07, y: 0.23, w: 0.5, size: 0.017, upper: true, tracking: 0.2, tone: 'accent', motion: { in: 'fade', at: 0.3, dur: 0.4 } },
      { role: 'subline', x: 0.07, y: 0.26, w: 0.5, size: 0.022, motion: { in: 'fade', at: 0.35, dur: 0.4 } },
      { role: 'price', x: 0.07, y: 0.36, w: 0.86, size: 0.026, max: 7, motion: { in: 'rise', at: 0.45, dur: 0.7 } },
      { role: 'cta', x: 0.45, y: 0.8, w: 0.48, size: 0.036, weight: 800, align: 'right', motion: { in: 'fade', at: 0.9, dur: 0.4 } },
    ],
  },

  {
    key: 'gift-voucher',
    look: { palette: 'plum-mono', type: 'luxury' },
    label: 'Gift Voucher',
    desc: 'DL voucher: serif title and value, a tear line, the code and a QR on the stub',
    use: 'marketing',
    styles: ['elegant', 'luxury', 'premium'], tags: ['gift voucher', 'gift card', 'voucher', 'coupon', 'present'],
    industries: ['Fashion & Beauty', 'Food & Hospitality', 'Health & Wellness'],
    mood: 'luxe', scheme: 'dark', font: 'sans',
    surface: { kind: 'frame', frame: 0.03, intensity: 0.4 },
    shapes: [
      { kind: 'rect', x: 0.7, y: 0.06, w: 0.002, h: 0.88, tone: 'white', alpha: 0.4 },
    ],
    slots: [
      { role: 'brand', x: 0.06, y: 0.13, w: 0.58, size: 0.04, weight: 700, upper: true, tracking: 0.3, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.06, y: 0.3, w: 0.6, size: 0.16, font: 'editorial', motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'price', x: 0.06, y: 0.62, w: 0.56, size: 0.07, weight: 700, max: 1, motion: { in: 'pop', at: 0.5, dur: 0.5 } },
      { role: 'meta', x: 0.06, y: 0.12, w: 0.6, size: 0.028, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 0.7, dur: 0.4 } },
      { role: 'qr', x: 0.765, y: 0.2, w: 0.17, motion: { in: 'pop', at: 0.8, dur: 0.5 } },
      { role: 'cta', x: 0.73, y: 0.13, w: 0.24, size: 0.03, upper: true, tracking: 0.2, align: 'center', fromBottom: true, motion: { in: 'fade', at: 0.9, dur: 0.4 } },
    ],
  },

  {
    key: 'menu-modern',
    look: { palette: 'saffron-market', type: 'editorial' },
    label: 'Modern Menu',
    desc: 'A4 menu with a centred serif title, a section name and priced dishes',
    use: 'industry',
    styles: ['elegant', 'editorial', 'minimal'], tags: ['menu', 'restaurant', 'food', 'a4', 'dishes', 'prices'],
    industries: ['Food & Hospitality'],
    mood: 'editorial', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.1 },
    shapes: [
      { kind: 'rect', x: 0.4, y: 0.265, w: 0.2, h: 0.003, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.06, w: 0.86, size: 0.026, weight: 700, upper: true, tracking: 0.35, align: 'center', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.07, y: 0.1, w: 0.86, size: 0.1, font: 'serif', align: 'center', motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'eyebrow', x: 0.07, y: 0.22, w: 0.86, size: EYEBROW, upper: true, tracking: 0.3, align: 'center', motion: { in: 'fade', at: 0.35, dur: 0.4 } },
      { role: 'price', x: 0.1, y: 0.31, w: 0.8, size: 0.03, max: 7, tone: 'secondary', motion: { in: 'rise', at: 0.5, dur: 0.8 } },
      { role: 'contact', x: 0.07, y: 0.05, w: 0.86, size: 0.018, direction: 'row', max: 3, align: 'center', fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1, dur: 0.4 } },
    ],
  },

  {
    key: 'certificate-modern',
    look: { palette: 'kente-field', type: 'luxury' },
    label: 'Modern Certificate',
    desc: 'Landscape certificate: a centred serif name, the reason, and a colour seal',
    use: 'business',
    styles: ['elegant', 'premium', 'corporate'], tags: ['certificate', 'award', 'achievement', 'completion', 'training'],
    industries: ['Education & Community', 'Professional Services'],
    mood: 'luxe', scheme: 'light', font: 'sans',
    surface: { kind: 'frame', frame: 0.035, intensity: 0.2 },
    shapes: [
      { kind: 'ring', cx: 0.86, cy: 0.76, r: 0.09, tone: 'accent', thickness: 0.012 },
      { kind: 'circle', cx: 0.86, cy: 0.76, r: 0.06, tone: 'secondary', alpha: 0.85 },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.11, w: 0.8, size: 0.03, weight: 700, upper: true, tracking: 0.35, align: 'center', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.1, y: 0.26, w: 0.8, size: 0.028, upper: true, tracking: 0.3, align: 'center', tone: 'accent', motion: { in: 'fade', at: 0.15, dur: 0.4 } },
      { role: 'headline', x: 0.12, y: 0.35, w: 0.76, size: 0.11, font: 'editorial', align: 'center', motion: { in: 'rise', at: 0.3, dur: 0.6 } },
      { role: 'subline', x: 0.15, y: 0.55, w: 0.7, size: 0.032, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.5, dur: 0.4 } },
      { role: 'meta', x: 0.1, y: 0.13, w: 0.5, size: 0.024, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.7, dur: 0.4 } },
    ],
  },

  {
    key: 'wedding-invite',
    look: { palette: 'blush-sage', type: 'luxury' },
    label: 'Wedding Invitation',
    desc: 'A5 invitation in a thin frame: families, names, date and an RSVP',
    use: 'event',
    styles: ['elegant', 'luxury', 'soft'], tags: ['wedding', 'invitation', 'invite', 'engagement', 'traditional wedding'],
    mood: 'luxe', scheme: 'light', font: 'sans',
    surface: { kind: 'frame', frame: 0.04, intensity: 0.15 },
    shapes: [
      { kind: 'rect', x: 0.42, y: 0.45, w: 0.16, h: 0.002, tone: 'accent' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.1, y: 0.15, w: 0.8, size: 0.024, upper: true, tracking: 0.3, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.24, w: 0.8, size: 0.11, font: 'serif', align: 'center', motion: { in: 'blur', at: 0.3, dur: 0.8 } },
      { role: 'subline', x: 0.12, y: 0.5, w: 0.76, size: 0.032, align: 'center', motion: { in: 'fade', at: 0.6, dur: 0.5 } },
      { role: 'meta', x: 0.1, y: 0.61, w: 0.8, size: 0.028, upper: true, tracking: 0.2, align: 'center', motion: { in: 'fade', at: 0.8, dur: 0.5 } },
      { role: 'cta', x: 0.3, y: 0.11, w: 0.4, size: 0.026, upper: true, tracking: 0.2, align: 'center', treatment: 'outline', fromBottom: true, motion: { in: 'fade', at: 1, dur: 0.5 } },
    ],
  },

  {
    key: 'property-feature-wide',
    photoLed: true,
    label: 'Property Feature',
    desc: 'Landscape listing: the photograph above a panel with the headline and a fact strip',
    use: 'industry',
    styles: ['premium', 'corporate', 'modern'], tags: ['property', 'real estate', 'listing', 'for sale', 'to let', 'banner'],
    industries: ['Professional Services', 'Home & Personal Services'],
    mood: 'editorial', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.35 },
    camera: { move: 'pan-right', amount: 0.03 },
    shapes: [
      { kind: 'rect', x: 0, y: 0.66, w: 1, h: 0.34, tone: 'base' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.05, y: 0.08, w: 0.3, size: 0.03, weight: 800, upper: true, tracking: 0.16, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0, dur: 0.4 } },
      { role: 'brand', x: 0.6, y: 0.08, w: 0.35, size: 0.03, weight: 800, upper: true, tracking: 0.18, align: 'right', motion: { in: 'fade', at: 0.1, dur: 0.4 } },
      { role: 'headline', x: 0.05, y: 0.7, w: 0.5, size: 0.08, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.3, dur: 0.6 } },
      { role: 'meta', x: 0.05, y: 0.08, w: 0.5, size: 0.03, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.5, dur: 0.4 } },
      { role: 'stats', x: 0.58, y: 0.72, w: 0.37, size: 0.032, direction: 'row', max: 3, motion: { in: 'pop', at: 0.6, dur: 0.6 } },
    ],
  },

  {
    key: 'rate-card',
    look: { palette: 'cobalt-pop', type: 'modern', pattern: { key: 'grid', role: 'primary', opacity: 0.05, scale: 0.08 } },
    label: 'Rate Card',
    desc: 'A4 rate card: a bold title, what the rates cover and a long priced list',
    use: 'business',
    styles: ['corporate', 'tech', 'swiss'], tags: ['rate card', 'price list', 'delivery rates', 'logistics', 'tariff', 'a4'],
    industries: ['Logistics & Mobility', 'Trades & Industry', 'Professional Services'],
    mood: 'minimal', scheme: 'light', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.06 },
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.07, w: 0.86, h: 0.006, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.1, w: 0.5, size: 0.03, weight: 800, upper: true, tracking: 0.14, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.07, y: 0.15, w: 0.86, size: 0.085, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'subline', x: 0.07, y: 0.25, w: 0.7, size: 0.026, tone: 'muted', motion: { in: 'fade', at: 0.35, dur: 0.4 } },
      { role: 'price', x: 0.07, y: 0.32, w: 0.86, size: 0.027, max: 8, motion: { in: 'rise', at: 0.5, dur: 0.8 } },
      { role: 'meta', x: 0.07, y: 0.1, w: 0.86, size: 0.02, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.9, dur: 0.4 } },
      { role: 'contact', x: 0.07, y: 0.05, w: 0.86, size: 0.018, direction: 'row', max: 3, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1, dur: 0.4 } },
    ],
  },

  /*
   * ── FILLING THE THIN NEEDS (2026-10-31) ──────────────────────────────
   *
   * Menus held four layouts, Signs & outdoor three, Brand & packaging five.
   * A need is only shown once it carries six finished designs, so these are
   * the commonest real requests those shelves were missing: a drinks menu,
   * a menu for the TV above the counter, an event backdrop, an LED screen
   * ad, the A-board on the pavement and a round sticker label.
   */

  {
    key: 'drinks-menu',
    look: {
      palette: 'cola-nut',
      type: 'editorial',
      pattern: { key: 'arches', role: 'secondary', opacity: 0.07, scale: 0.16, zone: 'top' },
    },
    label: 'Drinks Menu',
    desc: 'A5 bar or café list: a serif title, a section line and priced drinks',
    use: 'industry',
    styles: ['elegant', 'editorial'], tags: ['drinks', 'bar', 'cocktails', 'cafe', 'menu', 'mocktails'],
    industries: ['Food & Hospitality'],
    mood: 'warm', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.3 },
    shapes: [
      { kind: 'rect', x: 0.36, y: 0.285, w: 0.28, h: 0.003, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.06, w: 0.84, size: 0.028, weight: 700, upper: true, tracking: 0.32, align: 'center', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.08, y: 0.11, w: 0.84, size: 0.12, font: 'serif', align: 'center', motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'eyebrow', x: 0.08, y: 0.24, w: 0.84, size: EYEBROW, upper: true, tracking: 0.3, align: 'center', motion: { in: 'fade', at: 0.35, dur: 0.4 } },
      { role: 'price', x: 0.1, y: 0.33, w: 0.8, size: 0.03, max: 8, motion: { in: 'rise', at: 0.5, dur: 0.8 } },
      { role: 'contact', x: 0.08, y: 0.05, w: 0.84, size: 0.02, direction: 'row', max: 3, align: 'center', fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1, dur: 0.4 } },
    ],
  },

  {
    key: 'menu-board',
    look: { palette: 'baobab', type: 'modern' },
    label: 'Menu Board',
    desc: 'Landscape menu for the screen above the counter: title left, prices right',
    use: 'industry',
    styles: ['modern', 'bold'], tags: ['menu board', 'tv menu', 'screen', 'restaurant', 'fast food', 'prices'],
    industries: ['Food & Hospitality'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.3 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.4, h: 1, tone: 'secondary', alpha: 0.18 },
      { kind: 'rect', x: 0.06, y: 0.52, w: 0.08, h: 0.008, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.06, y: 0.1, w: 0.3, size: 0.04, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.06, y: 0.24, w: 0.32, size: 0.085, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.2, dur: 0.6 } },
      { role: 'eyebrow', x: 0.06, y: 0.57, w: 0.3, size: 0.03, upper: true, tracking: 0.24, motion: { in: 'fade', at: 0.35, dur: 0.4 } },
      { role: 'price', x: 0.46, y: 0.12, w: 0.48, size: 0.042, max: 7, motion: { in: 'rise', at: 0.4, dur: 0.8 } },
      { role: 'contact', x: 0.06, y: 0.08, w: 0.3, size: 0.026, max: 2, fromBottom: true, motion: { in: 'fade', at: 1, dur: 0.4 } },
    ],
  },

  {
    key: 'event-backdrop',
    look: {
      palette: 'indigo-dye',
      type: 'statement',
      pattern: { key: 'blocks', role: 'highlight', opacity: 0.06, scale: 0.12 },
    },
    label: 'Event Backdrop',
    desc: 'Stage or press-wall backdrop: the event name centred, date and venue below',
    use: 'event',
    styles: ['bold', 'premium'], tags: ['backdrop', 'press wall', 'stage', 'step and repeat', 'event banner'],
    industries: ['Arts & Entertainment', 'Education & Community'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'spotlight', intensity: 0.5, vignette: 0.3 },
    shapes: [
      { kind: 'rect', x: 0.4, y: 0.62, w: 0.2, h: 0.008, tone: 'secondary' },
    ],
    slots: [
      { role: 'brand', x: 0.05, y: 0.08, w: 0.4, size: 0.04, weight: 800, upper: true, tracking: 0.2, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.2, y: 0.3, w: 0.6, size: 0.035, upper: true, tracking: 0.3, align: 'center', motion: { in: 'fade', at: 0.2, dur: 0.4 } },
      { role: 'headline', x: 0.1, y: 0.37, w: 0.8, size: 0.13, weight: 800, tracking: -0.03, align: 'center', motion: { in: 'pop', at: 0.35, dur: 0.6 } },
      { role: 'meta', x: 0.2, y: 0.67, w: 0.6, size: 0.035, upper: true, tracking: 0.2, align: 'center', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
      { role: 'contact', x: 0.1, y: 0.07, w: 0.8, size: 0.026, direction: 'row', max: 3, align: 'center', fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.8, dur: 0.4 } },
    ],
  },

  {
    key: 'led-screen-ad',
    look: { palette: 'electric-lagos', type: 'impact' },
    label: 'LED Screen Ad',
    desc: 'Digital billboard frame: a few big words, the name, and one call to act',
    use: 'marketing',
    styles: ['bold', 'high-contrast'], tags: ['led', 'digital billboard', 'screen ad', 'outdoor', 'advertising'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 120, intensity: 0.35 },
    shapes: [
      { kind: 'rect', x: 0.72, y: 0, w: 0.28, h: 1, tone: 'primary' },
      { kind: 'rect', x: 0.72, y: 0, w: 0.012, h: 1, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.04, y: 0.12, w: 0.5, size: 0.07, weight: 800, upper: true, tracking: 0.14, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.04, y: 0.32, w: 0.64, size: 0.22, weight: 900, upper: true, tracking: -0.03, motion: { in: 'slide-right', at: 0.2, dur: 0.5 } },
      { role: 'cta', x: 0.75, y: 0.4, w: 0.22, size: 0.08, weight: 800, upper: true, align: 'center', on: 'primary', motion: { in: 'pop', at: 0.6, dur: 0.4 } },
    ],
  },

  {
    key: 'pavement-sign',
    look: {
      palette: 'harbour-blue',
      type: 'warmth',
      pattern: { key: 'diagonal', role: 'secondary', opacity: 0.06, scale: 0.1, zone: 'bottom' },
    },
    label: 'Pavement A-Board',
    desc: 'The sign outside the door: what is on today, three specials and an arrow in',
    use: 'business',
    styles: ['modern', 'playful'], tags: ['a-board', 'pavement sign', 'sidewalk', 'specials', 'shop front', 'today'],
    industries: ['Food & Hospitality', 'Retail & Commerce', 'Local & Everyday Business'],
    mood: 'warm', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.12 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.03, tone: 'primary' },
      { kind: 'circle', cx: 0.86, cy: 0.12, r: 0.07, tone: 'secondary' },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.07, w: 0.6, size: 0.04, weight: 800, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.6, size: 0.04, upper: true, tracking: 0.24, tone: 'primary', motion: { in: 'fade', at: 0.2, dur: 0.4 } },
      { role: 'headline', x: 0.08, y: 0.25, w: 0.84, size: 0.15, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'services', x: 0.08, y: 0.5, w: 0.84, size: 0.05, bullet: 'dot', max: 3, motion: { in: 'rise', at: 0.55, dur: 0.6 } },
      { role: 'cta', x: 0.08, y: 0.1, w: 0.5, size: 0.045, weight: 800, upper: true, treatment: 'pill', tone: 'primary', fromBottom: true, motion: { in: 'pop', at: 0.8, dur: 0.5 } },
    ],
  },

  {
    key: 'round-sticker',
    look: { palette: 'red-earth', type: 'editorial' },
    label: 'Round Sticker Label',
    desc: 'A circular label for jars, boxes and bags: the name on a colour disc',
    use: 'industry',
    styles: ['organic', 'soft', 'premium'], tags: ['sticker', 'round label', 'jar label', 'packaging', 'seal', 'product'],
    industries: ['Food & Hospitality', 'Fashion & Beauty', 'Retail & Commerce'],
    mood: 'warm', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.1 },
    shapes: [
      { kind: 'circle', cx: 0.5, cy: 0.5, r: 0.44, tone: 'primary' },
      { kind: 'ring', cx: 0.5, cy: 0.5, r: 0.38, tone: 'highlight', alpha: 0.5, thickness: 0.008 },
    ],
    slots: [
      { role: 'eyebrow', x: 0.3, y: 0.3, w: 0.4, size: 0.032, upper: true, tracking: 0.32, align: 'center', on: 'primary', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.28, y: 0.38, w: 0.44, size: 0.11, font: 'serif', align: 'center', on: 'primary', motion: { in: 'pop', at: 0.2, dur: 0.6 } },
      { role: 'meta', x: 0.3, y: 0.6, w: 0.4, size: 0.03, upper: true, tracking: 0.2, align: 'center', on: 'primary', motion: { in: 'fade', at: 0.5, dur: 0.4 } },
    ],
  },
];
