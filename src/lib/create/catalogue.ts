/**
 * NowOpen Create — the catalogue and its prices.
 *
 * Five divisions, one workflow: Create it. Brand it. Print it. Promote it.
 * Grow it. Printivo's model is the benchmark for the production catalogue and
 * the fulfilment chain; the part NowOpen adds is that a finished asset can go
 * straight to print, to an advert, or onto a profile people already search.
 *
 * ── THE ONE THING TO UNDERSTAND ABOUT THESE PRICES ────────────────────────
 *
 * Every physical price here is `basis: 'indicative'`. It is derived from a
 * competitor's public retail price, NOT from a quote NowOpen has been given.
 * Nobody has agreed to produce any of it at any price.
 *
 * That distinction is carried in the data instead of a comment, because the
 * moment a customer can pay, an indicative number becomes a commitment — and a
 * commitment made against a guessed cost is a loss taken on every order. So:
 *
 *   indicative  a benchmark. Show it as "from", never take money against it.
 *   quoted      a production partner has priced it. Safe to sell.
 *
 * `sellable()` is the gate. It returns false for everything in this file today,
 * and will start returning true one SKU at a time as real quotes arrive. That
 * is deliberate: the catalogue can ship, be browsed, and gather demand signal
 * long before a single supplier is signed, without anyone being sold something
 * at a price that was invented.
 *
 * Digital work is different and is priced honestly today: it costs NowOpen
 * compute and a creator's time, both of which are known.
 */

export type Division = 'create' | 'video' | 'print' | 'brand' | 'advertise';

/** Who actually delivers it. Decides the margin band and the turnaround. */
export type Fulfilment =
  | 'instant'   // generated in Studio, no human, no partner
  | 'creator'   // a NowOpen creator does the work
  | 'partner';  // a production partner prints and delivers it

/** Whether a price is real money or a benchmark. See the note above. */
export type PriceBasis = 'indicative' | 'quoted';

export interface QuantityTier {
  qty: number;
  /** Naira, VAT-exclusive, delivery excluded. */
  price: number;
}

export interface Benchmark {
  /** Where the reference price came from. Never presented to a customer. */
  source: string;
  low: number;
  high?: number;
  /** When it was observed — a benchmark with no date is a benchmark you cannot trust. */
  seen: string;
}

export interface CatalogueItem {
  sku: string;
  division: Division;
  name: string;
  blurb: string;
  fulfilment: Fulfilment;
  basis: PriceBasis;
  /** Free at point of use. Digital creation, to get businesses into Create. */
  free?: boolean;
  /** A single price, for work that does not vary by quantity. */
  price?: number;
  /** Quantity breaks, for print. Ascending, and cheaper per unit as they rise. */
  tiers?: QuantityTier[];
  /** True when `price` is a starting point rather than the whole price. */
  from?: boolean;
  benchmark?: Benchmark;
  /** Working days, [fastest, slowest]. */
  turnaround?: [number, number];
  /**
   * For free items: the Studio tool that actually makes this thing.
   *
   * Every "Create it free" button used to point at bare /studio, so choosing
   * "Poster" and choosing "Caption" both landed on the Growth Center and the
   * visitor had to go and find the tool themselves. Studio reads ?module=,
   * so the button can open the thing it named. Keys are the ModuleKey values
   * in pages/Studio.tsx; studioModulesExist() in the test keeps them honest.
   */
  studioModule?: string;
  /**
   * The design work is already inside the price.
   *
   * True for packs, where "hire a creator" is not an upsell — it is what the
   * pack is. Without this the configurator would offer to add a creator fee on
   * top of a bundle whose whole point is that a creator does all of it.
   */
  designIncluded?: boolean;
}

const PRINTIVO = (low: number, high?: number): Benchmark =>
  ({ source: 'printivo.com public retail', low, high, seen: '2026-09-06' });

