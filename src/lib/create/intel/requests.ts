// Request taxonomy: the seven kinds of thing people ask Create for.
//
// These sit above the catalogue's categories A-H (catalogueTaxonomy.ts) and
// map onto them; they do not replace them. A request family tells the brief
// engine what must be settled before concepts are worth making.

import type { RequestFamily } from './types';

export const REQUEST_FAMILIES: RequestFamily[] = [
  { key: 'branding', name: 'Branding and identity', categories: ['brand', 'presentations'],
    examples: ['Logo and visual identity', 'Brand guidelines', 'Business cards and stationery', 'Company profile', 'Brand launch campaign'],
    briefMustSettle: ['What the business is and for whom', 'Three words it should feel like', 'Existing assets to keep', 'Where the identity will be seen most'] },
  { key: 'social', name: 'Social media and digital marketing', categories: ['social'],
    examples: ['Instagram posts and carousels', 'Stories and reels covers', 'Facebook and LinkedIn creatives', 'Thumbnails', 'Product launch posts'],
    briefMustSettle: ['Platform and format', 'The one thing the post says', 'The action wanted', 'Whether it is one post or a series'] },
  { key: 'advertising', name: 'Advertising and outdoor', categories: ['advertising'],
    examples: ['Billboards', 'Transit and bus wraps', 'Digital screens', 'Display ads', 'Shop signs'],
    briefMustSettle: ['Exact placement and size', 'Viewing distance and time', 'The single message, in seven words or fewer', 'Brand sign-off'] },
  { key: 'events', name: 'Events and entertainment', categories: ['events'],
    examples: ['Event posters and invitations', 'Conference identities', 'Stage and screen graphics', 'Speaker cards', 'Programmes and tickets'],
    briefMustSettle: ['Name, date, time and venue', 'Who is appearing, with confirmed names', 'How to attend', 'The full set of pieces needed'] },
  { key: 'packaging', name: 'Packaging and product design', categories: ['product'],
    examples: ['Food and drink packaging', 'Cosmetics and skincare', 'Labels', 'Bottles and boxes', 'Shopping bags'],
    briefMustSettle: ['Exact dieline or size', 'Mandatory label information for the market', 'Material and print method', 'Where it is sold and beside what'] },
  { key: 'print-merch', name: 'Print and merchandise', categories: ['print', 'product'],
    examples: ['Flyers, posters and brochures', 'Menus and price lists', 'T-shirts, caps and uniforms', 'Mugs, bottles and bags', 'Stickers'],
    briefMustSettle: ['Finished size and quantity', 'Print method and colours available', 'The information it must carry', 'How it will be handed out or worn'] },
  { key: 'production', name: 'Photography, video and motion', categories: ['production'],
    examples: ['Product photography', 'Portraits', 'Short video and reels', 'Motion graphics'],
    briefMustSettle: ['What is being shot and where', 'Where the result will be used', 'Usage rights and consent', 'Whether NowOpen can make this today or must refer it'] },
];

export const requestFamilyOf = (key: string): RequestFamily | null =>
  REQUEST_FAMILIES.find((r) => r.key === key) ?? null;
