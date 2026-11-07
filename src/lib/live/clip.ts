/**
 * Clipping the last few seconds of a live broadcast.
 *
 * ── HOW THIS IS POSSIBLE AT ALL ──────────────────────────────────────────
 *
 * The broadcaster already records the whole session for replay:
 * `useBroadcastStream` runs a MediaRecorder with `start(1000)`, so one Blob
 * arrives per second. A clip is therefore not a new recording — it is a
 * selection out of one that is already running, which is why clipping costs
 * nothing extra while live and cannot drop a frame.
 *
 * ── THE ONE RULE THAT MAKES A CLIP PLAYABLE ──────────────────────────────
 *
 * The FIRST chunk is not video. It is the initialisation segment: the EBML
 * header for WebM, or `ftyp` + `moov` for fragmented MP4. It carries the
 * codec, resolution and track layout, and every later chunk is meaningless
 * without it. Take chunks 40-70 on their own and you get a file no player
 * will open; prepend chunk 0 and you get one they will.
 *
 * So every clip is [init, ...window]. That is the whole trick, and getting
 * it wrong produces a file that is exactly the right size and completely
 * unplayable — the kind of failure a customer discovers, not a developer.
 *
 * ── WHAT THIS CANNOT PROMISE ─────────────────────────────────────────────
 *
 * The fragments keep the timestamps they were recorded with, so a clip taken
 * forty seconds into a broadcast begins at forty seconds rather than zero.
 * Players handle that differently: most play it straight through, some show
 * an odd duration or seek strangely. Normalising it means remuxing, which
 * means a demuxer in the browser, which is a far larger thing than this.
 *
 * This is stated rather than hidden because the alternative is a feature
 * that works on the machine it was written on.
 */

/** The lengths offered, in seconds. */
export const CLIP_LENGTHS = [15, 30, 60, 90] as const;
export type ClipLength = (typeof CLIP_LENGTHS)[number];

/** The longest clip, and so the only amount of video worth keeping. */
export const MAX_CLIP_SECONDS: ClipLength = 90;

/**
 * A recorded chunk and the moment it arrived.
 *
 * The timestamp is the recorder's, not the clock's: a tab that is
 * backgrounded gets throttled and its chunks stop arriving every second, so
 * counting chunks would silently produce a 30-second clip holding two
 * minutes of video. Time is measured, never inferred from the count.
 */
export interface ClipChunk {
  blob: Blob;
  /** performance.now()-style milliseconds when the chunk was delivered. */
  atMs: number;
}

/**
 * Drop what no clip could ever need.
 *
 * The init chunk is kept forever — without it nothing else is usable — and
 * then only the last `MAX_CLIP_SECONDS` of video. At the replay bitrate that
 * is roughly 17MB held in memory, which is affordable; keeping a two-hour
 * broadcast would not be.
 *
 * NOTE: this is for the CLIP buffer only. The replay recording keeps all of
 * its chunks, because the replay is the whole broadcast.
 */
export function trimClipBuffer(
  chunks: readonly ClipChunk[],
  nowMs: number,
  keepSeconds: number = MAX_CLIP_SECONDS,
): ClipChunk[] {
  if (chunks.length <= 1) return [...chunks];
  const [init, ...rest] = chunks;
  /* A second of slack, so the newest full-length clip is never one chunk short. */
  const cutoff = nowMs - (keepSeconds + 2) * 1000;
  return [init, ...rest.filter((c) => c.atMs >= cutoff)];
}

export interface ClipSelection {
  /** Init chunk first, then the window, in order. */
  parts: Blob[];
  /** How much video this really covers — never more than was recorded. */
  seconds: number;
  /** True when the broadcast is younger than the length that was asked for. */
  short: boolean;
}

/**
 * The chunks that make up the last `seconds` of broadcast.
 *
 * Returns null when there is nothing to clip yet: a broadcast one second old
 * has an init segment and nothing else, and handing back a file containing
 * only a header is worse than refusing.
 */
export function selectClip(
  chunks: readonly ClipChunk[],
  seconds: ClipLength,
  nowMs: number,
): ClipSelection | null {
  if (chunks.length < 2) return null;
  const [init, ...rest] = chunks;
  const from = nowMs - seconds * 1000;
  /*
   * Strictly after, not on.
   *
   * A chunk's timestamp is when it FINISHED, so the chunk sitting exactly on
   * the boundary holds the second before the window opens. Including it made
   * every clip one second long than asked for — 16 chunks in a 15-second
   * clip — which is the sort of error that survives review because the file
   * still plays.
   */
  const window = rest.filter((c) => c.atMs > from);
  if (!window.length) return null;

  /*
   * Measured from the chunk BEFORE the first one kept, because a chunk's
   * timestamp is when it finished, not when it started. Using the first
   * kept chunk's own time understates every clip by about a second.
   */
  const firstKeptIndex = rest.indexOf(window[0]);
  const startedAt = firstKeptIndex > 0 ? rest[firstKeptIndex - 1].atMs : init.atMs;
  const covered = (window[window.length - 1].atMs - startedAt) / 1000;

  return {
    parts: [init.blob, ...window.map((c) => c.blob)],
    seconds: Math.max(0, Math.round(covered * 10) / 10),
    short: covered < seconds - 1.5,
  };
}

/** Which lengths are worth offering, given how long this has been running. */
export function availableLengths(recordedSeconds: number): ClipLength[] {
  /*
   * A length is offered as soon as there is SOMETHING to put in it, not only
   * when it can be filled — somebody thirty seconds in should still be able
   * to take a clip, and `selectClip` tells them it came out short. Below
   * three seconds nothing is worth offering at all.
   */
  if (recordedSeconds < 3) return [];
  return [...CLIP_LENGTHS];
}

/** A filename that says what it is without needing the page it came from. */
export function clipFileName(
  businessName: string | null | undefined,
  seconds: number,
  extension: string,
  at: Date = new Date(),
): string {
  const slug = (businessName || 'nowopen-live')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'nowopen-live';
  const stamp = [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, '0'),
    String(at.getDate()).padStart(2, '0'),
    String(at.getHours()).padStart(2, '0'),
    String(at.getMinutes()).padStart(2, '0'),
  ].join('');
  return `${slug}-clip-${Math.round(seconds)}s-${stamp}.${extension.replace(/^\./, '')}`;
}
