// A category's gallery, composed by the engine instead of drawn by hand.
//
// WHY. The founder's verdict on the category templates (2026-11-17): "still
// looking basic; it doesn't reflect the standard of the new updates". They are
// the older slot layouts: fixed boxes, tiny labels, filler such as "Your story
// line" and "00%". The engine built this week already knows composition, type
// for the job, palette for the price level, honest copy and the house's
// quality gates. This file points it at a category: for an item ("Flyer",
// "Event poster", "Business card") it composes a set of distinct designs at the
// item's real format, and keeps only those that pass every measured check.
//
// What it will not do: invent a business, a price or a date (copy comes from
// the gated bank or is a "Your ..." placeholder), use a photograph outside
// development (none has been through intake; see photoSet.ts), or offer an item it cannot make properly. Letterheads,
// invoices, guidelines, carousels, packaging and documents are multi-part or
// document layouts; they keep their templates until the engine can do them.

import { formatOf, type Format } from '../../design/formats';
import { readBrief, type CreativeBrief, type Objective } from '../brief';
import { SUBCATEGORIES } from '../catalogueTaxonomy';
import { ALL_PAIRINGS, INDUSTRIES, MOVEMENTS, archetypeOf, movementOf, pairingProblems, typefaceLabel, type ArchetypeKey, type TypeContext } from '../intel';
import type { DesignDocument } from '../../studio/designDocument';
import { IMPLEMENTED, composeWithReport, type ConceptCopy } from './archetypes';
import { checkConcept } from './conceptChecks';
import { BY_GOAL, BY_TRADE } from './copyBank';
import { CAPS, PATTERN, asPlaceholder, paletteFor, seedOf, turned } from './concepts';
import { PILOT_PHOTOS, type PilotPhoto } from './photoSet';
import { MANIFEST, assetUrl, type AssetManifest } from '../../design/assetManifest';

interface Kit {
  goal: Objective;
  /** Facts the item carries, as placeholders. */
  details: string[];
  /** Copy that replaces the bank's: a card leads with a name, a menu with what it is. */
  fixed?: Partial<ConceptCopy>;
  /** Extra headlines that belong to this item, all written to the bank's rules. */
  heads?: string[];
  /**
   * How many of `details`, from the first, a design must show to be offered.
   * A business card without a phone number, or an event poster without a
   * date, fails at the one thing it is for, however good it looks.
   */
  require?: number;
}

const HERE = ['Where: Your address', 'Open: Your hours', 'Call: Your phone'];
const WHEN = ['Date: Your date', 'Time: Your time', 'Venue: Your venue'];

/** The items the engine can make, and what each must say. */
export const GALLERY_KITS: Record<string, Kit> = {
  'business-card': { goal: 'identity', require: 2, details: ['Phone: Your phone', 'Email: Your email', 'Address: Your address'],
    fixed: { headline: 'Your name', eyebrow: 'Your role', support: undefined, cta: undefined } },
  'brand-launch': { goal: 'launch', details: ['Where: Your website'] },
  'instagram-post': { goal: 'awareness', details: HERE },
  story: { goal: 'awareness', details: HERE },
  'reels-cover': { goal: 'awareness', details: [] },
  'page-banner': { goal: 'identity', details: [] },
  'youtube-thumbnail': { goal: 'awareness', details: [] },
  'sale-post': { goal: 'sale', require: 1, details: ['Offer: Your offer', 'Ends: Your end date', 'Where: Your address'] },
  'offer-flyer': { goal: 'sale', require: 1, details: ['Offer: Your offer', 'Ends: Your end date', 'Where: Your address'] },
  'display-ad': { goal: 'sale', details: [] },
  flyer: { goal: 'awareness', details: HERE },
  poster: { goal: 'awareness', details: HERE },
  notice: { goal: 'inform', require: 2, details: ['From: Your date', 'Hours: Your new hours', 'Questions: Your phone'] },
  'event-poster': { goal: 'event', require: 3, details: WHEN },
  invitation: { goal: 'event', require: 2, details: WHEN, heads: ['You are invited.', 'Join us to celebrate.', 'Save the date.', 'Celebrate with us.', 'Your presence is requested.', 'Come and celebrate.'] },
  ticket: { goal: 'event', require: 2, details: WHEN, heads: ['Admit one.', 'Your seat is waiting.', 'Keep this ticket.', 'Entry pass.'] },
  'speaker-card': { goal: 'event', require: 2, details: ['Talk: Your talk title', 'When: Your date'], fixed: { headline: 'Your speaker name', eyebrow: 'Speaking at' } },
  menu: { goal: 'awareness', require: 3, details: ['Your dish: Your price', 'Your dish: Your price', 'Your dish: Your price', 'Your dish: Your price'],
    fixed: { eyebrow: 'Menu' }, heads: ['What we cook.', 'On the menu.', 'Eat well here.', 'Cooked to order.', 'Come hungry.', 'Our kitchen, your table.', 'Order what you love.', 'Something for everyone.'] },
  'price-list': { goal: 'inform', require: 3, details: ['Your service: Your price', 'Your service: Your price', 'Your service: Your price', 'Your service: Your price'],
    fixed: { eyebrow: 'Price list' }, heads: ['Our prices.', 'What it costs.', 'Clear prices.', 'Our services.', 'Simple and fair.', 'No surprises.', 'Prices at a glance.', 'What we offer.'] },
  'rate-card': { goal: 'inform', require: 2, details: ['Your service: Your rate', 'Your service: Your rate', 'Your service: Your rate'],
    fixed: { eyebrow: 'Rates' }, heads: ['Our rates.', 'Work with us.', 'Rates at a glance.', 'What we charge.', 'Book our services.', 'Plain rates.', 'How we charge.', 'Our services.'] },
  'shopfront-sign': { goal: 'identity', details: [] },
  'roll-up': { goal: 'awareness', details: HERE },
  billboard: { goal: 'awareness', details: [] },
  'billboard-48-sheet': { goal: 'awareness', details: [] },
  banner: { goal: 'awareness', details: [] },
};

