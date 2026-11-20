/**
 * Where Video Studio media can come from, besides a file on this device:
 *
 *   * a LINK, shown at once:
 *       - a NowOpen storage link in the person's own folder is used in place;
 *       - a YouTube / Vimeo / Instagram / TikTok / Facebook video plays through
 *         that platform's official player (components/video/EmbedLayer.tsx),
 *         never downloaded: their terms forbid it, so it cannot be exported;
 *       - any other direct file link plays from the link straight away, and
 *         the `video-studio-import` edge function copies it into the person's
 *         folder in the background (the asset then switches to the copy);
 *   * an OPENREEL — recorded now with the OpenReel camera, or one already
 *     recorded (`business-images/<user id>/reel-<stamp>.<ext>`).
 *
 * The player-page list and the type table mirror the server's
 * (supabase/functions/_shared/videoImport.ts); videoSources.test.ts compares
 * them, so the browser never offers a link the server will refuse for a
 * reason the browser could have given.
 */

import { supabase } from '../supabase';
import { POSTER_SUFFIX } from '../reelShare';
import type { AssetKind, LinkPlatform } from './videoDocument';
import { parseVideoEmbed } from '../videoEmbeds';
import { VIDEO_UPLOAD_TYPES, type MediaFacts } from './videoAssets';

export const BUCKET = 'business-images';

export const PLAYER_PAGE_HOSTS = [
  'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'twitch.tv',
  'instagram.com', 'facebook.com', 'fb.watch', 'tiktok.com', 'x.com', 'twitter.com',
  'linkedin.com', 'snapchat.com', 'pinterest.com', 'threads.net',
] as const;

export function playerPageHost(host: string): string | null {
  const h = host.toLowerCase().replace(/^www\./, '');
  return PLAYER_PAGE_HOSTS.find((d) => h === d || h.endsWith(`.${d}`)) ?? null;
}

/** File extension → kind, from the same table uploads use. */
const KIND_BY_EXT: Record<string, AssetKind> = Object.fromEntries(
  Object.values(VIDEO_UPLOAD_TYPES).map((t) => [t.ext, t.kind]),
);
/* The OpenReel camera also writes .jpeg on some browsers. */
KIND_BY_EXT.jpeg = 'image';

export function kindForPath(path: string): AssetKind | null {
  const ext = path.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return KIND_BY_EXT[ext] ?? null;
}

export type LinkPlan =
  | { type: 'storage'; path: string; kind: AssetKind }
  /** A platform video, played through its official player. */
  | { type: 'embed'; url: string; platform: LinkPlatform; embedId: string; label: string }
  /** A direct file link: played from the link at once, copied into storage in the background. */
  | { type: 'import'; url: string; kind: AssetKind | null }
  | { type: 'refuse'; reason: string };

const PLATFORM_LABEL: Record<LinkPlatform, string> = {
  youtube: 'YouTube', vimeo: 'Vimeo', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook',
};

/**
 * The player address for a platform video inside the editor: no controls, no
 * related videos, no annotations, no keyboard, and the JS API on so the
 * timeline can seek, play and pause it. The player also sits under the
 * canvas, so nothing on it can be hovered or clicked.
 *
 * What a platform still shows is its call: YouTube may show its title or
 * logo for a moment when a video starts; Vimeo hides controls only for
 * videos whose owner allows it; TikTok, Instagram and Facebook players
 * cannot be controlled at all and play on their own.
 */
export function studioEmbedSrc(platform: LinkPlatform, id: string, url: string, origin: string): string {
  const e = encodeURIComponent;
  switch (platform) {
    case 'youtube':
      return `https://www.youtube-nocookie.com/embed/${e(id)}?enablejsapi=1&controls=0&disablekb=1&fs=0&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1&cc_load_policy=0&origin=${e(origin)}`;
    case 'vimeo':
      return `https://player.vimeo.com/video/${e(id)}?api=1&controls=0&title=0&byline=0&portrait=0&dnt=1&playsinline=1`;
    case 'tiktok':
      return `https://www.tiktok.com/embed/v2/${e(id)}?controls=0&music_info=0&description=0&rel=0`;
    case 'instagram':
      return `https://www.instagram.com/reel/${e(id)}/embed`;
    case 'facebook':
      return `https://www.facebook.com/plugins/video.php?href=${e(url)}&show_text=false`;
  }
}

/** Seek / play / pause messages for the players that take them (YouTube, Vimeo). */
export function playerCommand(platform: LinkPlatform, cmd: 'seek' | 'play' | 'pause' | 'mute' | 'unmute', seconds = 0): string | Record<string, unknown> | null {
  if (platform === 'youtube') {
    const func = { seek: 'seekTo', play: 'playVideo', pause: 'pauseVideo', mute: 'mute', unmute: 'unMute' }[cmd];
    return JSON.stringify({ event: 'command', func, args: cmd === 'seek' ? [seconds, true] : [] });
  }
  if (platform === 'vimeo') {
    if (cmd === 'seek') return { method: 'setCurrentTime', value: seconds };
    if (cmd === 'mute' || cmd === 'unmute') return { method: 'setVolume', value: cmd === 'mute' ? 0 : 1 };
    return { method: cmd };
  }
  return null;
}

/**
 * What to do with a pasted link. Pure: `storageBase` is the project's
 * `<supabase url>/storage/v1/object/public/` and `userId` the signed-in person.
 */
