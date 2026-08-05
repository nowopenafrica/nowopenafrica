// Quick Create entry cards for the Creative Studio. Each card maps a business
// goal to an occasion template + default format; the hub preloads them into the
// DesignStudio editor in one tap.
//
// Every `templateKey` here MUST exist in studioPresets.ts — a card pointing at
// a missing key would silently fall back to the first template and produce the
// wrong design. `quickCreate.test.ts` asserts that, and that no two cards share
// a key, so the grid can't drift from the template library.
//
// `group` only drives the headings in the picker; it has no behaviour.

export type QuickCreateGroup = 'Trading' | 'Seasonal' | 'Business' | 'Proof';

export interface QuickCreateItem {
  key: string;
  label: string;
  emoji: string;
  desc: string;
  templateKey: string;
  formatKey: string;
  group: QuickCreateGroup;
  /** When set, the pick also runs the full-campaign export (all sizes). */
  fullCampaign?: boolean;
}

export const QUICK_CREATE_ITEMS: QuickCreateItem[] = [
  // --- Trading: the everyday money-makers ---------------------------------
  { key: 'open-today', label: 'Open Today', emoji: '🟢', desc: "Tell people you're open", templateKey: 'now-open', formatKey: 'story', group: 'Trading' },
  { key: 'weekend-sale', label: 'Weekend Sale', emoji: '🏷️', desc: '3-day price drop', templateKey: 'weekend-offer', formatKey: 'instagram-post', group: 'Trading' },
  { key: 'flash-sale', label: 'Flash Sale', emoji: '⚡', desc: '24-hour urgency', templateKey: 'flash-sale', formatKey: 'story', group: 'Trading' },
  { key: 'price-drop', label: 'Price Drop', emoji: '📉', desc: 'New lower prices', templateKey: 'price-drop', formatKey: 'instagram-post', group: 'Trading' },
  { key: 'discount', label: 'Discount', emoji: '💸', desc: 'Percent off everything', templateKey: 'discount', formatKey: 'instagram-post', group: 'Trading' },
  { key: 'limited-stock', label: 'Limited Stock', emoji: '⏳', desc: 'Only a few left', templateKey: 'limited-stock', formatKey: 'story', group: 'Trading' },
  { key: 'new-product', label: 'New Product', emoji: '🛍️', desc: 'Just-arrived drop', templateKey: 'new-product', formatKey: 'instagram-post', group: 'Trading' },
  { key: 'happy-hour', label: 'Happy Hour', emoji: '🍹', desc: 'Time-boxed offer', templateKey: 'happy-hour', formatKey: 'story', group: 'Trading' },
  { key: 'menu-update', label: 'Menu Update', emoji: '🍽️', desc: 'New on the menu', templateKey: 'menu-update', formatKey: 'instagram-post', group: 'Trading' },

  // --- Seasonal: calendar moments -----------------------------------------
  { key: 'christmas', label: 'Christmas', emoji: '🎄', desc: 'Festive season offer', templateKey: 'christmas', formatKey: 'story', group: 'Seasonal' },
  { key: 'new-year', label: 'New Year', emoji: '🎊', desc: 'New year push', templateKey: 'new-year', formatKey: 'story', group: 'Seasonal' },
  { key: 'black-friday', label: 'Black Friday', emoji: '🖤', desc: 'Biggest sale of the year', templateKey: 'black-friday', formatKey: 'instagram-post', group: 'Seasonal' },
  { key: 'valentine', label: "Valentine's", emoji: '❤️', desc: 'Gifts for two', templateKey: 'valentine', formatKey: 'instagram-post', group: 'Seasonal' },
  { key: 'ramadan', label: 'Ramadan', emoji: '🌙', desc: 'Iftar & Ramadan specials', templateKey: 'ramadan', formatKey: 'story', group: 'Seasonal' },
  { key: 'eid', label: 'Eid', emoji: '✨', desc: 'Eid Mubarak greeting', templateKey: 'eid', formatKey: 'story', group: 'Seasonal' },
  { key: 'easter', label: 'Easter', emoji: '🐣', desc: 'Easter weekend offer', templateKey: 'easter', formatKey: 'instagram-post', group: 'Seasonal' },
  { key: 'independence', label: 'Independence Day', emoji: '🇳🇬', desc: 'National day greeting', templateKey: 'independence', formatKey: 'instagram-post', group: 'Seasonal' },
  { key: 'childrens-day', label: "Children's Day", emoji: '🧸', desc: 'For the little ones', templateKey: 'childrens-day', formatKey: 'instagram-post', group: 'Seasonal' },
  { key: 'back-to-school', label: 'Back to School', emoji: '🎒', desc: 'Term-start push', templateKey: 'back-to-school', formatKey: 'instagram-post', group: 'Seasonal' },
  { key: 'holiday', label: 'Holiday Hours', emoji: '🗓️', desc: 'Updated schedule', templateKey: 'holiday-hours', formatKey: 'story', group: 'Seasonal' },

  // --- Business: milestones & operations ----------------------------------
  { key: 'grand-opening', label: 'Grand Opening', emoji: '🎉', desc: 'Ribbon-cutting launch', templateKey: 'grand-opening', formatKey: 'story', group: 'Business' },
  { key: 'anniversary', label: 'Anniversary', emoji: '🥂', desc: 'Milestone offer', templateKey: 'anniversary', formatKey: 'square', group: 'Business' },
  { key: 'hiring', label: "We're Hiring", emoji: '💼', desc: 'Join the team', templateKey: 'hiring', formatKey: 'facebook-post', group: 'Business' },
  { key: 'event', label: 'Event', emoji: '📣', desc: 'Invite & save the date', templateKey: 'event', formatKey: 'story', group: 'Business' },

  // --- Proof & loyalty: trust that converts -------------------------------
  { key: 'review', label: 'Customer Review', emoji: '⭐', desc: 'Share a real review', templateKey: 'review', formatKey: 'square', group: 'Proof' },
  { key: 'before-after', label: 'Before & After', emoji: '🪄', desc: 'Show your results', templateKey: 'before-after', formatKey: 'instagram-post', group: 'Proof' },
  { key: 'appreciation', label: 'Thank Customers', emoji: '💛', desc: 'Loyalty shout-out', templateKey: 'customer-appreciation', formatKey: 'square', group: 'Proof' },
  { key: 'referral', label: 'Referral Campaign', emoji: '🤝', desc: 'Reward introductions', templateKey: 'referral', formatKey: 'instagram-post', group: 'Proof' },

  // --- One-tap everything -------------------------------------------------
  { key: 'full-campaign', label: 'Full Campaign', emoji: '🚀', desc: 'Design + all sizes', templateKey: 'flash-sale', formatKey: 'story', group: 'Trading', fullCampaign: true },
];

export const QUICK_CREATE_GROUPS: QuickCreateGroup[] = ['Trading', 'Seasonal', 'Business', 'Proof'];
