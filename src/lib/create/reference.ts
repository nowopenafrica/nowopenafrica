/**
 * The order reference — the only thing a customer walks away with.
 *
 * An order on the Create page is placed without an account, which is the whole
 * point of it. That means there is no inbox to look in and no dashboard to come
 * back to: the reference IS the receipt, and the URL that carries it is the
 * only way the customer can ever see the job again.
 *
 * Three consequences, all of which shape what is below.
 *
 * 1. IT IS A BEARER TOKEN. Anyone holding it can see the status of that one
 *    order and accept a quote on it. So it is generated from crypto, never
 *    Math.random(), and it is long enough (50 bits) that it cannot be guessed
 *    or walked. What it exposes is deliberately narrow — the job, the price and
 *    where it has got to, never the contact details. See create_order_status().
 *
 * 2. IT IS GENERATED ON THE CLIENT. The orders table is insert-only to the
 *    public, so nothing comes back from the insert (chaining .select() makes
 *    RLS refuse the whole statement). Making the reference here is what lets us
 *    show it to the customer at all — and it lets the artwork upload path be
 *    known before the row exists.
 *
 * 3. IT GETS READ OVER THE PHONE AND TYPED BACK IN. Hence the alphabet: no I,
 *    L, O or U, so it cannot be confused with 1, 0 or written as a word. And
 *    hence normalise() below, which forgives the substitutions people make
 *    anyway rather than telling them their own reference is wrong.
 */

/** Crockford-style: unambiguous when spoken, and no vowels to form words. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const GROUP = 5;

export const ORDER_REFERENCE_PATTERN = /^NOC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;

/** The same expression, for Postgres. Kept beside the one above on purpose. */
export const ORDER_REFERENCE_SQL = '^NOC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$';

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(out);
    return out;
  }
  // No crypto means no unguessable reference, and a guessable one is worse
  // than none: it would hand strangers other people's orders.
  throw new Error('Secure random is unavailable in this environment.');
}

export function generateOrderReference(): string {
  // Rejection-free: 256 is a whole multiple of 32, so masking is unbiased.
  const bytes = randomBytes(GROUP * 2);
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 31];
  return `NOC-${out.slice(0, GROUP)}-${out.slice(GROUP)}`;
}

/**
 * Make what somebody typed into what we stored, where that is unambiguous.
 *
 * People lowercase it, drop the dashes, and write O for 0 because that is what
 * the character looks like. None of that is the customer being careless — it is
 * an alphabet decision we made — so we absorb it rather than rejecting them.
 */
export function normaliseOrderReference(input: string): string {
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, '');

  // The prefix comes off FIRST. Its own O is a letter O, and the substitutions
  // below would turn it into NOC -> N0C and then nothing would match.
  const body = raw
    .replace(/^N[O0]C/, '')
    // The four characters the alphabet deliberately excludes can only ever have
    // been meant as these, so the mapping cannot destroy a real reference.
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');

  if (body.length !== GROUP * 2) return input.trim().toUpperCase();
  return `NOC-${body.slice(0, GROUP)}-${body.slice(GROUP)}`;
}

export const isOrderReference = (value: string): boolean =>
  ORDER_REFERENCE_PATTERN.test(value);

/** Where a customer goes to see it again. */
export const orderTrackPath = (reference: string): string =>
  `/order/${encodeURIComponent(reference)}`;