/* ── DIGITAL: free, because this is how a business gets into Create ───────── */

const QUICK_CREATE: CatalogueItem[] = ([
  ['qc-social', 'Social post', 'A post sized for every platform, using your brand.', 'design'],
  ['qc-flyer', 'Flyer', 'A flyer built from your logo, colours and details.', 'design'],
  ['qc-poster', 'Poster', 'A poster you can print or post.', 'design'],
  // Both cards open the same tool: BrandCardStudio exports the printable card
  // and the QR lockup, so splitting them across two modules would be a lie.
  ['qc-card', 'Business card design', 'Your card, ready to download or print.', 'card'],
  ['qc-digital-card', 'Digital business card', 'A live card with a QR that points at your profile.', 'card'],
  ['qc-caption', 'Caption', 'Wording for the post, in your brand voice.', 'copywriter'],
  ['qc-resize', 'Resize', 'One design, every size, without redoing it.', 'design'],
] as const).map(([sku, name, blurb, studioModule]) => ({
  sku, name, blurb, studioModule,
  division: 'create' as const, fulfilment: 'instant' as const,
  basis: 'quoted' as const, free: true, turnaround: [0, 0] as [number, number],
}));

/* ── DESIGN ON DEMAND: a creator does the work ───────────────────────────── */

const DESIGN_ON_DEMAND: CatalogueItem[] = [
  ['dod-social', 'Social media design', 7_500],
  ['dod-card', 'Business card design', 8_000],
  ['dod-flyer', 'Professional flyer design', 10_000],
  ['dod-poster', 'Poster design', 15_000],
  ['dod-menu', 'Menu design', 15_000],
  ['dod-event', 'Event creative', 15_000],
  ['dod-flyer-premium', 'Premium flyer', 20_000],
  ['dod-brochure', 'Brochure design', 25_000],
  ['dod-presentation', 'Presentation design', 25_000],
  ['dod-catalogue', 'Product catalogue', 30_000],
  ['dod-logo', 'Logo design', 35_000],
  ['dod-packaging', 'Packaging design', 40_000],
  ['dod-brandkit', 'Logo + mini brand kit', 75_000],
  ['dod-guidelines', 'Brand guidelines', 75_000],
  ['dod-identity', 'Full brand identity', 150_000],
].map(([sku, name, price]) => ({
  sku: sku as string, name: name as string,
  blurb: 'Briefed to a NowOpen creator, delivered to your brand kit.',
  division: (String(sku).startsWith('dod-logo') || String(sku).includes('brand') || String(sku).includes('identity') || String(sku).includes('guidelines') || String(sku).includes('packaging') ? 'brand' : 'create') as Division,
  fulfilment: 'creator' as const,
  basis: 'quoted' as const,
  price: price as number,
  from: true,
  turnaround: [2, 5] as [number, number],
}));

/* ── VIDEO ───────────────────────────────────────────────────────────────── */

const VIDEO: CatalogueItem[] = [
  ['vid-reel', 'AI social reel', 3_500, [0, 1]],
  ['vid-15', '15-second advert', 7_500, [0, 1]],
  ['vid-promo', 'AI promo video', 7_500, [0, 1]],
  ['vid-product', 'Product promo', 10_000, [1, 2]],
  ['vid-30', '30-second advert', 12_500, [1, 2]],
  ['vid-logo', 'Logo animation', 15_000, [1, 3]],
  ['vid-60', '60-second advert', 20_000, [2, 4]],
  ['vid-motion', 'Premium motion graphic', 25_000, [3, 5]],
  ['vid-opener', 'Event opener', 25_000, [3, 5]],
  ['vid-cinematic', 'Cinematic brand advert', 50_000, [5, 10]],
].map(([sku, name, price, turnaround]) => ({
  sku: sku as string, name: name as string,
  blurb: 'Rendered from your brand kit, sized for the platform you are posting to.',
  division: 'video' as const,
  fulfilment: (Number(price) >= 25_000 ? 'creator' : 'instant') as Fulfilment,
  basis: 'quoted' as const,
  price: price as number,
  from: true,
  turnaround: turnaround as [number, number],
}));

