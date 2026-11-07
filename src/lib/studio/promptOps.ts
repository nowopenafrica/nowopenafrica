/**
 * Turning a sentence into edits, without a model.
 *
 * ── WHY THIS EXISTS BEFORE ANY MODEL DOES ────────────────────────────────
 *
 * The expensive way to build a prompt-driven editor is to send every
 * sentence to a model and let it return a design. Most sentences do not need
 * one. "Make the headline bigger", "change the price to ₦5,000", "centre
 * that", "make the background navy" are each a deterministic change to a
 * document, and a rule can do them instantly, offline, for nothing, and the
 * same way twice.
 *
 * So this handles the sentences it genuinely can, and REFUSES the rest by
 * name. It does not guess. "Make it more premium" is not a document
 * operation and pretending otherwise produces a random change the person
 * then has to undo.
 *
 * ── AND WHY IT IS THE RIGHT FOUNDATION ANYWAY ────────────────────────────
 *
 * Whatever interprets the harder sentences later — a model, on a server,
 * with a budget — has to emit something. It should emit exactly these
 * operations, into exactly the validator in `designPatch.ts`. Building the
 * contract first means the model becomes one more caller rather than a
 * rewrite, and the cheap path keeps serving the sentences that never needed
 * it.
 *
 * NOTE ON SCOPE: this file decides WHAT to change. `designPatch.ts` decides
 * whether that change is allowed. Neither trusts the other.
 */

import type { DesignObject, DesignPage, TextObject } from './designDocument';
import { COLOUR_WORDS, normaliseColour, type PatchOp } from './designPatch';
import { PRESETS, presetPixels } from './formats';

/** A second copy of the design at another size, beside the original. */
export interface PromptVariant {
  presetId: string;
  label: string;
  width: number;
  height: number;
}

export interface PromptOutcome {
  ops: PatchOp[];
  /**
   * Set when the instruction asked for another SIZE rather than an edit.
   *
   * It is separate from `ops` because it is not a change to this page — it
   * adds one. The caller applies it through the document, not the patch.
   */
  variant?: PromptVariant;
  /** False when nothing in the sentence matched something we can do. */
  understood: boolean;
  /** Always set — the screen says this whether it worked or not. */
  say: string;
  /** The instruction needed something selected and nothing was. */
  needsSelection?: boolean;
}

/* ── finding the thing being talked about ─────────────────────────────── */

/**
 * Words people use for the parts of a design, mapped to slot roles.
 *
 * Longest first, so "sub heading" is not matched as "heading".
 */
const ROLE_WORDS: { words: string[]; role: string }[] = [
  { words: ['sub headline', 'sub heading', 'subheading', 'subtitle', 'subline', 'strapline'], role: 'subline' },
  { words: ['headline', 'heading', 'title', 'main text', 'big text'], role: 'headline' },
  { words: ['eyebrow', 'kicker', 'label above'], role: 'eyebrow' },
  { words: ['call to action', 'cta', 'button'], role: 'cta' },
  { words: ['price list', 'prices', 'price'], role: 'price' },
  { words: ['contact', 'phone', 'footer'], role: 'contact' },
  { words: ['business name', 'brand', 'logo text'], role: 'brand' },
  { words: ['services', 'service list', 'list'], role: 'services' },
  { words: ['stats', 'numbers', 'figures'], role: 'stats' },
];

const SELF_WORDS = ['it', 'this', 'that', 'selected', 'selection'];

function objectFor(page: DesignPage, text: string, selectedId: string | null): DesignObject | null {
  for (const { words, role } of ROLE_WORDS) {
    if (!words.some((w) => text.includes(w))) continue;
    const match = page.objects.find((o) => o.slotRole === role)
      /* Fall back to the layer's name — a hand-made object has no slot. */
      ?? page.objects.find((o) => o.name.toLowerCase().includes(role));
    if (match) return match;
  }
  if (selectedId && SELF_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(text))) {
    return page.objects.find((o) => o.id === selectedId) ?? null;
  }
  return selectedId ? page.objects.find((o) => o.id === selectedId) ?? null : null;
}

const describe = (o: DesignObject) => (o.slotRole ? `the ${o.slotRole}` : `"${o.name}"`);

/* ── reading the instruction ──────────────────────────────────────────── */

/**
 * Quoted copy, used exactly as written — a headline the owner typed is a fact.
 *
 * ── WHY A QUOTE MUST CLOSE WITH ITS OWN KIND ─────────────────────────────
 *
 * This was one pattern, `["“”'‘’]([^"“”'‘’]{1,200})["“”'‘’]`, which treats
 * an apostrophe as a closing quote and forbids one inside the copy. So
 * `change the headline to "Ada's Hair Studio"` set the headline to **Ada**.
 *
 * Found by typing a realistic business name into the live editor. It would
 * have truncated most of them — Mama's Kitchen, Joe's Barbers, We're open,
 * Don't miss out — always silently, and always leaving a design that looked
 * like it had worked.
 *
 * Each form now pairs with its own closer, and double quotes are read first,
 * so an apostrophe inside them is just an apostrophe.
 */
