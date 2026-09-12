/**
 * Template tags — the vocabulary the picker searches and filters on.
 *
 * A leaf module on purpose. designTemplates.ts needs these types to declare a
 * template, and taxonomy.ts needs them to search; putting them in either of
 * those makes the two import each other in a circle.
 */

/** The job a design does. */
export type TemplateUse = 'business' | 'social' | 'marketing' | 'event' | 'industry';

export const TEMPLATE_USES: { key: TemplateUse; label: string; blurb: string }[] = [
  { key: 'business', label: 'Business', blurb: 'Cards, profiles, price lists, reports — the things a business needs to look real.' },
  { key: 'social', label: 'Social', blurb: 'Posts, stories and statuses, sized for where you are posting.' },
  { key: 'marketing', label: 'Marketing', blurb: 'Sales, launches, offers, announcements, proof.' },
  { key: 'event', label: 'Events', blurb: 'Anything with a date on it.' },
  { key: 'industry', label: 'Industry', blurb: 'Layouts built around one trade rather than one occasion.' },
];

/**
 * Visual registers, for search.
 *
 * Deliberately NOT the same list as DESIGN_STYLES. A style is a thing you can
 * apply — eight of them, each a real typography and colour decision. These are
 * words somebody types. "Brutalist" is a search term, not a switch we ship, and
 * pretending otherwise would mean a style picker full of options that all
 * produce the same design.
 */
export type StyleTag =
  | 'minimal' | 'luxury' | 'editorial' | 'corporate' | 'modern' | 'bold'
  | 'elegant' | 'fashion' | 'street' | 'afro-modern' | 'cinematic' | 'swiss'
  | 'monochrome' | 'high-contrast' | 'soft' | 'organic' | 'premium'
  | 'playful' | 'youth' | 'tech';

export const STYLE_TAGS: StyleTag[] = [
  'minimal', 'luxury', 'editorial', 'corporate', 'modern', 'bold',
  'elegant', 'fashion', 'street', 'afro-modern', 'cinematic', 'swiss',
  'monochrome', 'high-contrast', 'soft', 'organic', 'premium',
  'playful', 'youth', 'tech',
];
