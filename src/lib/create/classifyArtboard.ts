/**
 * Proposing a classification for an imported artboard.
 *
 * ── PROPOSALS, NOT ASSERTIONS ────────────────────────────────────────────
 *
 * Seventy-odd artboards cannot each be classified by hand, and a bulk import
 * that files everything as "flyers" produces a catalogue where the category
 * filter is noise. So each import arrives with a category, a canvas and a
 * use already chosen — and every one of them is editable before it is saved,
 * because this reads a filename and a shape, which is evidence, not proof.
 *
 * ── DERIVED FROM THE SHIPPED VOCABULARIES ONLY ───────────────────────────
 *
 * Every value here is a `DELIVERABLE_CATEGORIES` id, a `DESIGN_FORMATS` key
 * or a `TEMPLATE_USES` key. Nothing invents a category: the product has
 * already been bitten by a second vocabulary that drifted from the first.
 */

import { DESIGN_FORMATS } from '../../data/studioPresets';
import { DELIVERABLE_CATEGORIES, type DeliverableCategory } from '../design/deliverables';
import type { TemplateUse } from '../design/tags';

export interface ArtboardClass {
  category: DeliverableCategory;
  /** A DESIGN_FORMATS key, or '' for the product's own square default. */
  format: string;
  use: TemplateUse;
  tags: string[];
  /** Why, in one line, shown next to the choice so it can be judged. */
  because: string;
}

/**
 * What the artboard's own name says it is.
 *
 * Ordered: the first match wins, so the specific sits above the general —
 * "Menu" before "Card", because "Menu card" is a menu.
 */
const BY_NAME: { match: RegExp; category: DeliverableCategory; use?: TemplateUse; tags?: string[] }[] = [
  { match: /\bmenu\b|price list|tariff/i, category: 'menus', use: 'business', tags: ['menu', 'price list'] },
  { match: /invoice|receipt|quotation|statement/i, category: 'documents', use: 'business', tags: ['invoice'] },
  { match: /certificate|award|diploma/i, category: 'documents', use: 'business', tags: ['certificate'] },
  { match: /\bdeck\b|slide|presentation|report|proposal|profile/i, category: 'documents', use: 'business', tags: ['deck'] },
  { match: /\bid\b|staff id|badge|lanyard/i, category: 'branding', use: 'business', tags: ['staff id'] },
  { match: /business card|card front|card back|letterhead|stationery/i, category: 'branding', use: 'business', tags: ['business card'] },
  { match: /logo|brand line|brand square|identity/i, category: 'branding', use: 'business', tags: ['brand'] },
  { match: /story|reel|status/i, category: 'social', use: 'social', tags: ['story'] },
  { match: /carousel|post\b|square|thumbnail|linkedin|youtube|whatsapp|community|quote card/i, category: 'social', use: 'social', tags: ['social post'] },
  { match: /event|ticket|co-hosted|countdown|launch day|opening/i, category: 'events', use: 'event', tags: ['event'] },
  { match: /hiring|recruitment|vacancy/i, category: 'documents', use: 'business', tags: ['hiring'] },
  { match: /display ad|billboard|roll-?up|banner|transit|outdoor|poster/i, category: 'flyers', use: 'marketing', tags: ['advertising'] },
  { match: /flyer|handbill|leaflet/i, category: 'flyers', use: 'marketing', tags: ['flyer'] },
  { match: /offer|sale|discount|promo|campaign|announce|partner|ambassador|milestone/i, category: 'campaigns', use: 'marketing', tags: ['campaign'] },
];

/**
 * Canvases a NAME identifies, where the shape alone cannot.
 *
 * MEASURED: a business card artboard is 344×231 — 91×61mm *including
 * bleed* — which is proportionally nearer to Half A4 than to the trimmed
 * 85.6×54 card. Shape said Half A4; the board is called "Business card
 * front". The name is right and the measurement is right; they are
 * measuring different rectangles.
 *
 * A named canvas is only taken when its proportion is in the same family as
 * the artboard's, so "48-sheet billboard" on a 2:1 board does not get forced
 * onto our 3:1 billboard and come out the wrong shape.
 */
const NAMED_FORMAT: { match: RegExp; keys: string[] }[] = [
  { match: /\bA5\b|handbill/i, keys: ['a5'] },
  { match: /\bA4\b/i, keys: ['a4'] },
  { match: /\bA3\b/i, keys: ['a3'] },
  { match: /roll-?up/i, keys: ['rollup'] },
  { match: /\bstory\b|status/i, keys: ['story'] },
  { match: /\bid\b|CR80|lanyard/i, keys: ['business-card-portrait'] },
  { match: /business card|\bcard (front|back)\b/i, keys: ['business-card', 'business-card-portrait'] },
  { match: /letterhead/i, keys: ['letterhead'] },
  { match: /postcard/i, keys: ['postcard'] },
  { match: /compliment/i, keys: ['compliment-slip'] },
  { match: /youtube thumbnail/i, keys: ['youtube-thumbnail'] },
  { match: /linkedin/i, keys: ['linkedin-post'] },
];

/** How far out in proportion a NAMED canvas may be before it is refused. */
const NAME_TOLERANCE = 0.25;

