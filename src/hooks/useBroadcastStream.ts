import { useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  RTC_CONFIG, channelName, getSpeechRecognition, speechRecognitionSupported,
  CAMERA_CONSTRAINTS, MIC_CONSTRAINTS, REPLAY_VIDEO_BITRATE_BPS, computePerViewerBitrate,
} from '../lib/liveStream';
import {
  coverCropRect, containRect, videoConstraintsFor, oppositeFacing, canFlipCamera,
  applyAutoAdapt, cameraControls, applyPointOfInterest, applyTrackValue,
  nativeZoomTarget, clampToRange,
  type FacingMode, type CameraControls,
} from '../lib/openReel';
import { livePosterPath, LIVE_POSTER_BUCKET } from '../lib/liveShare';
import { PIN_EVENT, type PinPayload } from '../lib/livePin';
import type { RealtimeChannel } from '@supabase/supabase-js';

/** Frames per second the replay is drawn and encoded at. */
export const REPLAY_FPS = 30;

interface RecordingPump {
  /** The stream handed to MediaRecorder. Its tracks never change. */
  stream: MediaStream;
  /** Point the pump at a different camera without interrupting the recording. */
  setSource: (track: MediaStreamTrack) => void;
  stop: () => void;
}

/**
 * A recording source that survives a camera swap.
 *
 * MediaRecorder records the tracks a stream had when start() was called, and
 * the spec is explicit that adding or removing tracks afterwards is an error —
 * Chrome fires onerror and stops. So flipping the camera mid-broadcast would
 * end the replay at the moment of the flip, silently, and the owner would only
 * find out afterwards.
 *
 * Drawing the camera into a canvas and recording canvas.captureStream() gives
 * the recorder one track that never changes; flipping just re-points the
 * offscreen <video> the canvas copies from. Viewers are unaffected either way —
 * they get the camera track directly through replaceTrack, not this canvas.
 *
 * Driven by setInterval rather than requestAnimationFrame on purpose: rAF stops
 * completely when the broadcaster switches apps, which would freeze the replay,
 * whereas a background interval is throttled to about a second. A low-framerate
 * replay is a far better outcome than a frozen one.
 */
async function createRecordingPump(
  track: MediaStreamTrack,
  audio: MediaStreamTrack | null,
): Promise<RecordingPump | null> {
  if (typeof document === 'undefined') return null;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  try { await video.play(); } catch { /* autoplay of a muted local stream */ }

  // Sized from the frame that actually arrives, NOT from track.getSettings().
  //
  // The two disagree, and the disagreement is exactly the bug: iOS Safari
  // reports the sensor in its native landscape while the <video> element
  // exposes the rotation-applied size, so a phone held upright reported
  // 1280x720 and delivered 720x1280. The canvas was then built landscape and
  // the upright frame was cropped to a middle strip — the owner's head and
  // hands recorded off-frame.
  for (let i = 0; i < 20 && !video.videoWidth; i++) {
    await new Promise((r) => window.setTimeout(r, 100));
  }
  const width = video.videoWidth || track.getSettings().width || 1280;
  const height = video.videoHeight || track.getSettings().height || 720;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') {
    video.srcObject = null;
    return null;
  }

  const timer = setInterval(() => {
    if (!video.videoWidth) return;
    // CONTAIN, not cover. The canvas cannot be resized once MediaRecorder is
    // running, so a flip to a camera of a different shape has to fit inside the
    // one the recording started with — and for a replay, the part that hangs
    // over the edge is the part the owner was pointing at. Letterbox bars are a
    // far better outcome than a cropped frame. Same-device cameras almost
    // always share an aspect, so in practice this draws edge to edge.
    const fit = containRect(video.videoWidth, video.videoHeight, canvas.width, canvas.height);
    if (fit.dw !== canvas.width || fit.dh !== canvas.height) {
      // Clear first, or the bars keep whatever the previous camera left there.
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(video, fit.dx, fit.dy, fit.dw, fit.dh);
  }, Math.round(1000 / REPLAY_FPS));

  const stream = canvas.captureStream(REPLAY_FPS);
  if (audio) stream.addTrack(audio);

  return {
    stream,
    setSource: (next: MediaStreamTrack) => {
      video.srcObject = new MediaStream([next]);
      video.play().catch(() => {});
    },
    stop: () => {
      clearInterval(timer);
      video.srcObject = null;
      stream.getVideoTracks().forEach((t) => t.stop());
    },
  };
}