const QUOTED_FORMS: RegExp[] = [
  /"([^"]{1,200})"/,
  /“([^”]{1,200})”/,
  /‘([^’]{1,200})’/,
  /*
   * A straight single quote only counts when it opens and closes like one.
   * Without that, "it's Ada's" reads as a quotation of "s Ada".
   */
  /(?:^|[\s(])'([^']{1,200})'(?=$|[\s).,!?:;])/,
];

/** The copy inside the first real quotation, or null when there is none. */
export function quotedCopy(prompt: string): string | null {
  for (const form of QUOTED_FORMS) {
    const found = form.exec(prompt);
    if (found) return found[1];
  }
  return null;
}

const SIZE_UP = /\b(bigger|larger|grow|increase)\b/;
const SIZE_DOWN = /\b(smaller|tinier|shrink|reduce|decrease)\b/;
const A_LOT = /\b(much|a lot|lots|way|far|double)\b/;
const A_BIT = /\b(bit|slightly|little|touch)\b/;

const DIRECTIONS: { words: RegExp; dx: number; dy: number }[] = [
  { words: /\b(up|higher|raise)\b/, dx: 0, dy: -1 },
  { words: /\b(down|lower|drop)\b/, dx: 0, dy: 1 },
  { words: /\bleft\b/, dx: -1, dy: 0 },
  { words: /\bright\b/, dx: 1, dy: 0 },
];

/** What the editor can do without a model, said in the words it accepts. */
export const CAPABILITIES = [
  'make the headline bigger / smaller',
  'change the price to "₦5,000"',
  'make the background navy',
  'centre the headline',
  'make the subtitle bold',
  'move it up a bit',
  'fade the band',
];

const colourIn = (text: string): string | null => {
  const hex = /#[0-9a-f]{3,6}\b/i.exec(text);
  if (hex) return normaliseColour(hex[0]);
  const word = COLOUR_WORDS.find((c) => new RegExp(`\\b${c}\\b`).test(text));
  return word ? normaliseColour(word) : null;
};

/**
 * Read an instruction against the current design.
 *
 * Returns `understood: false` rather than an empty operation list when
 * nothing matched, because those are different things and the screen has to
 * say different words for them.
 */
