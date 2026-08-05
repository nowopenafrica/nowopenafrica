import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useBroadcastStream } from '../../hooks/useBroadcastStream';
import LiveChat from './LiveChat';
import StreamHistory from './StreamHistory';
import {
  X, Radio, Mic, MicOff, Video, VideoOff, Subtitles, Loader2, Calendar, History,
} from 'lucide-react';

interface GoLiveModalProps {
  business: { id: string; name: string };
  onClose: () => void;
}

export default function GoLiveModal({ business, onClose }: GoLiveModalProps) {
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [creating, setCreating] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const broadcaster = useBroadcastStream();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && broadcaster.localStream) videoRef.current.srcObject = broadcaster.localStream;
  }, [broadcaster.localStream]);

  const goLiveNow = async () => {
    if (!title.trim()) { toast.error('Give your stream a title'); return; }
    setCreating(true);
    const { data, error } = await supabase.from('business_streams').insert([{
      business_id: business.id,
      title: title.trim(),
      description: description.trim() || null,
      status: 'live',
      started_at: new Date().toISOString(),
    }]).select().single();
    setCreating(false);
    if (error || !data) {
      toast.error(`Could not start stream: ${error?.message || 'unknown error'}. If this mentions a missing table, run scripts/sql/apply_all_migrations.sql in Supabase.`);
      return;
    }
    setStreamId(data.id);
    await broadcaster.start(data.id);
  };

  const schedule = async () => {
    if (!title.trim()) { toast.error('Give your stream a title'); return; }
    if (!scheduledFor) { toast.error('Pick a date and time'); return; }
    setCreating(true);
    const { error } = await supabase.from('business_streams').insert([{
      business_id: business.id,
      title: title.trim(),
      description: description.trim() || null,
      status: 'scheduled',
      scheduled_for: new Date(scheduledFor).toISOString(),
    }]);
    setCreating(false);
    if (error) {
      toast.error(`Could not schedule: ${error.message}`);
      return;
    }
    toast.success('Stream scheduled');
    setTitle(''); setDescription(''); setScheduledFor('');
    setRefreshKey((k) => k + 1);
    setTab('history');
  };

  const startScheduled = async (id: string) => {
    const { error } = await supabase.from('business_streams').update({ status: 'live', started_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(`Could not start: ${error.message}`); return; }
    setStreamId(id);
    await broadcaster.start(id);
  };

  const endStream = async () => {
    await broadcaster.stop();
    setStreamId(null);
    setRefreshKey((k) => k + 1);
    toast.success('Stream ended — replay is processing');
  };

  const isBroadcasting = !!streamId;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            🔴 NowOpen Live — {business.name}
          </h2>
          <button
            onClick={() => { if (isBroadcasting && !window.confirm('End your live stream and close?')) return; if (isBroadcasting) endStream(); onClose(); }}
            aria-label="Close"
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <X size={20} />
          </button>
        </div>

        {isBroadcasting ? (
          <div className="p-5 space-y-4">
            {broadcaster.error ? (
              <div className="text-center py-8">
                <p className="text-sm text-red-600 dark:text-red-400 mb-3">{broadcaster.error}</p>
                <button onClick={() => setStreamId(null)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  Back
                </button>
              </div>
            ) : !broadcaster.localStream ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <Loader2 size={28} className="animate-spin text-gray-400" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Requesting camera & microphone access…</p>
              </div>
            ) : (
              <>
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
                      <Radio size={11} className="animate-pulse" /> LIVE
                    </span>
                    <span className="bg-black/50 text-white text-[11px] font-medium px-2 py-0.5 rounded-md">
                      {broadcaster.viewerCount} watching
                    </span>
                  </div>
                  {broadcaster.captionsOn && broadcaster.currentCaption && (
                    <p className="absolute bottom-2.5 inset-x-2.5 text-center text-white text-xs bg-black/60 rounded-lg px-2 py-1 truncate">
                      {broadcaster.currentCaption}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-center gap-2">
                  <button onClick={broadcaster.toggleMic} className={`p-2.5 rounded-full transition ${broadcaster.micOn ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                    {broadcaster.micOn ? <Mic size={16} /> : <MicOff size={16} />}
                  </button>
                  <button onClick={broadcaster.toggleCam} className={`p-2.5 rounded-full transition ${broadcaster.camOn ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                    {broadcaster.camOn ? <Video size={16} /> : <VideoOff size={16} />}
                  </button>
                  {broadcaster.captionsSupported && (
                    <button onClick={broadcaster.toggleCaptions} className={`p-2.5 rounded-full transition ${broadcaster.captionsOn ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`} title="AI captions">
                      <Subtitles size={16} />
                    </button>
                  )}
                  <button onClick={endStream} className="px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-full hover:bg-red-700 transition">
                    End Stream
                  </button>
                </div>

                <div className="border border-gray-200 dark:border-gray-700 rounded-xl h-64">
                  <LiveChat streamId={streamId} businessId={business.id} isOwner />
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setTab('new')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium border-b-2 transition ${tab === 'new' ? 'text-blue-600 dark:text-blue-400 border-blue-600' : 'text-gray-500 dark:text-gray-400 border-transparent'}`}
              >
                <Radio size={14} /> New Stream
              </button>
              <button
                onClick={() => setTab('history')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium border-b-2 transition ${tab === 'history' ? 'text-blue-600 dark:text-blue-400 border-blue-600' : 'text-gray-500 dark:text-gray-400 border-transparent'}`}
              >
                <History size={14} /> Past Streams
              </button>
            </div>

            <div className="p-5">
              {tab === 'new' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Stream title</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={200}
                      placeholder="e.g. Weekend specials walkthrough"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={2000}
                      rows={2}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg">
                    <button
                      onClick={() => setScheduleMode('now')}
                      className={`flex-1 py-2 text-xs font-medium rounded-md transition ${scheduleMode === 'now' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                      Go live now
                    </button>
                    <button
                      onClick={() => setScheduleMode('later')}
                      className={`flex-1 py-2 text-xs font-medium rounded-md transition ${scheduleMode === 'later' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                      Schedule for later
                    </button>
                  </div>

                  {scheduleMode === 'later' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                        <Calendar size={12} /> Date & time
                      </label>
                      <input
                        type="datetime-local"
                        value={scheduledFor}
                        onChange={(e) => setScheduledFor(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                    </div>
                  )}

                  <button
                    onClick={scheduleMode === 'now' ? goLiveNow : schedule}
                    disabled={creating}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition disabled:opacity-50 text-sm"
                  >
                    {creating ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />}
                    {creating ? 'Please wait…' : scheduleMode === 'now' ? 'Go Live Now' : 'Schedule Stream'}
                  </button>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                    Streaming uses your browser's camera — no extra app needed. Works from desktop or mobile browsers.
                  </p>
                </div>
              ) : (
                <StreamHistory businessId={business.id} refreshKey={refreshKey} onStartScheduled={startScheduled} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