/* ── PRINT: every price here is a benchmark, not a quote ──────────────────── */

const tiers = (...pairs: [number, number][]): QuantityTier[] =>
  pairs.map(([qty, price]) => ({ qty, price }));

const PRINT: CatalogueItem[] = [
  {
    sku: 'pr-cards', division: 'print', name: 'Business cards',
    blurb: 'Double-sided, on your brand.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([100, 15_000], [250, 25_000], [500, 38_000], [1_000, 55_000]),
    benchmark: PRINTIVO(11_000, 15_100), turnaround: [3, 5],
  },
  {
    sku: 'pr-flyer-a5', division: 'print', name: 'A5 flyers',
    blurb: 'The workhorse flyer.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([100, 33_000], [250, 62_000], [500, 105_000], [1_000, 175_000]),
    benchmark: PRINTIVO(25_800, 34_900), turnaround: [3, 5],
  },
  {
    sku: 'pr-flyer-a6', division: 'print', name: 'A6 flyers',
    blurb: 'Handbill size, cheapest per piece.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([100, 25_000], [250, 46_000], [500, 78_000], [1_000, 130_000]),
    benchmark: PRINTIVO(17_400, 29_400), turnaround: [3, 5],
  },
  {
    sku: 'pr-flyer-a4', division: 'print', name: 'A4 flyers',
    blurb: 'Full-page, for menus and price lists.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([100, 53_000], [250, 98_000], [500, 165_000]),
    benchmark: PRINTIVO(43_500, 52_300), turnaround: [3, 5],
  },
  {
    sku: 'pr-letterhead', division: 'print', name: 'Letterheads',
    blurb: 'Branded paper for quotes and letters.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([100, 22_000], [500, 85_000]),
    benchmark: PRINTIVO(17_900), turnaround: [3, 5],
  },
  {
    sku: 'pr-idcard', division: 'print', name: 'ID cards',
    blurb: 'Staff cards, printed and laminated.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([10, 65_000], [50, 300_000]),
    benchmark: PRINTIVO(4_500, 5_000), turnaround: [3, 6],
  },
  {
    sku: 'pr-stickers', division: 'print', name: 'Stickers & labels',
    blurb: 'Product labels and branding stickers.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([100, 16_000], [500, 65_000], [1_000, 115_000]),
    benchmark: PRINTIVO(10_400, 17_000), turnaround: [4, 7],
  },
  {
    sku: 'pr-poster-a3', division: 'print', name: 'A3 posters',
    blurb: 'Shop and event posters.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([10, 62_000], [50, 260_000]),
    benchmark: PRINTIVO(58_100), turnaround: [3, 5],
  },
  {
    sku: 'pr-rollup', division: 'print', name: 'Roll-up banner',
    blurb: 'Free-standing, with its own case.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([1, 70_000], [2, 132_000]),
    benchmark: PRINTIVO(56_000, 68_500), turnaround: [3, 6],
  },
  {
    sku: 'pr-flex-5x3', division: 'print', name: 'Flex banner 5×3ft',
    blurb: 'Outdoor banner for a shopfront.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([1, 19_000], [3, 54_000]),
    benchmark: PRINTIVO(15_000), turnaround: [2, 4],
  },
  {
    sku: 'pr-flex-7x3', division: 'print', name: 'Flex banner 7×3ft',
    blurb: 'Wider outdoor banner.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([1, 26_000], [3, 74_000]),
    benchmark: PRINTIVO(21_100), turnaround: [2, 4],
  },
  {
    sku: 'pr-foamboard', division: 'print', name: 'Foam board',
    blurb: 'Rigid board for counters and events.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([1, 12_000], [5, 55_000]),
    benchmark: PRINTIVO(8_600), turnaround: [3, 5],
  },
  {
    sku: 'pr-paperbag', division: 'print', name: 'Paper bags',
    blurb: 'Branded carrier bags.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([100, 60_000], [500, 250_000]),
    benchmark: PRINTIVO(45_000, 188_000), turnaround: [7, 14],
  },
  {
    sku: 'pr-backdrop', division: 'print', name: 'Event backdrop',
    blurb: 'Large-format backdrop with frame.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([1, 350_000]),
    benchmark: PRINTIVO(309_400), turnaround: [5, 10],
  },
  {
    sku: 'pr-tshirt', division: 'print', name: 'T-shirts',
    blurb: 'Branded staff or giveaway shirts.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([10, 85_000], [50, 390_000]),
    benchmark: PRINTIVO(6_000, 7_000), turnaround: [5, 10],
  },
  {
    sku: 'pr-hoodie', division: 'print', name: 'Hoodies',
    blurb: 'Branded hoodies.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([10, 245_000]),
    benchmark: PRINTIVO(19_900), turnaround: [7, 14],
  },
  {
    sku: 'pr-mug', division: 'print', name: 'Mugs',
    blurb: 'Printed mugs, sold by the ten.', fulfilment: 'partner', basis: 'indicative',
    tiers: tiers([10, 55_000], [50, 250_000]),
    benchmark: PRINTIVO(47_400), turnaround: [5, 10],
  },
];

