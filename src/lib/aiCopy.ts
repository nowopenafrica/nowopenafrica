// Deterministic "AI" copy assistant for the Creative Studio.
//
// No model behind this — a hand-written bank of on-brand copy per occasion,
// personalised with the business name, category and Brand OS identity (tagline,
// voice, writing style). The Design Studio uses it for the "Generate copy
// ideas" button and the Smart CTA suggestions.

import { BrandIdentity } from './brandIdentity';
import { StudioTemplate } from '../data/studioPresets';

export interface CopyVariant {
  /** Short label for the tone, e.g. "Direct", "Urgent", "Warm", "On-brand". */
  label: string;
  headline: string;
  subline: string;
  badge: string;
}

export interface CtaSuggestion {
  badge: string;
  subline: string;
}

const clamp = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// On-brand copy per occasion key. Each entry is a full, ready-to-export
// headline + subline + badge trio (respecting the Design Studio input limits).
const COPY_BANK: Record<string, CopyVariant[]> = {
  'now-open': [
    { label: 'Direct', headline: 'Now Open', subline: "We're officially open — come say hello.", badge: 'NOW OPEN' },
    { label: 'Warm', headline: 'Welcome to the neighbourhood', subline: 'Your new go-to is ready and waiting.', badge: 'WELCOME' },
    { label: 'Urgent', headline: 'First visit? Let us make it count', subline: 'Open today. See you soon.', badge: 'OPEN NOW' },
  ],
  'grand-opening': [
    { label: 'Direct', headline: "It's finally here — Grand Opening", subline: 'Ribbon-cutting specials all day.', badge: 'GRAND OPENING' },
    { label: 'Warm', headline: 'Something exciting just opened', subline: 'Celebrate with us — offers all week.', badge: 'WELCOME IN' },
    { label: 'Urgent', headline: 'Big day! Doors are open now', subline: 'Welcome packs for the first 50 guests.', badge: 'NOW OPEN' },
  ],
  'new-product': [
    { label: 'Direct', headline: 'Just dropped: our newest arrival', subline: 'Fresh on the shelf and ready for you.', badge: 'JUST IN' },
    { label: 'Warm', headline: 'Something new (and worth it) is here', subline: 'Meet the latest addition to our range.', badge: 'NEW ARRIVAL' },
    { label: 'Urgent', headline: 'First come, first served', subline: 'New stock, limited quantities.', badge: 'NEW' },
  ],
  'weekend-offer': [
    { label: 'Direct', headline: 'Weekend specials are live', subline: 'Save big — this weekend only.', badge: 'WEEKEND OFFER' },
    { label: 'Urgent', headline: '3 days. One offer. Do not miss it', subline: 'Prices drop Friday to Sunday.', badge: 'THIS WEEKEND' },
    { label: 'Warm', headline: 'Treat yourself this weekend', subline: 'Special prices to make your weekend better.', badge: 'WEEKEND DEALS' },
  ],
  'flash-sale': [
    { label: 'Urgent', headline: 'Flash sale: 24 hours only', subline: "When it's gone, it's gone.", badge: 'FLASH SALE' },
    { label: 'Direct', headline: 'Right now — our best prices', subline: 'Stock is moving fast.', badge: 'HURRY' },
    { label: 'Warm', headline: 'A little surprise for you today', subline: 'Today-only savings across the store.', badge: 'TODAY ONLY' },
  ],
  discount: [
    { label: 'Direct', headline: 'Save on everything today', subline: 'Real discounts, no gimmicks.', badge: 'SPECIAL OFFER' },
    { label: 'Urgent', headline: 'Big savings, limited time', subline: 'Lock in the deal before it ends.', badge: "DON'T MISS OUT" },
    { label: 'Warm', headline: 'A thank-you in the form of a discount', subline: 'A little extra off for loyal customers.', badge: 'FOR YOU' },
  ],
  'happy-hour': [
    { label: 'Direct', headline: 'Happy hour is on', subline: 'Unbeatable prices after 5pm.', badge: 'HAPPY HOUR' },
    { label: 'Urgent', headline: '5pm — the deals begin', subline: 'Every weekday evening, no excuses.', badge: 'AFTER 5PM' },
    { label: 'Warm', headline: "Let's end the day on a high", subline: 'Great prices, great company.', badge: 'AFTER WORK' },
  ],
  'thank-you': [
    { label: 'Warm', headline: 'Thank you from the whole team', subline: "We wouldn't be here without you.", badge: 'THANK YOU' },
    { label: 'Direct', headline: 'Your support means the world', subline: "Here's to many more years together.", badge: 'GRATEFUL' },
    { label: 'Warm', headline: 'From our family to yours — thanks', subline: 'A small token of our appreciation.', badge: 'APPRECIATION' },
  ],
  'customer-appreciation': [
    { label: 'Warm', headline: "You're the reason we exist", subline: 'A little appreciation, straight from us.', badge: 'FOR OUR CUSTOMERS' },
    { label: 'Direct', headline: 'Loyalty pays — literally', subline: 'Perks and surprises for regulars.', badge: 'LOYALTY REWARDS' },
    { label: 'Urgent', headline: 'This month only — for our regulars', subline: 'A gift waiting for you in-store.', badge: 'SPECIAL FOR YOU' },
  ],
  referral: [
    { label: 'Direct', headline: 'Bring a friend, both win', subline: 'Refer someone and get rewarded.', badge: 'REFER A FRIEND' },
    { label: 'Warm', headline: 'Good things are better shared', subline: 'Share the love — get rewarded.', badge: 'SHARE & SAVE' },
    { label: 'Urgent', headline: 'Your invite = instant reward', subline: 'For you and the friend you bring.', badge: '2 FOR 1' },
  ],
  hiring: [
    { label: 'Direct', headline: "We're hiring — join us", subline: 'Be part of a team that cares.', badge: "WE'RE HIRING" },
    { label: 'Warm', headline: 'Build your future with us', subline: "We're growing and we want you on the team.", badge: 'NOW HIRING' },
    { label: 'Urgent', headline: 'Your next chapter starts here', subline: "Apply today — spots won't last.", badge: 'APPLY NOW' },
  ],
  'holiday-hours': [
    { label: 'Direct', headline: 'Holiday hours — plan your visit', subline: "We're open, just on new times.", badge: 'HOLIDAY HOURS' },
    { label: 'Warm', headline: 'Still open, just a little different', subline: 'Check the schedule before you come.', badge: 'NEW TIMES' },
    { label: 'Urgent', headline: "Don't get caught out this holiday", subline: 'Our festive schedule is live.', badge: 'PLAN YOUR VISIT' },
  ],
  anniversary: [
    { label: 'Warm', headline: 'Years strong, thanks to you', subline: 'Celebrating the journey with you.', badge: 'ANNIVERSARY' },
    { label: 'Direct', headline: 'A milestone worth celebrating', subline: 'Special offers all month long.', badge: 'WE MADE IT' },
    { label: 'Urgent', headline: 'One week of celebration only', subline: 'Anniversary prices while it lasts.', badge: 'CELEBRATION' },
  ],
  event: [
    { label: 'Direct', headline: "You're invited — save the date", subline: 'Join us for an event to remember.', badge: "DON'T MISS IT" },
    { label: 'Urgent', headline: 'Limited seats. Book now', subline: 'Spots are filling fast.', badge: 'TICKETS' },
    { label: 'Warm', headline: 'Something special is coming', subline: 'We saved a seat for you.', badge: 'INVITED' },
  ],
  'percent-off': [
    { label: 'Direct', headline: 'Big % off — this week only', subline: 'Across the store, no code needed.', badge: 'SPECIAL OFFER' },
    { label: 'Urgent', headline: 'Save before the sale ends', subline: 'Once it ends, prices go back up.', badge: 'HURRY' },
    { label: 'Warm', headline: 'A deal worth sharing', subline: 'Tell your friends — everyone saves.', badge: 'SHARE THE SAVINGS' },
  ],
  bogo: [
    { label: 'Direct', headline: 'Buy one, get one free', subline: 'Stock up while it lasts.', badge: '2 FOR 1' },
    { label: 'Urgent', headline: 'Double the value, half the wait', subline: 'While stocks last in-store.', badge: 'BOGO' },
    { label: 'Warm', headline: 'Two for the price of one', subline: 'Bring a friend — it is on us.', badge: 'TAKE A FRIEND' },
  ],
  clearance: [
    { label: 'Urgent', headline: 'Clearance: everything must go', subline: 'Limited stock — grab it while you can.', badge: 'CLEARANCE' },
    { label: 'Direct', headline: 'Final prices. Final chance', subline: 'Once it is gone, it is gone.', badge: 'LAST CHANCE' },
    { label: 'Warm', headline: 'Fresh stock, fresh prices', subline: 'New season is coming in fast.', badge: 'MAKE ROOM' },
  ],
  voucher: [
    { label: 'Warm', headline: 'Give the perfect gift', subline: 'Vouchers available in-store.', badge: 'GIFT CARD' },
    { label: 'Direct', headline: 'A gift they will actually use', subline: 'Flexible vouchers, any amount.', badge: 'THE PERFECT GIFT' },
    { label: 'Urgent', headline: 'Last-minute gift sorted', subline: 'Pick one up before you go.', badge: 'GRAB ONE' },
  ],
  'free-delivery': [
    { label: 'Direct', headline: 'Free delivery over a minimum', subline: 'Order today, doorstep tomorrow.', badge: 'FREE DELIVERY' },
    { label: 'Urgent', headline: 'Free delivery ends soon', subline: 'Order now and save the trip.', badge: 'ORDER NOW' },
    { label: 'Warm', headline: 'Skip the trip — we deliver', subline: 'Straight to your door.', badge: 'DELIVERED' },
  ],
};

