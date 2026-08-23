// OpenReel capture — the decisions the camera UI has to make, kept pure so they
// can be unit-tested without a real camera.
//
// Three things went wrong in the browser and are fixed here:
//
// 1. RECORDING FORMAT. The component asked for `video/webm` and, if that was
//    unsupported, still passed `video/webm` to the MediaRecorder constructor —
//    which throws on iOS Safari, because WebKit records MP4 and has never
//    supported WebM. Even when recording did work, the upload hard-coded a
//    `.webm` extension and `video/webm` content type, so a Safari MP4 would
//    have been stored under the wrong name and served with the wrong type.
//    `pickRecorderMimeType` negotiates instead of assuming, and the extension
//    is derived from what the recorder actually produced.
//
// 2. FILE SIZE. Recording with no bitrate ceiling let a 10-second clip run to
//    tens of megabytes on a modern phone — a real cost on African mobile data.
//    `chooseVideoBitrate` scales the ceiling to the capture resolution so the
//    clip stays high quality but predictable.
//
// 3. ZOOM. Cameras that expose no native zoom need the crop done in software.
//    `zoomCropRect` is that crop, and it is centre-anchored so 1x and 1.5x
//    frame the same subject.

// --- Adapting to the light in the room ---------------------------------------
//
// WHAT THE WEB ACTUALLY EXPOSES
//
// There is no HDR capture control in any browser: `getUserMedia` has no HDR
// constraint, and the tone-mapping a phone's native camera app does is not
// reachable from a web page. Claiming an "HDR mode" here would be untrue.
//
// What IS reachable, on devices that implement the Image Capture constraints
// (most modern Android Chrome; almost nothing on iOS Safari), is to hand control
// back to the camera's own continuous auto-adjustment: exposure, white balance
// and focus that keep re-metering as the scene changes. That is what makes a
// shop interior, a sunlit street and an evening market each come out usable
// rather than one of them being blown out or muddy — and it is the honest
// version of "adjusts to any environment".
//
// Every constraint is applied only if the track advertises it, and the whole
// thing is best-effort: a camera that supports none of it simply keeps its
// defaults, which is what happens today.

export interface CameraAdaptReport {
  /** Settings the camera accepted, for display/debugging. */
  applied: string[];
  /** True when the camera took at least one continuous mode. */
  adapted: boolean;
}

interface AdaptableTrack {
  getCapabilities?: () => Record<string, unknown>;
  applyConstraints?: (c: unknown) => Promise<void>;
}

/**
 * Ask the camera to continuously re-meter exposure, white balance and focus.
 *
 * `preferred` lists the continuous modes in the order they matter; each is only
 * requested when `getCapabilities()` says the device offers it, and a rejection
 * of one does not stop the others being tried.
 */
export async function applyAutoAdapt(track: AdaptableTrack | null | undefined): Promise<CameraAdaptReport> {
  const empty: CameraAdaptReport = { applied: [], adapted: false };
  if (!track || typeof track.applyConstraints !== 'function') return empty;

  let caps: Record<string, unknown> = {};
  if (typeof track.getCapabilities === 'function') {
    try { caps = track.getCapabilities() || {}; } catch { caps = {}; }
  }

  const supportsMode = (key: string, mode: string): boolean => {
    const values = caps[key];
    return Array.isArray(values) && values.includes(mode);
  };

  const wanted: { key: string; value: string }[] = [
    { key: 'exposureMode', value: 'continuous' },
    { key: 'whiteBalanceMode', value: 'continuous' },
    { key: 'focusMode', value: 'continuous' },
  ].filter((c) => supportsMode(c.key, c.value));

  const applied: string[] = [];
  for (const c of wanted) {
    try {
      await track.applyConstraints({ advanced: [{ [c.key]: c.value }] });
      applied.push(c.key);
    } catch {
      // This camera advertised the mode but refused it; try the next.
    }
  }

  return { applied, adapted: applied.length > 0 };
}

/** Zoom steps offered in the capture UI. */
export const ZOOM_STEPS = [0.5, 1, 2] as const;
export type ZoomStep = (typeof ZOOM_STEPS)[number];

// --- Manual camera controls ---------------------------------------------------
//
// Focus, brightness and zoom are exposed through MediaTrackCapabilities /
// applyConstraints. Every one of them is optional per device, so each is read
// before it is offered and the UI only shows controls the camera can honour.
// Nothing here throws: an unsupported control is simply absent.

export interface NumericRange { min: number; max: number; step: number }

