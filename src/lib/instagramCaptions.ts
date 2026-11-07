/**
 * Reading what a business says in its own captions.
 *
 * ── WHAT THIS IS ALLOWED TO DO ───────────────────────────────────────────
 *
 * Find text the business actually wrote and offer it to an operator. Nothing
 * here infers, summarises, guesses a trade, or completes a thought. Every
 * value it returns is a literal substring of a caption, so a reviewer can
 * always see where it came from.
 *
 * That is deliberate and it is the whole point: inventing services, products
 * or prices for a business that has not claimed its listing is the failure
 * this platform is built to avoid. A rule-based reader that occasionally
 * returns nothing is worth more than a clever one that occasionally returns a
 * service the business does not offer.
 *
 * ── WHAT IT DOES NOT RETURN ──────────────────────────────────────────────
 *
 * Prices. A caption's price is true the week it was posted and misleading
 * after, and a directory publishing a stale price does real harm to both
 * sides. Price MENTIONS are flagged so a reviewer knows to ask the owner;
 * the numbers are not carried.
 */

export interface CaptionSource {
  caption: string | null;
  permalink: string | null;
}

export interface CaptionFindings {
  /** Hashtags, lowercased and de-duplicated, without the #. */
  hashtags: string[];
  /**
   * Lines the business presented as a list of what it offers — found by an
   * explicit marker it wrote ("Services:", "We offer:", a bulleted line), not
   * by guessing which sentences sound like services.
   */
  offerings: string[];
  /**
   * The offerings the business introduced with a word for STOCK rather than
   * work — "Menu:", "Products:". Always a subset of `offerings`.
   *
   * This exists so the batch extractor can file services and products
   * separately without a human ticking each one. An offering that carries no
   * such marker is NOT assumed to be a product: unlabelled means service,
   * because naming something a product implies a thing that can be bought,
   * and asserting that about a business which has not claimed its listing is
   * a claim too far.
   */
  productOfferings: string[];
  phones: string[];
  emails: string[];
  /** wa.me / api.whatsapp.com links, which carry the number in the path. */
  whatsapp: string[];
  /** Other sites the business links to — often a shop or booking page. */
  links: string[];
  /** True when any caption quotes a price. The amounts are NOT returned. */
  mentionsPrices: boolean;
}

/** Markers a business uses when it is actually listing what it does. */
const OFFER_MARKER = /^(?:services?|we offer|what we (?:do|offer)|our services?|menu|products?|packages?)\s*[:\-–]/i;
/**
 * The subset of those markers that names things SOLD rather than things DONE.
 *
 * "Menu:" and "Products:" are a business listing stock; "Services:", "We
 * offer:" and "Packages:" are a business listing work. Splitting on the word
 * the business chose is the only honest basis available — inferring it from
 * the item itself would mean guessing the trade, which is the failure this
 * whole module exists to avoid.
 */
const PRODUCT_MARKER = /^(?:menu|products?)\s*[:\-–]/i;
/**
 * A line the author bulleted is a list item by their own formatting.
 *
 * Alternation rather than a character class: ✔️ and ▪️ are a base character
 * plus U+FE0F, so inside `[...]` they decompose and the class silently also
 * matches a bare variation selector. ESLint's no-misleading-character-class
 * catches exactly that.
 */
const BULLET = /^\s*(?:[•\-–*]|✅|✔️?|🔹|▪️?)+\s*(.+)$/u;

/*
 * Deliberately broad on separators and narrow on length: African numbers are
 * written every imaginable way (+234 801 234 5678, 0801-234-5678, 08012345678)
 * but a run of 9–15 digits is what they all reduce to.
 */
const PHONE = /(?:\+?\d[\d\s().-]{7,18}\d)/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const WHATSAPP = /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/\S+/gi;
const LINK = /https?:\/\/[^\s)]+/gi;
const HASHTAG = /#([A-Za-z0-9_]{2,40})/g;
/** ₦ N NGN $ £ € followed by digits, or digits followed by a currency word. */
const PRICE = /(?:[₦$£€]\s?\d|(?:\bN|\bNGN|\bUSD|\bKES|\bGHS|\bZAR)\s?\d|\d[\d,.]*\s?(?:naira|dollars?|cedis?|shillings?|rand)\b)/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Digits only. */
const digits = (s: string) => s.replace(/\D/g, '');

/**
 * A key under which two spellings of one number are the same number.
 *
 * `0801 234 5678` and `+234 801 234 5678` are the same line; compared as raw
 * digit strings they are not, and a caption that gives both — which is
 * ordinary — would list the business's phone number twice.
 *
 * The last nine digits are the national significant number once the trunk
 * prefix and country code are gone, which is what both forms share. The
 * trade-off is stated plainly: two genuinely different numbers that happen to
 * end in the same nine digits would merge. Across one account's captions that
 * is vanishingly unlikely, and the alternative — the same number offered to a
 * reviewer twice, in two forms — is a certainty rather than a risk.
 */