// Generic fallback when a template key has no hand-written bank entry (poster,
// banner and industry templates reuse this, flavoured by the occasion label).
const FALLBACK: CopyVariant[] = [
  { label: 'Direct', headline: 'Visit us today', subline: 'Fresh offers, ready for you.', badge: 'WELCOME' },
  { label: 'Urgent', headline: 'Limited time — act now', subline: 'While it lasts.', badge: 'ACT NOW' },
  { label: 'Warm', headline: 'We would love to see you', subline: 'Open today — come on in.', badge: 'OPEN TODAY' },
];

// Category → call-to-action suggestions. Matched against the business category
// text (loosely), so "Restaurant & Bar", "Car Mechanic" and "Beauty Salon" all
// resolve to the right action.
const CTA_RULES: { test: RegExp; badge: string; subline: string }[] = [
  { test: /restaurant|food|cafe|grill|kitchen|bakery|eatery|chop|bar|pub/i, badge: 'RESERVE A TABLE', subline: 'Book your table today' },
  { test: /mechanic|auto|garage|repair|tyres|tires/i, badge: 'BOOK A SERVICE', subline: 'Call to book your slot' },
  { test: /barber|salon|beauty|spa|hair|nails|nail|lashes|brows/i, badge: 'BOOK YOUR VISIT', subline: 'Walk-ins welcome, bookings preferred' },
  { test: /hotel|lodge|guest\s*house|inn|resort/i, badge: 'BOOK DIRECT', subline: 'Best rate when you book direct' },
  { test: /school|academy|tutor|college|training|education/i, badge: 'ENROL NOW', subline: 'Limited places available' },
  { test: /church|ministry|chapel|mosque|temple/i, badge: 'JOIN US', subline: 'Everyone is welcome' },
  { test: /real|estate|property|apartment|housing|rental/i, badge: 'BOOK A VIEWING', subline: 'See it before you decide' },
  { test: /hospital|clinic|medical|dental|doctor|pharmacy|optician|physio/i, badge: 'BOOK AN APPOINTMENT', subline: 'Quality care, close to home' },
  { test: /shop|store|retail|butchery|supermarket|market|pharmacy|mall/i, badge: 'ORDER NOW', subline: 'In-store & online' },
  { test: /event|entertainment|concert|gig|nightclub|party/i, badge: 'GET TICKETS', subline: 'Limited tickets left' },
  { test: /fashion|clothing|apparel|tailor|attire|shoes/i, badge: 'SHOP THE DROP', subline: 'New styles in store' },
  { test: /farm|agric|produce|market/i, badge: 'ORDER FRESH', subline: 'Straight from the source' },
  { test: /gym|fitness|personal\s*trainer|studio/i, badge: 'START TODAY', subline: 'First session on us' },
  { test: /insurance|financial|bank|loan/i, badge: 'TALK TO US', subline: 'Free consultation today' },
];

