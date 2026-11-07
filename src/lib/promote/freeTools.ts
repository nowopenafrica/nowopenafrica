import { Heart, LineChart, Tag, UserRound, type LucideIcon } from 'lucide-react';

/**
 * The four free tools Promote offers: one list, one name per tool.
 *
 * The "Start free" section renders it and the budget mix (mix.ts) labels its
 * free items from it, so a tool can never be called one thing in a card and
 * another in a recommended mix. Labels are the ones the page already used.
 *
 * Blurbs are one line each. At four across, a two-sentence blurb sets the card
 * height from the longest one and leaves the other three padded with air.
 */
export type FreeTool = 'offer' | 'keeps' | 'profile' | 'insights';

export interface FreeToolInfo {
  tool: FreeTool;
  label: string;
  to: string;
  blurb: string;
  icon: LucideIcon;
}

export const FREE_TOOLS: FreeToolInfo[] = [
  {
    tool: 'offer',
    icon: Tag,
    label: 'Publish an offer',
    to: '/offers',
    blurb: 'A reason to buy this week, shown to people already looking.',
  },
  {
    tool: 'keeps',
    icon: Heart,
    label: 'Update the people who kept you',
    to: '/keeps',
    blurb: 'Customers who chose to hear from you — the cheapest audience there is.',
  },
  {
    tool: 'profile',
    icon: UserRound,
    label: 'A profile that answers the question',
    /*
     * /add-business, not /waitlist.
     *
     * This pointed at the waiting list, which is where a business went before
     * the directory accepted submissions. It does now — 3,118 listings and
     * a live /add-business flow — so the card was inviting an owner to
     * queue for something already open to them.
     */
    to: '/add-business',
    blurb: 'Hours, prices, photos and a way to call — the advert that runs daily.',
  },
  {
    tool: 'insights',
    icon: LineChart,
    label: 'Then see who came',
    to: '/dashboard',
    blurb: 'Calls, WhatsApps and directions your listing earned — not impressions.',
  },
];

export const freeTool = (tool: FreeTool): FreeToolInfo =>
  FREE_TOOLS.find((t) => t.tool === tool) as FreeToolInfo;
