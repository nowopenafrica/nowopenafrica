/**
 * A database service, shaped for the ordering flow that already exists.
 *
 * ── WHY ADAPT RATHER THAN REWRITE ────────────────────────────────────────
 *
 * CreateConfigurator, quoteFor(), specLine() and the create_orders table are
 * built, tested and working. They take a `CatalogueItem`. Rewriting all of
 * that to take a `Service` would be a rewrite priced as a feature, and would
 * throw away the one part of this page that reliably turns a visitor into a
 * request.
 *
 * So the catalogue moves to the database and the order flow does not notice.
 *
 * ── THE ONE MAPPING THAT CARRIES MONEY ───────────────────────────────────
 *
 * `basis` in the old model has two values: 'indicative' (a benchmark — show
 * it, never charge it) and 'quoted' (safe to sell). The new model has three,
 * because a founder's proposed launch price is not the same thing as a
 * competitor benchmark.
 *
 * Both of the unverified ones map to 'indicative', which is the value the
 * existing flow already treats as "request, do not charge". Mapping
 * 'proposed' to 'quoted' because it happens to have a number would make the
 * order button say "Place this order" against a price nobody has agreed to.
 *
 * And the mapping does NOT read price_basis directly — it reads
 * `is_orderable`, the generated column, so a service that is published but
 * still a hypothesis cannot be sold even if somebody sets the basis without
 * publishing, or publishes without setting the basis.
 */

import type { CatalogueItem, Division, Fulfilment } from './catalogue';
import type { Service } from './services';
import { minorToMajor } from './money';

/** Which division a service belongs to, for the existing page's chrome. */
export function divisionOf(service: Pick<Service, 'deliverable_type' | 'production_required'>): Division {
  if (service.production_required) return 'print';
  switch (service.deliverable_type) {
    case 'video': return 'video';
    case 'print': return 'print';
    case 'strategy':
    case 'managed': return 'brand';
    default: return 'create';
  }
}

/**
 * Turn a catalogue row into the item the configurator understands.
 *
 * `price` is in whole naira, because that is the unit CatalogueItem and
 * create_orders both use. The conversion goes through money.ts rather than a
 * local `/ 100`, so there is one place where the two units meet.
 */
export function serviceAsCatalogueItem(service: Service): CatalogueItem {
  const fulfilment: Fulfilment = service.fulfilment;
  const free = service.pricing_model === 'free';

  return {
    sku: service.sku,
    division: divisionOf(service),
    name: service.name,
    blurb: service.short_description ?? '',
    fulfilment,
    /*
     * is_orderable, not price_basis. The generated column is the single
     * definition of "may be charged for"; anything else here would be a
     * second opinion that could disagree with the database.
     */
    basis: service.is_orderable ? 'quoted' : 'indicative',
    free: free || undefined,
    price: service.price_minor === null ? undefined : minorToMajor(service.price_minor, service.currency),
    /*
     * "from" where the figure is a floor. A per-screen or per-item price is
     * exact for one of the thing, and labelling it "from" leaves a customer
     * unable to work out what four screens cost.
     */
    from: service.pricing_model === 'starting_at' || service.pricing_model === 'package' || undefined,
    /*
      The quantity breaks. Without these the configurator shows no quantity
      control, and a tiered service then cannot be priced by the server at
      all — measured: the panel opened on its own arithmetic while
      price_service refused with 'quantity_required'.
    */
    tiers: service.tiers?.length
      /*
        Sorted HERE as well as in the loader, not instead of it. `tierFor()`
        takes the last eligible tier and that is the largest only if they are
        ascending, so the assumption is enforced at the point that depends on
        it rather than trusted from whoever built the object.
      */
      ? [...service.tiers]
        .sort((a, b) => a.min_quantity - b.min_quantity)
        .map((t) => ({ qty: t.min_quantity, price: minorToMajor(t.price_minor, service.currency) }))
      : undefined,
    turnaround: [service.turnaround_min_days ?? 0, service.turnaround_max_days ?? 0],
    /* A package is designed by a creator as part of what it is. */
    designIncluded: service.pricing_model === 'package' || undefined,
  };
}

/**
 * What the card should say under the price.
 *
 * Returns null when there is nothing to warn about, so a confirmed price
 * carries no apology — a caveat under every figure is a caveat nobody reads.
 */
export function priceCaveat(service: Service): string | null {
  if (service.is_orderable) return null;
  if (service.quote_required || service.pricing_model === 'custom_quote') {
    return 'Priced after we read your brief';
  }
  if (service.price_basis === 'indicative') return 'Estimate — confirmed before anything is produced';
  return 'Guide price — confirmed against your brief';
}
