// NowOpen Studio — Live Promotion Center.
//
// A promotion lifecycle manager: create a promo, schedule it, take it live,
// count down the days, share it on WhatsApp and (via the Promotion Builder)
// design the matching asset. Stored per business in localStorage like the
// rest of the Studio's on-device data.

import { Business } from '../types';

export type PromoStatus = 'live' | 'scheduled' | 'ended';

export interface Promo {
  id: string;
  title: string;
  offer: string;
  template: string;
  startsAt: string; // YYYY-MM-DD
  endsAt: string;   // YYYY-MM-DD
  channels: string[];
  shared?: boolean;
  created_at: string;
}

export function promoStatus(p: Promo, now = new Date()): PromoStatus {
  const t = now.getTime();
  if (t < new Date(`${p.startsAt}T00:00:00`).getTime()) return 'scheduled';
  if (t > new Date(`${p.endsAt}T23:59:59`).getTime()) return 'ended';
  return 'live';
}

export function daysLeft(p: Promo, now = new Date()): number {
  return Math.max(0, Math.ceil((new Date(`${p.endsAt}T23:59:59`).getTime() - now.getTime()) / 86400000));
}

export function suggestDates(durationDays = 3, from = new Date()): { startsAt: string; endsAt: string } {
  const start = new Date(from);
  const end = new Date(from);
  end.setDate(end.getDate() + durationDays);
  return { startsAt: start.toISOString().slice(0, 10), endsAt: end.toISOString().slice(0, 10) };
}

export function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function promoBlurb(business: Business, p: Promo): string {
  return [
    `🎁 ${p.title} at ${business.name}!`,
    p.offer,
    business.phone ? `Call or WhatsApp ${business.phone}.` : 'Find us on NowOpen Africa.',
    `Offer ends ${dateLabel(p.endsAt)}.`,
  ].join('\n');
}

export function promosKey(businessId: string): string {
  return `nowopen_promos_${businessId}`;
}

export function loadPromos(businessId: string): Promo[] {
  try {
    const raw = localStorage.getItem(promosKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as Promo[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePromos(businessId: string, promos: Promo[]): void {
  try { localStorage.setItem(promosKey(businessId), JSON.stringify(promos)); } catch { /* ignore */ }
}

export function createPromo(data: Omit<Promo, 'id' | 'created_at' | 'channels'> & { channels?: string[] }): Promo {
  return {
    ...data,
    channels: data.channels || ['social', 'whatsapp'],
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
  };
}

export function promoCounts(promos: Promo[], now = new Date()): { live: number; scheduled: number; ended: number; shared: number; total: number } {
  return {
    live: promos.filter((p) => promoStatus(p, now) === 'live').length,
    scheduled: promos.filter((p) => promoStatus(p, now) === 'scheduled').length,
    ended: promos.filter((p) => promoStatus(p, now) === 'ended').length,
    shared: promos.filter((p) => p.shared).length,
    total: promos.length,
  };
}
