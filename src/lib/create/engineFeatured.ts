/* What the Create page's default view features when the engine is on (components/create/EngineFeatured.tsx). */

/** The strip: the range of things that can be made, one design each. */
export const STRIP_ITEMS = [
  'flyer', 'business-card', 'instagram-post', 'event-poster', 'menu', 'story',
  'poster', 'sale-post', 'invitation', 'price-list', 'shopfront-sign', 'billboard',
] as const;

/** The featured rows, six designs each. */
export const FEATURED_ROWS: { item: string; title: string; blurb: string }[] = [
  { item: 'flyer', title: 'Flyers & posters', blurb: 'Openings, offers and announcements, at the real A-size.' },
  { item: 'business-card', title: 'Business cards', blurb: 'At the real card size, ready for your name and number.' },
  { item: 'instagram-post', title: 'Social posts', blurb: 'Posts for Instagram and Facebook, checked for contrast and type size.' },
  { item: 'event-poster', title: 'Events', blurb: 'Every one carries the date and the venue.' },
];