export const galleryCovers = (deliverable: string): boolean => !!GALLERY_KITS[deliverable] && !!SUBCATEGORIES.find((s) => s.key === deliverable);

/** Does the design show the facts its item must carry? A value may be set alone or after its label. */
export function showsFacts(doc: DesignDocument, kit: Kit): boolean {
  const need = kit.require ?? 0;
  if (!need) return true;
  const text = doc.pages[0].objects.filter((o) => o.type === 'text').map((o) => (o as { text: string }).text.replace(/\s+/g, ' ')).join(' | ');
  /* Menus repeat one placeholder, so count occurrences rather than test each line once. */
  const wanted = kit.details.slice(0, need).map((d) => (d.includes(':') ? d.slice(d.indexOf(':') + 1).trim() : d));
  const tally = new Map<string, number>();
  for (const w of wanted) tally.set(w, (tally.get(w) ?? 0) + 1);
  for (const [w, times] of tally) if (text.split(w).length - 1 < times) return false;
  return true;
}

export interface GalleryDesign {
  id: string;
  doc: DesignDocument;
  movement: string;
  archetype: ArchetypeKey;
  pairing: string;
  palette: string;
  /** "Headline in X, text in Y", the same line a concept card shows. */
  type: string;
  /** Lines the format had no room for, reported rather than cut. */
  omitted: string[];
  /** The pilot photograph a photo-led design uses. */
  photo?: PilotPhoto;
  /** True while that photograph is not approved: shown in development only, never saved. */
  preview?: boolean;
}

export interface GalleryOptions {
  /** An INDUSTRIES key. Without one the copy is honest for any business. */
  trade?: string;
  count?: number;
  /** A FORMATS key the item is made on; defaults to the item's first. */
  format?: string;
  /**
   * Where the pilot photographs are served (PHOTO_BASE, development only).
   * With it, every other design is photo-led; without it the gallery is type-led.
   */
  photos?: string;
  /** The approved-asset manifest; tests pass a fixture. Approved photographs are used everywhere. */
  manifest?: AssetManifest;
}

interface PhotoSource { photo: PilotPhoto; url: string; preview: boolean }

/**
 * The photographs a gallery may draw: every approved copy (from the manifest,
 * so production gets them too), then, in development, the rest as previews.
 */
function photoSources(deliverable: string, trade: string | undefined, base: string | undefined, manifest: AssetManifest): PhotoSource[] {
  return photosFor(deliverable, trade).flatMap((photo): PhotoSource[] => {
    const id = photo.file.match(/(\d+)\.\w+$/)?.[1];
    const approved = manifest.assets.find((a) => a.kind === 'photo' && a.sourceId === id);
    const url = approved ? assetUrl(approved.id, manifest) : null;
    if (url) return [{ photo, url, preview: false }];
    return base ? [{ photo, url: `${base}/${photo.file}`, preview: true }] : [];
  });
}

/* What each item's photograph should show when no trade is chosen. */
const PHOTO_SUBJECTS: Record<string, string[]> = {
  menu: ['food'], 'price-list': ['beauty', 'food'], 'rate-card': ['work'],
  'event-poster': ['celebration'], invitation: ['celebration'], ticket: ['celebration'],
  'speaker-card': ['work', 'beauty'], 'business-card': ['work', 'beauty'],
};