/** A capability range, or null when the camera doesn't expose that control. */
export function readRange(
  caps: Record<string, unknown> | null | undefined,
  key: string,
): NumericRange | null {
  const raw = caps?.[key] as { min?: number; max?: number; step?: number } | undefined;
  if (!raw || typeof raw.min !== 'number' || typeof raw.max !== 'number') return null;
  if (!(raw.max > raw.min)) return null;
  // Some cameras omit step; a hundredth of the range is a usable default.
  const step = typeof raw.step === 'number' && raw.step > 0 ? raw.step : (raw.max - raw.min) / 100;
  return { min: raw.min, max: raw.max, step };
}

export interface CameraControls {
  zoom: NumericRange | null;
  focusDistance: NumericRange | null;
  /** Preferred brightness control: EV compensation, in stops. */
  exposureCompensation: NumericRange | null;
  /** Fallback brightness control on cameras without EV compensation. */
  brightness: NumericRange | null;
  focusModes: string[];
  exposureModes: string[];
  whiteBalanceModes: string[];
}

const modeList = (caps: Record<string, unknown>, key: string): string[] => {
  const v = caps[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
};

/** Everything this camera lets us control. Safe on any track. */
export function cameraControls(track: AdaptableTrack | null | undefined): CameraControls {
  let caps: Record<string, unknown> = {};
  if (track && typeof track.getCapabilities === 'function') {
    try { caps = track.getCapabilities() || {}; } catch { caps = {}; }
  }
  return {
    zoom: readRange(caps, 'zoom'),
    focusDistance: readRange(caps, 'focusDistance'),
    exposureCompensation: readRange(caps, 'exposureCompensation'),
    brightness: readRange(caps, 'brightness'),
    focusModes: modeList(caps, 'focusMode'),
    exposureModes: modeList(caps, 'exposureMode'),
    whiteBalanceModes: modeList(caps, 'whiteBalanceMode'),
  };
}

export function clampToRange(value: number, range: NumericRange): number {
  if (!Number.isFinite(value)) return range.min;
  return Math.min(range.max, Math.max(range.min, value));
}

/** Nudge a value one step up or down, staying inside the range. */
export function stepValue(current: number, range: NumericRange, direction: 1 | -1): number {
  const base = Number.isFinite(current) ? current : (range.min + range.max) / 2;
  return clampToRange(base + direction * range.step, range);
}

/** Midpoint of a range — the neutral starting point for brightness. */
export const midpointOf = (range: NumericRange): number => {
  // EV compensation ranges are usually centred on 0, which IS neutral.
  if (range.min <= 0 && range.max >= 0) return 0;
  return (range.min + range.max) / 2;
};

/**
 * Can this camera reach a zoom step?
 *
 * Zooming OUT past the lens is impossible: cropping only ever narrows the frame,
 * so a 0.5x ultra-wide has to come from hardware (a zoom range that goes below
 * 1, or a separate ultra-wide camera). Steps at or above 1 can always be faked
 * by cropping, so they are always available.
 */
export function zoomStepSupported(range: NumericRange | null, step: number): boolean {
  if (step >= 1) return true;
  if (!range) return false;
  // Ranges come in the camera's own units — usually 1..n, sometimes 100..n. The
  // MAXIMUM identifies which: an optical zoom expressed 1-based never reaches
  // 20x, so anything higher must be a 100-based scale. The minimum can't be used
  // for this, because a 100-based range that reaches 0.5x reports min 50.
  const scale = range.max > 20 ? 100 : 1;
  return step >= range.min / scale;
}

/** Does a device label look like an ultra-wide lens? Used to reach 0.5x. */
export function isUltraWideLabel(label: string): boolean {
  const l = (label || '').toLowerCase();
  if (/tele|telephoto|zoom lens|macro|depth|infrared/.test(l)) return false;
  return /ultra|0\.5|wide angle|wide-angle|ultrawide/.test(l);
}

/** Apply one numeric camera constraint. Resolves false if the camera refuses. */
export async function applyTrackValue(
  track: AdaptableTrack | null | undefined,
  key: string,
  value: number,
): Promise<boolean> {
  if (!track || typeof track.applyConstraints !== 'function') return false;
  try {
    await track.applyConstraints({ advanced: [{ [key]: value }] });
    return true;
  } catch {
    return false;
  }
}

/** Apply one camera mode (focusMode / exposureMode / whiteBalanceMode). */
export async function applyTrackMode(
  track: AdaptableTrack | null | undefined,
  key: string,
  mode: string,
  available: string[],
): Promise<boolean> {
  if (!track || typeof track.applyConstraints !== 'function') return false;
  if (!available.includes(mode)) return false;
  try {
    await track.applyConstraints({ advanced: [{ [key]: mode }] });
    return true;
  } catch {
    return false;
  }
}

export interface RecorderFormat {
  /** Pass to the MediaRecorder constructor, or undefined to let it choose. */
  mimeType: string | undefined;
  /** File extension for storage. */
  ext: string;
  /** Content type to store the object with. */
  contentType: string;
}

/**
 * Candidates in preference order. MP4/H.264 first because it is the only thing
 * iOS records, plays everywhere, and is what a business would expect to be able
 * to re-share; VP9 next for its smaller files on Chrome/Android.
 */
const VIDEO_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

/** Extension + content type for a MediaRecorder mimeType (which may carry codecs). */
export function formatForMimeType(mimeType: string | undefined): { ext: string; contentType: string } {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (base === 'video/mp4') return { ext: 'mp4', contentType: 'video/mp4' };
  if (base === 'video/webm') return { ext: 'webm', contentType: 'video/webm' };
  if (base === 'video/quicktime') return { ext: 'mov', contentType: 'video/quicktime' };
  // Unknown or empty (some browsers report '' until data arrives): WebM is the
  // safer default for a MediaRecorder blob than claiming MP4 it may not be.
  return { ext: 'webm', contentType: 'video/webm' };
}

/**
 * Choose a recording container this browser actually supports.
 *
 * `isSupported` is injected so this is testable and so a browser without
 * `MediaRecorder.isTypeSupported` (it is optional in the spec) degrades to
 * letting the constructor pick, rather than being handed a type that throws.
 */
export function pickRecorderMimeType(
  isSupported?: (type: string) => boolean,
): RecorderFormat {
  if (typeof isSupported === 'function') {
    for (const candidate of VIDEO_CANDIDATES) {
      let ok = false;
      try { ok = isSupported(candidate); } catch { ok = false; }
      if (ok) return { mimeType: candidate, ...formatForMimeType(candidate) };
    }
  }
  // Nothing advertised as supported — omit mimeType and read recorder.mimeType
  // afterwards instead of guessing now.
  return { mimeType: undefined, ext: 'webm', contentType: 'video/webm' };
}

/**
 * The gallery refuses videos over 50 MB (BusinessContentManager), and OpenReel
 * feeds that same gallery — so a recording that exceeds this is unusable no
 * matter how good it looks. The budget is set below the hard cap to leave room
 * for container overhead and for a browser that overshoots its bitrate hint.
 */
export const REEL_HARD_MAX_BYTES = 50 * 1024 * 1024;
export const REEL_SIZE_BUDGET_BYTES = 45 * 1024 * 1024;
/** Audio is recorded at a fixed rate and reserved out of the size budget. */
export const AUDIO_BITRATE = 128_000;

/** Bitrate a resolution deserves when size is not the binding constraint. */
function resolutionCeiling(width: number, height: number): number {
  const pixels = Math.max(0, width) * Math.max(0, height);
  if (pixels >= 1920 * 1080) return 4_500_000;
  if (pixels >= 1280 * 720) return 2_500_000;
  if (pixels > 0) return 1_500_000;
  return 2_500_000; // dimensions unknown yet — assume 720p
}

/**
 * Bitrate for a capture: high enough to stay visually clean, but capped so the
 * longest recording the plan allows still fits the upload budget. Omit
 * `maxSeconds` for the short-clip case, where resolution alone decides.
 */
export function chooseVideoBitrate(width: number, height: number, maxSeconds?: number): number {
  const ceiling = resolutionCeiling(width, height);
  if (!maxSeconds || maxSeconds <= 0) return ceiling;
  // The size budget is the binding constraint, not a preference: a recording
  // over the cap cannot be uploaded at all, so it always wins over bitrate.
  // Audio is reserved out of it so the estimate covers the whole file.
  const forVideo = Math.floor((REEL_SIZE_BUDGET_BYTES * 8) / maxSeconds) - AUDIO_BITRATE;
  return Math.max(1, Math.min(ceiling, forVideo));
}

/**
 * Resolution to ASK the camera for, given how long the recording may run.
 *
 * Longer recordings get proportionally fewer bits per second (see above), and
 * spending them on fewer, cleaner pixels beats smearing them across 1080p. The
 * steps are chosen so the bitrate the budget allows is reasonable *for that
 * resolution* — which is why the ladder drops as the limit grows.
 */
export function captureResolutionFor(maxSeconds: number): { width: number; height: number } {
  if (maxSeconds <= 90) return { width: 1920, height: 1080 };      // ~4.5 Mbps
  if (maxSeconds <= 6 * 60) return { width: 1280, height: 720 };   // ~1.1 Mbps
  if (maxSeconds <= 11 * 60) return { width: 854, height: 480 };   // ~0.5 Mbps
  return { width: 640, height: 360 };                              // ~0.19 Mbps
}

/** Rough finished size for a recording, so the UI can say so up front. */
export function estimatedBytes(videoBitrate: number, seconds: number): number {
  return Math.round(((videoBitrate + AUDIO_BITRATE) / 8) * Math.max(0, seconds));
}

/** Long edge of a generated share poster, in pixels. */
export const POSTER_MAX_EDGE = 1280;

/**
 * Grab a still frame from a recorded clip, for use as its share poster.
 *
 * A link preview's `og:image` has to be a real image — crawlers will not accept
 * an .mp4 there — so every reel needs one frame extracted and stored. Done here
 * on the device, at upload time, because the alternative is decoding video
 * server-side.
 *
 * Resolves null on any failure (unsupported codec, no canvas, metadata never
 * arrives). A reel without a poster still uploads and still plays; only its
 * share card falls back to the business cover.
 */
export async function captureVideoPoster(
  blob: Blob,
  atSeconds = 0.1,
  timeoutMs = 8000,
): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    const frame = await new Promise<Blob | null>((resolve) => {
      let settled = false;
      const finish = (result: Blob | null) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const timer = window.setTimeout(() => finish(null), timeoutMs);

      const draw = () => {
        window.clearTimeout(timer);
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return finish(null);
          // Keep the still small: link-preview crawlers (WhatsApp especially)
          // give up on a slow or heavy image, and a share card that silently
          // loses its thumbnail is the failure this poster exists to prevent.
          const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(w, h));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) return finish(null);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((b) => finish(b), 'image/jpeg', 0.8);
        } catch {
          finish(null);
        }
      };

      video.addEventListener('error', () => { window.clearTimeout(timer); finish(null); }, { once: true });
      // Seek first: at currentTime 0 some decoders have no frame to give.
      video.addEventListener('loadeddata', () => {
        const target = Math.min(atSeconds, Math.max(0, (video.duration || atSeconds) - 0.05));
        if (Number.isFinite(target) && target > 0) {
          video.addEventListener('seeked', draw, { once: true });
          try { video.currentTime = target; } catch { draw(); }
        } else {
          draw();
        }
      }, { once: true });

      video.src = url;
    });
    return frame;
  } catch {
    return null;
  } finally {
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* already gone */ }
    URL.revokeObjectURL(url);
  }
}