/**
 * The share poster: one frame from the broadcast itself.
 *
 * A shared live link unfurls as a still, because a WebRTC stream has no URL a
 * crawler could play (see src/lib/liveShare.ts). Without this the card falls
 * back to the business's cover photo, which says nothing about what is
 * happening right now — the whole reason someone taps a live link.
 *
 * Taken a few seconds in, not immediately: at t=0 the camera is still opening
 * its aperture and the frame is usually black or blown out, and a black poster
 * is worse than no poster.
 *
 * Taken ONCE. Refreshing it while live would mostly be wasted upload — every
 * platform caches an unfurl per URL and will not come back for a new image —
 * and every refresh fights the storage CDN's own cache.
 */
const POSTER_DELAY_MS = 3500;
const POSTER_WIDTH = 1200;
const POSTER_HEIGHT = 630;

async function capturePoster(stream: MediaStream, id: string): Promise<void> {
  if (typeof document === 'undefined') return;
  if (!stream.getVideoTracks().length) return;

  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
    // play() can resolve before the first frame has decoded, and a canvas drawn
    // from a 0x0 video is a blank poster.
    for (let i = 0; i < 20 && !video.videoWidth; i++) {
      await new Promise((r) => window.setTimeout(r, 100));
    }
    if (!video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = POSTER_WIDTH;
    canvas.height = POSTER_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Crop the way every platform crops a wide card, rather than letting them
    // do it to a squeezed image: a portrait phone frame keeps its middle.
    const crop = coverCropRect(video.videoWidth, video.videoHeight, POSTER_WIDTH, POSTER_HEIGHT, 1);
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, POSTER_WIDTH, POSTER_HEIGHT);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) return;

    await supabase.storage
      .from(LIVE_POSTER_BUCKET)
      .upload(livePosterPath(id), blob, { upsert: true, contentType: 'image/jpeg' });
  } catch (err) {
    // A poster is a nicety. Nothing here may interrupt a broadcast.
    console.warn('Live poster capture failed:', err);
  } finally {
    video.srcObject = null;
  }
}

interface SignalPayload {
  viewerId: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  to?: string;
  from?: string;
}

/** Owner-side: capture the camera, mesh a peer connection out to every
 * viewer that shows up, record locally for replay, and caption via the
 * browser's built-in speech recognition where available.
 *
 * `start(id)` takes the stream id as a direct argument rather than a hook
 * parameter — a caller that does `setStreamId(id); broadcaster.start()` in
 * the same tick would otherwise capture a stale closure of `start` built
 * from the *previous* render (where streamId was still null), silently
 * no-op, and never call getUserMedia at all. */
