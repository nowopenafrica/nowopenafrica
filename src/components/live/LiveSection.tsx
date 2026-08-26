import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { getSessionId } from '../../lib/liveStream';
import LiveViewerModal from './LiveViewerModal';
import LiveShareSheet from './LiveShareSheet';
import { Radio, Users, Bell, BellRing, Play, Calendar, Clock, Share2 } from 'lucide-react';

interface StreamRow {
  id: string;
  title: string;
  description?: string | null;
  status: 'scheduled' | 'live' | 'ended';
  scheduled_for?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  recording_url?: string | null;
  current_viewers: number;
}

interface LiveSectionProps {
  business: any;
  onBook: (moduleKey: string, itemId?: string) => void;
  onOpenCart: () => void;
}

const isRealBusinessId = (id: string) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);

export default function LiveSection({ business, onBook, onOpenCart }: LiveSectionProps) {
  const [loading, setLoading] = useState(true);
  const [liveStream, setLiveStream] = useState<StreamRow | null>(null);
  const [scheduledStream, setScheduledStream] = useState<StreamRow | null>(null);
  const [replays, setReplays] = useState<StreamRow[]>([]);
  const [watching, setWatching] = useState<StreamRow | null>(null);
  const [following, setFollowing] = useState(false);
  const [email, setEmail] = useState('');
  const [showFollowForm, setShowFollowForm] = useState(false);
  const [showShare, setShowShare] = useState(false);
  // A shared link lands here with ?watch=<id>; opening the viewer straight away
  // is the whole point of the link, and making someone hunt for the play button
  // after they already tapped "join the live" loses most of them.
  const [searchParams] = useSearchParams();
  const watchParam = searchParams.get('watch');

  const followKey = `nowopen_live_followed_${business.id}`;

  useEffect(() => {
    if (!isRealBusinessId(String(business.id))) { setLoading(false); return; }
    try { setFollowing(localStorage.getItem(followKey) === '1'); } catch { /* ignore */ }

    supabase
      .from('business_streams')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const rows: StreamRow[] = data || [];
        setLiveStream(rows.find((r) => r.status === 'live') || null);
        setScheduledStream(
          rows
            .filter((r) => r.status === 'scheduled' && r.scheduled_for)
            .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())[0] || null
        );
        setReplays(rows.filter((r) => r.status === 'ended' && r.recording_url).slice(0, 6));
        // Only a stream that belongs to THIS business, because the id arrives
        // from the query string and is not to be trusted as a lookup key.
        const requested = watchParam ? rows.find((r) => r.id === watchParam) : null;
        if (requested && (requested.status === 'live' || requested.recording_url)) setWatching(requested);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id]);

  const handleFollow = async () => {
    const { error } = await supabase.from('stream_followers').insert([{
      business_id: business.id,
      email: email.trim() || null,
      session_id: getSessionId(),
    }]);
    if (error && !error.message.includes('duplicate')) {
      toast.error(`Could not follow: ${error.message}`);
      return;
    }
    try { localStorage.setItem(followKey, '1'); } catch { /* ignore */ }
    setFollowing(true);
    setShowFollowForm(false);
    toast.success(email.trim() ? "You're following — we'll have a way to notify you soon!" : 'Following this business\'s live streams');
  };

  if (loading) {
    return <div className="animate-pulse h-40 bg-gray-100 dark:bg-gray-700 rounded-xl" />;
  }

  return (
    <div className="animate-fadeIn">
      <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
        🔴 NowOpen Live
      </h2>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
        Watch {business.name} broadcast live, chat in real time, and act on what you see.
      </p>

      <div className="relative rounded-2xl overflow-hidden bg-gray-900 aspect-video max-w-2xl">
        <img loading="lazy" decoding="async"
          src={business.image_url || business.logo_url}
          alt={business.name}
          className={`w-full h-full object-cover ${liveStream ? '' : 'opacity-50 grayscale'}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {liveStream ? (
          <>
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-md">
                <Radio size={12} className="animate-pulse" /> LIVE
              </span>
              <span className="inline-flex items-center gap-1 bg-black/50 text-white text-xs font-medium px-2 py-0.5 rounded-md">
                <Users size={12} /> {liveStream.current_viewers || 0} watching
              </span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => setWatching(liveStream)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 font-semibold rounded-full shadow-xl hover:scale-105 transition-transform"
              >
                <Play size={18} className="fill-current" /> Watch Live
              </button>
            </div>
            <div className="absolute bottom-3 left-3 right-3 flex items-end gap-2">
              <p className="flex-1 min-w-0 text-white text-sm font-medium truncate">{liveStream.title}</p>
              <button
                onClick={() => setShowShare((v) => !v)}
                aria-expanded={showShare}
                aria-label="Share this live stream"
                className="flex-shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-white text-xs font-semibold transition"
              >
                <Share2 size={14} /> Share
              </button>
            </div>
          </>
        ) : scheduledStream ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 gap-3">
            <span className="inline-flex items-center gap-1.5 bg-white/10 text-white text-xs font-medium px-3 py-1 rounded-full backdrop-blur">
              <Calendar size={13} /> Upcoming live stream
            </span>
            <p className="text-white font-semibold">{scheduledStream.title}</p>
            <p className="text-white/70 text-sm flex items-center gap-1.5">
              <Clock size={13} /> {new Date(scheduledStream.scheduled_for!).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <div className="flex items-center gap-2">
              <FollowButton following={following} showForm={showFollowForm} email={email} setEmail={setEmail} setShowForm={setShowFollowForm} onFollow={handleFollow} label="Notify Me" />
              {/* An upcoming stream is worth sharing too — that is when there is
                  still time for someone to plan to be there. */}
              {!showFollowForm && (
                <button
                  onClick={() => setShowShare((v) => !v)}
                  aria-expanded={showShare}
                  aria-label="Share this upcoming live stream"
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-white text-sm font-medium transition"
                >
                  <Share2 size={14} /> Share
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 gap-3">
            <p className="text-white/80 text-sm">{business.name} hasn't gone live yet.</p>
            <FollowButton following={following} showForm={showFollowForm} email={email} setEmail={setEmail} setShowForm={setShowFollowForm} onFollow={handleFollow} label="Follow Live" />
          </div>
        )}
      </div>

      {showShare && (liveStream || scheduledStream) && (
        <div className="mt-3 max-w-2xl rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <LiveShareSheet
            streamId={(liveStream || scheduledStream)!.id}
            title={(liveStream || scheduledStream)!.title}
            businessName={business.name}
            status={liveStream ? 'live' : 'scheduled'}
            scheduledFor={scheduledStream?.scheduled_for}
            fallbackImage={business.image_url || business.logo_url}
          />
        </div>
      )}

      {replays.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Past streams</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
            {replays.map((r) => (
              <button
                key={r.id}
                onClick={() => setWatching(r)}
                className="relative rounded-xl overflow-hidden aspect-video bg-gray-800 group"
              >
                <img loading="lazy" decoding="async" src={business.image_url || business.logo_url} alt={r.title} className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center">
                    <Play size={14} className="fill-gray-900 text-gray-900 ml-0.5" />
                  </div>
                </div>
                <p className="absolute bottom-1.5 left-2 right-2 text-white text-[11px] font-medium truncate text-left">{r.title}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {watching && (
        <LiveViewerModal
          business={business}
          stream={watching}
          onClose={() => setWatching(null)}
          onBook={onBook}
          onOpenCart={onOpenCart}
        />
      )}
    </div>
  );
}

function FollowButton({ following, showForm, email, setEmail, setShowForm, onFollow, label }: {
  following: boolean;
  showForm: boolean;
  email: string;
  setEmail: (v: string) => void;
  setShowForm: (v: boolean) => void;
  onFollow: () => void;
  label: string;
}) {
  if (following) {
    return (
      <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 text-white text-sm font-medium rounded-full backdrop-blur">
        <BellRing size={14} /> Following
      </span>
    );
  }
  if (showForm) {
    return (
      <div className="flex gap-2 w-full max-w-xs">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={320}
          placeholder="you@email.com (optional)"
          className="flex-1 px-3 py-2 text-xs rounded-lg border-0 focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={onFollow} className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition flex-shrink-0">
          Follow
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={() => setShowForm(true)}
      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 transition"
    >
      <Bell size={14} /> {label}
    </button>
  );
}
