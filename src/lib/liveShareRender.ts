// The markup behind /live/<id> — the page a shared NowOpen Live link unfurls to.
//
// It lives in src/lib for the same two reasons shareRender.ts does: it must be
// unit-testable without a network or a database (everything here is pure), and
// the thing that serves it has to be a Vercel function on our own domain,
// because Supabase's gateway forces text/plain on every edge function response
// and no crawler parses OpenGraph out of that.
//
// WHAT A CRAWLER GETS, AND WHY IT IS WHAT IT IS
//
// A live WebRTC broadcast has no playable URL — a viewer negotiates a peer
// connection with the broadcaster, so there is nothing to put in og:video and
// nothing for an inline player to open. Claiming otherwise with a video tag
// pointed at a dead URL is worse than a still: platforms that try it show a
// spinner and then an error, on the one card meant to pull someone in.
//
// So a live stream unfurls as a large still — the poster frame, with the LIVE
// badge and viewer count in the text — and the tap opens the stream in the app.
// A finished stream with a recording is a real file, and that one does get
// og:video and plays inline right here.

import { escapeHtml } from './shareRender.js';
import { liveBadge, liveSubline, type LiveStatus, type LiveShareInput } from './liveShare.js';

export interface LiveSharePage {
  status: LiveStatus;
  title: string;
  description: string;
  businessName: string;
  /** Poster frame, business cover, or the site's own card — never empty. */
  image: string;
  /** The replay file, when the broadcast is over and one was saved. */
  recordingUrl?: string | null;
  viewers?: number;
  scheduledFor?: string | null;
  /** Where "Join the live" goes: the profile, live tab, viewer opening. */
  watchUrl: string;
  /** Canonical address of this page. */
  shareUrl: string;
  siteUrl: string;
}

/**
 * The container a replay is actually in.
 *
 * Declaring the wrong one is not cosmetic: a platform that trusts og:video:type
 * hands the bytes to the wrong demuxer and shows an error instead of the video.
 * Replays used to be WebM without exception; they are now whatever the
 * broadcaster's browser could record (see pickRecorderMimeType), so the tag has
 * to follow the file rather than assume.
 */
export function videoTypeForUrl(url: string): string {
  const path = (url || '').split(/[?#]/)[0].toLowerCase();
  if (/\.mp4$/.test(path)) return 'video/mp4';
  if (/\.mov$/.test(path)) return 'video/quicktime';
  return 'video/webm';
}

const badgeColour = (status: LiveStatus): string =>
  status === 'live' ? '#dc2626' : status === 'scheduled' ? '#2563eb' : '#475569';

export function renderLiveSharePage(p: LiveSharePage): string {
  const summary: LiveShareInput = {
    streamId: '',
    title: p.title,
    businessName: p.businessName,
    status: p.status,
    viewers: p.viewers,
    scheduledFor: p.scheduledFor,
  };

  // The card's title carries the state, because on most platforms the title is
  // the only line that survives at full weight — the description gets truncated
  // and the image carries no words a screen reader will read out.
  const cardTitle = `${liveBadge(p.status)} · ${p.title} — ${p.businessName}`;
  const cardDescription = p.description?.trim() || liveSubline(summary);

  const t = escapeHtml(cardTitle);
  const d = escapeHtml(cardDescription);
  const image = escapeHtml(p.image);
  const share = escapeHtml(p.shareUrl);
  const watch = escapeHtml(p.watchUrl);
  const site = escapeHtml(p.siteUrl);
  const name = escapeHtml(p.businessName);
  const heading = escapeHtml(p.title);
  const badge = escapeHtml(liveBadge(p.status));
  const sub = escapeHtml(liveSubline(summary));

  const replay = p.status === 'ended' && p.recordingUrl ? escapeHtml(p.recordingUrl) : null;

  // Only a real file gets video tags. See the note at the top of this file.
  const typeTags = replay
    ? `<meta property="og:type" content="video.other">
<meta property="og:video" content="${replay}">
<meta property="og:video:secure_url" content="${replay}">
<meta property="og:video:type" content="${videoTypeForUrl(p.recordingUrl || '')}">
<meta name="twitter:card" content="player">
<meta name="twitter:player" content="${share}">
<meta name="twitter:player:width" content="1280">
<meta name="twitter:player:height" content="720">`
    : `<meta property="og:type" content="video.other">
<meta name="twitter:card" content="summary_large_image">`;

  const cta = p.status === 'live'
    ? `Join the live &rarr;`
    : p.status === 'scheduled'
      ? `Set a reminder &rarr;`
      : `Watch the replay &rarr;`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${share}">
<meta property="og:site_name" content="NowOpen Africa">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${share}">
<meta property="og:image" content="${image}">
<meta property="og:image:secure_url" content="${image}">
<meta property="og:image:alt" content="${t}">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${image}">
${typeTags}
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:#0f172a; color:#fff;
         font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
         display:flex; flex-direction:column; align-items:center; }
  header, footer { width:100%; max-width:560px; padding:16px; }
  header { display:flex; align-items:center; gap:8px; font-weight:700; }
  .dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
  .stage { position:relative; width:100%; max-width:560px; background:#000; }
  .stage img, .stage video { width:100%; height:auto; display:block; }
  .badge { position:absolute; top:12px; left:12px; display:inline-flex; align-items:center;
           gap:6px; padding:5px 10px; border-radius:8px; font-size:12px; font-weight:800;
           letter-spacing:.04em; background:${badgeColour(p.status)}; color:#fff; }
  .count { position:absolute; top:12px; right:12px; padding:5px 10px; border-radius:8px;
           font-size:12px; font-weight:600; background:rgba(0,0,0,.55); color:#fff; }
  h1 { margin:20px 16px 4px; font-size:20px; line-height:1.3; max-width:560px; }
  p.sub { margin:0 16px; color:#cbd5e1; max-width:560px; }
  .cta { display:block; width:calc(100% - 32px); max-width:528px; margin:20px 16px;
         padding:16px 20px; border-radius:14px; background:#dc2626; color:#fff;
         text-decoration:none; font-weight:700; text-align:center; font-size:17px; }
  .cta.calm { background:#2563eb; }
  a.muted { color:#93c5fd; }
</style>
</head>
<body>
  <header>
    <span class="dot" style="background:#3b82f6"></span>
    <span class="dot" style="background:#ec4899"></span>
    <span class="dot" style="background:#22c55e"></span>
    NowOpen Africa
  </header>

  <div class="stage">
    ${replay
      ? `<video src="${replay}" poster="${image}" controls playsinline preload="metadata"></video>`
      : `<img src="${image}" alt="${t}">`}
    <span class="badge">${badge}</span>
    ${p.status === 'live' && (p.viewers ?? 0) > 1 ? `<span class="count">${p.viewers} watching</span>` : ''}
  </div>

  <h1>${heading}</h1>
  <p class="sub">${sub}</p>

  <a class="cta${p.status === 'live' ? '' : ' calm'}" href="${watch}">${cta}</a>

  <footer>
    <a class="muted" href="${site}">See more from ${name} on NowOpen Africa</a>
  </footer>
</body>
</html>`;
}
