import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { Radio, Users, MessageSquare, Play, Calendar, Loader2, Trash2 } from 'lucide-react';

interface StreamRow {
  id: string;
  title: string;
  status: 'scheduled' | 'live' | 'ended';
  scheduled_for?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  recording_url?: string | null;
  peak_viewers: number;
  total_viewers: number;
  chat_message_count: number;
}

interface StreamHistoryProps {
  businessId: string;
  refreshKey: number;
  /** The title travels with the id so the share card can name the stream. */
  onStartScheduled: (streamId: string, title: string) => void;
}

export default function StreamHistory({ businessId, refreshKey, onStartScheduled }: StreamHistoryProps) {
  const [streams, setStreams] = useState<StreamRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('business_streams')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setStreams(data || []); setLoading(false); });
  }, [businessId, refreshKey]);

  const deleteStream = async (stream: StreamRow) => {
    if (!window.confirm(`Delete "${stream.title}"? This cannot be undone.`)) return;
    const { data, error } = await supabase.from('business_streams').delete().eq('id', stream.id).select();
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      toast.error('Nothing was deleted — please refresh and try again. If it persists, the database policies need updating (scripts/sql/apply_all_migrations.sql).');
      return;
    }
    setStreams(prev => prev.filter(s => s.id !== stream.id));
    toast.success('Stream deleted');
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;
  }

  if (streams.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
        No streams yet — start your first one from the "New Stream" tab.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {streams.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {s.status === 'live' && (
                <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                  <Radio size={9} className="animate-pulse" /> LIVE
                </span>
              )}
              {s.status === 'scheduled' && (
                <span className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-bold px-1.5 py-0.5 rounded">
                  <Calendar size={9} /> SCHEDULED
                </span>
              )}
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.title}</p>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              {s.status === 'scheduled' && s.scheduled_for && (
                <span>{new Date(s.scheduled_for).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              )}
              {s.status === 'ended' && (
                <>
                  <span className="flex items-center gap-1"><Users size={11} /> {s.peak_viewers} peak · {s.total_viewers} total</span>
                  <span className="flex items-center gap-1"><MessageSquare size={11} /> {s.chat_message_count}</span>
                </>
              )}
            </div>
          </div>
          {s.status === 'scheduled' && (
            <button
              onClick={() => onStartScheduled(s.id, s.title)}
              className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition"
            >
              <Radio size={12} /> Start Now
            </button>
          )}
          {s.status === 'ended' && s.recording_url && (
            <a
              href={s.recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <Play size={12} /> Replay
            </a>
          )}
          <button
            onClick={() => deleteStream(s)}
            className="flex-shrink-0 p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
            title="Delete stream"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