export const CATALOGUE: CatalogueItem[] = [
  ...QUICK_CREATE, ...DESIGN_ON_DEMAND, ...VIDEO, ...PRINT,
];

/* ── Packs ───────────────────────────────────────────────────────────────── */

export interface Pack {
  sku: string;
  name: string;
  price: number;
  basis: PriceBasis;
  includes: string[];
  /** Working days for the whole pack, [fastest, slowest]. */
  turnaround: [number, number];
}

/**
 * Packs are `indicative` because each contains print, and print is indicative.
 * A pack cannot be more certain than the least certain thing inside it.
 */
export const PACKS: Pack[] = [
  {
    sku: 'pack-starter', name: 'Starter Brand Pack', price: 25_000, basis: 'indicative',
    includes: ['100 business cards', '1 flyer design', '5 social designs', 'Digital business card', 'QR code', 'Profile optimisation'],
    turnaround: [3, 7],
  },
  {
    sku: 'pack-growth', name: 'Growth Pack', price: 75_000, basis: 'indicative',
    includes: ['250 business cards', '100 flyers', '10 social creatives', '2 reels', 'Digital card', 'QR poster', 'WhatsApp creative', 'Profile optimisation'],
    turnaround: [5, 10],
  },
  {
    sku: 'pack-visibility', name: 'Business Visibility Pack', price: 150_000, basis: 'indicative',
    includes: ['500 business cards', '250 flyers', '20 social creatives', '4 reels', 'Roll-up banner', 'QR poster', 'Digital card', 'Profile optimisation', '1 campaign'],
    turnaround: [7, 14],
  },
  {
    sku: 'pack-launch', name: 'Launch Pack', price: 250_000, basis: 'indicative',
    includes: ['Logo', 'Brand identity', 'Digital brand kit', 'Business cards', 'Flyers', 'Social templates', '5 reels', 'Banner', 'QR', 'Business profile', 'Launch campaign', 'Advertising credit'],
    turnaround: [10, 21],
  },
];

/**
 * A pack, shaped so the configurator can price and order it.
 *
 * The "Request a quote" button on every pack used to go to /waitlist — a
 * launch-signup form, which is not a quote request and never reached anybody
 * who could price the job. A pack is just a large order, so it goes through
 * the same flow as everything else.
 *
 * Fulfilment is 'creator', not 'partner': a pack contains print, but finish
 * and sides are per-item choices that mean nothing across a whole bundle.
 * Speed is the only thing a customer can actually vary here.
 */