/** Photographs for an item and trade, the trade's own first; rotated so a gallery never repeats one too soon. */
export function photosFor(deliverable: string, trade?: string): PilotPhoto[] {
  const group = trade ? INDUSTRIES.find((i) => i.key === trade)?.group : undefined;
  const subjects = PHOTO_SUBJECTS[deliverable];
  /* A card for a person shows a person. */
  const personal = ['speaker-card', 'business-card'].includes(deliverable);
  const pool = personal ? PILOT_PHOTOS.filter((p) => p.people) : PILOT_PHOTOS;
  const byTrade = group ? pool.filter((p) => p.groups.includes(group)) : [];
  const bySubject = subjects ? pool.filter((p) => p.subjects.some((x) => subjects.includes(x))) : [];
  /* Any business: one of each kind in turn (food, a portrait, work, a celebration...), so the set reads as range. */
  const kinds = uniq(['food', 'beauty', 'celebration', 'craft', 'work', ...PILOT_PHOTOS.flatMap((p) => p.subjects)]);
  const spread: PilotPhoto[] = [];
  for (let i = 0; spread.length < PILOT_PHOTOS.length && i < PILOT_PHOTOS.length; i += 1) {
    for (const k of kinds) { const p = pool.filter((x) => x.subjects.includes(k))[i]; if (p && !spread.includes(p)) spread.push(p); }
  }
  return uniq([...byTrade, ...(byTrade.length ? [] : bySubject), ...(byTrade.length || bySubject.length ? [] : spread)]);
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

/*
 * Headlines true of any honest business, for a gallery with no trade chosen.
 * The bank's goal lines alone gave six, so eight designs repeated two of them.
 * Every line is held to the same gate as the bank (gallery.test.ts).
 */
export const GENERAL_HEADS: Partial<Record<Objective, string[]>> = {
  awareness: ['Good work, close to home.', 'Made with care.', 'Worth the visit.', 'Here for you.', 'Ask us anything.', 'Simply done well.'],
  sale: ['Good things, good prices.', 'A little less, for a little while.', 'Do not miss this.', 'Come early.', 'Your favourites, on offer.', 'Treat yourself.'],
  event: ['Mark your calendar.', 'Something to look forward to.', 'Be part of it.', 'Come as you are.', 'See you there.', 'An evening worth keeping.'],
  inform: ['Please read.', 'Things are changing.', 'Here is the plan.', 'A note for you.', 'Before you visit.', 'Keep this handy.'],
  identity: ['This is us.', 'Know the name.', 'Made to be remembered.', 'Nice to meet you.', 'Look for us.', 'The name to know.'],
  launch: ['Something new.', 'It is here.', 'Ready when you are.', 'Say hello to it.', 'Made for you.', 'Now you can.'],
};

function headlinesFor(kit: Kit, trade?: string): string[] {
  const tradeLines = trade ? BY_TRADE[trade]?.map((t) => t[0]) ?? [] : [];
  /* An item with its own lines (a menu, an invitation) speaks in them first; the general lines are a last resort. */
  return uniq([...(kit.heads ?? []), ...tradeLines, ...BY_GOAL[kit.goal].map((l) => l.headline), ...(GENERAL_HEADS[kit.goal] ?? []), ...(kit.goal === 'awareness' ? BY_GOAL.identity.map((l) => l.headline) : [])]);
}

function linesFor(kit: Kit, trade: string | undefined, n: number): Omit<ConceptCopy, 'brand' | 'details'> {
  const goal = BY_GOAL[kit.goal][n % 3];
  const t = trade ? BY_TRADE[trade]?.[n % 3] : undefined;
  return {
    eyebrow: goal.eyebrow,
    headline: headlinesFor(kit, trade)[n % headlinesFor(kit, trade).length],
    support: t?.[1] ?? goal.support,
    cta: t?.[2] ?? goal.cta,
  };
}

/**
 * Up to `count` distinct designs for one item. Every one passes the measured
 * checks; a design that does not is skipped, never shown with a defect.
 */
export function galleryFor(deliverable: string, opts: GalleryOptions = {}): GalleryDesign[] {
  const kit = GALLERY_KITS[deliverable];
  const sub = SUBCATEGORIES.find((s) => s.key === deliverable);
  if (!kit || !sub) return [];
  const formatKey = opts.format && sub.formats.includes(opts.format) ? opts.format : sub.formats[0];
  const format = formatOf(formatKey) as Format;
  if (!format) return [];
  const count = opts.count ?? 8;

  const trade = opts.trade;
  const tradeName = trade ? trade.replace(/-/g, ' ') : 'my business';
  const brief: CreativeBrief = readBrief(`${sub.name} for ${tradeName}`);
  const roadside = /^(billboard|board-)/.test(formatKey);
  const smallPrint = /^(business-card|compliment-slip)/.test(formatKey);
  /* The trade's own styles first, then every other movement, so a long gallery still varies. */
  const order = uniq([...brief.movements.value, ...MOVEMENTS.map((m) => m.key)]);
  const seed = seedOf(`${deliverable}/${trade ?? ''}`);

  const out: GalleryDesign[] = [];
  const combos = new Set<string>();
  const archetypeUse = new Map<ArchetypeKey, number>();
  const palettes = new Set<string>();
  const displays = new Map<string, number>();
  const pool = photoSources(deliverable, trade, opts.photos, opts.manifest ?? MANIFEST);
  let photoUse = 0;

  for (let pass = 0; pass < 3 && out.length < count; pass += 1) {
    for (const key of order) {
      if (out.length >= count) break;
      const movement = movementOf(key);
      if (!movement) continue;
      const n = out.length;
      const lines = linesFor(kit, trade, n);
      const copy: ConceptCopy = {
        brand: 'Your brand', ...lines, ...kit.fixed,
        details: kit.details.map(asPlaceholder),
      };
      const words = copy.headline.split(/\s+/).length;
      const ctx: TypeContext = { distance: roadside, smallPrint, headlineWords: words, capitals: CAPS.has(movement.key) };
      /*
       * Photo-led layouts only when photographs are given (development, until
       * the intake clears them), and then on every other design, so the set
       * mixes photographs and type.
       */
      const usable = turned(movement.archetypes.filter((a) => IMPLEMENTED.includes(a) && (pool.length > 0 || !archetypeOf(a).needsImage)), seed + pass);
      const wantPhoto = pool.length > 0 && n % 2 === 0;
      const archetypes = [...usable].sort((a, b) => Number(archetypeOf(b).needsImage === wantPhoto) - Number(archetypeOf(a).needsImage === wantPhoto));
      const pairings = turned(movement.pairings, (seed >>> 3) + pass).filter((k) => {
        const p = ALL_PAIRINGS.find((x) => x.key === k);
        return !!p && pairingProblems(p, ctx).length === 0;
      });
      let placed = false;
      for (const archetype of archetypes) {
        if (placed || (archetypeUse.get(archetype) ?? 0) >= 2) continue;
        /* Prefer a headline face the gallery has used least. */
        const ranked = [...pairings].sort((a, b) => (displays.get(ALL_PAIRINGS.find((x) => x.key === a)!.display) ?? 0) - (displays.get(ALL_PAIRINGS.find((x) => x.key === b)!.display) ?? 0));
        for (const pk of ranked) {
          if (combos.has(`${archetype}/${pk}`)) continue;
          const p = ALL_PAIRINGS.find((x) => x.key === pk)!;
          const palette = paletteFor(movement, palettes, seed + n, brief.tier?.value);
          const photo = archetypeOf(archetype).needsImage ? pool[photoUse % pool.length] : undefined;
          const input = {
            copy, colours: palette.colours, fonts: { display: p.display, text: p.text, accent: p.accent },
            ...(photo && { image: photo.url }),
            upperHeadline: CAPS.has(movement.key),
            ...(archetype === 'pattern-field' && { pattern: PATTERN[movement.key] ?? 'rings' }),
          };
          const { doc, omitted } = composeWithReport(archetype, input, format, `${sub.name}: ${movement.name}`, { distance: roadside });
          if (checkConcept(doc, { format, distance: roadside }).length) continue;
          /* A design that had to drop its headline is not a design. */
          if (omitted.includes('Headline')) continue;
          if (!showsFacts(doc, kit)) continue;
          combos.add(`${archetype}/${pk}`);
          archetypeUse.set(archetype, (archetypeUse.get(archetype) ?? 0) + 1);
          palettes.add(palette.key);
          displays.set(p.display, (displays.get(p.display) ?? 0) + 1);
          const type = p.display === p.text
            ? `Type: ${typefaceLabel(p.display)} throughout`
            : `Headline in ${typefaceLabel(p.display)}, text in ${typefaceLabel(p.text)}`;
          if (photo) photoUse += 1;
          out.push({ id: `${deliverable}-${formatKey}-${movement.key}-${archetype}-${pk}`, doc, movement: movement.name, archetype, pairing: pk, palette: palette.key, type, omitted, ...(photo && { photo: photo.photo, preview: photo.preview }) });
          placed = true;
          break;
        }
      }
    }
  }
  return out;
}
