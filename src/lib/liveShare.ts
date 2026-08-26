// Sharing a NowOpen Live broadcast.
//
// WHAT CANNOT BE DONE, SO NOBODY BUILDS TOWARDS IT
//
// A live stream cannot play inside a WhatsApp status, and no amount of meta
// tags will change that. Two independent reasons:
//
//   1. Status renders media you UPLOAD — a photo or a video file. It is not a
//      web view and has no embed. Even a link sticker only opens the browser.
//   2. NowOpen Live is a WebRTC mesh: a viewer receives media over a peer
//      connection negotiated with the broadcaster. There is no URL that plays
//      the stream, so there is nothing for a crawler or a player to point at.
//
// WHAT WORKS INSTEAD, AND IS WHAT PEOPLE ACTUALLY DO
//
// The owner posts a still to their status — a 9:16 card showing they are live —
// and the link goes with it. When that link is pasted anywhere (a WhatsApp
// chat, a status link sticker, X, Facebook, Telegram) it unfurls into a rich
// card, because /live/:id is server-rendered HTML with real OpenGraph tags.
// Tapping it opens the stream.
//
// So this module builds three things: the share URL, the message that travels
// with it, and the copy that goes on the card. The rendering lives in
// api/live/[id].ts, for the reason api/r/[id].ts documents at length —
// Supabase's function gateway forces text/plain and cannot serve HTML.

export type LiveStatus = 'scheduled' | 'live' | 'ended';

export interface LiveShareInput {
  streamId: string;
  title: string;
  businessName: string;
  status: LiveStatus;
  viewers?: number;
  scheduledFor?: string | null;
  siteUrl?: string;
}

/** Where a shared live link points. Short, because it gets typed out loud. */
export const liveShareUrl = (streamId: string, siteUrl = 'https://nowopenafrica.com'): string =>
  `${siteUrl.replace(/\/$/, '')}/live/${streamId}`;

/**
 * The badge a card leads with.
 *
 * "LIVE" is a claim about right now, so it is only used when the stream really
 * is live. A card that says LIVE over an ended broadcast is the fastest way to
 * lose someone's trust in a notification.
 */
export function liveBadge(status: LiveStatus): string {
  if (status === 'live') return 'LIVE NOW';
  if (status === 'scheduled') return 'STARTING SOON';
  return 'REPLAY';
}

/**
 * The line under the headline.
 *
 * Viewer counts are only shown once there is a real audience — "0 watching"
 * reads as nobody came, and one viewer is usually the owner's own second
 * device.
 */
export function liveSubline(input: LiveShareInput): string {
  const who = input.businessName?.trim() || 'A NowOpen business';
  if (input.status === 'live') {
    const n = input.viewers ?? 0;
    const crowd = n > 1 ? ` · ${n} watching` : '';
    return `${who} is broadcasting now${crowd}. Tap to join.`;
  }
  if (input.status === 'scheduled') {
    const when = formatWhen(input.scheduledFor);
    return when ? `${who} goes live ${when}. Tap to be there.` : `${who} is going live soon. Tap to be there.`;
  }
  return `${who} has finished broadcasting. Tap to watch what you missed.`;
}

/** A short, human time. Absent or unparseable dates simply drop out. */
export function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  });
}

/**
 * The message the owner sends.
 *
 * The link goes LAST and on its own line. WhatsApp only unfurls a preview for
 * the final URL in a message, and trailing punctuation gets swallowed into the
 * href — both of which turn a rich card back into a bare blue link.
 */
export function liveShareMessage(input: LiveShareInput): string {
  const url = liveShareUrl(input.streamId, input.siteUrl);
  const lead = input.status === 'live'
    ? `🔴 We're live now — ${input.title?.trim() || 'come and watch'}`
    : input.status === 'scheduled'
      ? `📅 ${input.businessName} is going live${formatWhen(input.scheduledFor) ? ` ${formatWhen(input.scheduledFor)}` : ' soon'}`
      : `▶️ Missed us live? The replay is up`;
  return `${lead}\n\n${url}`;
}

/** WhatsApp's share intent. Works in the app and on web without a key. */
export const whatsappShareLink = (input: LiveShareInput): string =>
  `https://wa.me/?text=${encodeURIComponent(liveShareMessage(input))}`;

/**
 * Should this stream be indexed?
 *
 * A live broadcast is worth ranking while it is on and after it has a replay.
 * A scheduled one that never happened is a page about nothing, and letting
 * search engines keep those is how a domain fills with dead ends.
 */
export const liveIsIndexable = (status: LiveStatus, hasRecording: boolean): boolean =>
  status === 'live' || (status === 'ended' && hasRecording);

/**
 * Where a broadcast's poster frame lives.
 *
 * By convention rather than a column, exactly like reel posters
 * (see posterUrlForVideo in shareRender.ts): storage path derived from the
 * stream id, and the share page HEAD-checks it. That keeps a migration off the
 * deploy list, and a stream whose poster failed to upload simply falls back to
 * the business cover instead of carrying a broken url in the database.
 */
export const LIVE_POSTER_BUCKET = 'business-images';
export const livePosterPath = (streamId: string): string => `live/${streamId}-poster.jpg`;

export function livePosterUrl(supabaseUrl: string, streamId: string): string | null {
  if (!supabaseUrl || !streamId) return null;
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${LIVE_POSTER_BUCKET}/${livePosterPath(streamId)}`;
}

/**
 * Where the share page's CTA sends someone.
 *
 * `tab=live` is the profile's existing live tab; `watch` tells LiveSection to
 * open the viewer straight away, so a tap from a status lands on the stream
 * rather than on a page with the stream one more tap away.
 */
export function liveWatchUrl(
  profileUrl: string,
  streamId: string,
): string {
  const join = profileUrl.includes('?') ? '&' : '?';
  return `${profileUrl}${join}tab=live&watch=${encodeURIComponent(streamId)}`;
}
