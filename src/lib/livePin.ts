// Pinning what you are holding up, live.
//
// A live stream without this is a video call: the owner shows a bag, says the
// price, and the viewer has to remember it, close the stream, find the item and
// hope it was the right one. Pinning puts THAT item on screen with its price
// and a button, while it is still in shot. It is the whole mechanic of live
// commerce, and it is the difference between a broadcast that entertains and
// one that sells.
//
// WHY THE WIRE CARRIES AN ID AND NOTHING ELSE
//
// Pins travel over the same Supabase Realtime channel as the WebRTC signalling,
// and that channel is public — anyone holding the anon key can send to it. If a
// pin carried its own name, price and picture, any viewer could broadcast
// "iPhone 15 — ₦50,000" onto a business's live stream and every other viewer
// would see it, apparently endorsed by the business.
//
// So a pin is an id and a source table, nothing more. Every viewer resolves it
// against that business's own rows, under RLS. The worst a forged pin can then
// do is highlight a genuine item of that business at its genuine price, which
// is a nuisance rather than a fraud.
//
// Being ephemeral is also deliberate: a pin belongs to the moment it was shown
// in, so it lives in the broadcast and not in a column, and there is no
// migration to apply and no stale "featured" flag left behind afterwards.

export const PIN_EVENT = 'pin';

export type PinSource = 'service' | 'product';

/** What crosses the wire. */
export interface PinPayload {
  itemId: string | null;
  source: PinSource;
  /** Which booking module the CTA should open. */
  moduleKey: string;
}

/** What a viewer renders, after resolving the id against the database. */
export interface ResolvedPin {
  id: string;
  name: string;
  price?: string | null;
  imageUrl?: string | null;
  source: PinSource;
  moduleKey: string;
}

const SOURCES: PinSource[] = ['service', 'product'];

/**
 * Read a pin off the wire, or refuse it.
 *
 * Everything arriving here was sent by an untrusted client, so nothing is
 * assumed: a payload that is not the shape below is dropped rather than
 * rendered half-formed. `itemId: null` is valid and means "unpin".
 */
export function parsePinPayload(raw: unknown): PinPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;

  const source = p.source;
  if (typeof source !== 'string' || !SOURCES.includes(source as PinSource)) return null;

  const moduleKey = typeof p.moduleKey === 'string' ? p.moduleKey.slice(0, 64) : '';
  if (!moduleKey) return null;

  const itemId = p.itemId;
  if (itemId === null || itemId === undefined) return { itemId: null, source: source as PinSource, moduleKey };
  // Ids are uuids. Anything else is not worth a database round trip.
  if (typeof itemId !== 'string' || !/^[0-9a-fA-F-]{16,64}$/.test(itemId)) return null;

  return { itemId, source: source as PinSource, moduleKey };
}

/** Which table an id should be resolved against. */
export const pinTable = (source: PinSource): string =>
  source === 'service' ? 'business_services' : 'business_products';

/**
 * The price line on a pin card.
 *
 * Prices in this schema are free text — "₦12,000", "From ₦200/day", "Contact
 * us" — so they are shown as written rather than parsed and reformatted. A
 * blank price is left blank instead of becoming "₦0", which would be a claim
 * the business never made.
 */
export function formatPinPrice(price: string | null | undefined): string | null {
  const trimmed = (price || '').trim();
  return trimmed ? trimmed : null;
}

/**
 * The button on a pin card.
 *
 * Falls back to a plain verb rather than an empty button when the category
 * config has no label for this module.
 */
export function pinCtaLabel(ctaLabel: string | null | undefined, source: PinSource): string {
  const trimmed = (ctaLabel || '').trim();
  if (trimmed) return trimmed;
  return source === 'product' ? 'Order this' : 'Book this';
}
