// NowOpen Studio — branded receipts.
//
// An invoice asks for money; a receipt proves it was paid. They are not the
// same document and a business needs both — a customer who paid cash wants
// something to hold, a customer claiming expenses needs it itemised, and a
// customer disputing a charge needs it to have a number.
//
// WHY THERE ARE SEVERAL LAYOUTS RATHER THAN ONE
//
// A receipt is a document with a shape people already expect, and the expected
// shape depends on the trade. A buka slip is a narrow till roll in a monospace
// face; an accountant's receipt is a letter that says "Received from … the sum
// of …"; a hotel gives you a folio with dates and nights; a courier gives you a
// waybill with two addresses. Handing all of them the same rectangle would make
// the document look improvised, which is the opposite of what a receipt is for.
//
// The template picked for a business is a starting point, not a rule — an owner
// can choose any of them.
//
// Totals follow invoices.ts exactly: discount comes off the subtotal, and tax
// applies to what is left. Two documents in one product must not disagree about
// arithmetic.

import { localDateISO } from './dates';
import { currencyInfo } from './currency';

export type ReceiptLayout =
  | 'thermal'       // 80mm till roll
  | 'retail'        // itemised sales receipt with a tax line
  | 'service'       // work done, by whom, with a warranty note
  | 'professional'  // "Official Receipt" letter
  | 'hospitality'   // stay folio: dates, room, nights
  | 'delivery';     // waybill: from, to, package

export interface ReceiptTemplate {
  id: ReceiptLayout;
  label: string;
  /** One line an owner can choose from without opening it. */
  blurb: string;
  /** Physical width the design is drawn at, in px, before export scaling. */
  designWidth: number;
  /** Categories this shape is the expected one for. */
  categories: string[];
}

export const RECEIPT_TEMPLATES: ReceiptTemplate[] = [
  {
    id: 'thermal',
    label: 'Till roll',
    blurb: 'Narrow 80mm slip, the shape that comes out of a counter printer.',
    designWidth: 380,
    categories: [
      'Restaurant', 'Fast Food', 'Café & Bakery', 'Bar & Lounge', 'Local Food Vendor',
      'Food Truck', 'Suya & Grill', 'Shawarma & Kebab', 'Bakery & Pastry',
      'Supermarket', 'Grocery / Mini-Mart', 'Frozen Food Store', 'Meat & Poultry Shop',
      'Produce / Fruit & Veg Market', 'Gas Refill Station', 'Palm Oil & Local Produce Seller',
      'Firewood & Charcoal Supply',
    ],
  },
  {
    id: 'retail',
    label: 'Sales receipt',
    blurb: 'Itemised, with quantities and a tax line. For anything sold over a counter.',
    designWidth: 640,
    categories: [
      'Retail Store', 'Fashion & Apparel', 'Electronics', 'Jewelry & Accessories',
      'Furniture & Home', 'Online Store / E-commerce', 'Boutique', 'Phone & Gadget Store',
      'Bookstore & Stationery', 'Cosmetics & Beauty Supply', 'Gift & Souvenir Shop',
      'Spare Parts Store', 'Pharmacy', 'Fabric Store', 'Footwear & Bags',
      'Wig & Hair Extensions', 'Perfume & Cosmetics Store', 'Optician',
    ],
  },
  {
    id: 'service',
    label: 'Service receipt',
    blurb: 'What was done, who did it, and what is covered afterwards.',
    designWidth: 640,
    categories: [
      'Salon / Barber', 'Spa & Beauty', 'Nail Studio', 'Hair Braiding Studio',
      'Wellness & Therapy', 'Fitness & Gym', 'Physiotherapy & Rehab',
      'Automotive', 'Gadget & Device Repair', 'Car Wash & Detailing',
      'Auto Electrician & Panel Beating', 'Tyre & Vulcanizer', 'Generator Sales & Repair',
      'Appliance Repair', 'Laundry & Dry Cleaning', 'House Cleaning', 'Cleaning Services',
      'Fumigation & Pest Control', 'Electrical Services', 'Plumbing Services',
      'Tailor & Fashion Designer', 'Furniture Maker / Carpentry', 'Painting & POP Ceiling',
      'Tiling & Flooring', 'CCTV & Security Installation', 'Solar Installation',
      'Welders & Fabrication', 'Roofing & Building Works', 'Construction',
      'Motorcycle & Bicycle Repair', 'Watch & Jewellery Repair', 'Key Cutting & Locksmith',
      'Photography & Video', 'Web & App Development', 'IT Support & Services',
      'Dental Care', 'Veterinary Services', 'Medical Laboratory', 'Hospital & Clinic',
    ],
  },
  {
    id: 'professional',
    label: 'Official receipt',
    blurb: '"Received from … the sum of …" — the wording a fee or a levy expects.',
    designWidth: 640,
    categories: [
      'Legal Services', 'Accounting & Tax', 'Consulting', 'Financial Services',
      'Insurance', 'Real Estate', 'Recruitment & HR', 'Business Coaching',
      'Microfinance & SACCO', 'Money Transfer / Mobile Money Agent',
      'School & Education', 'Training & Tutoring', 'Childcare', 'Music School',
      'Language School', 'Driving School', 'Computer & Tech Training',
      'Non-profit & NGO', 'Religious Organization', 'Software & IT', 'Digital Marketing',
    ],
  },
  {
    id: 'hospitality',
    label: 'Stay folio',
    blurb: 'Check-in, check-out and nights, the way a guest expects to see it.',
    designWidth: 640,
    categories: [
      'Hotel & Lodging', 'Guesthouse & Short-let / B&B', 'Travel & Tourism',
      'Event Planning', 'Catering', 'Event Rentals & Equipment', 'Car Rental',
    ],
  },
  {
    id: 'delivery',
    label: 'Waybill receipt',
    blurb: 'Two addresses and a package, for anything that moved to get there.',
    designWidth: 640,
    categories: [
      'Courier & Dispatch', 'Logistics & Transport', 'Moving & Haulage',
      'Towing & Recovery', 'Import/Export & Trading', 'Agriculture',
    ],
  },
];

