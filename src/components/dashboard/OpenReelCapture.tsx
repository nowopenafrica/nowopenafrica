import { useState, useRef, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { X, Camera, Video, Circle, Square, Loader2, Check, RotateCcw, Pause, Play, Sun, Settings2, Minus, Plus, SwitchCamera } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { compressImage, CAPTURE_MAX_DIMENSION } from '../../lib/imageCompression';
import {
  ZOOM_STEPS, pickRecorderMimeType, formatForMimeType, chooseVideoBitrate,
  zoomCropRect, coverCropRect, nativeZoomTarget, captureResolutionFor, formatRecordingClock,
  estimatedBytes, AUDIO_BITRATE, REEL_HARD_MAX_BYTES, captureVideoPoster,
  applyAutoAdapt, cameraControls, clampToRange, stepValue, midpointOf,
  zoomStepSupported, isUltraWideLabel, applyTrackValue, applyTrackMode,
  applyPointOfInterest, bracketStops, fuseExposures,
  videoConstraintsFor, canFlipCamera, previewTransform, oppositeFacing, facingLabel,
  type ZoomStep, type CameraControls, type RgbaFrame, type FacingMode,
} from '../../lib/openReel';
import { POSTER_SUFFIX } from '../../lib/reelShare';
import { formatReelLimit } from '../../data/pricingPlans';

interface OpenReelCaptureProps {
  userId: string;
  /**
   * Longest recording this business's plan allows, in seconds
   * (reelLimitForPlan). Defaults to the free tier's minute so a caller that
   * hasn't resolved the plan yet can never accidentally grant more.
   */
  maxSeconds?: number;
  onCaptured: (url: string, type: 'photo' | 'video') => void;
  onClose: () => void;
}

type Mode = 'photo' | 'video';
type Stage = 'preview' | 'capture' | 'review';

export default function OpenReelCapture({ userId, maxSeconds = 60, onCaptured, onClose }: OpenReelCaptureProps) {
  const limitSeconds = Math.max(5, Math.round(maxSeconds));
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The captured bytes. Held directly rather than re-read from the preview URL:
  // fetching a blob: URL is governed by CSP connect-src, which does not (and
  // should not need to) allow blob:, so on production that fetch failed with
  // "Load failed" while the same code worked in dev where no CSP applies.
  const capturedBlobRef = useRef<Blob | null>(null);
  // Tears down the canvas pump used for software zoom while recording.
  const pumpStopRef = useRef<(() => void) | null>(null);
  const zoomRef = useRef<ZoomStep>(1);
  // True when the camera itself is doing the zoom, so the frame is already
  // zoomed and nothing should be cropped or CSS-scaled on top of it.
  const nativeZoomRef = useRef(false);

  // Bytes accumulated so far, so a browser that ignores the bitrate hint can
  // still be stopped before it produces a file the gallery would reject.
  const recordedBytesRef = useRef(0);

  const [mode, setMode] = useState<Mode>('photo');
  const [stage, setStage] = useState<Stage>('preview');
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [reviewType, setReviewType] = useState<'photo' | 'video'>('photo');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomStep>(1);
  const [softwareZoom, setSoftwareZoom] = useState(false);
  // Whether this camera accepted continuous exposure/white-balance/focus.
  const [, setAutoAdapted] = useState(false);
  // Manual camera controls, populated from what the current track advertises.
  const [controls, setControls] = useState<CameraControls | null>(null);
  const [autoLight, setAutoLight] = useState(true);
  const [autoFocus, setAutoFocus] = useState(true);
  const [focusDistance, setFocusDistance] = useState<number | null>(null);
  const [brightness, setBrightness] = useState<number | null>(null);
  const [showControls, setShowControls] = useState(false);
  // Bracket and fuse on capture. Only offered where the camera can actually
  // change its exposure, since without that the frames would be identical.
  const [hdr, setHdr] = useState(true);
  const [capturing, setCapturing] = useState(false);
  // Where the last tap landed, so the ring can be drawn over the preview.
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  // Which camera is open. The back one to start with, because most of what a
  // business photographs — stock, a shopfront, a finished job — is in front of
  // them, not behind the phone.
  const [facing, setFacing] = useState<FacingMode>('environment');
  const [canFlip, setCanFlip] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const facingRef = useRef<FacingMode>('environment');

  /** The live video track, cast past the DOM typings for camera capabilities. */
  const videoTrack = useCallback(() => (
    streamRef.current?.getVideoTracks()[0] as unknown as Parameters<typeof applyAutoAdapt>[0] | undefined
  ), []);

  /** Brightness goes through EV compensation where offered, else `brightness`. */
  const brightnessRange = controls?.exposureCompensation ?? controls?.brightness ?? null;
  const brightnessKey = controls?.exposureCompensation ? 'exposureCompensation' : 'brightness';

  /**
   * Ask the camera for the zoom; report whether it could actually do it.
   *
   * `zoom` is a well-supported media capability on mobile but is not in the
   * standard TypeScript DOM typings, so both the capability read and the
   * constraint write are cast through a local shape.
   */
  const applyNativeZoom = useCallback(async (target: ZoomStep): Promise<boolean> => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return false;
    const value = nativeZoomTarget(
      track as unknown as { getCapabilities?: () => { zoom?: { min?: number; max?: number } } },
      target,
    );
    if (value === null) return false;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value }] } as unknown as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  }, []);

  // `desiredMode` is passed in rather than read from state: switchMode calls
  // this immediately after setMode, when the state value is still the old one —
  // which meant switching to Reel captured a stream with no audio track.
  // `desiredFacing` is passed for exactly the same reason.
  const startCamera = useCallback(async (desiredMode: Mode, desiredFacing?: FacingMode) => {
    const wanted = desiredFacing ?? facingRef.current;
    try {
      // Video asks for the resolution the plan's maximum length can actually
      // afford in bits — a 20-minute clip held to the upload cap looks better at
      // 360p than smeared over 1080p.
      //
      // Photos ask for more, above 1080p. `ideal` degrades on its own, so a
      // camera that cannot manage it simply returns what it has, while a phone
      // that can now hands back detail the old request left on the sensor.
      // Stopped short of 4K deliberately: the preview and the HDR bracket both
      // work on these frames, and 4K makes both noticeably slower on a
      // mid-range phone.
      const res = desiredMode === 'video'
        ? captureResolutionFor(limitSeconds)
        : { width: 2560, height: 1440 };
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraintsFor(wanted, res.width, res.height),
        audio: desiredMode === 'video',
      });
      // Whatever was open has to be released, or the second camera opens onto a
      // busy device on Android and the preview stays black.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      facingRef.current = wanted;
      setFacing(wanted);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const playPromise = videoRef.current.play();
        if (playPromise) await playPromise.catch(() => {});
      }
      // Hand metering back to the camera so the shot survives a dim shop, a
      // sunlit street or a night market without being blown out or muddy. Only
      // the modes this device advertises are requested; see applyAutoAdapt for
      // why this is not (and cannot be) true HDR on the web.
      // Cast for the same reason as the zoom constraint below: these camera
      // capabilities are widely implemented but absent from the DOM typings.
      const track = stream.getVideoTracks()[0] as unknown as Parameters<typeof applyAutoAdapt>[0];
      const report = await applyAutoAdapt(track);
      setAutoAdapted(report.adapted);
      setAutoLight(report.adapted);
      setAutoFocus(true);

      // Read what this camera lets the owner control, so only real controls are
      // offered. Sliders start at the camera's neutral position.
      const caps = cameraControls(track);
      setControls(caps);
      const bRange = caps.exposureCompensation ?? caps.brightness;
      setBrightness(bRange ? midpointOf(bRange) : null);
      setFocusDistance(caps.focusDistance ? midpointOf(caps.focusDistance) : null);

      // Re-assert the chosen zoom on the new track, and work out whether this
      // camera can do it in hardware or we have to crop.
      const native = await applyNativeZoom(zoomRef.current);
      nativeZoomRef.current = native;
      setSoftwareZoom(!native && zoomRef.current !== 1);
      setCameraError(null);

      try {
        const devices = await navigator.mediaDevices?.enumerateDevices?.();
        setCanFlip(canFlipCamera(devices));
      } catch {
        // Some embedded webviews refuse to enumerate; no button is better than
        // one that cannot work.
        setCanFlip(false);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'NotReadableError') return;
      setCameraError(err?.message || 'Camera access denied');
    }
  }, [applyNativeZoom, limitSeconds]);

  useEffect(() => {
    startCamera('photo');
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      pumpStopRef.current?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Release the preview URL when it is replaced or the sheet closes.
  useEffect(() => () => { if (reviewUrl) URL.revokeObjectURL(reviewUrl); }, [reviewUrl]);

  /**
   * Switch to a physically wider lens, for 0.5x on phones whose main camera
   * cannot zoom below 1. Identified by device label, which is the only signal
   * the web exposes — so this is a best-effort attempt, not a guarantee.
   */
  const switchToUltraWide = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return false;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const wide = devices.find((d) => d.kind === 'videoinput' && isUltraWideLabel(d.label));
      if (!wide) return false;

      const res = mode === 'video' ? captureResolutionFor(limitSeconds) : { width: 1920, height: 1080 };
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: wide.deviceId }, width: { ideal: res.width }, height: { ideal: res.height } },
        audio: mode === 'video',
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      const track = stream.getVideoTracks()[0] as unknown as Parameters<typeof applyAutoAdapt>[0];
      setControls(cameraControls(track));
      if (autoLight) await applyAutoAdapt(track);
      return true;
    } catch {
      return false;
    }
  }, [mode, limitSeconds, autoLight]);

  const selectZoom = useCallback(async (next: ZoomStep) => {
    if (recording) return; // changing the source mid-take would corrupt the clip

    // 0.5x cannot be faked: cropping only narrows the frame, so going wider than
    // the lens needs hardware — either a zoom range that reaches below 1, or a
    // separate ultra-wide camera.
    if (next < 1 && !zoomStepSupported(controls?.zoom ?? null, next)) {
      // The ultra-wide is a rear lens on every phone that has one, and the
      // label search would happily switch the owner's selfie shot to it.
      if (facingRef.current === 'user') {
        toast('0.5x is a back-camera lens — switch to the back camera first.');
        return;
      }
      const switched = await switchToUltraWide();
      if (!switched) {
        toast('This device has no ultra-wide lens, so 0.5x isn\'t available.');
        return;
      }
    }

    zoomRef.current = next;
    setZoom(next);
    const native = await applyNativeZoom(next);
    nativeZoomRef.current = native;
    // Software zoom only ever crops in, so it never applies below 1x.
    setSoftwareZoom(!native && next > 1);
  }, [recording, applyNativeZoom, controls, switchToUltraWide]);

  /**
   * Auto light on/off. On hands metering back to the camera; off switches
   * exposure to manual so the brightness control actually holds — with auto
   * exposure running, the camera immediately re-meters away from any value set.
   */
  const toggleAutoLight = useCallback(async () => {
    const track = videoTrack();
    if (!track || !controls) return;
    const next = !autoLight;
    if (next) {
      const report = await applyAutoAdapt(track);
      setAutoAdapted(report.adapted);
      setAutoLight(report.adapted || true);
    } else {
      await applyTrackMode(track, 'exposureMode', 'manual', controls.exposureModes);
      setAutoLight(false);
      setAutoAdapted(false);
    }
  }, [autoLight, controls, videoTrack]);

  /** Auto focus on/off. Off enables the focus-distance control. */
  const toggleAutoFocus = useCallback(async () => {
    const track = videoTrack();
    if (!track || !controls) return;
    const next = !autoFocus;
    const mode = next ? 'continuous' : 'manual';
    const ok = await applyTrackMode(track, 'focusMode', mode, controls.focusModes);
    if (!ok) {
      toast(`This camera doesn't support ${next ? 'continuous' : 'manual'} focus.`);
      return;
    }
    setAutoFocus(next);
    // Re-assert the chosen distance when leaving auto, so the picture doesn't
    // sit wherever autofocus happened to stop.
    if (!next && focusDistance !== null) {
      await applyTrackValue(track, 'focusDistance', focusDistance);
    }
  }, [autoFocus, controls, focusDistance, videoTrack]);

  const changeFocusDistance = useCallback(async (value: number) => {
    const track = videoTrack();
    if (!track || !controls?.focusDistance) return;
    const next = clampToRange(value, controls.focusDistance);
    setFocusDistance(next);
    // Manual focus is a precondition for the distance being honoured.
    if (autoFocus) {
      const ok = await applyTrackMode(track, 'focusMode', 'manual', controls.focusModes);
      if (ok) setAutoFocus(false);
    }
    await applyTrackValue(track, 'focusDistance', next);
  }, [autoFocus, controls, videoTrack]);

  const nudgeBrightness = useCallback(async (direction: 1 | -1) => {
    const track = videoTrack();
    if (!track || !brightnessRange) return;
    const next = stepValue(brightness ?? midpointOf(brightnessRange), brightnessRange, direction);
    setBrightness(next);
    // EV compensation is respected while auto-exposure runs; a raw brightness
    // value is not, so that path needs manual exposure first.
    if (brightnessKey === 'brightness' && autoLight && controls) {
      const ok = await applyTrackMode(track, 'exposureMode', 'manual', controls.exposureModes);
      if (ok) { setAutoLight(false); setAutoAdapted(false); }
    }
    const applied = await applyTrackValue(track, brightnessKey, next);
    if (!applied) toast('This camera won\'t let brightness be changed.');
  }, [brightness, brightnessRange, brightnessKey, autoLight, controls, videoTrack]);

  const showCaptured = useCallback((blob: Blob, type: 'photo' | 'video') => {
    capturedBlobRef.current = blob;
    setReviewUrl(URL.createObjectURL(blob));
    setReviewType(type);
    setStage('review');
  }, []);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.error('Camera is still starting — try again in a moment.');
      return;
    }
    // Crop to what the PREVIEW is showing, not to the whole sensor.
    //
    // The preview is object-cover, so a 16:9 sensor in a portrait phone is
    // trimmed at the sides to fill the box — and the composition the owner
    // chose is that trim. Saving the full frame handed them back scenery they
    // never saw and threw away their framing; on a portrait phone that is
    // close to half the picture.
    //
    // Zoom still only applies when the camera could not do it itself,
    // otherwise the incoming frame is already zoomed and this would double it.
    const box = video.getBoundingClientRect();
    const crop = coverCropRect(
      video.videoWidth,
      video.videoHeight,
      box.width,
      box.height,
      nativeZoomRef.current ? 1 : zoomRef.current,
    );
    const canvas = document.createElement('canvas');
    canvas.width = crop.sw;
    canvas.height = crop.sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const grab = (): RgbaFrame => {
      ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
      const f = ctx.getImageData(0, 0, crop.sw, crop.sh);
      return { width: f.width, height: f.height, data: f.data };
    };

    // One exposure cannot hold a bright African sky and a shaded doorway at
    // once. Where the camera offers exposure compensation, take the frame two
    // stops apart and keep whichever exposed each pixel best.
    const track = videoTrack();
    const evRange = controls?.exposureCompensation ?? null;
    const stops = hdr ? bracketStops(evRange) : [0];

    let frame: RgbaFrame | null = null;
    if (stops.length > 1 && track) {
      setCapturing(true);
      const frames: RgbaFrame[] = [];
      const before = brightness ?? 0;
      try {
        for (const ev of stops) {
          const applied = await applyTrackValue(track, 'exposureCompensation', before + ev);
          if (!applied) break;
          // The sensor needs a moment to settle, or the bracket is three reads
          // of the same exposure and the fusion achieves nothing.
          await new Promise((r) => window.setTimeout(r, 140));
          frames.push(grab());
        }
      } finally {
        // Always hand the camera back the exposure the owner was looking at,
        // even if a frame failed — otherwise the preview stays two stops dark.
        await applyTrackValue(track, 'exposureCompensation', before);
        setCapturing(false);
      }
      if (frames.length > 1) frame = fuseExposures(frames);
    }

    if (frame) {
      ctx.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);
    } else {
      // Single shot, or the bracket could not complete: the plain frame is a
      // correct photograph, which is why the bracket is centred on it.
      grab();
    }

    // LOSSLESS here, because compressImage is about to encode it properly.
    //
    // This was JPEG at 0.95, so every photograph went through two lossy
    // generations. Measured against a detailed 1280x720 source, dropping the
    // first one is worth +0.8 dB at an identical uploaded file size — which is
    // the case that matters most, because a camera that only manages 720p is
    // already under the ceiling and gets no downscale to hide the artefacts.
    //
    // Where a downscale DOES happen it is worth almost nothing (+0.05 dB): the
    // resize averages the JPEG artefacts away regardless. So this is the cheap
    // half of the change, not the important one — see CAPTURE_MAX_DIMENSION for
    // where the detail actually comes back.
    //
    // PNG is large in memory and never leaves it — nothing uploads this blob.
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Could not capture the photo — try again.');
        return;
      }
      showCaptured(blob, 'photo');
    }, 'image/png');
  }, [showCaptured, hdr, controls, brightness, videoTrack]);

  /**
   * Tap the preview to focus there.
   *
   * The camera wants the point normalised against the FRAME, but the tap
   * arrives in preview pixels — and the preview is object-cover, so it is a
   * cropped, scaled view of that frame. Converting through the element's own
   * box is close enough for a focus point and avoids re-deriving the crop maths
   * that zoomCropRect already owns.
   *
   * Autofocus is switched off by the tap, because leaving it continuous means
   * the camera wanders straight back off the spot it was just given. The
   * indicator fades on its own so it does not sit over the shot.
   */
  const focusAt = useCallback(async (e: React.MouseEvent<HTMLElement>) => {
    const track = videoTrack();
    if (!track || !controls?.pointsOfInterest) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;

    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    setFocusPoint({ x, y });
    window.setTimeout(() => setFocusPoint(null), 1200);

    const ok = await applyPointOfInterest(track, x, y, controls.focusModes);
    if (ok) setAutoFocus(false);
  }, [controls, videoTrack]);

  /**
   * The stream to record. Normally the camera's own, but when this camera has
   * no hardware zoom and 1.5x is selected we pump the cropped frames through a
   * canvas so the recording matches what the preview shows — a CSS transform
   * would only zoom the preview and record the wide frame.
   */
  const buildRecordingStream = useCallback((): MediaStream => {
    const stream = streamRef.current!;
    const video = videoRef.current;
    const needsCrop = !nativeZoomRef.current && zoomRef.current !== 1;
    if (!needsCrop || !video?.videoWidth) return stream;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.captureStream !== 'function') return stream;

    let raf = 0;
    const draw = () => {
      const c = zoomCropRect(video.videoWidth, video.videoHeight, zoomRef.current);
      if (c.sw > 0 && c.sh > 0) {
        ctx.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, canvas.width, canvas.height);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(30);
    pumpStopRef.current = () => {
      cancelAnimationFrame(raf);
      canvasStream.getTracks().forEach((t) => t.stop());
      pumpStopRef.current = null;
    };
    // Keep the microphone track from the real stream — captureStream is video only.
    return new MediaStream([...canvasStream.getVideoTracks(), ...stream.getAudioTracks()]);
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    setRecording(false);
    setPaused(false);
  }, []);

  /**
   * Pause / resume the take. The elapsed clock is driven by the same interval,
   * which is cleared while paused — so a pause genuinely stops the countdown
   * rather than letting it run out behind a stopped recorder.
   */
  const togglePause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    try {
      if (recorder.state === 'recording') {
        recorder.pause();
        setPaused(true);
      } else if (recorder.state === 'paused') {
        recorder.resume();
        setPaused(false);
      }
    } catch {
      // Pause is optional in the MediaRecorder spec; if this browser refuses,
      // the take simply carries on rather than breaking.
      toast('Pause isn\'t supported on this browser — recording continues.');
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    const video = videoRef.current;
    chunksRef.current = [];

    const format = pickRecorderMimeType(
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported
        ? (t) => MediaRecorder.isTypeSupported(t)
        : undefined,
    );
    const recordStream = buildRecordingStream();
    const options: MediaRecorderOptions = {
      // Capped so the plan's longest take still fits the gallery upload limit.
      videoBitsPerSecond: chooseVideoBitrate(video?.videoWidth ?? 0, video?.videoHeight ?? 0, limitSeconds),
      audioBitsPerSecond: AUDIO_BITRATE,
    };
    if (format.mimeType) options.mimeType = format.mimeType;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(recordStream, options);
    } catch {
      // A browser can advertise a type and still refuse the options object.
      // Recording at the browser's own defaults beats not recording at all.
      try {
        recorder = new MediaRecorder(recordStream);
      } catch (err: any) {
        pumpStopRef.current?.();
        toast.error(`Recording is not supported on this browser: ${err?.message || 'unknown error'}`);
        return;
      }
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size <= 0) return;
      chunksRef.current.push(e.data);
      recordedBytesRef.current += e.data.size;
      // Belt and braces: videoBitsPerSecond is a hint, not a guarantee, and a
      // browser that overshoots it would otherwise hand us a file the gallery
      // refuses. Stop while the recording is still uploadable.
      if (recordedBytesRef.current >= REEL_HARD_MAX_BYTES) {
        toast('Reached the maximum file size — saving what you recorded.');
        stopRecording();
      }
    };
    recorder.onstop = () => {
      pumpStopRef.current?.();
      // Trust what the recorder actually produced over what we requested.
      const actual = recorder.mimeType || format.mimeType;
      const blob = new Blob(chunksRef.current, { type: formatForMimeType(actual).contentType });
      if (!blob.size) {
        toast.error('Nothing was recorded — try again.');
        return;
      }
      showCaptured(blob, 'video');
    };
    recorder.onerror = () => {
      pumpStopRef.current?.();
      toast.error('Recording stopped unexpectedly — try again.');
      stopRecording();
    };

    recorder.start(500);
    mediaRecorderRef.current = recorder;
    recordedBytesRef.current = 0;
    setRecording(true);
    setPaused(false);
    setElapsed(0);
    let seconds = 0;
    timerRef.current = setInterval(() => {
      // Only count time the recorder is actually capturing, so a pause holds
      // the clock instead of quietly burning the allowance.
      if (mediaRecorderRef.current?.state !== 'recording') return;
      seconds += 1;
      setElapsed(seconds);
      if (seconds >= limitSeconds) stopRecording();
    }, 1000);
  }, [buildRecordingStream, showCaptured, stopRecording, limitSeconds]);

  const uploadCapture = useCallback(async () => {
    const captured = capturedBlobRef.current;
    if (!captured) return;
    setUploading(true);
    try {
      let body: Blob = captured;
      let ext: string;
      let contentType: string;

      if (reviewType === 'photo') {
        // Same pipeline as every other image upload: WebP where supported,
        // long edge capped, original kept if compressing wouldn't help.
        const compressed = await compressImage(
          new File([captured], `reel-${Date.now()}.png`, { type: captured.type || 'image/png' }),
          // A higher ceiling than a cover image gets: this is the shot a
          // customer opens to look closely at.
          CAPTURE_MAX_DIMENSION,
        );
        body = compressed;
        contentType = compressed.type || 'image/png';
        // Derived, not guessed at from two cases. compressImage returns the
        // ORIGINAL file when re-encoding would not help or when it throws, and
        // that original is now a PNG — which the old two-way branch would have
        // stored as `.jpg` with a PNG content type.
        ext = contentType === 'image/webp' ? 'webp'
          : contentType === 'image/png' ? 'png'
            : 'jpg';
      } else {
        ({ ext, contentType } = formatForMimeType(captured.type));
      }

      const stamp = Date.now();
      const path = `${userId}/reel-${stamp}.${ext}`;
      const { error } = await supabase.storage
        .from('business-images')
        .upload(path, body, { cacheControl: '3600', upsert: false, contentType });
      if (error) throw error;

      // A video also needs a still, because a link preview's og:image cannot be
      // an .mp4. Stored at the derivable `-poster.jpg` path beside the clip (see
      // lib/reelShare), so nothing extra has to be recorded against the row.
      // Best-effort: a reel without a poster still works, it just shares with
      // the business cover instead.
      if (reviewType === 'video') {
        try {
          const poster = await captureVideoPoster(captured);
          if (poster) {
            await supabase.storage
              .from('business-images')
              .upload(`${userId}/reel-${stamp}${POSTER_SUFFIX}`, poster, {
                cacheControl: '3600', upsert: true, contentType: 'image/jpeg',
              });
          }
        } catch {
          /* share card falls back to the cover image */
        }
      }

      const { data } = supabase.storage.from('business-images').getPublicUrl(path);
      // The caller decides what "added" means (it inserts the gallery row and
      // reports the outcome), so this must not claim success on its behalf —
      // saying "added" here is what made a failed insert look like it worked.
      onCaptured(data.publicUrl, reviewType);
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message || 'unknown error'}`);
    } finally {
      setUploading(false);
    }
  }, [reviewType, userId, onCaptured]);

  const retake = useCallback(() => {
    capturedBlobRef.current = null;
    setReviewUrl(null);
    setStage('preview');
    startCamera(mode);
  }, [startCamera, mode]);

  /**
   * Swap between the front and back cameras.
   *
   * Blocked while recording: changing the source mid-take gives MediaRecorder a
   * new track with different dimensions, and the clip either stops there or
   * comes out corrupt.
   *
   * startCamera stops the previous tracks before opening the new ones, which
   * matters on Android — some devices will not hand out the second camera while
   * the first is still held, and the preview comes back black.
   */
  const flipCamera = useCallback(async () => {
    if (recording || flipping) return;
    setFlipping(true);
    const target = oppositeFacing(facingRef.current);
    try {
      await startCamera(mode, target);
    } finally {
      setFlipping(false);
    }
  }, [recording, flipping, mode, startCamera]);

  const switchMode = useCallback((newMode: Mode) => {
    if (recording) return;
    setMode(newMode);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setTimeout(() => startCamera(newMode), 100);
  }, [recording, startCamera]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Camera size={16} /> OpenReel Capture
          </h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        {cameraError ? (
          <div className="p-8 text-center">
            <Camera size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-red-600 dark:text-red-400 mb-2">{cameraError}</p>
            <button onClick={onClose} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Close</button>
          </div>
        ) : stage === 'review' && reviewUrl ? (
          /* Review stage */
          <div className="space-y-3">
            <div className="relative bg-black">
              {reviewType === 'photo' ? (
                <img src={reviewUrl} alt="Captured" className="w-full max-h-[60vh] object-contain" />
              ) : (
                <video src={reviewUrl} controls autoPlay playsInline className="w-full max-h-[60vh] object-contain" />
              )}
            </div>
            <div className="flex gap-2 p-4">
              <button
                onClick={retake}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm"
              >
                <RotateCcw size={14} /> Retake
              </button>
              <button
                onClick={uploadCapture}
                disabled={uploading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition text-sm disabled:opacity-50"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {uploading ? 'Uploading…' : 'Use This'}
              </button>
            </div>
          </div>
        ) : (
          /* Camera preview */
          <>
            <div
              className="relative bg-black overflow-hidden"
              onClick={controls?.pointsOfInterest ? focusAt : undefined}
              style={controls?.pointsOfInterest ? { cursor: 'crosshair' } : undefined}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-full max-h-[60vh] object-cover"
                // Two things share this transform: the selfie mirror, and the
                // software zoom used only where the camera cannot zoom itself
                // (otherwise the frame arrives already zoomed and this would
                // compound it). They are composed in one string because a second
                // `transform` would silently replace the first.
                style={{ transform: previewTransform(facing, softwareZoom ? zoom : 1) }}
                onError={() => {}}
              />

              {/* Front/back. Only shown where a second camera exists, and it
                  stops the click reaching the tap-to-focus handler underneath. */}
              {canFlip && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); flipCamera(); }}
                  disabled={recording || flipping}
                  aria-label={`Switch to the ${facingLabel(oppositeFacing(facing)).toLowerCase()}`}
                  title={`${facingLabel(facing)} — tap to switch`}
                  className="absolute top-3 right-3 inline-flex items-center justify-center w-[44px] h-[44px] rounded-full bg-black/55 text-white hover:bg-black/70 transition disabled:opacity-40"
                >
                  {flipping ? <Loader2 size={18} className="animate-spin" /> : <SwitchCamera size={18} />}
                </button>
              )}

              {/* Where the tap landed. Drawn over the preview and gone in about
                  a second, because a permanent marker sits in the shot. */}
              {focusPoint && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute w-16 h-16 -ml-8 -mt-8 rounded-full border-2 border-amber-300 animate-ping"
                  style={{ left: `${focusPoint.x * 100}%`, top: `${focusPoint.y * 100}%` }}
                />
              )}

              {/* Bracketing holds the camera for a few hundred milliseconds. If
                  nothing said so, a still preview would look like a freeze. */}
              {capturing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">
                    <Loader2 size={13} className="animate-spin" /> Blending exposures…
                  </span>
                </div>
              )}
              {recording && (
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  {paused ? (
                    <span className="flex items-center gap-1 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-md">
                      <Pause size={9} className="fill-white" /> PAUSED
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-md">
                      <Circle size={8} className="fill-white animate-pulse" /> REC
                    </span>
                  )}
                  <span className="bg-black/60 text-white text-xs font-mono px-2 py-0.5 rounded-md" aria-live="off">
                    {formatRecordingClock(elapsed)} / {formatRecordingClock(limitSeconds)}
                  </span>
                </div>
              )}

              {/* Auto light is a switch, not a badge — tap to hand metering back
                  to the camera or to hold it steady for manual brightness. */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                {controls && (
                  <button
                    type="button"
                    onClick={toggleAutoLight}
                    aria-pressed={autoLight}
                    aria-label={autoLight ? 'Turn auto light off' : 'Turn auto light on'}
                    title={autoLight
                      ? 'Auto light on — the camera is metering continuously. Tap to hold it steady.'
                      : 'Auto light off — brightness stays where you set it. Tap to re-enable.'}
                    className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md transition ${
                      autoLight ? 'bg-black/55 text-emerald-300' : 'bg-black/55 text-gray-300'
                    }`}
                  >
                    <Sun size={10} className="inline mr-1 -mt-px" />
                    Auto light {autoLight ? 'on' : 'off'}
                  </button>
                )}

                {/* Only where the camera can change its exposure. Without that
                    the "bracket" is three identical frames, so the button would
                    cost latency and change nothing. */}
                {mode === 'photo' && controls?.exposureCompensation && (
                  <button
                    type="button"
                    onClick={() => setHdr((v) => !v)}
                    aria-pressed={hdr}
                    aria-label={hdr ? 'Turn HDR off' : 'Turn HDR on'}
                    title={hdr
                      ? 'HDR on — takes the shot at three exposures and keeps the best-lit part of each. Slightly slower; hold still.'
                      : 'HDR off — one exposure. Faster, but bright sky or deep shade will clip.'}
                    className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md transition ${
                      hdr ? 'bg-black/55 text-amber-300' : 'bg-black/55 text-gray-300'
                    }`}
                  >
                    HDR {hdr ? 'on' : 'off'}
                  </button>
                )}
                {/* Always offered once the camera is live. Hiding it when a
                    device reports no capabilities made Focus and Brightness
                    invisible on exactly the cameras where people went looking
                    for them; the panel now says what this camera can't do
                    instead of vanishing. */}
                {controls && (
                  <button
                    type="button"
                    onClick={() => setShowControls((v) => !v)}
                    aria-expanded={showControls}
                    aria-label="Camera settings"
                    title="Focus and brightness"
                    className="p-1.5 rounded-md bg-black/55 text-white hover:bg-black/70 transition"
                  >
                    <Settings2 size={13} />
                  </button>
                )}
              </div>

              {/* Focus + brightness. Only what this camera actually reports is
                  shown, so nothing here is a control that does nothing. */}
              {showControls && controls && (
                <div className="absolute top-12 right-3 w-52 rounded-xl bg-black/75 backdrop-blur p-3 space-y-3 text-white">
                  {controls.focusModes.includes('continuous') || controls.focusModes.includes('manual') ? (
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Focus</span>
                        <button
                          type="button"
                          onClick={toggleAutoFocus}
                          aria-pressed={autoFocus}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            autoFocus ? 'bg-emerald-500/90 text-white' : 'bg-white/20 text-gray-200'
                          }`}
                        >
                          {autoFocus ? 'Auto' : 'Manual'}
                        </button>
                      </div>
                      {controls.focusDistance ? (
                        <>
                          <input
                            type="range"
                            min={controls.focusDistance.min}
                            max={controls.focusDistance.max}
                            step={controls.focusDistance.step}
                            value={focusDistance ?? midpointOf(controls.focusDistance)}
                            onChange={(e) => changeFocusDistance(Number(e.target.value))}
                            aria-label="Focus distance"
                            className="w-full mt-2 accent-white"
                          />
                          <p className="text-[10px] text-gray-300">
                            {autoFocus ? 'Moving this switches to manual focus' : 'Near ← → Far'}
                          </p>
                        </>
                      ) : (
                        <p className="text-[10px] text-gray-300 mt-1">
                          This camera only offers automatic focus.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-300">Focus isn&apos;t adjustable on this camera.</p>
                  )}

                  {brightnessRange ? (
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wide">Brightness</span>
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => nudgeBrightness(-1)}
                          aria-label="Reduce brightness"
                          className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center"
                        >
                          <Minus size={14} />
                        </button>
                        <div className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden">
                          <div
                            className="h-full bg-white"
                            style={{
                              width: `${Math.round(
                                (((brightness ?? midpointOf(brightnessRange)) - brightnessRange.min)
                                  / (brightnessRange.max - brightnessRange.min)) * 100,
                              )}%`,
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => nudgeBrightness(1)}
                          aria-label="Increase brightness"
                          className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-300">Brightness isn&apos;t adjustable on this camera.</p>
                  )}
                </div>
              )}

              {/* Zoom — works on any camera: hardware zoom where the device
                  offers it, a centre crop where it doesn't. */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/50 backdrop-blur rounded-full p-1">
                {ZOOM_STEPS.map((step) => {
                  // 0.5x needs a physically wider lens; the rest can be cropped.
                  const hardwareOnly = step < 1;
                  const unavailable = hardwareOnly
                    && (facing === 'user' || !zoomStepSupported(controls?.zoom ?? null, step));
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => selectZoom(step)}
                      disabled={recording}
                      aria-pressed={zoom === step}
                      aria-label={`Zoom ${step}x`}
                      title={
                        !unavailable ? `Zoom ${step}x`
                          : facing === 'user' ? '0.5x is a back-camera lens'
                            : 'Needs an ultra-wide lens — we\'ll try to switch to one'
                      }
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition disabled:opacity-40 ${
                        zoom === step
                          ? 'bg-white text-gray-900'
                          : unavailable ? 'text-white/50 hover:bg-white/10' : 'text-white hover:bg-white/20'
                      }`}
                    >
                      {step}x
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mode toggle + capture controls */}
            <div className="p-4 space-y-3">
              <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg">
                <button
                  onClick={() => switchMode('photo')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition ${mode === 'photo' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  <Camera size={13} /> Photo
                </button>
                <button
                  onClick={() => switchMode('video')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition ${mode === 'video' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  <Video size={13} /> Reel ({formatRecordingClock(limitSeconds)})
                </button>
              </div>

              <div className="flex justify-center">
                {mode === 'photo' ? (
                  <button
                    onClick={capturePhoto}
                    aria-label="Capture photo"
                    className="w-16 h-16 rounded-full bg-white border-4 border-gray-900 dark:border-white hover:scale-105 active:scale-95 transition flex items-center justify-center"
                  >
                    <div className="w-12 h-12 rounded-full bg-gray-900 dark:bg-white" />
                  </button>
                ) : recording ? (
                  <div className="flex items-center gap-4">
                    <button
                      onClick={togglePause}
                      aria-label={paused ? 'Resume recording' : 'Pause recording'}
                      className="w-12 h-12 rounded-full border-2 border-white/70 bg-black/40 hover:bg-black/60 active:scale-95 transition flex items-center justify-center"
                    >
                      {paused
                        ? <Play size={18} className="text-white fill-white" />
                        : <Pause size={18} className="text-white fill-white" />}
                    </button>
                    <button
                      onClick={stopRecording}
                      aria-label="Stop recording"
                      className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 transition flex items-center justify-center"
                    >
                      <Square size={20} className="text-white fill-white" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startRecording}
                    aria-label="Start recording"
                    className="w-16 h-16 rounded-full bg-white border-4 border-red-600 hover:scale-105 active:scale-95 transition flex items-center justify-center"
                  >
                    <div className="w-10 h-10 rounded-full bg-red-600" />
                  </button>
                )}
              </div>

              <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                {mode === 'photo'
                  ? 'Tap to capture a photo'
                  : recording
                    ? `${paused ? 'Paused' : 'Recording'} — pause and resume as often as you like`
                    : `Tap to start recording — your plan allows ${formatReelLimit(limitSeconds)}, up to about ${Math.round(estimatedBytes(chooseVideoBitrate(captureResolutionFor(limitSeconds).width, captureResolutionFor(limitSeconds).height, limitSeconds), limitSeconds) / (1024 * 1024))} MB`}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
