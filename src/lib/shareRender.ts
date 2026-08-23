// Markup and URL derivation for the OpenReel share page (/r/<id>).
//
// WHY THIS RUNS ON VERCEL AND NOT A SUPABASE EDGE FUNCTION
//
// It started life as one. Supabase's gateway rewrites every function response to
// `Content-Type: text/plain` and injects `default-src 'none'; sandbox` — a
// deliberate policy so *.supabase.co cannot host HTML pages. The body arrived
// intact but no crawler would parse Open Graph tags out of text/plain, so every
// shared link stayed preview-less. Serving it from our own domain (api/r/[id].ts)
// is the only way to emit real text/html.
//
// Living in src/lib keeps it inside the test suite; the Vercel function imports it.
//
// Split out of index.ts so it can be unit-tested without Deno.serve, a database
// or the network: everything here is pure. The poster convention MUST stay in
// step with src/lib/reelShare.ts — there is a test asserting they agree.

const VIDEO_EXTENSIONS = /\.(mp4|m4v|webm|ogv|ogg|mov|qt)$/i;

/** Strip query and fragment before testing the extension. */
const pathOf = (url: string): string => (url || "").split(/[?#]/)[0];

export function isVideoUrl(url: string | null | undefined): boolean {
  return VIDEO_EXTENSIONS.test(pathOf(url || ""));
}

/** Poster stored beside the video: `reel-1.mp4` -> `reel-1-poster.jpg`. */
export function posterUrlForVideo(videoUrl: string | null | undefined): string | null {
  if (!videoUrl || !isVideoUrl(videoUrl)) return null;
  const path = pathOf(videoUrl);
  const swapped = path.replace(/\.[A-Za-z0-9]+$/, "-poster.jpg");
  return swapped === path ? null : swapped;
}

/**
 * Preview image for a link pasted from another platform.
 *
 * An embed URL is a web page, not a picture — pointing og:image at a YouTube
 * watch page gives WhatsApp nothing to show. YouTube publishes a predictable
 * thumbnail per video id, so that one can be resolved exactly; the others have
 * no stable public thumbnail without their oEmbed API (which needs a token), so
 * they fall back to the business's own cover.
 */
export function embedPreviewImage(url: string): string | null {
  const clean = (url || '').trim();
  if (!clean) return null;
  const yt = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(clean);
  if (yt) return `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`;
  return null;
}

/** Is this a link that plays in another platform's player rather than a file? */
export function isEmbedUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be|tiktok\.com|instagram\.com|vimeo\.com|facebook\.com|fb\.watch)\//i
    .test((url || '').trim());
}

export function escapeHtml(value: string): string {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SharePage {
  title: string;
  description: string;
  image: string;
  mediaUrl: string;
  isVideo: boolean;
  /** The media lives on another platform and is watched there. */
  isEmbed?: boolean;
  profileUrl: string;
  shareUrl: string;
  businessName: string;
  siteUrl: string;
}

export function renderSharePage(p: SharePage): string {
  const t = escapeHtml(p.title);
  const d = escapeHtml(p.description);
  const media = escapeHtml(p.mediaUrl);
  const image = escapeHtml(p.image);
  const profile = escapeHtml(p.profileUrl);
  const share = escapeHtml(p.shareUrl);
  const name = escapeHtml(p.businessName);
  const site = escapeHtml(p.siteUrl);

  // og:video lets the platforms with inline players use one. WhatsApp shows the
  // still and opens the link instead, so the page itself has to be worth landing
  // on — which is why the media plays straight away below.
  const typeTags = p.isVideo
    ? `<meta property="og:type" content="video.other">
<meta property="og:video" content="${media}">
<meta property="og:video:secure_url" content="${media}">
<meta property="og:video:type" content="video/mp4">
<meta name="twitter:card" content="player">
<meta name="twitter:player" content="${share}">
<meta name="twitter:player:width" content="720">
<meta name="twitter:player:height" content="1280">`
    : `<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">`;

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
  .media { width:100%; max-width:560px; background:#000; }
  .media video, .media img { width:100%; height:auto; max-height:80vh; display:block; object-fit:contain; }
  .cta { display:block; margin:16px; padding:14px 20px; border-radius:12px;
         background:#2563eb; color:#fff; text-decoration:none; font-weight:600; text-align:center; }
  p.caption { margin:16px; color:#cbd5e1; }
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

  <div class="media">
    ${p.isVideo
      ? `<video src="${media}" poster="${image}" controls autoplay muted playsinline preload="metadata"></video>`
      // A platform link is watched on that platform: show its thumbnail here and
      // send the tap onward, rather than embedding a player this page can't own.
      : p.isEmbed
        ? `<a href="${media}" target="_blank" rel="noopener noreferrer nofollow"><img src="${image}" alt="${t}"></a>`
        : `<img src="${media}" alt="${t}">`}
  </div>
  ${p.isEmbed ? `<a class="cta" href="${media}" target="_blank" rel="noopener noreferrer nofollow">Watch the full video &rarr;</a>` : ''}

  ${p.description ? `<p class="caption">${d}</p>` : ""}

  <a class="cta" href="${profile}">See more from ${name} &rarr;</a>

  <footer>
    <a class="muted" href="${site}">Discover African businesses on NowOpen Africa</a>
  </footer>
</body>
</html>`;
}
