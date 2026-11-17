/*
 * The items the engine's category gallery can make (GALLERY_KITS in
 * compose/gallery.ts). Kept apart from the engine so the Create page can ask
 * "is there a gallery for this?" without loading the engine itself: that
 * code arrives only when a gallery is actually shown. gallery.test.ts fails
 * if this list and the kits drift apart.
 */
export const ENGINE_ITEMS: readonly string[] = [
  'business-card', 'brand-launch', 'instagram-post', 'story', 'reels-cover', 'page-banner', 'youtube-thumbnail',
  'sale-post', 'offer-flyer', 'display-ad', 'flyer', 'poster', 'notice', 'event-poster', 'invitation', 'ticket',
  'speaker-card', 'menu', 'price-list', 'rate-card', 'shopfront-sign', 'roll-up', 'billboard', 'billboard-48-sheet', 'banner',
];

export const hasEngineGallery = (item: string): boolean => ENGINE_ITEMS.includes(item);