/**
 * The shape a trade's receipt is expected to take.
 *
 * Falls back to the itemised sales receipt, which is the least surprising thing
 * to hand someone when we have no better idea — never to an empty screen.
 */
export function templateForCategory(category: string | null | undefined): ReceiptTemplate {
  const wanted = (category || '').trim();
  const match = wanted && RECEIPT_TEMPLATES.find((t) => t.categories.includes(wanted));
  return match || RECEIPT_TEMPLATES.find((t) => t.id === 'retail')!;
}

export function receiptTemplate(id: string | null | undefined): ReceiptTemplate {
  return RECEIPT_TEMPLATES.find((t) => t.id === id) || templateForCategory(null);
}

// --- The document -------------------------------------------------------------

export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'mobile money' | 'other';

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'transfer', 'card', 'mobile money', 'other'];

export interface ReceiptItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
}

export interface Receipt {
  id: string;
  number: string;
  layout: ReceiptLayout;
  customerName: string;
  customerPhone: string;
  items: ReceiptItem[];
  taxPct: number;
  discountPct: number;
  /** What the customer actually handed over. Drives the change line. */
  amountPaid: number;
  method: PaymentMethod;
  /** Who served them — the line that turns a slip into accountability. */
  servedBy: string;
  /** Layout-specific extras, e.g. stay dates or a delivery address. */
  reference: string;
  fromLabel: string;
  toLabel: string;
  checkIn: string;
  checkOut: string;
  notes: string;
  currency: string;
  issuedAt: string; // ISO datetime
  createdAt: string; // ISO datetime
}

const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const emptyReceiptItem = (): ReceiptItem => ({ id: uid(), description: '', qty: 1, unitPrice: 0 });

// --- Money --------------------------------------------------------------------

/**
 * Format an amount in the business's own currency.
 *
 * Goes through Intl with the currency's locale rather than pasting a ₦ in
 * front of a number: a receipt is a financial record, and a Ghanaian business
 * handing a customer a slip denominated in the wrong symbol is worse than one
 * with no symbol at all. Falls back to `CODE 1,234` where a runtime lacks the
 * currency, which is unambiguous even if it is plain.
 */
