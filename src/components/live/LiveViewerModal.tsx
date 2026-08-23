import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useWatchStream } from '../../hooks/useWatchStream';
import { getCategoryFeatures } from '../../data/categoryFeatures';
import { telHref, whatsappHref } from '../../lib/phone';
import { CAPTION_LANGUAGES } from '../../lib/liveStream';
import VerifiedBadge from '../VerifiedBadge';
import LiveChat from './LiveChat';
import LiveAIAssistant from './LiveAIAssistant';
import {
  X, Volume2, VolumeX, Users, Radio, Subtitles, MessageCircle, Sparkles,
  Phone, Navigation, CalendarCheck, Loader2,
} from 'lucide-react';

interface StreamRow {
  id: string;
  title: string;
  status: 'scheduled' | 'live' | 'ended';
  recording_url?: string | null;
  started_at?: string | null;
}

interface LiveViewerModalProps {
  business: any;
  stream: StreamRow;
  onClose: () => void;
  onBook: (moduleKey: string, itemId?: string) => void;
  onOpenCart: () => void;
}

export default function LiveViewerModal({ business, stream, onClose, onBook, onOpenCart }: LiveViewerModalProps) {
  const { user } = useAuth();
  const isLive = stream.status === 'live';
  const isOwner = !!user && user.id === business.user_id;

  const { remoteStream, viewerCount, status: watchStatus, connected, currentCaption, retry } = useWatchStream(stream.id, isLive);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [panel, setPanel] = useState<'chat' | 'assistant'>('chat');
  const [captionsOn, setCaptionsOn] = useState(true);
  const [captionLang, setCaptionLang] = useState('en');
  const [displayCaption, setDisplayCaption] = useState('');
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    // Deps include `connected` too: the <video> element only mounts once
    // remoteStream && connected are both true, so if remoteStream arrives a
    // beat before connected flips, the element doesn't exist yet when this
    // effect first runs — re-running once it mounts is what actually
    // assigns srcObject onto it.
    if (videoRef.current && remoteStream) videoRef.current.srcObject = remoteStream;
  }, [remoteStream, connected]);

  useEffect(() => {
    if (!currentCaption) { setDisplayCaption(''); return; }
    if (captionLang === 'en') { setDisplayCaption(currentCaption); return; }
    let cancelled = false;
    setTranslating(true);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    fetch(`${supabaseUrl}/functions/v1/translate-caption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify({ text: currentCaption, targetLang: captionLang }),
    })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setDisplayCaption(data.translation || currentCaption); })
      .catch(() => { if (!cancelled) setDisplayCaption(currentCaption); })
      .finally(() => { if (!cancelled) setTranslating(false); });
    return () => { cancelled = true; };
  }, [currentCaption, captionLang]);

  useEffect(() => {
    if (!isLive) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isLive]);

  const features = getCategoryFeatures(business.category);
  const reservationModule = features.find((f) => f.itemSource === 'none');
  const cartModule = features.find((f) => f.itemSource === 'product' && f.cart);
  const primaryBookingModule = features.find((f) => f.itemSource === 'service' || (f.itemSource === 'product' && !f.cart));

  const whatsappLink = business.phone
    ? whatsappHref(String(business.phone), business.location, `Hi ${business.name}, I'm watching your live stream on NowOpen Africa!`)
    : null;

  return (
    <div className="fixed inset-0 bg-black z-[60] flex flex-col md:flex-row" role="dialog" aria-modal="true">
      {/* Video column */}
      <div className="relative flex-1 bg-black flex items-center justify-center min-h-[45vh] md:min-h-0">
        {isLive ? (
          remoteStream && connected ? (
            <video ref={videoRef} autoPlay playsInline muted={muted} className="w-full h-full object-contain" />
          ) : watchStatus === 'failed' ? (
            <div className="flex flex-col items-center gap-3 text-white/70 px-6 text-center">
              <p className="text-sm">Lost connection to the stream.</p>
              <button
                onClick={retry}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-full transition"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/70">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm">{watchStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting to the stream…'}</p>
            </div>
          )
        ) : (
          <video src={stream.recording_url || undefined} controls autoPlay className="w-full h-full object-contain" />
        )}

        {/* Top overlay */}
        <div className="absolute top-0 inset-x-0 p-3 sm:p-4 flex items-start justify-between bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gray-700 flex-shrink-0 overflow-hidden border border-white/20">
              {business.logo_url && <img loading="lazy" decoding="async" src={business.logo_url} alt={business.name} className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-white font-semibold text-sm truncate">{business.name}</p>
                {business.verified && <VerifiedBadge size={14} />}
              </div>
              <p className="text-white/70 text-xs truncate">{stream.title}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/90 hover:text-white bg-black/30 hover:bg-black/50 rounded-full p-1.5 transition flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Status row */}
        <div className="absolute top-16 sm:top-20 left-3 sm:left-4 flex items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
              <Radio size={11} className="animate-pulse" /> LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-gray-700 text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
              REPLAY
            </span>
          )}
          {isLive && (
            <span className="inline-flex items-center gap-1 bg-black/50 text-white text-[11px] font-medium px-2 py-0.5 rounded-md">
              <Users size={11} /> {viewerCount}
            </span>
          )}
        </div>

        {/* Caption bar */}
        {isLive && captionsOn && displayCaption && (
          <div className="absolute bottom-16 sm:bottom-20 inset-x-4 sm:inset-x-12 text-center">
            <span className="inline-block bg-black/70 text-white text-sm px-3 py-1.5 rounded-lg max-w-full">
              {translating ? '…' : displayCaption}
            </span>
          </div>
        )}

        {/* Bottom controls */}
        <div className="absolute bottom-0 inset-x-0 p-3 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent">
          <div className="flex items-center gap-2">
            {isLive && (
              <button
                onClick={() => setMuted((m) => !m)}
                className="text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            )}
            <button
              onClick={() => setCaptionsOn((c) => !c)}
              className={`text-white rounded-full p-2 transition ${captionsOn ? 'bg-blue-600' : 'bg-black/40 hover:bg-black/60'}`}
              aria-label="Toggle captions"
              title="Captions (AI, best-effort)"
            >
              <Subtitles size={16} />
            </button>
          </div>
          {captionsOn && (
            <select
              value={captionLang}
              onChange={(e) => setCaptionLang(e.target.value)}
              className="bg-black/50 text-white text-xs rounded-lg px-2 py-1.5 border border-white/20 focus:outline-none"
            >
              {CAPTION_LANGUAGES.map((l) => <option key={l.code} value={l.code} className="text-black">{l.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Side panel: business info, chat/assistant, actions */}
      <div className="w-full md:w-[380px] flex-shrink-0 bg-white dark:bg-gray-900 flex flex-col min-h-0 md:h-full">
        <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={() => setPanel('chat')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium border-b-2 transition ${
              panel === 'chat' ? 'text-blue-600 dark:text-blue-400 border-blue-600' : 'text-gray-500 dark:text-gray-400 border-transparent'
            }`}
          >
            <MessageCircle size={15} /> Chat
          </button>
          <button
            onClick={() => setPanel('assistant')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium border-b-2 transition ${
              panel === 'assistant' ? 'text-blue-600 dark:text-blue-400 border-blue-600' : 'text-gray-500 dark:text-gray-400 border-transparent'
            }`}
          >
            <Sparkles size={15} /> Assistant
          </button>
        </div>

        <div className="flex-1 min-h-0" style={{ display: panel === 'chat' ? 'block' : 'none' }}>
          <LiveChat streamId={stream.id} businessId={String(business.id)} isOwner={isOwner} />
        </div>
        <div className="flex-1 min-h-0" style={{ display: panel === 'assistant' ? 'block' : 'none' }}>
          <LiveAIAssistant business={business} />
        </div>

        {/* Action buttons */}
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {business.phone && (
              <a href={telHref(String(business.phone))} className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition">
                <Phone size={13} /> Call
              </a>
            )}
            {whatsappLink && (
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition">
                <MessageCircle size={13} /> WhatsApp
              </a>
            )}
            {reservationModule && (
              <button onClick={() => onBook(reservationModule.key)} className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition">
                <CalendarCheck size={13} /> {reservationModule.ctaLabel}
              </button>
            )}
            {cartModule && (
              <button onClick={onOpenCart} className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition">
                <CalendarCheck size={13} /> {cartModule.ctaLabel}
              </button>
            )}
            {primaryBookingModule && (
              <button onClick={() => onBook(primaryBookingModule.key)} className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition">
                <CalendarCheck size={13} /> {primaryBookingModule.ctaLabel}
              </button>
            )}
            {business.location && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <Navigation size={13} /> Directions
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
