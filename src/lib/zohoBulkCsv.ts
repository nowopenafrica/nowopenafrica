/**
 * Zoho Social Bulk Scheduler file, built from approved brand posts.
 *
 * WHY THIS EXISTS
 *
 * Zoho Social has no public API, and Zoho Flow's Zoho Social connection fails
 * for this account (channel lookup answers INVALID_OAUTHSCOPE; checked
 * 2026-10-29). The Bulk Scheduler is Zoho's own supported way in: upload a
 * file, review, schedule. This module writes that file so approved posts can
 * reach Zoho today, with every check the screen applies.
 *
 * THE FORMAT, as Zoho Social's own upload dialog states it (read 2026-10-29)
 * when "Choose channels from file" is selected:
 *
 *   A Schedule Time   MM/DD/YYYY HH:MM, leading zeros, brand time zone
 *   B Channels        "Facebook, X" (case-insensitive, quoted in a CSV)
 *   C Post Content    line breaks written as \n inside the cell
 *   D Link            one link, used for the preview
 *   E Media           public image URLs ending .jpg/.jpeg, up to 10
 *   F GMB Button Name (unused: no Google Business Profile channel)
 *   G GMB Link        (unused)
 *
 * Zoho also says: posts must be at least an hour after upload, at most 350 per
 * file, and no two posts may share the same content or link. The brand's time
 * zone in Zoho is Africa/Lagos, the same as ours, so times are written as
 * Lagos wall-clock time.
 *
 * Rows Zoho would reject are left OUT and listed with the reason, never
 * written in the hope that they work.
 */

import { CHANNEL_RULES, checkVariant, isBlocked, trackedUrl, utcToLagosLocal, type ChannelId } from './brandSocial';

/** The names Zoho's Bulk Scheduler accepts for each of our channels. */
export const ZOHO_BULK_CHANNEL: Partial<Record<ChannelId, string>> = {
  facebook: 'Facebook',
  x: 'X',
  instagram: 'Instagram',
  linkedin_company: 'LinkedIn',
  linkedin_profile: 'LinkedInProfile',
  youtube: 'Youtube',
  pinterest: 'Pinterest',
  tiktok: 'Tiktok',
  threads: 'Threads',
  // whatsapp: not a Bulk Scheduler channel.
};

export const ZOHO_BULK_MAX_ROWS = 350;
/** Zoho wants an hour; five minutes more covers the time it takes to upload. */
export const ZOHO_BULK_MIN_LEAD_MINUTES = 65;

export const ZOHO_BULK_HEADER = ['Schedule Time', 'Channels', 'Post Content', 'Link', 'Media', 'GMB Button Name', 'GMB Link'];

export interface BulkPostInput {
  contentId: string;
  code: string;
  campaignSlug: string;
  plannedAt: string | null;
  mediaUrl: string | null;
  destinationUrl: string | null;
  variants: { channel: ChannelId; caption: string }[];
}

export interface BulkRow {
  contentId: string;
  code: string;
  channel: ChannelId;
  cells: string[];
}

export interface BulkSkip {
  code: string;
  channel: ChannelId | null;
  reason: string;
}

export interface BulkResult {
  rows: BulkRow[];
  skipped: BulkSkip[];
  /** Notes that do not stop a row, e.g. media left to attach in Zoho. */
  notes: BulkSkip[];
  csv: string;
}

/** "2026-10-29T08:30:00Z" → "10/29/2026 09:30" in Lagos time. */
export function zohoBulkTime(iso: string): string {
  const local = utcToLagosLocal(iso); // 2026-10-29T09:30
  const [date, time] = local.split('T');
  const [y, m, d] = date.split('-');
  return `${m}/${d}/${y} ${time}`;
}

/** Zoho reads a literal \n as a line break inside a CSV cell. */
export function zohoBulkText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\n/g, '\\n');
}

/** RFC 4180: quote every cell, double any quote inside. */
export function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

const isJpeg = (url: string | null) => Boolean(url && /\.(jpe?g)$/i.test(url.split(/[?#]/)[0]));

export function buildZohoBulkCsv(posts: BulkPostInput[], now: Date = new Date()): BulkResult {
  const rows: BulkRow[] = [];
  const skipped: BulkSkip[] = [];
  const notes: BulkSkip[] = [];
  const seenContent = new Set<string>();
  const seenLink = new Set<string>();
  const earliest = now.getTime() + ZOHO_BULK_MIN_LEAD_MINUTES * 60_000;

  for (const post of posts) {
    if (!post.plannedAt) {
      skipped.push({ code: post.code, channel: null, reason: 'No planned time. Zoho needs a date and time for every post.' });
      continue;
    }
    if (new Date(post.plannedAt).getTime() < earliest) {
      skipped.push({ code: post.code, channel: null, reason: 'Planned less than an hour from now. Zoho only accepts posts at least an hour ahead; move it later.' });
      continue;
    }

    for (const v of post.variants) {
      const zohoName = ZOHO_BULK_CHANNEL[v.channel];
      if (!zohoName) {
        skipped.push({ code: post.code, channel: v.channel, reason: `${CHANNEL_RULES[v.channel].label} is not a Zoho Bulk Scheduler channel.` });
        continue;
      }

      const checks = checkVariant({ channel: v.channel, caption: v.caption, mediaUrl: post.mediaUrl, destinationUrl: post.destinationUrl });
      if (isBlocked(checks)) {
        skipped.push({ code: post.code, channel: v.channel, reason: checks.filter((c) => c.severity === 'block').map((c) => c.message).join(' ') });
        continue;
      }

      const rule = CHANNEL_RULES[v.channel];
      // Instagram and TikTok captions cannot carry a clickable link, so no
      // preview link either; the link lives in the bio.
      const link = rule.linkNotClickable ? '' : (trackedUrl(post.destinationUrl, v.channel, post.campaignSlug, post.code) ?? '');

      let media = '';
      if (post.mediaUrl) {
        if (isJpeg(post.mediaUrl)) media = post.mediaUrl;
        else notes.push({ code: post.code, channel: v.channel, reason: 'The file can only carry .jpg/.jpeg images. Attach this media to the post in Zoho before it publishes.' });
      }
      if (rule.requires && !media) {
        skipped.push({ code: post.code, channel: v.channel, reason: `${rule.label} needs an image or video, and the bulk file can only carry .jpg/.jpeg images. Schedule this one in Zoho directly.` });
        continue;
      }

      const content = zohoBulkText(v.caption.trim());
      const contentKey = content.toLowerCase();
      if (seenContent.has(contentKey) || (link && seenLink.has(link))) {
        skipped.push({ code: post.code, channel: v.channel, reason: 'Same wording or link as another row in this file. Zoho rejects duplicates; give this channel its own version.' });
        continue;
      }
      seenContent.add(contentKey);
      if (link) seenLink.add(link);

      rows.push({
        contentId: post.contentId,
        code: post.code,
        channel: v.channel,
        cells: [zohoBulkTime(post.plannedAt), zohoName, content, link, media, '', ''],
      });
    }
  }

  if (rows.length > ZOHO_BULK_MAX_ROWS) {
    for (const r of rows.splice(ZOHO_BULK_MAX_ROWS)) {
      skipped.push({ code: r.code, channel: r.channel, reason: `Zoho takes at most ${ZOHO_BULK_MAX_ROWS} posts per file. Download again for the rest.` });
    }
  }

  const lines = [ZOHO_BULK_HEADER, ...rows.map((r) => r.cells)].map((cells) => cells.map(csvCell).join(','));
  return { rows, skipped, notes, csv: `${lines.join('\r\n')}\r\n` };
}