export function formatMoney(amount: number, currency: string): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const info = currencyInfo(currency);
  try {
    return new Intl.NumberFormat(info.locale, {
      style: 'currency',
      currency: info.code,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${info.code} ${value.toLocaleString()}`;
  }
}

export const receiptItemTotal = (item: ReceiptItem): number =>
  (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);

export interface ReceiptTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** Negative while the customer still owes; that is a part payment, not change. */
  change: number;
  outstanding: number;
}

/**
 * Every number on the slip, from the items up.
 *
 * Discount comes off the subtotal and tax applies to what is left — the same
 * order invoices.ts uses. Two documents in one product must not disagree about
 * arithmetic, or the pair of them stops being evidence of anything.
 */
export function receiptTotals(
  items: ReceiptItem[],
  taxPct: number,
  discountPct: number,
  amountPaid = 0,
): ReceiptTotals {
  const subtotal = (items || []).reduce((sum, i) => sum + receiptItemTotal(i), 0);
  const discount = subtotal * ((Number(discountPct) || 0) / 100);
  const tax = (subtotal - discount) * ((Number(taxPct) || 0) / 100);
  const total = subtotal - discount + tax;
  const paid = Number(amountPaid) || 0;
  const difference = paid - total;
  return {
    subtotal,
    discount,
    tax,
    total,
    // Change is only change once the bill is covered; anything short is money
    // still owed, and calling it "change: -500" on a printed receipt is how a
    // dispute starts.
    change: difference > 0 ? difference : 0,
    outstanding: difference < 0 ? -difference : 0,
  };
}

/** Nights between two dates, for the stay folio. Never negative. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(`${checkIn}T00:00:00`);
  const b = new Date(`${checkOut}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const nights = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return nights > 0 ? nights : 0;
}

// --- Numbering ----------------------------------------------------------------

/**
 * The next receipt number.
 *
 * Date-prefixed and zero-padded (`RCP-20260827-0007`) so a stack of them sorts
 * correctly and a gap is visible — which is the entire point of numbering a
 * receipt. Counts only the receipts issued on the same day, so the sequence
 * restarts daily rather than growing forever.
 */
export function nextReceiptNumber(existing: Receipt[], today = localDateISO()): string {
  const stamp = today.replace(/-/g, '');
  const prefix = `RCP-${stamp}-`;
  const highest = (existing || [])
    .filter((r) => r.number?.startsWith(prefix))
    .reduce((max, r) => {
      const n = parseInt(r.number.slice(prefix.length), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
}

export function createReceipt(
  data: Partial<Receipt>,
  existing: Receipt[],
  currency: string,
): Receipt {
  const now = new Date().toISOString();
  return {
    id: uid(),
    number: nextReceiptNumber(existing),
    layout: 'retail',
    customerName: '',
    customerPhone: '',
    items: [emptyReceiptItem()],
    taxPct: 0,
    discountPct: 0,
    amountPaid: 0,
    method: 'cash',
    servedBy: '',
    reference: '',
    fromLabel: '',
    toLabel: '',
    checkIn: '',
    checkOut: '',
    notes: '',
    currency,
    issuedAt: now,
    createdAt: now,
    ...data,
  };
}

/**
 * The message that goes with a receipt sent over WhatsApp.
 *
 * Deliberately carries the number and the total in text as well as the image:
 * a customer searching their chat history months later searches words, not
 * pictures.
 */
export function receiptText(businessName: string, receipt: Receipt, totals: ReceiptTotals): string {
  const lines = [
    `Receipt ${receipt.number} — ${businessName}`,
    `Total: ${formatMoney(totals.total, receipt.currency)} (${receipt.method})`,
  ];
  if (totals.outstanding > 0) {
    lines.push(`Balance due: ${formatMoney(totals.outstanding, receipt.currency)}`);
  }
  lines.push('Thank you for your business.');
  return lines.join('\n');
}

// --- Storage ------------------------------------------------------------------

export const receiptsKey = (businessId: string): string => `nowopen_receipts_${businessId}`;

export function loadReceipts(businessId: string): Receipt[] {
  try {
    const raw = localStorage.getItem(receiptsKey(businessId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveReceipts(businessId: string, receipts: Receipt[]): void {
  try {
    localStorage.setItem(receiptsKey(businessId), JSON.stringify(receipts));
  } catch {
    /* storage full or unavailable — the receipt on screen is still exportable */
  }
}