const phoneKey = (s: string) => digits(s).slice(-9);

export function readCaptions(media: CaptionSource[]): CaptionFindings {
  const hashtags = new Set<string>();
  const offerings = new Set<string>();
  const productOfferings = new Set<string>();
  const phones = new Map<string, string>();
  const emails = new Set<string>();
  const whatsapp = new Set<string>();
  const links = new Set<string>();
  let mentionsPrices = false;

  for (const m of media) {
    const caption = m.caption;
    if (!caption) continue;

    if (PRICE.test(caption)) mentionsPrices = true;

    for (const [, tag] of caption.matchAll(HASHTAG)) hashtags.add(tag.toLowerCase());

    for (const raw of caption.matchAll(WHATSAPP)) whatsapp.add(raw[0]);
    for (const raw of caption.matchAll(EMAIL)) emails.add(raw[0].toLowerCase());
    for (const raw of caption.matchAll(LINK)) {
      const url = raw[0].replace(/[.,;]+$/, '');
      // WhatsApp links are reported on their own; instagram.com self-links
      // tell a directory nothing it does not already know.
      if (/wa\.me|api\.whatsapp\.com|instagram\.com/i.test(url)) continue;
      links.add(url);
    }

    for (const raw of caption.matchAll(PHONE)) {
      const d = digits(raw[0]);
      /*
       * 9–15 digits. Below that it is a date, a quantity or a discount; above
       * it, a card number or a run of figures that happens to look like one.
       * Keyed on the digits so "0801 234 5678" and "08012345678" are one
       * number, keeping the form the business actually wrote.
       */
      if (d.length < 9 || d.length > 15) continue;
      const key = phoneKey(raw[0]);
      /*
       * Keep the longer spelling when both appear: +234 801… carries the
       * country code, which a directory serving twenty markets needs and the
       * local 0801… form does not.
       */
      const existing = phones.get(key);
      if (!existing || digits(raw[0]).length > digits(existing).length) {
        phones.set(key, clean(raw[0]));
      }
    }

    /*
     * Offerings: only where the business itself marked a list. A line after
     * "Services:" is the business saying what it does; a sentence that merely
     * mentions a noun is not, and treating it as one is how a directory ends
     * up publishing services nobody offers.
     */
    const lines = caption.split(/\r?\n/);
    let inList = false;
    /*
     * Which word introduced the list we are inside.
     *
     * A business that writes "Menu:" is naming things it sells; one that
     * writes "Services:" is naming things it does. That is the business's own
     * word for its own list, which is the only basis for the split that is
     * not a guess about a trade we know nothing about. Outside a marked list
     * (a bare bulleted line) it stays null, and an unlabelled item is treated
     * as a service — see `productOfferings` on CaptionFindings.
     */
    let listKind: 'product' | 'service' | null = null;

    const remember = (item: string) => {
      const value = stripTrailingPunctuation(item);
      if (!value) return;
      offerings.add(value);
      if (listKind === 'product') productOfferings.add(value);
    };

    for (const line of lines) {
      const text = clean(line);
      if (!text) { inList = false; listKind = null; continue; }

      const marked = OFFER_MARKER.exec(text);
      if (marked) {
        inList = true;
        listKind = PRODUCT_MARKER.test(marked[0]) ? 'product' : 'service';
        const rest = clean(text.slice(marked[0].length));
        if (rest) for (const part of splitList(rest)) remember(part);
        continue;
      }

      const bullet = BULLET.exec(text);
      if (bullet) {
        const item = clean(bullet[1]);
        if (item && item.length <= 60) remember(item);
        continue;
      }

      // A plain line directly under a "Services:" marker continues the list.
      if (inList && text.length <= 60 && !/[.!?]$/.test(text)) {
        remember(text);
        continue;
      }
      inList = false;
      listKind = null;
    }
  }

  return {
    hashtags: [...hashtags].sort(),
    offerings: [...offerings].filter(Boolean).sort(),
    productOfferings: [...productOfferings].filter(Boolean).sort(),
    phones: [...phones.values()],
    emails: [...emails],
    whatsapp: [...whatsapp],
    links: [...links],
    mentionsPrices,
  };
}

/** "Hair, nails and lashes" → three items. Commas and slashes only. */
function splitList(s: string): string[] {
  return s
    .split(/\s*[,/|]\s*|\s+(?:and|&)\s+/i)
    .map((x) => stripTrailingPunctuation(clean(x)))
    .filter((x) => x.length > 1 && x.length <= 60);
}

function stripTrailingPunctuation(s: string): string {
  return s.replace(/[\s.,;:!]+$/, '').trim();
}