export function opsFromPrompt(
  prompt: string,
  page: DesignPage,
  selectedId: string | null = null,
): PromptOutcome {
  const text = (prompt ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return { ops: [], understood: false, say: 'Type what you want changed.' };

  /*
   * Another size is answered first and alone. "Make a Story version and the
   * headline bigger" would otherwise do both — to the ORIGINAL page, since
   * the new one does not exist yet, which is not what the sentence asked.
   */
  const variant = variantFor(text);
  if (variant) {
    return {
      ops: [],
      variant,
      understood: true,
      say: `Added ${article(variant.label)} ${variant.label} version beside this one.`,
    };
  }

  const ops: PatchOp[] = [];
  const target = objectFor(page, text, selectedId);
  const wantsBackground = /\bbackground\b|\bcanvas\b|\bpage\b/.test(text);
  const colour = colourIn(text);
  const amount = A_LOT.test(text) ? 'lot' : A_BIT.test(text) ? 'bit' : 'normal';

  /* Background first: "make the background navy" names no object. */
  if (wantsBackground && colour) {
    ops.push({ op: 'setBackground', colour });
  }

  if (target) {
    const isText = target.type === 'text';

    if (SIZE_UP.test(text)) {
      ops.push({ op: 'scaleText', id: target.id, factor: amount === 'lot' ? 1.6 : amount === 'bit' ? 1.12 : 1.3 });
    } else if (SIZE_DOWN.test(text)) {
      ops.push({ op: 'scaleText', id: target.id, factor: amount === 'lot' ? 0.6 : amount === 'bit' ? 0.9 : 0.78 });
    }

    if (colour && !wantsBackground) {
      ops.push(isText
        ? { op: 'setColour', id: target.id, colour }
        : { op: 'setFill', id: target.id, fill: colour });
    }

    if (/\b(centre|center|middle)\b/.test(text)) ops.push({ op: 'setAlign', id: target.id, align: 'center' });
    else if (/\bleft align|align left\b/.test(text)) ops.push({ op: 'setAlign', id: target.id, align: 'left' });
    else if (/\bright align|align right\b/.test(text)) ops.push({ op: 'setAlign', id: target.id, align: 'right' });

    if (/\b(bold|bolder|heavier|strong)\b/.test(text)) ops.push({ op: 'setWeight', id: target.id, weight: 800 });
    else if (/\b(lighter|thinner|light)\b/.test(text)) ops.push({ op: 'setWeight', id: target.id, weight: 300 });

    if (/\b(uppercase|caps|capitals|shout)\b/.test(text)) ops.push({ op: 'setCase', id: target.id, upper: true });
    else if (/\b(lowercase|sentence case|normal case)\b/.test(text)) ops.push({ op: 'setCase', id: target.id, upper: false });

    if (/\b(fade|faded|transparent|softer|ghost)\b/.test(text)) {
      ops.push({ op: 'setOpacity', id: target.id, opacity: amount === 'lot' ? 0.25 : 0.55 });
    }

    const dir = DIRECTIONS.find((d) => d.words.test(text));
    if (dir && /\b(move|nudge|shift|push|up|down|left|right|higher|lower|raise|drop)\b/.test(text)) {
      const step = amount === 'lot' ? 0.12 : amount === 'bit' ? 0.02 : 0.06;
      ops.push({ op: 'nudge', id: target.id, dx: dir.dx * step, dy: dir.dy * step });
    }

    /*
     * Quoted copy LAST, and only when the sentence asks for a replacement.
     * A quote inside "make the headline say 'Open late'" is the new words;
     * a quote in "make the 'headline' bigger" is just emphasis.
     */
    const quoted = quotedCopy(prompt ?? '');
    if (quoted && /\b(say|says|read|reads|change|replace|set|write|put)\b/.test(text)) {
      if (isText) ops.push({ op: 'setText', id: target.id, text: quoted });
      else {
        return {
          ops,
          understood: false,
          say: `${describe(target)} is not text, so I cannot change what it says.`,
        };
      }
    }
  }

  if (!ops.length) {
    /*
     * Two different failures, two different sentences. "I did not follow
     * that" when nothing matched; "which one?" when the instruction was
     * fine but had nothing to act on.
     */
    const needsSelection = !target && !wantsBackground;
    return {
      ops: [],
      understood: false,
      needsSelection,
      say: needsSelection
        ? 'Select something first, or name it — the headline, the price, the background.'
        : `I can't do that one yet. Try: ${CAPABILITIES.slice(0, 3).join('; ')}.`,
    };
  }

  const what = ops.some((o) => o.op === 'setBackground') && ops.length === 1
    ? 'the background'
    : target ? describe(target) : 'the design';
  return { ops, understood: true, say: `Updated ${what}.` };
}

/* ── another size ─────────────────────────────────────────────────────── */

/**
 * The words people use for a size, mapped to the editor's own presets.
 *
 * Longest first: "facebook cover" must not be read as "facebook", and
 * "instagram story" must not be read as "instagram post".
 */
const FORMAT_WORDS: { words: string[]; id: string }[] = [
  { words: ['whatsapp status', 'whatsapp'], id: 'whatsapp-status' },
  { words: ['instagram story', 'ig story', 'story', 'stories', 'reel'], id: 'ig-story' },
  { words: ['instagram post', 'square post', 'instagram'], id: 'ig-square' },
  { words: ['portrait post'], id: 'ig-portrait' },
  { words: ['tiktok'], id: 'tiktok' },
  { words: ['facebook cover'], id: 'facebook-cover' },
  { words: ['facebook'], id: 'facebook-post' },
  { words: ['linkedin banner'], id: 'linkedin-banner' },
  { words: ['linkedin'], id: 'linkedin-post' },
  { words: ['youtube thumbnail', 'thumbnail'], id: 'youtube-thumb' },
  { words: ['x post', 'twitter'], id: 'x-post' },
  { words: ['pinterest'], id: 'pinterest' },
  { words: ['website banner', 'web banner', 'hero banner'], id: 'web-hero' },
  { words: ['email header'], id: 'email-header' },
  { words: ['business card'], id: 'business-card' },
  { words: ['postcard'], id: 'postcard' },
  { words: ['certificate'], id: 'certificate' },
  { words: ['a3 poster', 'a3'], id: 'a3' },
  { words: ['a5 flyer', 'a5'], id: 'a5' },
  { words: ['a6', 'handbill'], id: 'a6' },
  { words: ['a4 flyer', 'a4', 'flyer'], id: 'a4' },
  { words: ['poster'], id: 'a3' },
  { words: ['presentation', 'slide'], id: 'slide-wide' },
];

/*
 * A size word alone is not a request for one.
 *
 * "Make the card bigger" names a format AND a size change, and is plainly an
 * edit to the design in front of you. Requiring one of these words keeps the
 * two apart, so nothing ever silently gains a page.
 */
const WANTS_VARIANT = /\b(version|variant|resize|resized|adapt|another size|different size)\b/;

/* "a Instagram story" reads as carelessness in a sentence the customer sees. */
const article = (label: string) => (/^[aeiou]/i.test(label.trim()) ? 'an' : 'a');

function variantFor(text: string): PromptVariant | null {
  if (!WANTS_VARIANT.test(text)) return null;
  for (const { words, id } of FORMAT_WORDS) {
    if (!words.some((w) => text.includes(w))) continue;
    const preset = PRESETS.find((x) => x.id === id);
    if (!preset) continue;
    const size = presetPixels(preset);
    return { presetId: id, label: preset.label, width: size.width, height: size.height };
  }
  return null;
}

/** A short, honest line for the composer's placeholder. */
export const PROMPT_PLACEHOLDER = 'Make the headline bigger, change the price to "₦5,000", background navy…';

/** Text objects worth offering as quick targets, biggest type first. */
export function promptTargets(page: DesignPage): TextObject[] {
  return (page.objects.filter((o) => o.type === 'text' && !o.locked) as TextObject[])
    .slice()
    .sort((a, b) => b.size - a.size);
}
