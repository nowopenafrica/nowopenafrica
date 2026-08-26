// Shared plumbing for NowOpen Live: a browser-native WebRTC mesh (owner's
// camera → each viewer gets a direct peer connection), signaled over a
// Supabase Realtime channel used as a pub/sub bus. No third-party streaming
// account or media server — genuinely works today, at the cost of not
// supporting OBS/RTMP ingest and being best suited to a handful of
// concurrent viewers (broadcaster's upload bandwidth is the bottleneck,
// since every viewer gets its own copy of the outbound media).

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const channelName = (streamId: string) => `live-stream:${streamId}`;

const SESSION_KEY = 'nowopen_live_session_id';
const NAME_KEY = 'nowopen_live_display_name';

/** Stable per-browser id used for presence, chat attribution, and moderation. */
export function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `viewer-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `viewer-${Math.random().toString(36).slice(2)}`;
  }
}

export function getSavedDisplayName(): string {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

export function saveDisplayName(name: string) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* storage may be unavailable */ }
}

export function speechRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
}

export function getSpeechRecognition(): any | null {
  if (typeof window === 'undefined') return null;
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

// Adaptive-bitrate budget for the WebRTC mesh: the broadcaster sends a
// separate copy of the stream to every viewer (no SFU), so total upload
// usage scales with viewer count. Split a fixed upload budget across active
// viewers — bounded so a single viewer isn't wastefully high-bitrate, and
// many viewers don't get squeezed below watchable — rather than a flat
// per-connection cap that would either waste bandwidth or overload the
// broadcaster's uplink as the audience grows.
export const UPLOAD_BUDGET_BPS = 4_000_000; // ~4 Mbps total, safe for most home/mobile uplinks
export const MIN_VIEWER_BITRATE_BPS = 150_000;
export const MAX_VIEWER_BITRATE_BPS = 1_500_000;

export function computePerViewerBitrate(viewerCount: number): number {
  const share = UPLOAD_BUDGET_BPS / Math.max(1, viewerCount);
  return Math.round(Math.min(MAX_VIEWER_BITRATE_BPS, Math.max(MIN_VIEWER_BITRATE_BPS, share)));
}

// Resolution/framerate preferences so the encoder doesn't start out heavier
// than the network can realistically carry — WebRTC's own congestion control,
// plus the bitrate cap above, then adapts further as conditions change.
//
// NOTE THE ABSENT `max` ON WIDTH AND HEIGHT. It used to be there, and it cost
// owners their framing: `width.max: 1280` with `height.max: 720` rejects a
// portrait 720x1280 frame, so a phone held upright — which is how a phone is
// held — was forced to hand back a landscape frame. The broadcast then showed a
// letterboxed middle strip of whatever the owner was pointing at.
//
// `ideal` still steers to roughly 720p, in whichever orientation the device is
// actually in, and bandwidth is governed where it should be: by the per-viewer
// bitrate cap above, applied through RTCRtpSender.setParameters. Capping pixels
// to control bandwidth was doing that job twice, and badly.
export const CAMERA_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
};

export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

// Keeps recorded replay files small and fast to upload/play back, instead
// of MediaRecorder's much heavier browser default.
export const REPLAY_VIDEO_BITRATE_BPS = 1_500_000;

export const CAPTION_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'sw', label: 'Kiswahili' },
  { code: 'yo', label: 'Yorùbá' },
  { code: 'ha', label: 'Hausa' },
  { code: 'ar', label: 'العربية' },
  { code: 'pt', label: 'Português' },
];