export function useBroadcastStream() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [currentCaption, setCurrentCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Camera state, mirroring what OpenReel already offers so an owner does not
  // meet two different cameras in one product.
  const [facing, setFacing] = useState<FacingMode>('environment');
  const [canFlip, setCanFlip] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [controls, setControls] = useState<CameraControls | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pinned, setPinned] = useState<PinPayload | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const recorderRef = useRef<MediaRecorder | null>(null);
  // The stream new viewers are given. Held in a ref, not a closure: after a
  // camera flip the old closure still points at a stopped track, so a viewer
  // arriving after the flip would connect to a dead camera.
  const outboundStreamRef = useRef<MediaStream | null>(null);
  const pumpRef = useRef<RecordingPump | null>(null);
  const facingRef = useRef<FacingMode>('environment');
  // What is pinned right now. Kept in a ref as well as state so it can be
  // re-sent to a viewer who joins mid-broadcast — a broadcast event reaches
  // only the people who were already listening, so without this anyone
  // arriving after the pin sees nothing on screen.
  const pinRef = useRef<PinPayload | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const speechRef = useRef<any | null>(null);
  const allViewersSeenRef = useRef<Set<string>>(new Set());
  const peakViewersRef = useRef(0);
  const analyticsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const posterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamIdRef = useRef<string | null>(null);
  // A viewer's ICE candidates can start arriving before its offer has been
  // processed (offers are retried on a delay from the viewer side, so the
  // two aren't guaranteed to arrive in a tidy order) — buffer by viewerId
  // until a peer connection exists for them, instead of silently dropping.
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const closePeer = (viewerId: string) => {
    const pc = peersRef.current.get(viewerId);
    if (pc) { pc.close(); peersRef.current.delete(viewerId); }
    pendingCandidatesRef.current.delete(viewerId);
  };

  // Re-splits the upload budget across however many viewers are currently
  // connected and pushes the new ceiling to every active sender — called
  // whenever a viewer joins/leaves so bandwidth reallocates automatically.
  const rebalanceBitrates = useCallback(() => {
    const bps = computePerViewerBitrate(peersRef.current.size);
    peersRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (!sender) return;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = bps;
      (params as any).degradationPreference = 'balanced';
      sender.setParameters(params).catch(() => {});
    });
  }, []);

  const handleViewerOffer = useCallback(async (payload: SignalPayload) => {
    const channel = channelRef.current;
    const stream = outboundStreamRef.current;
    if (!channel || !payload.sdp || !stream) return;
    closePeer(payload.viewerId);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(payload.viewerId, pc);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    rebalanceBitrates();
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        channel.send({ type: 'broadcast', event: 'ice-candidate', payload: { to: payload.viewerId, from: 'broadcaster', candidate: e.candidate.toJSON() } });
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    channel.send({ type: 'broadcast', event: 'broadcaster-answer', payload: { viewerId: payload.viewerId, sdp: answer } });

    const buffered = pendingCandidatesRef.current.get(payload.viewerId);
    if (buffered) {
      pendingCandidatesRef.current.delete(payload.viewerId);
      buffered.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
    }

    // Catch the new arrival up on what is currently pinned.
    if (pinRef.current) {
      channel.send({ type: 'broadcast', event: PIN_EVENT, payload: pinRef.current });
    }
  }, [rebalanceBitrates]);

  const start = useCallback(async (id: string, opts?: { video?: boolean; audio?: boolean; facing?: FacingMode }) => {
    if (!id) return;
    streamIdRef.current = id;
    setError(null);
    try {
      // Ask for a specific camera. Live previously asked for none at all, so on
      // a phone the browser chose — nearly always the selfie camera, which is
      // the wrong one for showing a shop, a workshop or stock.
      const wanted = opts?.facing ?? facingRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: opts?.video === false
          ? false
          : { ...CAMERA_CONSTRAINTS, ...videoConstraintsFor(wanted, 1280, 720, 30) },
        audio: opts?.audio === false ? false : MIC_CONSTRAINTS,
      });
      facingRef.current = wanted;
      setFacing(wanted);
      setLocalStream(stream);
      outboundStreamRef.current = stream;

      // The same metering pass OpenReel runs, so a stream from a dim shop or a
      // sunlit street is watchable without the owner touching anything.
      const camTrack = stream.getVideoTracks()[0] as unknown as Parameters<typeof applyAutoAdapt>[0] | undefined;
      if (camTrack) {
        await applyAutoAdapt(camTrack);
        setControls(cameraControls(camTrack));
      }
      setTorchOn(false);
      setZoom(1);

      try {
        const devices = await navigator.mediaDevices?.enumerateDevices?.();
        setCanFlip(canFlipCamera(devices));
      } catch {
        setCanFlip(false);
      }

      const channel = supabase.channel(channelName(id), { config: { presence: { key: 'broadcaster' } } });
      channelRef.current = channel;

      channel.on('broadcast', { event: 'viewer-offer' }, ({ payload }) => {
        allViewersSeenRef.current.add(payload.viewerId);
        handleViewerOffer(payload as SignalPayload);
      });
      channel.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
        const p = payload as SignalPayload;
        if (p.to !== 'broadcaster' || !p.from || !p.candidate) return;
        const pc = peersRef.current.get(p.from);
        if (pc) {
          pc.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(() => {});
        } else {
          const queue = pendingCandidatesRef.current.get(p.from) ?? [];
          queue.push(p.candidate);
          pendingCandidatesRef.current.set(p.from, queue);
        }
      });
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ role: string }>();
        const viewers = Object.entries(state).filter(([key]) => key !== 'broadcaster');
        const count = viewers.length;
        setViewerCount(count);
        peakViewersRef.current = Math.max(peakViewersRef.current, count);
      });
      channel.on('presence', { event: 'leave' }, ({ key }) => {
        if (key !== 'broadcaster') { closePeer(key); rebalanceBitrates(); }
      });

      await new Promise<void>((resolve) => {
        channel.subscribe((status) => { if (status === 'SUBSCRIBED') resolve(); });
      });
      await channel.track({ role: 'broadcaster' });

      // Local recording for replay support — no external service needed.
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
      chunksRef.current = [];
      // Recorded through the pump so a camera flip does not end the replay —
      // see createRecordingPump. Falls back to the camera stream where canvas
      // capture is unavailable, which costs the flip its seamlessness but never
      // costs the replay entirely.
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0] || null;
      pumpRef.current = videoTrack ? await createRecordingPump(videoTrack, audioTrack) : null;
      const recordStream = pumpRef.current?.stream ?? stream;
      const recorder = new MediaRecorder(recordStream, { mimeType, videoBitsPerSecond: REPLAY_VIDEO_BITRATE_BPS });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(1000);
      recorderRef.current = recorder;

      if (speechRecognitionSupported()) {
        const rec = getSpeechRecognition();
        if (rec) {
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';
          rec.onresult = (e: any) => {
            let finalText = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const result = e.results[i];
              if (result.isFinal) finalText += result[0].transcript;
              else setCurrentCaption(result[0].transcript);
            }
            if (finalText.trim()) {
              const text = finalText.trim();
              setCurrentCaption(text);
              channel.send({ type: 'broadcast', event: 'caption', payload: { text } });
              supabase.from('stream_captions').insert([{ stream_id: id, text, lang: 'en' }]).then(() => {});
            }
          };
          rec.onerror = () => { /* mic/permission hiccups shouldn't kill the broadcast */ };
          rec.onend = () => { if (captionsOn) { try { rec.start(); } catch { /* already running */ } } };
          speechRef.current = rec;
        }
      }

      analyticsTimerRef.current = setInterval(() => {
        supabase.from('business_streams').update({
          current_viewers: peersRef.current.size,
          peak_viewers: peakViewersRef.current,
          total_viewers: allViewersSeenRef.current.size,
        }).eq('id', id).then(() => {});
      }, 5000);

      posterTimerRef.current = setTimeout(() => { capturePoster(stream, id); }, POSTER_DELAY_MS);

      setIsLive(true);
    } catch (err: any) {
      console.error('Failed to start broadcast:', err);
      setError(err?.message || 'Could not access your camera/microphone.');
    }
  }, [handleViewerOffer, rebalanceBitrates]);

  /** The camera track currently going out, cast past the DOM typings. */
  const cameraTrack = useCallback(() => (
    outboundStreamRef.current?.getVideoTracks()[0] as unknown as Parameters<typeof applyAutoAdapt>[0] | undefined
  ), []);

  /**
   * Swap between the front and back cameras mid-broadcast.
   *
   * Three things have to happen together, and missing any one of them shows:
   *
   *  - Every peer connection gets the new track through replaceTrack, which
   *    swaps the source WITHOUT renegotiating. Removing and re-adding the track
   *    instead would make every viewer's picture drop while SDP is exchanged.
   *  - outboundStreamRef is updated, so a viewer who joins after the flip is
   *    given the camera that is actually running.
   *  - The recording pump is re-pointed, so the replay follows the flip instead
   *    of ending at it.
   *
   * Video only: the microphone track is deliberately kept, because reopening it
   * would break the recorder (its audio track must not change) and would drop a
   * word or two of whatever the owner was saying.
   */
  const flipCamera = useCallback(async () => {
    const current = outboundStreamRef.current;
    if (!current || flipping) return;
    setFlipping(true);
    const target = oppositeFacing(facingRef.current);
    const previous = current.getVideoTracks()[0];

    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { ...CAMERA_CONSTRAINTS, ...videoConstraintsFor(target, 1280, 720, 30) },
        audio: false,
      });
      const nextTrack = next.getVideoTracks()[0];
      if (!nextTrack) { next.getTracks().forEach((t) => t.stop()); return; }

      await Promise.all(
        Array.from(peersRef.current.values()).map((pc) => {
          const sender = pc.getSenders().find((sd) => sd.track?.kind === 'video');
          return sender ? sender.replaceTrack(nextTrack).catch(() => {}) : Promise.resolve();
        }),
      );

      const audio = current.getAudioTracks();
      const composed = new MediaStream([nextTrack, ...audio]);
      outboundStreamRef.current = composed;
      setLocalStream(composed);
      pumpRef.current?.setSource(nextTrack);

      // Only now is the old camera released — stopping it before the new one is
      // live would blank both the preview and every viewer.
      previous?.stop();

      facingRef.current = target;
      setFacing(target);

      const adapted = nextTrack as unknown as Parameters<typeof applyAutoAdapt>[0];
      await applyAutoAdapt(adapted);
      setControls(cameraControls(adapted));
      // The new camera has its own lamp and its own zoom range; carrying the old
      // camera's state across would leave the UI describing a lens that is no
      // longer open.
      setTorchOn(false);
      setZoom(1);
    } catch (err) {
      console.warn('Camera flip failed:', err);
      setError('Could not switch camera — the other one may be in use.');
    } finally {
      setFlipping(false);
    }
  }, [flipping]);

  /**
   * Focus where the owner tapped, in coordinates normalised to the preview.
   *
   * Continuous autofocus is switched off by the tap, because otherwise the
   * camera wanders straight back off the spot it was just given.
   */
  const focusAt = useCallback(async (x: number, y: number): Promise<boolean> => {
    const track = cameraTrack();
    if (!track || !controls?.pointsOfInterest) return false;
    return applyPointOfInterest(track, x, y, controls.focusModes);
  }, [cameraTrack, controls]);

  /** The lamp. Worth having on a live stream in a back room or after dark. */
  const toggleTorch = useCallback(async () => {
    const track = cameraTrack();
    if (!track || !controls?.torch) return;
    const next = !torchOn;
    const ok = await applyTrackValue(track, 'torch', next as unknown as number);
    if (ok) setTorchOn(next);
  }, [cameraTrack, controls, torchOn]);

  /**
   * Hardware zoom only.
   *
   * OpenReel can fall back to cropping because it owns the canvas it captures
   * from; here the frame goes straight to the peer connections, so a crop would
   * mean re-encoding every frame on the broadcaster's phone while it is already
   * encoding for every viewer. A camera that cannot zoom simply does not offer
   * the control.
   */
  const applyZoom = useCallback(async (value: number) => {
    const track = cameraTrack();
    if (!track || !controls?.zoom) return;
    const next = clampToRange(value, controls.zoom);
    const target = nativeZoomTarget(
      track as unknown as { getCapabilities?: () => { zoom?: { min?: number; max?: number } } },
      next / (controls.zoom.min || 1),
    );
    const ok = await applyTrackValue(track, 'zoom', target ?? next);
    if (ok) setZoom(next);
  }, [cameraTrack, controls]);

  /**
   * Put an item on every viewer's screen, or take it off.
   *
   * Only the id travels — see src/lib/livePin.ts for why a price must never
   * cross this channel.
   */
  const pinItem = useCallback((payload: PinPayload | null) => {
    const channel = channelRef.current;
    pinRef.current = payload;
    setPinned(payload);
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: PIN_EVENT,
      // Unpinning is a pin with no id, so viewers clear the card rather than
      // being left with the last thing that was shown.
      payload: payload ?? { itemId: null, source: 'product', moduleKey: 'none' },
    });
  }, []);

  const toggleCaptions = useCallback(() => {
    setCaptionsOn((prev) => {
      const next = !prev;
      const rec = speechRef.current;
      if (rec) {
        try { if (next) rec.start(); else rec.stop(); } catch { /* start/stop race is harmless */ }
      }
      if (!next) setCurrentCaption('');
      return next;
    });
  }, []);

  const toggleMic = useCallback(() => {
    setMicOn((prev) => {
      const next = !prev;
      localStream?.getAudioTracks().forEach((t) => { t.enabled = next; });
      return next;
    });
  }, [localStream]);

  const toggleCam = useCallback(() => {
    setCamOn((prev) => {
      const next = !prev;
      localStream?.getVideoTracks().forEach((t) => { t.enabled = next; });
      return next;
    });
  }, [localStream]);

  const stop = useCallback(async () => {
    const id = streamIdRef.current;
    if (analyticsTimerRef.current) clearInterval(analyticsTimerRef.current);
    if (posterTimerRef.current) clearTimeout(posterTimerRef.current);
    if (speechRef.current) { try { speechRef.current.stop(); } catch { /* ignore */ } }

    let recordingUrl: string | null = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recordingUrl = await new Promise<string | null>((resolve) => {
        recorder.onstop = async () => {
          try {
            const blob = new Blob(chunksRef.current, { type: 'video/webm' });
            if (blob.size === 0 || !id) { resolve(null); return; }
            const path = `live/${id}.webm`;
            const { error: uploadError } = await supabase.storage.from('business-images').upload(path, blob, { upsert: true, contentType: 'video/webm' });
            if (uploadError) { console.warn('Replay upload failed:', uploadError.message); resolve(null); return; }
            const { data } = supabase.storage.from('business-images').getPublicUrl(path);
            resolve(data.publicUrl);
          } catch (err) {
            console.warn('Replay processing failed:', err);
            resolve(null);
          }
        };
        recorder.stop();
      });
    }

    pumpRef.current?.stop();
    pumpRef.current = null;
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    // outboundStreamRef, not localStream: after a flip they are the same object,
    // but before React has re-rendered they are not, and the camera that is
    // actually open is the one in the ref.
    outboundStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStream?.getTracks().forEach((t) => t.stop());
    outboundStreamRef.current = null;
    if (channelRef.current) { await channelRef.current.unsubscribe(); channelRef.current = null; }

    if (id) {
      await supabase.from('business_streams').update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        recording_url: recordingUrl,
        current_viewers: 0,
        peak_viewers: peakViewersRef.current,
        total_viewers: allViewersSeenRef.current.size,
      }).eq('id', id);
    }

    streamIdRef.current = null;
    pinRef.current = null;
    setPinned(null);
    setLocalStream(null);
    setIsLive(false);
    setViewerCount(0);
    setCurrentCaption('');
  }, [localStream]);

  return {
    localStream, isLive, viewerCount, micOn, camOn, captionsOn, currentCaption, error,
    start, stop, toggleMic, toggleCam, toggleCaptions,
    captionsSupported: speechRecognitionSupported(),
    facing, canFlip, flipping, flipCamera,
    pinned, pinItem,
    controls, focusAt, torchOn, toggleTorch, zoom, applyZoom,
  };
}