/** Seconds -> "m:ss" / "mm:ss" for a recording clock. */
export function formatRecordingClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface CropRect { sx: number; sy: number; sw: number; sh: number }

/**
 * Centre crop for a digital zoom factor. At 1x this is the whole frame, so the
 * same code path serves both steps and there is no untested branch at 1x.
 */
export function zoomCropRect(videoWidth: number, videoHeight: number, zoom: number): CropRect {
  const w = Math.max(0, videoWidth);
  const h = Math.max(0, videoHeight);
  const z = Number.isFinite(zoom) && zoom >= 1 ? zoom : 1;
  const sw = Math.round(w / z);
  const sh = Math.round(h / z);
  return { sx: Math.round((w - sw) / 2), sy: Math.round((h - sh) / 2), sw, sh };
}

/**
 * The zoom a camera track can do in hardware, clamped to what it advertises.
 * Returns null when the track exposes no zoom capability, which is the signal
 * to fall back to `zoomCropRect`. Reads defensively: `getCapabilities` is
 * unimplemented on Firefox and absent on older Safari.
 */
export function nativeZoomTarget(
  track: { getCapabilities?: () => { zoom?: { min?: number; max?: number } } } | null | undefined,
  desired: number,
): number | null {
  if (!track || typeof track.getCapabilities !== 'function') return null;
  let caps: { zoom?: { min?: number; max?: number } };
  try { caps = track.getCapabilities() || {}; } catch { return null; }
  const zoom = caps.zoom;
  if (!zoom || typeof zoom.max !== 'number' || typeof zoom.min !== 'number') return null;
  if (!(zoom.max > zoom.min)) return null;
  // Cameras report zoom in their own units: often 1..n, but some use 100..n.
  // Scale the desired multiplier onto the advertised range from its minimum.
  const target = zoom.min * desired;
  return Math.min(zoom.max, Math.max(zoom.min, target));
}