export function planLink(raw: string, storageBase: string, userId: string): LinkPlan {
  let s = raw.trim();
  if (!s) return { type: 'refuse', reason: 'Paste a link first.' };
  if (/^(data|blob|file|javascript):/i.test(s)) return { type: 'refuse', reason: 'Paste a web link (https://…).' };
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try { u = new URL(s); } catch { return { type: 'refuse', reason: 'That is not a link.' }; }

  const embed = parseVideoEmbed(s);
  if (embed) {
    const embedId = embed.id.split(/[?&#/]/)[0];
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(embedId)) {
      return { type: 'refuse', reason: `That ${embed.label} link has no video in it. Copy the link from the video itself (Share → Copy link).` };
    }
    return { type: 'embed', url: u.toString(), platform: embed.platform, embedId, label: PLATFORM_LABEL[embed.platform] };
  }
  const player = playerPageHost(u.hostname);
  if (player) {
    return { type: 'refuse', reason: `That ${player} link is not a video. Copy the link from the video itself (Share → Copy link).` };
  }

  /* A NowOpen file in the person's own folder: use it where it is. */
  const own = `${storageBase.replace(/\/?$/, '/')}${BUCKET}/`;
  if (s.startsWith(own)) {
    const path = decodeURIComponent(s.slice(own.length).split('?')[0]);
    if (path.startsWith(`${userId}/`) && !path.includes('..')) {
      const kind = kindForPath(path);
      if (!kind) return { type: 'refuse', reason: 'That NowOpen file is not a video, image or sound Video Studio can use.' };
      return { type: 'storage', path, kind };
    }
  }
  return { type: 'import', url: u.toString(), kind: kindForPath(u.pathname) };
}

/**
 * Read a direct link's size and length WITHOUT asking for CORS, so a file on
 * any site plays. When the kind is not clear from the address, try video,
 * then image, then sound.
 */
export async function probeLink(url: string, kind: AssetKind | null): Promise<{ kind: AssetKind; facts: MediaFacts }> {
  const order: AssetKind[] = kind ? [kind] : ['video', 'image', 'audio'];
  let last: unknown = null;
  for (const k of order) {
    try { return { kind: k, facts: await probeMediaUrl(url, k, { cors: false }) }; } catch (e) { last = e; }
  }
  throw last instanceof Error ? new Error(`That link did not open as a video, image or sound. ${last.message}`) : new Error('That link did not open as a video, image or sound.');
}

export function storageBaseUrl(): string {
  /* getPublicUrl('x') ends in /business-images/x; everything before the bucket is the base. */
  const sample = supabase.storage.from(BUCKET).getPublicUrl('x').data.publicUrl;
  return sample.slice(0, sample.length - `${BUCKET}/x`.length);
}

export type ImportResult = { ok: true; path: string; kind: AssetKind } | { ok: false; reason: string };

/** Ask the server to copy a direct file link into the person's studio folder. */
export async function importFromLink(url: string): Promise<ImportResult> {
  const { data, error } = await supabase.functions.invoke('video-studio-import', { body: { url } });
  if (error) {
    /* A refusal comes back as a non-2xx with { reason } in the body; read it rather than show "non-2xx". */
    let reason = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const body = await ctx.json(); if (body?.reason) reason = String(body.reason); } catch { /* keep message */ }
    }
    return { ok: false, reason };
  }
  const d = data as { ok?: boolean; path?: string; kind?: AssetKind; reason?: string } | null;
  if (!d?.ok || !d.path || !d.kind) return { ok: false, reason: d?.reason ?? 'The link could not be imported.' };
  return { ok: true, path: d.path, kind: d.kind };
}

export interface ReelFile { path: string; kind: AssetKind; createdAt: string | null }

/**
 * The person's OpenReels, newest first: `<user id>/reel-<stamp>.<ext>`.
 * Posters (`-poster.jpg`) are stills made for share cards, not reels.
 */
export async function listOpenReels(userId: string, limit = 24): Promise<ReelFile[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
    search: 'reel-', limit: limit * 2, sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((f) => f.name.startsWith('reel-') && !f.name.endsWith(POSTER_SUFFIX))
    .map((f) => ({ path: `${userId}/${f.name}`, kind: kindForPath(f.name), createdAt: (f as { created_at?: string }).created_at ?? null }))
    .filter((f): f is ReelFile => f.kind !== null)
    .slice(0, limit);
}

/** Size and length of a file already in storage, read by the browser from its public URL. */
export function probeMediaUrl(url: string, kind: AssetKind, { cors = true, timeoutMs = 15_000 }: { cors?: boolean; timeoutMs?: number } = {}): Promise<MediaFacts> {
  return new Promise<MediaFacts>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`That ${kind} took too long to open.`)), timeoutMs);
    const ok = (f: MediaFacts) => { clearTimeout(timer); resolve(f); };
    const fail = (e: Error) => { clearTimeout(timer); reject(e); };
    run(ok, fail);
  });

  function run(resolve: (f: MediaFacts) => void, reject: (e: Error) => void) {
    if (kind === 'image') {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('That image could not be read.'));
      img.src = url;
      return;
    }
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    if (cors) el.crossOrigin = 'anonymous';
    el.onloadedmetadata = () => {
      const durationMs = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : undefined;
      const v = el as HTMLVideoElement;
      /* A sound file opened as a video has no picture: not a video. */
      if (kind === 'video' && !v.videoWidth) { reject(new Error('That link has no picture.')); return; }
      resolve(kind === 'video' ? { width: v.videoWidth, height: v.videoHeight, durationMs } : { durationMs });
    };
    el.onerror = () => reject(new Error(`This browser cannot play that ${kind}.`));
    el.src = url;
  }
}
