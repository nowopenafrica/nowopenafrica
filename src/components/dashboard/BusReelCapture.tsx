import { useState, useRef, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { X, Camera, Video, Circle, Square, Loader2, Check, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const MAX_VIDEO_SEC = 10;

interface BusReelCaptureProps {
  userId: string;
  onCaptured: (url: string, type: 'photo' | 'video') => void;
  onClose: () => void;
}

type Mode = 'photo' | 'video';
type Stage = 'preview' | 'capture' | 'review';

export default function BusReelCapture({ userId, onCaptured, onClose }: BusReelCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [mode, setMode] = useState<Mode>('photo');
  const [stage, setStage] = useState<Stage>('preview');
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(MAX_VIDEO_SEC);
  const [uploading, setUploading] = useState(false);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [reviewType, setReviewType] = useState<'photo' | 'video'>('photo');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: mode === 'video',
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const playPromise = videoRef.current.play();
        if (playPromise) await playPromise.catch(() => {});
      }
      setCameraError(null);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'NotReadableError') return;
      setCameraError(err?.message || 'Camera access denied');
    }
  }, [mode]);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setReviewUrl(url);
      setReviewType('photo');
      setStage('review');
    }, 'image/jpeg', 0.9);
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setReviewUrl(url);
      setReviewType('video');
      setStage('review');
    };
    recorder.start(500);
    mediaRecorderRef.current = recorder;
    setRecording(true);
    setCountdown(MAX_VIDEO_SEC);
    let remaining = MAX_VIDEO_SEC;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        stopRecording();
      }
    }, 1000);
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    setRecording(false);
  }, []);

  const uploadCapture = useCallback(async () => {
    if (!reviewUrl) return;
    setUploading(true);
    try {
      let blob: Blob;
      let ext: string;
      let contentType: string;

      if (reviewType === 'photo') {
        const resp = await fetch(reviewUrl);
        blob = await resp.blob();
        ext = 'jpg';
        contentType = 'image/jpeg';
      } else {
        const resp = await fetch(reviewUrl);
        blob = await resp.blob();
        ext = 'webm';
        contentType = 'video/webm';
      }

      const path = `${userId}/reel-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('business-images')
        .upload(path, blob, { cacheControl: '3600', upsert: false, contentType });
      if (error) throw error;
      const { data } = supabase.storage.from('business-images').getPublicUrl(path);
      onCaptured(data.publicUrl, reviewType);
      toast.success(reviewType === 'photo' ? 'Photo added to BusReel' : 'Reel added to BusReel');
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message || 'unknown error'}`);
    } finally {
      setUploading(false);
    }
  }, [reviewUrl, reviewType, userId, onCaptured]);

  const retake = useCallback(() => {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setReviewUrl(null);
    setStage('preview');
    startCamera();
  }, [reviewUrl, startCamera]);

  const switchMode = useCallback((newMode: Mode) => {
    if (recording) return;
    setMode(newMode);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setTimeout(() => startCamera(), 100);
  }, [recording, startCamera]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Camera size={16} /> BusReel Capture
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
                <video src={reviewUrl} controls autoPlay className="w-full max-h-[60vh] object-contain" />
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
            <div className="relative bg-black">
              <video ref={videoRef} muted playsInline className="w-full max-h-[60vh] object-cover" onError={() => {}} />
              {recording && (
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-md">
                    <Circle size={8} className="fill-white animate-pulse" /> REC
                  </span>
                  <span className="bg-black/60 text-white text-xs font-mono px-2 py-0.5 rounded-md">
                    0:{countdown.toString().padStart(2, '0')}
                  </span>
                </div>
              )}
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
                  <Video size={13} /> Reel (10s)
                </button>
              </div>

              <div className="flex justify-center">
                {mode === 'photo' ? (
                  <button
                    onClick={capturePhoto}
                    className="w-16 h-16 rounded-full bg-white border-4 border-gray-900 dark:border-white hover:scale-105 active:scale-95 transition flex items-center justify-center"
                  >
                    <div className="w-12 h-12 rounded-full bg-gray-900 dark:bg-white" />
                  </button>
                ) : recording ? (
                  <button
                    onClick={stopRecording}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 transition flex items-center justify-center"
                  >
                    <Square size={20} className="text-white fill-white" />
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="w-16 h-16 rounded-full bg-white border-4 border-red-600 hover:scale-105 active:scale-95 transition flex items-center justify-center"
                  >
                    <div className="w-10 h-10 rounded-full bg-red-600" />
                  </button>
                )}
              </div>

              <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                {mode === 'photo' ? 'Tap to capture a photo' : 'Tap to start recording — auto-stops at 10 seconds'}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
