/**
 * The one format registry.
 *
 * Canvas pixels, physical size and print target for every named format,
 * in one place. Later programme tasks read this instead of keeping their own
 * copies. Where the older registries disagree, the PHYSICAL size wins.
 *
 * `source` is the platform's official help page; `verifiedAt` (YYYY-MM-DD) is
 * set only when that page was actually read and the size matched. Platforms
 * change specs without notice, so a format unverified for 180 days (or never)
 * needs re-verifying: see `needsReverify`.
 */

export type Medium = 'screen' | 'office' | 'press' | 'large-format';

export interface Format {
  key: string;
  label: string;
  /** Canvas pixels. */
  w: number;
  h: number;
  /** Physical size, where the format is a real object. */
  mm?: { w: number; h: number };
  medium: Medium;
  targetDpi: number | null;
  bleedMm: number;
  safeMm: number;
  source?: string;
  verifiedAt?: string;
}

const fmt = (
  key: string, label: string, w: number, h: number, medium: Medium, targetDpi: number | null,
  bleedMm: number, safeMm: number, mm?: { w: number; h: number }, source?: string, verifiedAt?: string,
): Format => ({ key, label, w, h, medium, targetDpi, bleedMm, safeMm, ...(mm && { mm }), ...(source && { source }), ...(verifiedAt && { verifiedAt }) });

export const FORMATS: Record<string, Format> = {
  /*
   * Platform `source` values are where to VERIFY a size (the official help centre),
   * not proof of it. None is verified yet (2026-11-07): the fetch tool could not
   * read the pages, so `verifiedAt` is omitted. The YouTube thumbnail page was
   * read and states only the 16:9 ratio, not 1280x720.
   */
  'story': fmt('story', 'Story / WhatsApp Status', 1080, 1920, 'screen', null, 0, 0, undefined, 'https://help.instagram.com/'),
  'instagram-post': fmt('instagram-post', 'Instagram Post', 1080, 1080, 'screen', null, 0, 0, undefined, 'https://help.instagram.com/'),
  'instagram-portrait': fmt('instagram-portrait', 'Instagram / Facebook Portrait', 1080, 1350, 'screen', null, 0, 0, undefined, 'https://help.instagram.com/'),
  'facebook-post': fmt('facebook-post', 'Facebook Post', 1200, 630, 'screen', null, 0, 0, undefined, 'https://www.facebook.com/help/'),
  'linkedin-post': fmt('linkedin-post', 'LinkedIn Post', 1200, 627, 'screen', null, 0, 0, undefined, 'https://www.linkedin.com/help/linkedin'),
  'x-post': fmt('x-post', 'X / Twitter', 1600, 900, 'screen', null, 0, 0, undefined, 'https://help.x.com/'),
  'pinterest': fmt('pinterest', 'Pinterest', 1000, 1500, 'screen', null, 0, 0, undefined),
  'youtube-thumbnail': fmt('youtube-thumbnail', 'YouTube Thumbnail', 1280, 720, 'screen', null, 0, 0, undefined, 'https://support.google.com/youtube/answer/72431'),
  'a4': fmt('a4', 'A4 Flyer / Poster', 1240, 1754, 'office', 150, 3, 5, { w: 210, h: 297 }),
  'a3': fmt('a3', 'A3 Poster', 1414, 2000, 'office', 150, 3, 5, { w: 297, h: 420 }),
  'a5': fmt('a5', 'A5 Flyer / Handbill', 877, 1240, 'office', 150, 3, 5, { w: 148, h: 210 }),
  'letter': fmt('letter', 'US Letter', 1275, 1650, 'office', 150, 3, 5, { w: 215.9, h: 279.4 }),
  'half-a4': fmt('half-a4', 'Half A4 / DL', 1240, 877, 'office', 150, 3, 5, { w: 210, h: 148.5 }),
  'square': fmt('square', 'Square Poster', 1200, 1200, 'screen', null, 0, 0, undefined),
  'website-banner': fmt('website-banner', 'Website Hero', 1920, 600, 'screen', null, 0, 0, undefined),
  'billboard': fmt('billboard', 'Billboard', 4500, 1500, 'large-format', null, 0, 0, undefined),
  'led': fmt('led', 'LED Screen', 1600, 600, 'large-format', null, 0, 0, undefined),
  'rollup': fmt('rollup', 'Roll-up', 1200, 2400, 'large-format', null, 0, 0, undefined),
  'backdrop': fmt('backdrop', 'Backdrop', 2400, 1200, 'large-format', null, 0, 0, undefined),
  'street': fmt('street', 'Street Banner', 1200, 400, 'large-format', null, 0, 0, undefined),
  'facebook-cover': fmt('facebook-cover', 'Facebook Cover', 1640, 859, 'screen', null, 0, 0, undefined, 'https://www.facebook.com/help/'),
  'linkedin-cover': fmt('linkedin-cover', 'LinkedIn Cover', 1584, 396, 'screen', null, 0, 0, undefined, 'https://www.linkedin.com/help/linkedin'),
  'youtube-banner': fmt('youtube-banner', 'YouTube Banner', 2560, 1440, 'screen', null, 0, 0, undefined, 'https://support.google.com/youtube/'),
  'email-header': fmt('email-header', 'Email Header', 600, 200, 'screen', null, 0, 0, undefined),
  'display-mpu': fmt('display-mpu', 'Display Ad · MPU', 300, 250, 'screen', null, 0, 0, undefined),
  'display-leaderboard': fmt('display-leaderboard', 'Display Ad · Leaderboard', 728, 90, 'screen', null, 0, 0, undefined),
  'business-card': fmt('business-card', 'Business Card · 85.6×54mm', 1011, 638, 'press', 300, 3, 5, { w: 85.6, h: 54 }),
  'business-card-portrait': fmt('business-card-portrait', 'Business Card, portrait · 54×85.6mm', 638, 1011, 'press', 300, 3, 5, { w: 54, h: 85.6 }),
  'letterhead': fmt('letterhead', 'Letterhead · A4', 2480, 3508, 'press', 300, 3, 5, { w: 210, h: 297 }),
  'compliment-slip': fmt('compliment-slip', 'Compliment Slip · 210×99mm', 2480, 1169, 'press', 300, 3, 5, { w: 210, h: 99 }),
  'postcard': fmt('postcard', 'Postcard · 148×105mm', 1748, 1240, 'press', 300, 3, 5, { w: 148, h: 105 }),
  // 15 dpi at full size is 150 dpi at 1:10, the scale 48-sheet artwork is supplied at (Ruling AE).
  'board-48-sheet': fmt('board-48-sheet', '48-sheet Billboard', 3600, 1800, 'large-format', 15, 0, 0, { w: 6096, h: 3048 }),
};

export function formatOf(key: string): Format | null {
  return Object.prototype.hasOwnProperty.call(FORMATS, key) ? FORMATS[key] : null;
}

/** True when two width/height ratios agree within `tolerance` (relative). */
export function sameRatio(a: number, b: number, tolerance = 0.01): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) / Math.max(a, b) <= tolerance;
}

const DAY_MS = 86_400_000;
const dayNumber = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

/** Never verified, or last verified more than `days` days before `today` (YYYY-MM-DD). */
export function needsReverify(f: Format, today: string, days = 180): boolean {
  if (!f.verifiedAt) return true;
  const age = dayNumber(today) - dayNumber(f.verifiedAt);
  /* A malformed date on either side fails safe: re-verify. */
  if (!Number.isFinite(age)) return true;
  return age > days;
}
