// Turning a pasted video link into a short, compressed background clip.
//
// WHAT CAN AND CANNOT BE EXTRACTED
//
// A DIRECT FILE URL (.mp4, .webm, …) can be trimmed and re-encoded here: the
// browser loads it, frames are drawn to a canvas and re-recorded through
// MediaRecorder. The result lives in memory as a Blob and is never uploaded —
// it exists only to render the design you download.
//
// A PLATFORM LINK (YouTube, TikTok, Instagram, Facebook) cannot. Those services
// do not expose the underlying media: the stream sits behind signed, short-lived,
// geo-fenced URLs, the page is cross-origin so its <iframe> cannot be read into a
// canvas, and pulling the file would need server-side extraction that breaches
// their terms. There is no client-side route to it at all — so the UI has to say
// so rather than appear to work.
//
// Two further limits worth knowing on a direct URL:
//   • The host must send CORS headers. Without them the browser will not let a
//     canvas read the frames (the canvas becomes tainted), so trimming fails.
//     Supabase Storage does send them; a random web host often does not.
//   • Trimming happens in real time — capturing 60 seconds takes 60 seconds,
//     because the frames have to play to be recorded.

import { pickRecorderMimeType, formatForMimeType } from './openReel';

/** Longest background clip taken from a link. */
export const BACKGROUND_CLIP_SECONDS = 60;
/** Long edge of the re-encoded clip: plenty for a backdrop, far smaller. */
export const BACKGROUND_CLIP_MAX_EDGE = 1280;
/** Bitrate for the re-encode — a background sits behind text, so this is ample. */
export const BACKGROUND_CLIP_BITRATE = 2_000_000;

export interface ExtractedClip {
  /** In-memory only. Never uploaded; revoke the URL when finished with it. */
  blob: Blob;
  url: string;
  seconds: number;
  width: number;
  height: number;
}

/** How long to capture: the clip's own length, capped. */
export function clipDurationFor(sourceSeconds: number, cap = BACKGROUND_CLIP_SECONDS): number {
  if (!Number.isFinite(sourceSeconds) || sourceSeconds <= 0) return cap;
  return Math.min(cap, sourceSeconds);
}

/** Output size for the re-encode, preserving aspect and capping the long edge. */
export function clipOutputSize(
  width: number,
  height: number,
  maxEdge = BACKGROUND_CLIP_MAX_EDGE,
): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  // Even dimensions: some encoders reject odd ones.
  const even = (n: number) => Math.max(2, Math.round(n * scale / 2) * 2);
  return { width: even(w), height: even(h) };
}

export interface ExtractProgress { (fraction: number, seconds: number): void }

/**
 * Trim and compress the first `seconds` of a direct video URL, in the browser.
 *
 * Rejects with a readable reason rather than resolving empty, because the caller
 * shows it to the person who pasted the link. The returned object owns an object
 * URL the caller must revoke.
 */
export async function extractBackgroundClip(
  sourceUrl: string,
  seconds = BACKGROUND_CLIP_SECONDS,
  onProgress?: ExtractProgress,
): Promise<ExtractedClip> {
  if (typeof window === 'undefined' || !window.MediaRecorder) {
    throw new Error('This browser can\'t re-encode video.');
  }

  const video = document.createElement('video');
  // Required for the canvas to be readable; without it the draw below taints it.
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = sourceUrl;

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('That video took too long to load.')), 20000);
    video.addEventListener('loadedmetadata', () => { window.clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener('error', () => {
      window.clearTimeout(timer);
      reject(new Error('That video couldn\'t be loaded — the host may not allow other sites to read it.'));
    }, { once: true });
  });

  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('That link doesn\'t appear to be a playable video file.');
  }

  const take = clipDurationFor(video.duration, seconds);
  const size = clipOutputSize(video.videoWidth, video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') {
    throw new Error('This browser can\'t re-encode video.');
  }

  const format = pickRecorderMimeType(
    MediaRecorder.isTypeSupported ? (t) => MediaRecorder.isTypeSupported(t) : undefined,
  );
  const stream = canvas.captureStream(30);
  const options: MediaRecorderOptions = { videoBitsPerSecond: BACKGROUND_CLIP_BITRATE };
  if (format.mimeType) options.mimeType = format.mimeType;

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, options);
  } catch {
    recorder = new MediaRecorder(stream);
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  let raf = 0;
  const cleanup = () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* stopped */ } });
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* gone */ }
  };

  try {
    // A CORS-less source throws here on the first draw, which is the only place
    // the taint becomes visible.
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.getImageData(0, 0, 1, 1);
    } catch {
      throw new Error('That host doesn\'t allow its video to be re-used. Upload the file instead.');
    }

    video.currentTime = 0;
    await video.play();
    recorder.start(250);

    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const draw = () => {
        const elapsed = (performance.now() - startedAt) / 1000;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        onProgress?.(Math.min(1, elapsed / take), Math.min(take, elapsed));
        if (elapsed >= take || video.ended) { resolve(); return; }
        raf = requestAnimationFrame(draw);
      };
      draw();
    });

    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: formatForMimeType(recorder.mimeType || format.mimeType).contentType }));
    });
    recorder.stop();
    const blob = await finished;
    if (!blob.size) throw new Error('Nothing could be captured from that video.');

    return {
      blob,
      url: URL.createObjectURL(blob),
      seconds: take,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    cleanup();
  }
}
