/**
 * Rules for importing one media file from a link into Video Studio.
 *
 * Pure, so the browser's twin (src/lib/studio/videoSources.ts) and the edge
 * function `video-studio-import` can be tested against the same table. The
 * table must match VIDEO_UPLOAD_TYPES and MAX_BYTES in
 * src/lib/studio/videoAssets.ts: a link may bring in exactly what an upload
 * may, no more. videoImport.test.ts compares them.
 */

export type ImportKind = "video" | "image" | "audio";

export const IMPORT_TYPES: Record<string, { kind: ImportKind; ext: string }> = {
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/webm": { kind: "video", ext: "webm" },
  "video/quicktime": { kind: "video", ext: "mov" },
  "image/png": { kind: "image", ext: "png" },
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/webp": { kind: "image", ext: "webp" },
  "image/gif": { kind: "image", ext: "gif" },
  "audio/mpeg": { kind: "audio", ext: "mp3" },
  "audio/mp4": { kind: "audio", ext: "m4a" },
  "audio/x-m4a": { kind: "audio", ext: "m4a" },
  "audio/wav": { kind: "audio", ext: "wav" },
  "audio/x-wav": { kind: "audio", ext: "wav" },
  "audio/ogg": { kind: "audio", ext: "ogg" },
  "audio/webm": { kind: "audio", ext: "weba" },
};

export const IMPORT_MAX_BYTES: Record<ImportKind, number> = {
  video: 50 * 1024 * 1024,
  image: 25 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
};

/** The biggest anything may be, checked before the kind is known. */
export const IMPORT_HARD_MAX = Math.max(...Object.values(IMPORT_MAX_BYTES));

/** At most this many redirects, each one re-checked before it is followed. */
export const IMPORT_MAX_REDIRECTS = 3;

/**
 * Video sites serve a player page, not a file. Named so the person is told
 * what to do instead of "that is not a video (text/html)".
 */
const PLAYER_PAGE_HOSTS = [
  "youtube.com", "youtu.be", "vimeo.com", "dailymotion.com", "twitch.tv",
  "instagram.com", "facebook.com", "fb.watch", "tiktok.com", "x.com", "twitter.com",
  "linkedin.com", "snapchat.com", "pinterest.com", "threads.net",
];

export const PLAYER_PAGE_HOSTS_FOR_TEST: readonly string[] = PLAYER_PAGE_HOSTS;

export function playerPageHost(host: string): string | null {
  const h = host.toLowerCase().replace(/^www\./, "");
  return PLAYER_PAGE_HOSTS.find((d) => h === d || h.endsWith(`.${d}`)) ?? null;
}

export const PLAYER_PAGE_MESSAGE = (domain: string) =>
  `${domain} links open a player page, not a file, so they cannot be placed on the timeline. ` +
  "If the video is yours, download it from that platform and add it with Video, or use a direct link to the file.";

/** The content type without parameters, lower-cased. */
export function baseType(header: string | null): string {
  return (header ?? "").split(";")[0].trim().toLowerCase();
}

export type TypeVerdict = { ok: true; kind: ImportKind; ext: string } | { ok: false; reason: string };

export function checkImportType(header: string | null): TypeVerdict {
  const t = baseType(header);
  const hit = IMPORT_TYPES[t];
  if (hit) return { ok: true, ...hit };
  if (t.startsWith("text/html")) return { ok: false, reason: "That link opens a web page, not a media file. Use a link that ends in the file itself (.mp4, .jpg, .mp3)." };
  return { ok: false, reason: `${t || "That file type"} cannot be used. Use MP4, WebM or MOV video, PNG, JPEG, WebP or GIF images, or MP3, M4A, WAV or OGG sound.` };
}

export function checkImportSize(kind: ImportKind, bytes: number): string | null {
  if (bytes <= 0) return "That file is empty.";
  if (bytes > IMPORT_MAX_BYTES[kind]) {
    return `That ${kind} is ${Math.ceil(bytes / 1024 / 1024)} MB. The limit is ${IMPORT_MAX_BYTES[kind] / 1024 / 1024} MB.`;
  }
  return null;
}

/** Same shape as mediaPath() in src/lib/studio/videoAssets.ts, so the label reader works on both. */
export function importPath(userId: string, ext: string, now = Date.now(), tail = Math.random().toString(36).slice(2, 8)): string {
  const safe = tail.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "x";
  return `${userId}/studio/video-${now}-${safe}.${ext}`;
}
