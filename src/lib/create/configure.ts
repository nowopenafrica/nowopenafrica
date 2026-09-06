import { CATALOGUE, type CatalogueItem, type PriceBasis } from './catalogue';

/**
 * The Create configurator — Choose → Customise → Price → Order.
 *
 * Printivo's workflow is the benchmark: pick a product, pick a quantity, pick a
 * finish, decide who does the artwork, watch the price move, then order. This
 * is that, with two differences.
 *
 * FIRST DIFFERENCE — the artwork route is a first-class choice, not a
 * checkbox. "Use a template", "upload mine", "let AI make it from my brand" and
 * "hire a creator" are four genuinely different jobs at four different prices,
 * and NowOpen can do all four. A print shop can only do two of them.
 *
 * SECOND DIFFERENCE — the order does NOT end in a payment. Every printed price
 * in the catalogue is a market estimate with no supplier quote behind it (see
 * catalogue.ts), so a Pay button would be charging money against a number
 * nobody has agreed to. It ends in a request carrying the full specification,
 * which is what a printer needs to quote and what the customer needs to compare.
 * The moment a SKU has a real quote its basis flips to 'quoted' and the same
 * flow can take payment without being rebuilt.
 *
 * Everything here is pure. No network, no randomness — the same configuration
 * always produces the same price, which is the only way a quote can be trusted
 * or tested.
 */

export type DesignRoute = 'template' | 'upload' | 'ai' | 'creator';

export interface DesignOption {
  key: DesignRoute;
  label: string;
  blurb: string;
  /** SKU of the design service charged when this route is chosen. */
  chargeSku?: string;
}

export const DESIGN_ROUTES: DesignOption[] = [
  { key: 'ai', label: 'Make it for me', blurb: 'Built from your logo, colours and details. Free.' },
  { key: 'template', label: 'Use a template', blurb: 'Start from a layout and edit it. Free.' },
  { key: 'upload', label: 'I have the artwork', blurb: 'Upload a print-ready file. Free.' },
  { key: 'creator', label: 'Hire a creator', blurb: 'A NowOpen designer does it properly.', chargeSku: 'dod-flyer' },
];

export interface OptionChoice {
  key: string;
  label: string;
  /** Multiplier on the base price. 0.1 = +10%. */
  delta: number;
  note?: string;
}

export interface OptionGroup {
  key: string;
  label: string;
  choices: OptionChoice[];
}

/**
 * Finish and sides, the two things that actually change what a printer charges.
 *
 * Deliberately short. Printivo exposes dozens of variants per product and the
 * result is a customer browsing specifications instead of ordering; the brief
 * called that out. These are the two that change the price enough to matter.
 */
export const PRINT_OPTIONS: OptionGroup[] = [
  {
    key: 'finish',
    label: 'Finish',
    choices: [
      { key: 'standard', label: 'Standard', delta: 0 },
      { key: 'matte', label: 'Matte', delta: 0.10 },
      { key: 'premium', label: 'Premium', delta: 0.25, note: 'Heavier stock' },
      { key: 'rounded', label: 'Rounded corners', delta: 0.08 },
    ],
  },
  {
    key: 'sides',
    label: 'Printed',
    choices: [
      { key: 'double', label: 'Both sides', delta: 0 },
      { key: 'single', label: 'One side', delta: -0.10 },
    ],
  },
];

/** Rush is only offered where a person is doing the work. */
export const SPEED_OPTIONS: OptionGroup[] = [
  {
    key: 'speed',
    label: 'Turnaround',
    choices: [
      { key: 'standard', label: 'Standard', delta: 0 },
      { key: 'rush', label: 'Rush', delta: 0.35, note: 'Front of the queue' },
    ],
  },
];

export function optionGroupsFor(item: CatalogueItem): OptionGroup[] {
  if (item.free) return [];
  if (item.fulfilment === 'partner') return [...PRINT_OPTIONS, ...SPEED_OPTIONS];
  return SPEED_OPTIONS;
}

