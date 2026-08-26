import { useEffect, useRef, useState, useCallback } from 'react';
import { PIN_EVENT, parsePinPayload, type PinPayload } from '../lib/livePin';
import { supabase } from '../lib/supabase';
import { RTC_CONFIG, channelName, getSessionId } from '../lib/liveStream';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface SignalPayload {
  viewerId: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  to?: string;
  from?: string;
}

export type WatchStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2500;
// Realtime broadcast is fire-and-forget — if the broadcaster's channel isn't
// subscribed and listening at the exact instant the offer is sent (camera
// permission + channel setup takes a few seconds), the message is lost
// forever with no error on either side. Re-send the same offer on an
// interval until an answer arrives, rather than sending it once and hoping.
const OFFER_RETRY_INTERVAL_MS = 2000;
const MAX_OFFER_RETRIES = 10;

/** Viewer-side: join the stream's signaling channel, offer to receive video,
 * and surface the remote stream, live viewer count, and live captions. Only
 * used while a stream is actually `live` — replays play back the recorded
 * file directly and never touch WebRTC.
 *
 * A flaky network shows up as the peer connection going 'failed' (not just
 * 'disconnected', which is often transient and self-recovers) — when that
 * happens this re-runs the whole offer/answer handshake against the same
 * viewer id rather than leaving the viewer stuck on a frozen last frame. */
export function useWatchStream(streamId: string | null, active: boolean) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [status, setStatus] = useState<WatchStatus>('connecting');
  const [currentCaption, setCurrentCaption] = useState('');
  // What the owner is holding up right now. Only the id and where to look it
  // up — never the price, which the viewer reads from the database itself.
  const [pin, setPin] = useState<PinPayload | null>(null);

  const viewerIdRef = useRef(getSessionId());
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const captionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const offerRetryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answeredRef = useRef(false);

  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!streamId || !active) return;
    let cancelled = false;
    const viewerId = viewerIdRef.current;
    const channel = supabase.channel(channelName(streamId), { config: { presence: { key: viewerId } } });
    channelRef.current = channel;

    const connectPeer = async () => {
      if (cancelled) return;
      pcRef.current?.close();
      if (offerRetryTimerRef.current) { clearInterval(offerRetryTimerRef.current); offerRetryTimerRef.current = null; }
      answeredRef.current = false;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.ontrack = (e) => { if (!cancelled) setRemoteStream(e.streams[0] ?? null); };
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          channel.send({ type: 'broadcast', event: 'ice-candidate', payload: { to: 'broadcaster', from: viewerId, candidate: e.candidate.toJSON() } });
        }
      };
      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        if (pc.connectionState === 'connected') {
          attemptRef.current = 0;
          setStatus('connected');
        } else if (pc.connectionState === 'failed') {
          if (attemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
            setStatus('failed');
            return;
          }
          attemptRef.current += 1;
          setStatus('reconnecting');
          setRemoteStream(null);
          reconnectTimerRef.current = setTimeout(() => { if (!cancelled) connectPeer(); }, RECONNECT_DELAY_MS);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      let retries = 0;
      const sendOffer = () => {
        if (cancelled || answeredRef.current || pcRef.current !== pc) {
          if (offerRetryTimerRef.current) { clearInterval(offerRetryTimerRef.current); offerRetryTimerRef.current = null; }
          return;
        }
        if (retries >= MAX_OFFER_RETRIES) {
          if (offerRetryTimerRef.current) { clearInterval(offerRetryTimerRef.current); offerRetryTimerRef.current = null; }
          setStatus('failed');
          return;
        }
        retries += 1;
        channel.send({ type: 'broadcast', event: 'viewer-offer', payload: { viewerId, sdp: offer } });
      };
      sendOffer();
      offerRetryTimerRef.current = setInterval(sendOffer, OFFER_RETRY_INTERVAL_MS);
    };

    channel.on('broadcast', { event: 'broadcaster-answer' }, ({ payload }) => {
      const p = payload as SignalPayload;
      if (p.viewerId === viewerId && p.sdp && pcRef.current) {
        answeredRef.current = true;
        if (offerRetryTimerRef.current) { clearInterval(offerRetryTimerRef.current); offerRetryTimerRef.current = null; }
        pcRef.current.setRemoteDescription(new RTCSessionDescription(p.sdp)).catch(() => {});
      }
    });
    channel.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
      const p = payload as SignalPayload;
      if (p.to === viewerId && p.candidate && pcRef.current) pcRef.current.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(() => {});
    });
    channel.on('broadcast', { event: PIN_EVENT }, ({ payload }) => {
      // Anyone with the anon key can send to this channel, so the payload is
      // validated rather than trusted; a malformed one is dropped, not shown.
      const parsed = parsePinPayload(payload);
      if (parsed) setPin(parsed.itemId ? parsed : null);
    });
    channel.on('broadcast', { event: 'caption' }, ({ payload }) => {
      if (cancelled) return;
      setCurrentCaption(payload.text || '');
      if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
      captionTimeoutRef.current = setTimeout(() => setCurrentCaption(''), 6000);
    });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ role: string }>();
      const viewers = Object.keys(state).filter((key) => key !== 'broadcaster');
      if (!cancelled) setViewerCount(viewers.length);
    });

    channel.subscribe(async (subStatus) => {
      if (subStatus !== 'SUBSCRIBED' || cancelled) return;
      await channel.track({ role: 'viewer' });
      connectPeer();
    });

    return () => {
      cancelled = true;
      if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (offerRetryTimerRef.current) clearInterval(offerRetryTimerRef.current);
      pcRef.current?.close();
      channel.unsubscribe();
      pcRef.current = null;
      channelRef.current = null;
      setRemoteStream(null);
      setStatus('connecting');
      setViewerCount(0);
    };
  }, [streamId, active, retryTick]);

  const retry = useCallback(() => {
    attemptRef.current = 0;
    setStatus('connecting');
    // The effect keys off retryTick to re-run the whole handshake — flipping
    // status alone wouldn't retrigger it.
    setRetryTick((t) => t + 1);
  }, []);

  return { remoteStream, viewerCount, status, connected: status === 'connected', currentCaption, pin, retry };
}