export const packAsItem = (pack: Pack): CatalogueItem => ({
  sku: pack.sku,
  division: 'create',
  name: pack.name,
  blurb: pack.includes.join(' · '),
  fulfilment: 'creator',
  basis: pack.basis,
  price: pack.price,
  turnaround: pack.turnaround,
  designIncluded: true,
});

/* ── Credits ─────────────────────────────────────────────────────────────── */

export interface CreditBundle { naira: number; credits: number }

/** Deliberately better value as they rise, so the ladder rewards commitment. */
export const CREDIT_BUNDLES: CreditBundle[] = [
  { naira: 2_000, credits: 20 },
  { naira: 5_000, credits: 60 },
  { naira: 10_000, credits: 140 },
  { naira: 25_000, credits: 400 },
];

export const creditValue = (b: CreditBundle): number => b.naira / b.credits;

/* ── Margin ──────────────────────────────────────────────────────────────── */

/** What NowOpen takes, by who does the work. */
export const MARGIN_BAND: Record<Fulfilment, [number, number]> = {
  instant: [1, 1],      // all of it; the cost is compute
  creator: [0.15, 0.25],
  partner: [0.15, 0.30],
};

export interface Costing {
  /** What the partner or creator charges NowOpen. */
  supplierCost: number;
  deliveryFee?: number;
  /** 0.2 = 20%. */
  markup: number;
}

/** Customer price from a real cost. Rounded up to ₦100 — nobody quotes ₦17,438. */
export function customerPrice({ supplierCost, deliveryFee = 0, markup }: Costing): number {
  const raw = (supplierCost + deliveryFee) * (1 + markup);
  return Math.ceil(raw / 100) * 100;
}

export function marginOn(costing: Costing): number {
  return customerPrice(costing) - costing.supplierCost - (costing.deliveryFee ?? 0);
}

/** Is a proposed markup inside the band for this kind of work? */
export function markupInBand(fulfilment: Fulfilment, markup: number): boolean {
  const [lo, hi] = MARGIN_BAND[fulfilment];
  return markup >= lo && markup <= hi;
}

/* ── The honesty gate ────────────────────────────────────────────────────── */

/**
 * May NowOpen take money for this today?
 *
 * Only when the price came from somebody who agreed to produce it. Everything
 * priced off a competitor's shelf is browsable and quotable, never sellable —
 * because the first order at an invented price is the first order sold at a
 * loss, and the customer is owed the truth either way.
 */
export const sellable = (item: CatalogueItem | Pack): boolean =>
  item.basis === 'quoted';

/** How a price should be shown, given what is actually known about it. */
export function priceLabel(item: CatalogueItem): string {
  if (item.free) return 'Free';
  const tier = item.tiers?.length ? item.tiers[0] : null;
  const amount = tier ? tier.price : item.price;
  if (amount == null) return 'On request';
  /*
   * "per 100", not just the number.
   *
   * Printivo writes every price as "starting at ₦15,100 per 100", and it is the
   * better label for a reason that has nothing to do with copying them: a price
   * for a printed thing is meaningless without the quantity it buys. Ours said
   * "from ₦15,000" and left the reader to work out whether that was for one
   * card or a thousand — which reads as expensive until they find out.
   */
  const money = `₦${amount.toLocaleString('en-NG')}${tier ? ` per ${tier.qty}` : ''}`;
  if (item.basis === 'indicative') return `from ${money} — estimate`;
  return item.from || tier ? `from ${money}` : money;
}

export const byDivision = (division: Division): CatalogueItem[] =>
  CATALOGUE.filter((i) => i.division === division);

/** Everything still waiting on a real supplier quote. The list to go and get. */
export const awaitingQuote = (): CatalogueItem[] =>
  CATALOGUE.filter((i) => i.basis === 'indicative');
