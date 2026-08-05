// Quick Create entry cards for the Creative Studio. Each card maps a business
// goal to an occasion template + default format; the hub preloads them into the
// DesignStudio editor in one tap.

export interface QuickCreateItem {
  key: string;
  label: string;
  emoji: string;
  desc: string;
  templateKey: string;
  formatKey: string;
  /** When set, the pick also runs the full-campaign export (all sizes). */
  fullCampaign?: boolean;
}

export const QUICK_CREATE_ITEMS: QuickCreateItem[] = [
  { key: 'grand-opening', label: 'Grand Opening', emoji: '🎉', desc: 'Ribbon-cutting launch', templateKey: 'grand-opening', formatKey: 'story' },
  { key: 'weekend-sale', label: 'Weekend Sale', emoji: '🏷️', desc: '3-day price drop', templateKey: 'weekend-offer', formatKey: 'instagram-post' },
  { key: 'new-product', label: 'New Product', emoji: '🛍️', desc: 'Just-arrived drop', templateKey: 'new-product', formatKey: 'instagram-post' },
  { key: 'flash-sale', label: 'Flash Sale', emoji: '⚡', desc: '24-hour urgency', templateKey: 'flash-sale', formatKey: 'story' },
  { key: 'hiring', label: "We're Hiring", emoji: '💼', desc: 'Join the team', templateKey: 'hiring', formatKey: 'facebook-post' },
  { key: 'appreciation', label: 'Thank Customers', emoji: '💛', desc: 'Loyalty shout-out', templateKey: 'customer-appreciation', formatKey: 'square' },
  { key: 'holiday', label: 'Holiday Hours', emoji: '🎄', desc: 'Festive schedule', templateKey: 'holiday-hours', formatKey: 'story' },
  { key: 'anniversary', label: 'Anniversary', emoji: '🥂', desc: 'Milestone offer', templateKey: 'anniversary', formatKey: 'square' },
  { key: 'full-campaign', label: 'Full Campaign', emoji: '🚀', desc: 'Design + all sizes', templateKey: 'flash-sale', formatKey: 'story', fullCampaign: true },
];
