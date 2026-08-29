// GET /r/:id — the server-rendered OpenReel share page.
//
// WHY IT LIVES HERE
//
// Link previews are built by crawlers that do not execute JavaScript, so an SPA
// route can only ever hand WhatsApp / Facebook / X / LinkedIn / Telegram the
// generic index.html card. This route renders real HTML per reel.
//
// It was first written as a Supabase Edge Function, which does not work: their
// gateway forces every function response to `Content-Type: text/plain` and adds
// `default-src 'none'; sandbox`, so *.supabase.co cannot serve HTML pages. The
// tags arrived but no crawler parsed them. Serving from our own domain is the
// only way to emit text/html — hence a Vercel function.
//
// Reads with the ANON key on purpose: both tables it touches are publicly
// readable by RLS (a due gallery row, and a business name that is already on the
// public profile), so no service-role secret needs to exist here at all.

import { isVideoUrl, renderSharePage, embedPreviewImage, isEmbedUrl } from '../../src/lib/shareRender.js';
import { posterUrlForVideo } from '../../src/lib/reelShare.js';

const SITE_URL = process.env.APP_BASE_URL || 'https://nowopenafrica.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const FALLBACK_IMAGE = `${SITE_URL}/og-image.png`;

interface VercelRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}
interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
}

/** One row from the public REST API, or null. */
async function restOne<T>(path: string): Promise<T | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as T[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

/** Does the derived poster exist? Reels recorded before posters have none. */
async function posterExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

function notFound(res: VercelResponse) {
  res.status(404);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">`
    + `<title>Reel not found — NowOpen Africa</title><meta name="robots" content="noindex">`
    + `<meta http-equiv="refresh" content="0; url=${SITE_URL}/businesses"></head>`
    + `<body>This reel is no longer available. <a href="${SITE_URL}/businesses">Browse businesses</a>.</body></html>`,
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405);
    res.send('Method not allowed');
    return;
  }

  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw || '';
  // Gallery ids are uuids; refuse anything else rather than query with it.
  if (!/^[0-9a-fA-F-]{16,64}$/.test(id)) return notFound(res);

  const item = await restOne<{ id: string; business_id: string; image_url: string; caption: string | null }>(
    `business_gallery?select=id,business_id,image_url,caption&id=eq.${encodeURIComponent(id)}`,
  );
  if (!item?.image_url) return notFound(res);

  const business = await restOne<{ name: string; username: string | null; image_url: string | null }>(
    `businesses?select=name,username,image_url&id=eq.${encodeURIComponent(item.business_id)}`,
  );

  const businessName = business?.name || 'A business on NowOpen Africa';
  const profileUrl = business?.username
    ? `${SITE_URL}/${business.username}`
    : `${SITE_URL}/businesses/${item.business_id}`;

  const video = isVideoUrl(item.image_url);
  const embed = !video && isEmbedUrl(item.image_url);
  let image = FALLBACK_IMAGE;
  if (video) {
    const poster = posterUrlForVideo(item.image_url);
    if (poster && (await posterExists(poster))) image = poster;
    else if (business?.image_url) image = business.image_url;
  } else if (embed) {
    image = embedPreviewImage(item.image_url) || business?.image_url || FALLBACK_IMAGE;
  } else {
    image = item.image_url;
  }

  const html = renderSharePage({
    title: `${businessName} — OpenReel ${video || embed ? 'video' : 'photo'}`,
    description: (item.caption || '').trim(),
    image,
    mediaUrl: item.image_url,
    isVideo: video,
    isEmbed: embed,
    profileUrl,
    shareUrl: `${SITE_URL}/r/${item.id}`,
    businessName,
    siteUrl: SITE_URL,
  });

  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Crawlers re-fetch; a short cache keeps previews fresh after an edit while
  // absorbing the burst when a link spreads through a group chat.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
  res.send(html);
}