const ACTION_WORDS = /save|call|book|reserve|order|join|get|visit|buy|shop|enrol|register|apply|grab|secure|talk|start|free|delivery/i;

// A ready-to-apply CTA for this business + occasion. Uses the category match
// first; falls back to a generic urgency CTA for offer-style templates.
export function smartCta(business: { name: string; category: string; location?: string }, template: StudioTemplate): CtaSuggestion {
  const cat = business.category || '';
  const hit = CTA_RULES.find((r) => r.test.test(cat));
  if (hit) return { badge: hit.badge, subline: hit.subline };
  const generic = /sale|offer|discount|flash|weekend|clearance|bogo|percent|voucher|delivery|promo/i.test(template.key + template.badge);
  if (generic) return { badge: 'SHOP NOW', subline: 'Limited time — act fast' };
  return { badge: 'CALL NOW', subline: business.location ? `Visit us in ${business.location} today` : 'Visit us today' };
}

// Deterministic copy ideas. Always returns a fixed set the user can apply with
// one tap: the current template copy, two hand-written occasion variants and a
// personalised "on-brand" variant woven from the Brand OS identity.
export function generateCopyVariants(
  business: { name: string; category: string },
  identity: BrandIdentity,
  template: StudioTemplate,
): CopyVariant[] {
  const bank = COPY_BANK[template.key] ?? FALLBACK;
  const direct = bank[0];
  const second = bank[1] ?? FALLBACK[1];
  const third = bank[2] ?? FALLBACK[2];

  const tag = identity.tagline.trim();
  const name = business.name.trim();
  const cat = business.category || 'your local favourite';
  const onBrand: CopyVariant = tag
    ? {
        label: 'On-brand',
        headline: clamp(tag, 40),
        subline: clamp(tag ? `${name ? `${name} · ` : ''}${cat.toLowerCase()}` : cat, 60),
        badge: template.badge,
      }
    : {
        label: 'On-brand',
        headline: clamp(name || template.headline, 40),
        subline: clamp(`Your local ${cat.toLowerCase()} choice.`, 60),
        badge: 'WELCOME',
      };

  return [
    { label: 'Current', headline: template.headline, subline: template.subline, badge: template.badge },
    direct,
    second,
    third,
    onBrand,
  ];
}

// Whether a badge reads as an actionable call-to-action (used by the coach).
export function badgeHasAction(badge: string): boolean {
  return ACTION_WORDS.test(badge.trim());
}
