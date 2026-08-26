// GET /live/:id — the server-rendered NowOpen Live share page.
//
// Same shape and same reasoning as api/r/[id].ts: crawlers do not run
// JavaScript, so an SPA route can only ever hand WhatsApp / Facebook / X /
// Telegram the generic index.html card, and a Supabase Edge Function cannot
// serve HTML at all (their gateway forces text/plain). A Vercel function on our
// own domain is the only place this can live.
//
// Reads with the ANON key on purpose. business_streams has a "Public can view
// streams" policy and the business name is already on the public profile, so no
// service-role secret needs to exist here.

import { renderLiveSharePage } from '../../src/lib/liveShareRender.js';
import { livePosterUrl, liveWatchUrl, liveIsIndexable, type LiveStatus } from '../../src/lib/liveShare.js';

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

/** Was a poster frame ever uploaded for this broadcast? */
async function exists(url: string): Promise<boolean> {
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
    + `<title>Stream not found — NowOpen Africa</title><meta name="robots" content="noindex">`
    + `<meta http-equiv="refresh" content="0; url=${SITE_URL}/businesses"></head>`
    + `<body>This stream is no longer available. <a href="${SITE_URL}/businesses">Browse businesses</a>.</body></html>`,
  );
}

interface StreamRow {
  id: string;
  business_id: string;
  title: string | null;
  description: string | null;
  status: LiveStatus;
  scheduled_for: string | null;
  recording_url: string | null;
  current_viewers: number | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405);
    res.send('Method not allowed');
    return;
  }

  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw || '';
  // Stream ids are uuids; refuse anything else rather than query with it.
  if (!/^[0-9a-fA-F-]{16,64}$/.test(id)) return notFound(res);

  const stream = await restOne<StreamRow>(
    `business_streams?select=id,business_id,title,description,status,scheduled_for,recording_url,current_viewers`
    + `&id=eq.${encodeURIComponent(id)}`,
  );
  if (!stream) return notFound(res);

  const business = await restOne<{ name: string; username: string | null; image_url: string | null }>(
    `businesses?select=name,username,image_url&id=eq.${encodeURIComponent(stream.business_id)}`,
  );

  const businessName = business?.name || 'A business on NowOpen Africa';
  const profileUrl = business?.username
    ? `${SITE_URL}/${business.username}`
    : `${SITE_URL}/businesses/${stream.business_id}`;

  // A frame from the broadcast itself is the only image that says "this is
  // happening now". Fall back to the business cover, then to the site card —
  // an unfurl with no picture is barely an unfurl.
  const poster = livePosterUrl(SUPABASE_URL, stream.id);
  let image = business?.image_url || FALLBACK_IMAGE;
  if (poster && (await exists(poster))) image = poster;

  const html = renderLiveSharePage({
    status: stream.status,
    title: (stream.title || 'Live broadcast').trim(),
    description: (stream.description || '').trim(),
    businessName,
    image,
    recordingUrl: stream.recording_url,
    viewers: stream.current_viewers ?? 0,
    scheduledFor: stream.scheduled_for,
    watchUrl: liveWatchUrl(profileUrl, stream.id),
    shareUrl: `${SITE_URL}/live/${stream.id}`,
    siteUrl: SITE_URL,
  });

  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!liveIsIndexable(stream.status, !!stream.recording_url)) {
    res.setHeader('X-Robots-Tag', 'noindex');
  }
  // A live card goes stale fast — viewer count and the LIVE badge are both
  // claims about right now — so it is cached for far less time than a reel.
  // Scheduled and ended pages do not change, and get the longer window.
  res.setHeader(
    'Cache-Control',
    stream.status === 'live'
      ? 'public, max-age=30, s-maxage=30'
      : 'public, max-age=300, s-maxage=600',
  );
  res.send(html);
}