export interface Configuration {
  quantity?: number;
  /** group key -> choice key */
  options: Record<string, string>;
  design: DesignRoute;
}

export interface QuoteLine {
  label: string;
  amount: number;
}

export interface Quote {
  lines: QuoteLine[];
  total: number;
  /** 'indicative' anywhere in the basket makes the whole quote indicative. */
  basis: PriceBasis;
  /** Working days, widened by the design route and narrowed by rush. */
  turnaround: [number, number];
}

const round100 = (n: number) => Math.ceil(n / 100) * 100;

/** The tier that applies to a quantity: the largest one at or below it. */
export function tierFor(item: CatalogueItem, quantity: number): { qty: number; price: number } | null {
  if (!item.tiers?.length) return null;
  const eligible = item.tiers.filter((t) => t.qty <= quantity);
  return eligible.length ? eligible[eligible.length - 1] : item.tiers[0];
}

export const defaultConfiguration = (item: CatalogueItem): Configuration => ({
  quantity: item.tiers?.[0]?.qty,
  options: Object.fromEntries(optionGroupsFor(item).map((g) => [g.key, g.choices[0].key])),
  design: 'ai',
});

/**
 * What this configuration costs, itemised.
 *
 * Itemised rather than a single number because a customer comparing NowOpen
 * with a printer needs to see which part is the printing and which part is the
 * design — and because an unexplained total is the fastest way to lose trust in
 * a price that is already an estimate.
 */
export function quoteFor(item: CatalogueItem, config: Configuration): Quote {
  const lines: QuoteLine[] = [];
  let basis: PriceBasis = item.basis;

  if (item.free) {
    lines.push({ label: item.name, amount: 0 });
  } else {
    const tier = tierFor(item, config.quantity ?? 0);
    const base = tier ? tier.price : item.price ?? 0;
    lines.push({ label: tier ? `${item.name} × ${tier.qty}` : item.name, amount: base });

    for (const group of optionGroupsFor(item)) {
      const chosen = group.choices.find((c) => c.key === config.options[group.key]);
      if (!chosen || chosen.delta === 0) continue;
      lines.push({
        label: `${group.label}: ${chosen.label}`,
        amount: round100(base * chosen.delta),
      });
    }
  }

  const route = DESIGN_ROUTES.find((r) => r.key === config.design);
  if (route?.chargeSku) {
    const service = CATALOGUE.find((c) => c.sku === route.chargeSku);
    if (service?.price) {
      lines.push({ label: `Design by a creator (${service.name})`, amount: service.price });
      // A creator's price is known, so it does not make the quote less certain.
      if (service.basis === 'indicative') basis = 'indicative';
    }
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0);

  let [min, max] = item.turnaround ?? [0, 0];
  if (config.design === 'creator') { min += 2; max += 4; }
  if (config.options.speed === 'rush' && max > 1) { min = Math.max(1, Math.round(min / 2)); max = Math.max(min, Math.round(max / 2)); }

  return { lines, total, basis, turnaround: [min, max] };
}

/** What the button should say, given whether a real price exists. */
export const orderVerb = (quote: Quote): string =>
  quote.basis === 'quoted' ? 'Place this order' : 'Request this order';

/**
 * A one-line specification, for the order record and the email a printer reads.
 *
 * Written so somebody quoting it never has to open the app.
 */
export function specLine(item: CatalogueItem, config: Configuration): string {
  const bits: string[] = [item.name];
  if (config.quantity) bits.push(`qty ${config.quantity}`);
  for (const group of optionGroupsFor(item)) {
    const chosen = group.choices.find((c) => c.key === config.options[group.key]);
    if (chosen) bits.push(`${group.label.toLowerCase()} ${chosen.label.toLowerCase()}`);
  }
  const route = DESIGN_ROUTES.find((r) => r.key === config.design);
  if (route) bits.push(`artwork: ${route.label.toLowerCase()}`);
  return bits.join(' · ');
}
