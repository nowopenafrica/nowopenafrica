// NowOpen Studio — Announcements.
//
// Publish short announcements (new product, new branch, hiring, holiday hours,
// price changes, closures) straight to the business profile. Each announcement
// is pre-written from the profile, editable, pinned when important, and shares
// on WhatsApp in one tap. Stored per business in localStorage like the rest of
// the Studio's on-device data.

import { Business } from '../types';
import { localDateISO } from './dates';

export type AnnouncementType =
  | 'new-product'
  | 'new-branch'
  | 'hiring'
  | 'holiday'
  | 'price'
  | 'service-update'
  | 'closure'
  | 'thank-you';

export interface Announcement {
  id: string;
  type: AnnouncementType;
  title: string;
  body: string;
  date: string; // YYYY-MM-DD
  pinned: boolean;
  publishedAt: string | null; // ISO datetime when published
  createdAt: string; // ISO datetime
}

export interface AnnouncementTypeMeta {
  key: AnnouncementType;
  label: string;
  emoji: string;
}

export const ANNOUNCEMENT_TYPES: AnnouncementTypeMeta[] = [
  { key: 'new-product', label: 'New product', emoji: '🆕' },
  { key: 'new-branch', label: 'New branch', emoji: '📍' },
  { key: 'hiring', label: 'We are hiring', emoji: '🚀' },
  { key: 'holiday', label: 'Holiday hours', emoji: '🎊' },
  { key: 'price', label: 'Price change', emoji: '💲' },
  { key: 'service-update', label: 'Service update', emoji: '🔧' },
  { key: 'closure', label: 'Temporary closure', emoji: '⛔' },
  { key: 'thank-you', label: 'Thank you', emoji: '💛' },
];

export function announcementLabel(type: AnnouncementType): string {
  return ANNOUNCEMENT_TYPES.find((t) => t.key === type)?.label || type;
}

export function announcementEmoji(type: AnnouncementType): string {
  return ANNOUNCEMENT_TYPES.find((t) => t.key === type)?.emoji || '📣';
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Pre-writes an announcement for a given type straight from the profile.
export function announcementDraft(
  business: Pick<Business, 'name' | 'category' | 'location' | 'phone' | 'hours'>,
  type: AnnouncementType,
): { title: string; body: string } {
  const name = business.name;
  const location = business.location ? ` ${business.location}` : '';
  const phone = business.phone ? ` Questions? Call or WhatsApp ${business.phone}.` : '';
  switch (type) {
    case 'new-product':
      return {
        title: `🆕 New arrival at ${name}`,
        body: `We just added something new at ${name}${location}. Come see what is new${business.hours ? ` — we are open ${business.hours}` : ''}.${phone}`,
      };
    case 'new-branch':
      return {
        title: `📍 New branch — ${name}`,
        body: `We are now closer to you! ${name} just opened a new branch${location}. Same quality, more convenience.${phone}`,
      };
    case 'hiring':
      return {
        title: `🚀 ${name} is hiring`,
        body: `We are growing our team${location}. If you are talented, driven and love what we do, send us your CV today.${phone}`,
      };
    case 'holiday':
      return {
        title: `🎊 Holiday hours at ${name}`,
        body: `Planning to visit ${name} during the holidays? Check our updated hours — ${business.hours || 'see our profile for times'}${location}.${phone}`,
      };
    case 'price':
      return {
        title: `💲 Price update at ${name}`,
        body: `A quick price update from ${name}${location}. Current prices are listed on our profile — always fair, always transparent.${phone}`,
      };
    case 'service-update':
      return {
        title: `🔧 Service update at ${name}`,
        body: `Heads up from ${name}${location} — here is what is new with our service:${phone}`,
      };
    case 'closure':
      return {
        title: `⛔ Temporary closure notice`,
        body: `${name} will be closed temporarily. We apologise for any inconvenience and will be back soon.${phone}`,
      };
    case 'thank-you':
      return {
        title: `💛 Thank you, ${location.trim() || 'everyone'}!`,
        body: `From everyone at ${name}, a huge thank you for your continued support. You are why we do what we do.${phone}`,
      };
  }
}

// Formats an announcement the way it reads on the profile feed.
export function announcementPreview(
  business: Pick<Business, 'name'>,
  a: Announcement,
): string {
  return [
    `${announcementEmoji(a.type)} ${a.title}`,
    a.body,
    '',
    `— ${business.name} · ${new Date(`${a.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`,
  ].join('\n');
}

export function createAnnouncement(
  business: Pick<Business, 'name' | 'category' | 'location' | 'phone' | 'hours'>,
  type: AnnouncementType,
  overrides: { title?: string; body?: string; date?: string; pinned?: boolean } = {},
): Announcement {
  const draft = announcementDraft(business, type);
  return {
    id: uid(),
    type,
    title: overrides.title?.trim() || draft.title,
    body: overrides.body?.trim() || draft.body,
    date: overrides.date || localDateISO(),
    pinned: overrides.pinned ?? false,
    publishedAt: null,
    createdAt: new Date().toISOString(),
  };
}

// --- Persistence ------------------------------------------------------------

export function announcementsKey(businessId: string): string {
  return `nowopen_announcements_${businessId}`;
}

export function loadAnnouncements(businessId: string): Announcement[] {
  try {
    const raw = localStorage.getItem(announcementsKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as Announcement[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAnnouncements(businessId: string, list: Announcement[]): void {
  try { localStorage.setItem(announcementsKey(businessId), JSON.stringify(list)); } catch { /* ignore */ }
}
