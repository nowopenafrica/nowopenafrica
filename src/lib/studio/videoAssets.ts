/**
 * Media for Video Studio: what can be uploaded, where it is stored, and how
 * its size and length are read before it goes on the timeline.
 *
 * Stored in the same bucket and folder as design images
 * (`business-images/<user id>/studio/…`), so the existing storage policies
 * cover it and no new policy is needed.
 *
 * Honest limit: there is no proxy transcode yet (spec §2.3). The editor plays
 * the original file, so a long 4K upload will play slowly. The size cap keeps
 * that within reason until proxies exist.
 */

import type { AssetKind } from './videoDocument';

export const VIDEO_UPLOAD_TYPES: Record<string, { kind: AssetKind; ext: string }> = {
  'video/mp4': { kind: 'video', ext: 'mp4' },
  'video/webm': { kind: 'video', ext: 'webm' },
  'video/quicktime': { kind: 'video', ext: 'mov' },
  'image/png': { kind: 'image', ext: 'png' },
  'image/jpeg': { kind: 'image', ext: 'jpg' },
  'image/webp': { kind: 'image', ext: 'webp' },
  'image/gif': { kind: 'image', ext: 'gif' },
  'audio/mpeg': { kind: 'audio', ext: 'mp3' },
  'audio/mp4': { kind: 'audio', ext: 'm4a' },
  'audio/x-m4a': { kind: 'audio', ext: 'm4a' },
  'audio/wav': { kind: 'audio', ext: 'wav' },
  'audio/x-wav': { kind: 'audio', ext: 'wav' },
  'audio/ogg': { kind: 'audio', ext: 'ogg' },
  'audio/webm': { kind: 'audio', ext: 'weba' },
};

/** Per kind, in bytes. Video is capped hardest because the editor plays the original. */
export const MAX_BYTES: Record<AssetKind, number> = {
  video: 50 * 1024 * 1024,
  image: 25 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
};

export const ACCEPT_ATTR = Object.keys(VIDEO_UPLOAD_TYPES).join(',');

export type MediaCheck = { ok: true; kind: AssetKind; ext: string } | { ok: false; reason: string };

export function checkMediaFile(file: { type: string; size: number; name: string }): MediaCheck {
  const t = VIDEO_UPLOAD_TYPES[file.type];
  if (!t) return { ok: false, reason: `${file.type || 'That file type'} cannot be used. Use MP4, WebM or MOV video, PNG, JPEG, WebP or GIF images, or MP3, M4A, WAV or OGG sound.` };
  if (file.size === 0) return { ok: false, reason: 'That file is empty.' };
  if (file.size > MAX_BYTES[t.kind]) {
    return { ok: false, reason: `That ${t.kind} is ${Math.ceil(file.size / 1024 / 1024)} MB. The limit is ${MAX_BYTES[t.kind] / 1024 / 1024} MB.` };
  }
  return { ok: true, kind: t.kind, ext: t.ext };
}

export function mediaPath(userId: string, ext: string, now = Date.now(), tail = Math.random().toString(36).slice(2, 8)): string {
  const safe = tail.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'x';
  return `${userId}/studio/video-${now}-${safe}.${ext}`;
}

/** A readable label for an asset path: the original file name is not kept, so name it by kind and time. */
export function assetLabel(kind: AssetKind, path: string): string {
  const stamp = path.match(/-(\d{10,})-/)?.[1];
  const when = stamp ? new Date(Number(stamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return `${kind === 'video' ? 'Clip' : kind === 'image' ? 'Image' : 'Sound'}${when ? ` ${when}` : ''}`;
}

export interface MediaFacts { width?: number; height?: number; durationMs?: number }

/** Read the size and length the browser can tell from a local file, before uploading it. */
export function probeMedia(file: File, kind: AssetKind): Promise<MediaFacts> {
  const url = URL.createObjectURL(file);
  const done = (facts: MediaFacts) => { URL.revokeObjectURL(url); return facts; };
  return new Promise((resolve, reject) => {
    if (kind === 'image') {
      const img = new Image();
      img.onload = () => resolve(done({ width: img.naturalWidth, height: img.naturalHeight }));
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
      img.src = url;
      return;
    }
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const durationMs = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : undefined;
      const v = el as HTMLVideoElement;
      resolve(done(kind === 'video' ? { width: v.videoWidth, height: v.videoHeight, durationMs } : { durationMs }));
    };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`This browser cannot play that ${kind} file.`)); };
    el.src = url;
  });
}
