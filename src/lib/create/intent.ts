import type { StyleTag, TemplateUse } from '../design/tags';
import { NEEDS, type NeedSlug } from './needs';

/**
 * "What do you want to create?" — understanding the sentence.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ─────────────────────────────────────
 *
 * This is a deterministic reader, not a language model. It runs in the
 * browser, costs nothing, cannot be rate-limited, and returns the same answer
 * for the same sentence every time — which is why it can be tested properly
 * rather than sampled and hoped over.
 *
 * It is honest about its own limits. Where a model WOULD earn its place —
 * writing the words for a flyer, inventing imagery, scripting a film — this
 * layer does not pretend. It identifies what is being asked for, routes to
 * the workflow the product can actually perform, and says plainly when the
 * thing asked for is not something NowOpen can produce today.
 *
 * The product brief is explicit about this: "If a provider or API credential
 * is missing, implement the appropriate integration boundary, document the
 * required configuration, and provide an honest development fallback." The
 * boundary is `routeFor` below, and the fallback is the real design engine.
 */

export type CreateKind = 'graphic' | 'video' | 'brand' | 'campaign' | 'copy' | 'unknown';

export interface CreateIntent {
  kind: CreateKind;
  /** 0..1 — how much of the sentence actually pointed at this answer. */
  confidence: number;
  platform: string | null;
  /** A preset id from lib/studio/formats.ts, when the words implied one. */
  formatId: string | null;
  styleTag: StyleTag | null;
  /** The part of the catalogue to search, when the words implied one. */
  use: TemplateUse | null;
  /** Words worth searching the template catalogue with. */
  keywords: string[];
  /** The normalised sentence, for readers that need the short words keywords drop ("ID", "up"). */
  raw?: string;
  /** Copy the user put in quotes — used verbatim, never paraphrased. */
  headline: string | null;
  /** Only the questions whose answers would change the result. */
  missing: string[];
  /** Plain language: why this route, so the screen can say it. */
  reason: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9"'\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Words that say what is being made. Order matters: first match wins. */
const KIND_WORDS: { kind: CreateKind; words: string[] }[] = [
  { kind: 'campaign', words: ['campaign', 'launch everything', 'full set', 'whole set', 'every size'] },
  { kind: 'video', words: ['video', 'reel', 'tiktok video', 'advert film', 'commercial', 'motion', 'animation', 'storyboard', 'film'] },
  { kind: 'brand', words: ['logo', 'brand kit', 'brand identity', 'identity', 'rebrand', 'brand guidelines', 'visual identity'] },
  { kind: 'copy', words: ['caption', 'captions', 'copywriting', 'write copy', 'marketing copy', 'product description', 'headlines for'] },
  {
    kind: 'graphic',
    words: ['flyer', 'poster', 'post', 'banner', 'graphic', 'design', 'card', 'invite', 'invitation',
      'menu', 'certificate', 'leaflet', 'handbill', 'advert', 'ad', 'story', 'thumbnail', 'sticker', 'label'],
  },
];

const PLATFORMS: { id: string; words: string[]; formatId: string; story?: string }[] = [
  { id: 'instagram', words: ['instagram', 'ig', 'insta'], formatId: 'ig-square', story: 'ig-story' },
  { id: 'tiktok', words: ['tiktok', 'tik tok'], formatId: 'tiktok' },
  { id: 'whatsapp', words: ['whatsapp', 'wa status'], formatId: 'whatsapp-status' },
  { id: 'facebook', words: ['facebook', 'fb'], formatId: 'facebook-post' },
  { id: 'linkedin', words: ['linkedin'], formatId: 'linkedin-post' },
  { id: 'x', words: ['twitter', 'x post'], formatId: 'x-post' },
  { id: 'youtube', words: ['youtube', 'thumbnail'], formatId: 'youtube-thumb' },
  { id: 'pinterest', words: ['pinterest'], formatId: 'pinterest' },
];

/** Printed things name their own size. */
const PRINT_FORMATS: { words: string[]; formatId: string }[] = [
  { words: ['business card', 'complimentary card', 'name card'], formatId: 'business-card' },
  { words: ['a3', 'large poster'], formatId: 'a3' },
  { words: ['a4', 'flyer', 'leaflet'], formatId: 'a4' },
  { words: ['a5'], formatId: 'a5' },
  { words: ['a6', 'handbill'], formatId: 'a6' },
  { words: ['poster'], formatId: 'a3' },
  { words: ['menu'], formatId: 'menu' },
  { words: ['certificate'], formatId: 'certificate' },
  { words: ['invitation', 'invite'], formatId: 'invitation' },
  { words: ['postcard'], formatId: 'postcard' },
  { words: ['sticker', 'label'], formatId: 'label' },
];

/** Words that describe a look, mapped to the tags the catalogue is tagged with. */
const STYLE_WORDS: { tag: StyleTag; words: string[] }[] = [
  { tag: 'premium', words: ['premium', 'high end', 'upmarket', 'classy'] },
  { tag: 'luxury', words: ['luxury', 'luxe', 'expensive', 'exclusive'] },
  { tag: 'minimal', words: ['minimal', 'simple', 'clean', 'plain'] },
  { tag: 'bold', words: ['bold', 'loud', 'striking', 'punchy'] },
  { tag: 'editorial', words: ['editorial', 'magazine', 'typographic'] },
  { tag: 'elegant', words: ['elegant', 'refined', 'graceful'] },
  { tag: 'playful', words: ['playful', 'fun', 'cheerful', 'friendly'] },
  { tag: 'corporate', words: ['corporate', 'professional', 'business like', 'formal'] },
  { tag: 'street', words: ['street', 'urban', 'raw'] },
  { tag: 'afro-modern', words: ['afro', 'african', 'afrocentric'] },
  { tag: 'fashion', words: ['fashion', 'runway', 'lookbook'] },
  { tag: 'tech', words: ['tech', 'startup', 'digital', 'software'] },
];

/** The part of the catalogue a request belongs to. */
const USE_WORDS: { use: TemplateUse; words: string[] }[] = [
  { use: 'event', words: ['event', 'opening', 'launch', 'party', 'concert', 'conference', 'wedding', 'anniversary', 'festival'] },
  { use: 'marketing', words: ['sale', 'offer', 'discount', 'promo', 'promotion', 'advert', 'ad', 'campaign', 'new product'] },
  { use: 'business', words: ['price list', 'business card', 'hours', 'services', 'report', 'profile', 'hiring', 'vacancy'] },
  { use: 'social', words: ['post', 'story', 'reel', 'quote', 'testimonial', 'review'] },
];

const NOISE = new Set([
  'create', 'make', 'design', 'need', 'want', 'please', 'help', 'for', 'my', 'me', 'a', 'an', 'the',
  'with', 'and', 'that', 'this', 'some', 'something', 'new', 'can', 'you', 'i', 'to', 'of', 'in', 'on',
  'is', 'it', 'about', 'using', 'use', 'would', 'like', 'get', 'got',
]);

/** Anything the user put in quotes is theirs, and is used exactly as written. */
export function quotedText(input: string): string | null {
  const m = input.match(/["“”']([^"“”']{2,120})["“”']/);
  return m ? m[1].trim() : null;
}

/**
 * Whole words only.
 *
 * This used to be `text.includes(w)`, and the two-letter aliases made that
 * quietly catastrophic: "ig" matched inside "des-ig-n", so "make me a design"
 * was read as an Instagram request and silently given a square canvas. "ad"
 * sits inside "ready", "fb" inside nothing useful, and "x" inside everything.
 *
 * Multi-word entries are matched as phrases, which is why the boundary is
 * built around the whole string rather than each word in it.
 */
const BOUNDARY = new Map<string, RegExp>();
const has = (text: string, words: string[]): string | null => {
  for (const w of words) {
    let re = BOUNDARY.get(w);
    if (!re) {
      re = new RegExp(`(?:^|\\s)${w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
      BOUNDARY.set(w, re);
    }
    if (re.test(text)) return w;
  }
  return null;
};

/**
 * Read a sentence.
 *
 * Confidence is the share of the answer that came from the words rather than
 * from a default — it is reported so the screen can ask instead of assuming,
 * never to decorate the result with a number.
 */
export function classifyIntent(input: string): CreateIntent {
  const text = ` ${norm(input)} `;
  const words = text.split(' ').filter((w) => w.length > 2 && !NOISE.has(w));

  let kind: CreateKind = 'unknown';
  let signals = 0;
  for (const entry of KIND_WORDS) {
    if (has(text, entry.words)) { kind = entry.kind; signals += 1; break; }
  }

  /*
   * A cover is a still, whatever it is a cover OF.
   *
   * "Reel cover", "video thumbnail", "story artwork" all contain a word from
   * the video list and all describe a picture. Without this, asking for a
   * reel cover is answered with "we cannot render video" — a refusal to do
   * something the user never asked for.
   */
  if (kind === 'video' && /\b(cover|thumbnail|artwork|poster|still)\b/.test(text)) kind = 'graphic';

  const platform = PLATFORMS.find((p) => has(text, p.words)) ?? null;
  if (platform) signals += 1;

  const wantsStory = /\b(story|stories|reel|reels|vertical|9:16)\b/.test(text);
  const print = PRINT_FORMATS.find((f) => has(text, f.words)) ?? null;

  /*
   * A named platform beats a printed size: "instagram flyer" is a square
   * post, not a sheet of A4. The word "flyer" describes the job, and the
   * platform describes where it has to fit.
   */
  let formatId: string | null = null;
  if (platform) formatId = (wantsStory && platform.story) ? platform.story : platform.formatId;
  else if (print) { formatId = print.formatId; signals += 1; }
  else if (wantsStory) {
    /*
     * "A story graphic", with no platform named, is still 9:16. The shape was
     * stated even though the network was not, and leaving the format empty
     * would hand a vertical request a square canvas.
     */
    formatId = 'ig-story';
    signals += 1;
  }

  const style = STYLE_WORDS.find((s) => has(text, s.words)) ?? null;
  if (style) signals += 1;

  const use = USE_WORDS.find((u) => has(text, u.words)) ?? null;
  if (use) signals += 1;

  const headline = quotedText(input);
  if (headline) signals += 1;

  const missing: string[] = [];
  if (kind === 'unknown') missing.push('What are you making — a flyer, a post, a video, a logo?');
  if (kind === 'graphic' && !formatId) missing.push('Where will it be used — Instagram, WhatsApp, or printed?');
  if (!headline) missing.push('What should it say? Put the exact words in quotes and they will be used as written.');

  const reason = kind === 'unknown'
    ? 'Not enough to go on yet.'
    : `Read as ${LABEL[kind]}${platform ? ` for ${platform.id}` : ''}${style ? `, ${style.tag} in feel` : ''}.`;

  return {
    kind,
    confidence: Math.min(1, signals / 4),
    platform: platform?.id ?? null,
    formatId,
    styleTag: style?.tag ?? null,
    use: use?.use ?? null,
    keywords: [...new Set(words)].slice(0, 8),
    raw: text.trim(),
    headline,
    missing,
    reason,
  };
}

const LABEL: Record<CreateKind, string> = {
  graphic: 'a design',
  video: 'a video',
  brand: 'brand identity work',
  campaign: 'a campaign',
  copy: 'written copy',
  unknown: 'something',
};

export type CreateRoute =
  | { action: 'design'; intent: CreateIntent }
  | { action: 'ask'; intent: CreateIntent; questions: string[] }
  | { action: 'explain'; intent: CreateIntent; canDo: string; cannotDo: string };

/**
 * What the product will actually do about it.
 *
 * ── THE HONEST BOUNDARY ──────────────────────────────────────────────────
 *
 * Designs are produced for real: the catalogue, the style system and the
 * editor are deterministic and already shipping, so a flyer request ends in
 * an editable flyer.
 *
 * Video, logos and written copy are NOT produced here. Those need a model,
 * and this account has no working model access — so the route says what the
 * product can do instead and what it cannot do yet. A storyboard is never
 * returned as a film, and no placeholder is dressed up as a result.
 */
export function routeFor(intent: CreateIntent): CreateRoute {
  if (intent.kind === 'unknown') {
    return { action: 'ask', intent, questions: intent.missing };
  }

  if (intent.kind === 'graphic' || intent.kind === 'campaign') {
    return { action: 'design', intent };
  }

  if (intent.kind === 'video') {
    return {
      action: 'explain',
      intent,
      canDo: 'Design the frames — a cover, a title card and the end card — as editable designs you can export.',
      cannotDo: 'Render a finished video. That needs a video model, which is not connected to this account yet.',
    };
  }

  if (intent.kind === 'brand') {
    return {
      action: 'explain',
      intent,
      canDo: 'Build a brand kit from your own colours and type, and put it on cards, flyers and posts.',
      cannotDo: 'Draw an original logo. That needs an image model, which is not connected to this account yet.',
    };
  }

  return {
    action: 'explain',
    intent,
    canDo: 'Lay your words out as a finished design, exactly as you write them.',
    cannotDo: 'Write the words for you. That needs a language model, which is not connected to this account yet.',
  };
}

/* ── From a sentence to a place in the library ───────────────────────────── */

/**
 * Which part of the library a request belongs in.
 *
 * The gallery is not a separate shelf of pretty things under a prompt — it
 * is the same library the prompt is reaching into. Asking for a menu should
 * leave the menus on screen, so somebody who would rather browse than type
 * can carry on from where the sentence got them.
 *
 * Returns null when the words do not point anywhere in particular, which is
 * better than filtering the library down to a guess.
 */
export function categoryForIntent(intent: CreateIntent): string | null {
  const words = intent.keywords.join(' ');
  const say = (list: string[]) => list.some((w) => words.includes(w));

  if (say(['menu', 'menus', 'price list', 'rates', 'pricelist'])) return 'menus';
  if (say(['card', 'cards', 'letterhead', 'stationery', 'logo', 'brand', 'identity'])) return 'branding';
  if (say(['ticket', 'tickets', 'lineup', 'line-up', 'speaker', 'conference'])) return 'events';
  if (say(['profile', 'proposal', 'report', 'certificate', 'hours', 'vacancy', 'hiring', 'quotation'])) return 'documents';
  if (say(['sale', 'offer', 'discount', 'promo', 'promotion', 'bundle', 'campaign', 'launch', 'clearance'])) return 'campaigns';
  if (say(['post', 'story', 'status', 'reel', 'carousel', 'quote', 'testimonial', 'review', 'giveaway'])) return 'social';
  if (say(['flyer', 'poster', 'handbill', 'leaflet', 'banner', 'opening', 'property', 'delivery'])) return 'flyers';

  /* The platform alone is a decent hint when nothing else is said. */
  if (intent.platform && ['instagram', 'tiktok', 'whatsapp', 'facebook', 'linkedin', 'x', 'pinterest'].includes(intent.platform)) {
    return 'social';
  }
  return null;
}

/*
 * ── THE REQUEST BOX SPEAKS NEEDS ─────────────────────────────────────────
 *
 * The tiles on Create are the nine needs and their deliverables
 * (`needs.ts`). Typing "I need a business card" must land exactly where
 * tapping the Business card tile does, so the sentence is resolved to the
 * same pair: a need, and the deliverable inside it.
 *
 * Synonym lists, not inference — "visiting card" and "complimentary card"
 * are what people actually say in Nigeria, and no stemmer finds them from
 * "business card". Keywords are already stripped of noise words and of
 * words of two letters or fewer ("ad" never survives), so the lists below
 * use whole words that do.
 *
 * Order matters: specific things are listed before generic ones, so
 * "event poster" is not swallowed by "poster".
 */
const DELIVERABLE_RULES: { deliverable: string; phrases: string[] }[] = [
  { deliverable: 'business-card', phrases: ['business card', 'business cards', 'visiting card', 'visiting cards', 'complimentary card', 'company card', 'name card', 'contact card'] },
  { deliverable: 'letterhead', phrases: ['letterhead', 'letterheads', 'letter head'] },
  { deliverable: 'email-signature', phrases: ['email signature'] },
  { deliverable: 'invoice', phrases: ['invoice', 'invoices'] },
  { deliverable: 'compliment-slip', phrases: ['compliment slip', 'compliments slip'] },
  { deliverable: 'brand-guidelines', phrases: ['brand guidelines', 'brand guide', 'brand book'] },
  { deliverable: 'brand-launch', phrases: ['brand launch'] },
  { deliverable: 'hang-tag', phrases: ['hang tag', 'hangtag'] },
  { deliverable: 'product-label', phrases: ['product label', 'label', 'labels', 'sticker', 'stickers'] },
  { deliverable: 'packaging', phrases: ['packaging', 'box design'] },
  { deliverable: 'merch', phrases: ['merch', 'merchandise', 'tshirt', 'shirt', 'hoodie'] },
  { deliverable: 'reels-cover', phrases: ['reel cover', 'reels cover'] },
  { deliverable: 'youtube-thumbnail', phrases: ['thumbnail', 'thumbnails'] },
  { deliverable: 'page-banner', phrases: ['page banner', 'profile banner', 'cover photo', 'facebook cover', 'linkedin banner'] },
  { deliverable: 'carousel', phrases: ['carousel', 'carousels'] },
  { deliverable: 'story', phrases: ['whatsapp status', 'status', 'story', 'stories'] },
  { deliverable: 'gift-voucher', phrases: ['gift voucher', 'voucher', 'vouchers', 'coupon'] },
  { deliverable: 'sale-post', phrases: ['sale post'] },
  { deliverable: 'display-ad', phrases: ['display advert', 'display ad', 'display ads', 'advert', 'adverts', 'web banner'] },
  { deliverable: 'event-poster', phrases: ['event poster', 'concert poster', 'party poster'] },
  { deliverable: 'ticket', phrases: ['ticket', 'tickets'] },
  { deliverable: 'speaker-card', phrases: ['speaker card', 'speaker'] },
  { deliverable: 'invitation', phrases: ['invitation', 'invitations', 'invite', 'invites'] },
  { deliverable: 'price-list', phrases: ['price list', 'pricelist', 'price sheet', 'rates list'] },
  { deliverable: 'rate-card', phrases: ['rate card'] },
  { deliverable: 'menu', phrases: ['menu', 'menus'] },
  { deliverable: 'shopfront-sign', phrases: ['shop sign', 'shopfront', 'shop front', 'storefront', 'signboard', 'sign board', 'store sign'] },
  { deliverable: 'roll-up', phrases: ['roll up', 'rollup', 'pull up banner'] },
  { deliverable: 'billboard', phrases: ['billboard', 'billboards'] },
  { deliverable: 'company-profile', phrases: ['company profile', 'business profile'] },
  { deliverable: 'proposal', phrases: ['proposal', 'proposals'] },
  { deliverable: 'certificate', phrases: ['certificate', 'certificates'] },
  { deliverable: 'report-cover', phrases: ['report cover', 'annual report'] },
  { deliverable: 'deck-cover', phrases: ['deck cover', 'pitch deck', 'presentation'] },
  { deliverable: 'flyer', phrases: ['flyer', 'flyers', 'leaflet', 'leaflets', 'handbill', 'handbills'] },
  { deliverable: 'poster', phrases: ['poster', 'posters'] },
  { deliverable: 'notice', phrases: ['notice', 'notices'] },
  { deliverable: 'banner', phrases: ['banner', 'banners'] },
  { deliverable: 'instagram-post', phrases: ['instagram post', 'post', 'posts'] },
];

/** Words that make a request a sale, whatever shape it is printed in. */
const SALE_WORDS = ['sale', 'offer', 'offers', 'discount', 'promo', 'promotion', 'clearance', 'bundle', 'black friday'];
/** Words that make a poster an event poster. */
const EVENT_WORDS = ['event', 'concert', 'party', 'conference', 'wedding', 'festival', 'anniversary'];
/** Generic printed shapes a sale takes over: the sale decides the need, the shape decides the item. */
const SALE_SHAPE: Record<string, string> = { flyer: 'offer-flyer', poster: 'offer-flyer', 'instagram-post': 'sale-post' };
/** Modifiers that make a "card" something other than a business card. No template exists for these yet. */
const OTHER_CARDS = [
  'birthday', 'thank', 'thanks', 'greeting', 'greetings', 'id', 'bank', 'atm', 'credit', 'debit',
  'loyalty', 'gift', 'postcard', 'christmas', 'sim', 'congratulations', 'condolence', 'holiday',
];
const SOCIAL_PLATFORMS =['instagram', 'tiktok', 'whatsapp', 'facebook', 'linkedin', 'x', 'pinterest'];

const needOf = (deliverable: string): NeedSlug | null =>
  NEEDS.find((n) => n.deliverables.some((d) => d.slug === deliverable))?.slug ?? null;

const resolveIntent = (intent: CreateIntent): { need: NeedSlug; deliverable: string | null } | null => {
  /* A film or a piece of copy is not something the template library makes. */
  if (intent.kind === 'video' || intent.kind === 'copy') return null;

  /*
   * The sentence itself when we have it. Keywords drop every word of two
   * letters or fewer, which erases "ID" in "ID card" and "up" in "roll up
   * banner" — the first becomes a bare "card" and is handed business cards.
   */
  const words = ` ${intent.raw ?? intent.keywords.join(' ')} `;
  const says = (phrases: string[]) => phrases.some((p) => words.includes(` ${p} `));

  let found = DELIVERABLE_RULES.find((r) => says(r.phrases))?.deliverable ?? null;
  /*
   * "card" with no modifier is a business card. A modifier that names some
   * other card (birthday, bank, ID …) is NOT: there is no template for those
   * yet, and a business card would be a confident wrong answer.
   */
  const otherCard = says(OTHER_CARDS);
  /* Nigerian usage: a "wedding card" is the invitation. */
  if (!found && !otherCard && says(['wedding', 'weddings'])) found = 'invitation';
  if (!found && words.includes(' card ') && !otherCard) found = 'business-card';

  const sale = says(SALE_WORDS);

  if (found) {
    /* A sale takes the generic printed shapes: "flyer for my weekend sale" is a promotion. */
    if (sale && SALE_SHAPE[found]) return { need: 'promotions', deliverable: SALE_SHAPE[found] };
    /* A named network beats a printed shape: an "instagram flyer" is a post, not a sheet of A4. */
    if (intent.platform && SOCIAL_PLATFORMS.includes(intent.platform) && (found === 'flyer' || found === 'poster')) {
      return { need: 'social', deliverable: intent.platform === 'whatsapp' ? 'story' : 'instagram-post' };
    }
    if (found === 'poster' && says(EVENT_WORDS)) return { need: 'events', deliverable: 'event-poster' };
    const need = needOf(found);
    return need ? { need, deliverable: found } : null;
  }

  if (sale) return { need: 'promotions', deliverable: null };
  if (intent.platform && SOCIAL_PLATFORMS.includes(intent.platform)) return { need: 'social', deliverable: null };
  return null;
};

/** The need a sentence belongs to, or null when the words point nowhere. */
export function needForIntent(intent: CreateIntent): NeedSlug | null {
  return resolveIntent(intent)?.need ?? null;
}

/**
 * The exact deliverable asked for. It is always one of the returned need's
 * own deliverables, so the pair can be handed straight to the tiles' routes.
 */
export function deliverableForIntent(intent: CreateIntent): string | null {
  const r = resolveIntent(intent);
  if (!r?.deliverable) return null;
  const need = NEEDS.find((n) => n.slug === r.need);
  return need?.deliverables.some((d) => d.slug === r.deliverable) ? r.deliverable : null;
}
