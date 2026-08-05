import { useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  RTC_CONFIG, channelName, getSpeechRecognition, speechRecognitionSupported,
  CAMERA_CONSTRAINTS, MIC_CONSTRAINTS, REPLAY_VIDEO_BITRATE_BPS, computePerViewerBitrate,
} from '../lib/liveStream';
import type { RealtimeChannel } from '@supabase/supabase-js';

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

  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const speechRef = useRef<any | null>(null);
  const allViewersSeenRef = useRef<Set<string>>(new Set());
  const peakViewersRef = useRef(0);
  const analyticsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const handleViewerOffer = useCallback(async (payload: SignalPayload, stream: MediaStream) => {
    const channel = channelRef.current;
    if (!channel || !payload.sdp) return;
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
  }, [rebalanceBitrates]);

  const start = useCallback(async (id: string, opts?: { video?: boolean; audio?: boolean }) => {
    if (!id) return;
    streamIdRef.current = id;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: opts?.video === false ? false : CAMERA_CONSTRAINTS,
        audio: opts?.audio === false ? false : MIC_CONSTRAINTS,
      });
      setLocalStream(stream);

      const channel = supabase.channel(channelName(id), { config: { presence: { key: 'broadcaster' } } });
      channelRef.current = channel;

      channel.on('broadcast', { event: 'viewer-offer' }, ({ payload }) => {
        allViewersSeenRef.current.add(payload.viewerId);
        handleViewerOffer(payload as SignalPayload, stream);
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
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: REPLAY_VIDEO_BITRATE_BPS });
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

      setIsLive(true);
    } catch (err: any) {
      console.error('Failed to start broadcast:', err);
      setError(err?.message || 'Could not access your camera/microphone.');
    }
  }, [handleViewerOffer, rebalanceBitrates]);

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

    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    localStream?.getTracks().forEach((t) => t.stop());
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
    setLocalStream(null);
    setIsLive(false);
    setViewerCount(0);
    setCurrentCaption('');
  }, [localStream]);

  return { localStream, isLive, viewerCount, micOn, camOn, captionsOn, currentCaption, error, start, stop, toggleMic, toggleCam, toggleCaptions, captionsSupported: speechRecognitionSupported() };
}
