/**
 * Click-to-chat: the owner messages US first.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * MEASURED 2026-10-10: every business-initiated WhatsApp template this
 * platform sent came back `failed`, code 131042 — the WhatsApp Business
 * Account has no usable payment method, so Meta accepts the call and refuses
 * to deliver. Outbound templates are the expensive, gated direction.
 *
 * `wa.me` is the other direction and it is free: no API, no billing, no
 * template approval. The owner taps a link, their own WhatsApp opens with a
 * message pre-typed, and they press send. That is an ordinary person sending
 * an ordinary message — nothing is automated on their device and nothing
 * here touches an unofficial client.
 *
 * It is also the better acquisition design. An owner who writes to us first
 * is a warmer contact than one who receives a template, and their message
 * opens a service window we can answer inside.
 */

/**
 * Digits for a wa.me URL, or null.
 *
 * Deliberately the same rule as `waNumber` in the edge sender: a leading zero
 * means a local number with the country code left off, and this directory is
 * pan-African. Guessing +234 for a Kenyan 0709... would point the owner at a
 * stranger's chat. A link we cannot build correctly is not built.
 */
export function waDigits(phone?: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/[^\d]/g, '');
  if (d.length < 8 || d.length > 15) return null;
  if (d.startsWith('0')) return null;
  return d;
}

/**
 * A short, stable handle for one listing.
 *
 * It travels in the pre-typed message so that whoever reads the inbox — or
 * the inbound webhook — can tell which listing the sender means without
 * asking. Derived from the id rather than stored, so there is no second
 * source of truth and nothing to keep in sync.
 */
export function claimReference(businessId: string): string {
  const compact = (businessId || '').replace(/[^0-9a-fA-F]/g, '').slice(0, 8).toUpperCase();
  return compact.length === 8 ? `NOA-${compact}` : '';
}

/** Find a reference inside whatever the sender actually typed. */
export function extractReference(text?: string | null): string | null {
  const m = /NOA-([0-9A-F]{8})/i.exec(text ?? '');
  return m ? `NOA-${m[1].toUpperCase()}` : null;
}

/** Does this inbound message refer to this listing? */
export function referenceMatches(text: string | null | undefined, businessId: string): boolean {
  const ref = claimReference(businessId);
  return Boolean(ref) && extractReference(text) === ref;
}

/**
 * The message we put in the owner's compose box.
 *
 * Written as the OWNER, because they are the one who will send it — a line
 * phrased as though the platform were speaking reads as a form letter the
 * moment it lands in their drafts.
 */
export function claimMessage(opts: { businessName: string; businessId: string }): string {
  const ref = claimReference(opts.businessId);
  const name = (opts.businessName || '').trim() || 'my business';
  return ref
    ? `Hi NowOpen Africa — I want to claim my listing for ${name}. (${ref})`
    : `Hi NowOpen Africa — I want to claim my listing for ${name}.`;
}

/**
 * The link itself.
 *
 * Returns null rather than a half-built URL when the number cannot be
 * addressed: a dead "Message us on WhatsApp" button is worse than no button,
 * because it looks like the channel is broken.
 */
export function waChatLink(opts: { phone?: string | null; text?: string }): string | null {
  const digits = waDigits(opts.phone);
  if (!digits) return null;
  const text = (opts.text ?? '').trim();
  return text
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${digits}`;
}
