/**
 * Editing the service catalogue — the decisions, apart from the screen.
 *
 * ── THE ONE EDIT THAT IS NOT LIKE THE OTHERS ─────────────────────────────
 *
 * Changing a name is a typo fix. Changing `price_basis` to 'quoted' is the
 * moment a figure stops being a working guess and becomes a number NowOpen
 * will be held to — it is what makes `is_orderable` true and what lets a
 * checkout take money. The founder's brief is explicit that the seeded
 * prices are "a proposed launch catalogue ... not verified market averages",
 * so that transition must be deliberate and must never be something that
 * happens as a side effect of tidying a description.
 *
 * `turnsChargeable()` below is how the screen knows to stop and ask. It is
 * here, not in the component, so it can be tested without rendering anything
 * and so a second screen cannot implement the rule differently.
 */

export type PriceBasis = 'proposed' | 'indicative' | 'quoted';
export type PublicationStatus = 'draft' | 'published' | 'archived';

export interface EditableService {
  sku: string;
  name: string;
  short_description: string | null;
  price_minor: number | null;
  currency: string;
  price_unit: string | null;
  price_basis: PriceBasis;
  pricing_model: string;
  quote_required: boolean;
  publication_status: PublicationStatus;
  turnaround_min_days: number | null;
  turnaround_max_days: number | null;
  revisions_included: number | null;
  is_orderable: boolean;
}

/** What the form holds while it is being typed into: strings. */
export interface Draft {
  name: string;
  short_description: string;
  /** Major units, as typed. "7,500" and "7500" both mean the same thing. */
  price: string;
  price_unit: string;
  /*
   * Carried but not edited here. Changing a pricing MODEL changes which
   * questions a customer is asked and how the server multiplies the figure,
   * so it is not a field to flip beside a typo fix — but validation needs to
   * know it, because a free service legitimately has no price.
   */
  pricing_model: string;
  price_basis: PriceBasis;
  quote_required: boolean;
  publication_status: PublicationStatus;
  turnaround_min: string;
  turnaround_max: string;
  revisions: string;
}

export const draftFrom = (s: EditableService, minorPerMajor = 100): Draft => ({
  name: s.name,
  short_description: s.short_description ?? '',
  price: s.price_minor === null ? '' : String(s.price_minor / minorPerMajor),
  price_unit: s.price_unit ?? '',
  pricing_model: s.pricing_model,
  price_basis: s.price_basis,
  quote_required: s.quote_required,
  publication_status: s.publication_status,
  turnaround_min: s.turnaround_min_days === null ? '' : String(s.turnaround_min_days),
  turnaround_max: s.turnaround_max_days === null ? '' : String(s.turnaround_max_days),
  revisions: s.revisions_included === null ? '' : String(s.revisions_included),
});

/**
 * A typed amount in major units → minor units, or a reason it is not one.
 *
 * Accepts the separators people actually type. Refuses a fraction of a minor
 * unit rather than rounding it away: if somebody types ₦7,500.005 they have
 * made a mistake, and silently storing ₦7,500.01 hides it until an invoice.
 */
export function parseAmount(
  text: string,
  minorPerMajor = 100,
): { ok: true; minor: number | null } | { ok: false; reason: string } {
  const clean = (text ?? '').trim().replace(/[₦,\s]/g, '');
  if (clean === '') return { ok: true, minor: null };
  if (!/^\d+(\.\d+)?$/.test(clean)) return { ok: false, reason: 'Enter a number, like 7500.' };

  const minor = Number(clean) * minorPerMajor;
  if (!Number.isFinite(minor)) return { ok: false, reason: 'That number is too large.' };
  if (!Number.isInteger(minor)) {
    return { ok: false, reason: `That is a fraction of a ${minorPerMajor === 100 ? 'kobo' : 'minor unit'}.` };
  }
  if (minor > Number.MAX_SAFE_INTEGER) return { ok: false, reason: 'That number is too large.' };
  return { ok: true, minor };
}

const nullableInt = (text: string): { ok: true; value: number | null } | { ok: false; reason: string } => {
  const clean = (text ?? '').trim();
  if (clean === '') return { ok: true, value: null };
  if (!/^\d+$/.test(clean)) return { ok: false, reason: 'Enter a whole number of days.' };
  return { ok: true, value: Number(clean) };
};

export interface Patch {
  name: string;
  short_description: string | null;
  price_minor: number | null;
  price_unit: string | null;
  price_basis: PriceBasis;
  quote_required: boolean;
  publication_status: PublicationStatus;
  turnaround_min_days: number | null;
  turnaround_max_days: number | null;
  revisions_included: number | null;
}

/**
 * Turn a draft into something the database will accept, or say what is wrong.
 *
 * Every rule here is also a database constraint. Checking twice is not
 * duplication: the constraint is what makes the rule true, and this is what
 * makes the failure readable — "violates check constraint
 * services_turnaround_ordered" is not a sentence anybody should have to meet.
 */
export function validate(draft: Draft, minorPerMajor = 100): { ok: true; patch: Patch } | { ok: false; reason: string } {
  const name = draft.name.trim();
  if (!name) return { ok: false, reason: 'A service needs a name.' };

  const amount = parseAmount(draft.price, minorPerMajor);
  if (!amount.ok) return amount;

  const min = nullableInt(draft.turnaround_min);
  if (!min.ok) return min;
  const max = nullableInt(draft.turnaround_max);
  if (!max.ok) return max;
  if (min.value !== null && max.value !== null && min.value > max.value) {
    return { ok: false, reason: 'The fastest turnaround cannot be slower than the slowest.' };
  }

  const revisions = nullableInt(draft.revisions);
  if (!revisions.ok) return { ok: false, reason: 'Revisions must be a whole number.' };

  /*
   * A published service with no price and no quote route is a dead end: a
   * card on the catalogue that can neither be bought nor enquired about.
   */
  if (amount.minor === null && !draft.quote_required
      && draft.pricing_model !== 'free' && draft.publication_status === 'published') {
    return { ok: false, reason: 'Give it a price, or mark it as quoted on request.' };
  }

  return {
    ok: true,
    patch: {
      name,
      short_description: draft.short_description.trim() || null,
      price_minor: amount.minor,
      price_unit: draft.price_unit.trim() || null,
      price_basis: draft.price_basis,
      quote_required: draft.quote_required,
      publication_status: draft.publication_status,
      turnaround_min_days: min.value,
      turnaround_max_days: max.value,
      revisions_included: revisions.value,
    },
  };
}

/**
 * Would saving this let the service start taking money?
 *
 * Mirrors the `is_orderable` generated column exactly. If that definition
 * ever changes, this has to change with it — which is why the test asserts
 * the two against each other rather than against a hand-written list.
 */
export const wouldBeOrderable = (patch: Patch): boolean =>
  patch.publication_status === 'published'
  && patch.price_basis === 'quoted'
  && patch.quote_required === false
  && patch.price_minor !== null;

export const turnsChargeable = (before: EditableService, patch: Patch): boolean =>
  !before.is_orderable && wouldBeOrderable(patch);

/**
 * The sentence shown before a price becomes chargeable.
 *
 * Names the amount, because the thing being confirmed is the number — not
 * the act of saving. A confirmation that does not repeat the figure is a
 * confirmation people click through.
 */
export const chargeableWarning = (name: string, price: string): string =>
  `${name} will become orderable at ${price}. Customers can pay this immediately, `
  + 'and NowOpen is committed to delivering it at that price. Only confirm if a '
  + 'supplier or creator has actually quoted it.';