/** Nearest shipped canvas: an exact size, then a name, then the shape. */
export function formatFor(width: number, height: number, title = ''): string {
  const exact = DESIGN_FORMATS.find((f) => f.w === width && f.h === height);
  if (exact) return exact.key;

  const ratio = width / height;

  const named = NAMED_FORMAT.find((n) => n.match.test(title));
  if (named) {
    /* Of the variants that name allows, the one shaped like this board. */
    const fits = named.keys
      .map((k) => DESIGN_FORMATS.find((f) => f.key === k))
      .filter((f): f is NonNullable<typeof f> => Boolean(f))
      .map((f) => ({ key: f.key, diff: Math.abs(f.w / f.h - ratio) }))
      .sort((a, b) => a.diff - b.diff)[0];
    if (fits && fits.diff <= NAME_TOLERANCE) return fits.key;
  }
  let best = '';
  let closestShape = Number.POSITIVE_INFINITY;
  let closestScore = Number.POSITIVE_INFINITY;

  for (const f of DESIGN_FORMATS) {
    const diff = Math.abs(f.w / f.h - ratio);
    /*
     * SHAPE DECIDES; size only breaks a tie.
     *
     * MEASURED: weighting the two evenly sent an A5 flyer to a portrait
     * business card, because the card's pixel area was nearer than A4's
     * even though its proportion was ten times further out. An artboard is
     * drawn at whatever scale suited the canvas — one roll-up in this set is
     * 0.5 px per millimetre — so its AREA carries almost no information and
     * its PROPORTION carries all of it.
     */
    const tie = Math.abs(Math.log((f.w * f.h) / (width * height)));
    const score = diff * 100 + tie;
    if (score < closestScore) { closestScore = score; closestShape = diff; best = f.key; }
  }

  /*
   * More than a tenth out in proportion is not the same canvas, whatever is
   * nearest. Returning nothing lets the product's own square default stand,
   * which is a stated fallback rather than a wrong answer.
   */
  return closestShape <= 0.1 ? best : '';
}

/**
 * Classify one artboard from its name and its shape.
 *
 * The shape is the tie-breaker rather than the evidence: a 1080×1920 board is
 * almost always a story, but "Roll-up 850×2000mm" is the same shape and is
 * a print stand, which is why the name is read first.
 */
export function classifyArtboard(
  title: string,
  width: number,
  height: number,
  /**
   * The artboard's OWN title, when `title` also carries its filename.
   *
   * MEASURED: a staff ID card filed as `A3-ID-Front.dc.html` was given an A3
   * poster canvas, because "A3" is the board's filing code on the canvas and
   * reads exactly like the paper size. A filing code helps decide what a
   * design is FOR; it must never decide how big it is.
   */
  canvasTitle: string = title,
): ArtboardClass {
  const format = formatFor(width, height, canvasTitle);
  const named = BY_NAME.find((r) => r.match.test(title));

  if (named) {
    return {
      category: named.category,
      format,
      use: named.use ?? 'marketing',
      tags: named.tags ?? [],
      because: `its name says “${(named.match.source.split('|')[0]).replace(/\\b/g, '')}”`,
    };
  }

  /* No word to go on: fall back to the shape, and say that is what happened. */
  const ratio = width / height;
  if (ratio < 0.7) {
    return { category: 'social', format, use: 'social', tags: ['story'], because: 'it is a tall canvas, which is a story shape' };
  }
  if (ratio > 1.6) {
    return { category: 'flyers', format, use: 'marketing', tags: ['banner'], because: 'it is a wide canvas, which is a banner or billboard shape' };
  }
  return {
    category: 'social',
    format,
    use: 'social',
    tags: ['social post'],
    because: 'nothing in the name said otherwise, and it is a square-ish post shape',
  };
}

/** Every category id, for the picker that lets a reviewer overrule this. */
export const CATEGORY_IDS: DeliverableCategory[] = DELIVERABLE_CATEGORIES.map((c) => c.id);

/**
 * The artboard's name, as a catalogue entry rather than a canvas label.
 *
 * Artboards are filed on a canvas, so their titles carry the filing: "T15
 * First 1,000 numeral", "C1 · Display 300×250", "Business card front,
 * actual size". The code and the dimensions are how a designer finds a board
 * among a hundred; they are noise to a business owner choosing a template,
 * and the size is already shown beside the card.
 *
 * Only the filing is removed. The name itself is left exactly as written —
 * renaming somebody's design is a judgement call, and the review screen
 * lets whoever is publishing make it.
 */
export function cleanLabel(title: string, fallback: string): string {
  let out = title.trim();

  /*
   * A leading board code: "T15 ", "C1 · ", "F1 — ", "A · ".
   *
   * Only when what follows starts with a capital or a digit. Measured on
   * the real set: "A3 campaign poster" and "A5 flyer" are PAPER SIZES used
   * attributively, and stripping those left "campaign poster" and "flyer",
   * which is the one piece of information a print buyer needs.
   */
  out = out.replace(/^[A-Z]{1,2}\d{0,2}\s*[·\-–—]?\s+(?=[A-Z0-9])/, '');

  /* A trailing production note, after a separator. */
  out = out.replace(/\s*[·,—–-]\s*(actual size|incl\.?\s*bleed.*|\d+\s*mm.*|CR80.*|A\d\b.*)$/i, '');

  /*
   * A trailing dimension, with or without a separator: "Display 300×250",
   * "Hero · 1080×1350". The size is already shown beside the card and on
   * the row, so repeating it in the name costs the name its first words.
   * "Display ad 300 by 250" survives, because that is how it is spoken.
   */
  out = out.replace(/\s*[·,—–-]?\s*\d{2,4}\s*[x×]\s*\d{2,4}\s*(?:px|mm)?$/i, '');

  out = out.trim();

  /* A title that was only its filing code tells a reader nothing. */
  if (/^[A-Z]{1,2}\d{0,2}$/.test(out)) return fallback.slice(0, 60);

  return out.length >= 3 ? out.slice(0, 60) : fallback.slice(0, 60);
}
