import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Heart, Send, Loader2, Users } from 'lucide-react';

import { Business } from '../../types';
import { supabase } from '../../lib/supabase';
import { KEEP_TOPICS, reachFor, audienceSummary, type KeepTopic } from '../../lib/keeps';

/**
 * Sending to the people who keep this business.
 *
 * Four of the six topics send themselves from database triggers — a new
 * product, a new branch, a stream, the shop opening. Promotions and
 * announcements have no table to trigger from, so the owner writes those, and
 * this is where.
 *
 * The reach figure beside each topic is the point of the screen. It is not
 * "how many people follow you"; it is how many agreed to hear about THIS, which
 * is usually smaller and is the number that makes an owner write a better
 * message.
 */
interface Props {
  business: Business;
}

/** Only these can be written by hand; the rest fire from real events. */
const SENDABLE: KeepTopic[] = ['promotions', 'announcements'];

export default function KeepUpdates({ business }: Props) {
  const [rows, setRows] = useState<{ topics: unknown }[]>([]);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState<KeepTopic>('promotions');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const businessId = String(business.id);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('business_keeps')
      .select('topics')
      .eq('business_id', businessId);
    setRows((data as { topics: unknown }[]) || []);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const reach = useMemo(() => reachFor(rows, topic), [rows, topic]);
  const total = rows.length;

  const send = async () => {
    if (!title.trim()) { toast.error('Give the update a headline first.'); return; }
    setSending(true);
    const { data, error } = await supabase.rpc('send_keep_update', {
      p_business_id: businessId,
      p_topic: topic,
      p_title: title.trim().slice(0, 120),
      p_body: body.trim().slice(0, 400),
    });
    setSending(false);

    if (error) {
      toast.error(
        /does not exist|schema cache/i.test(error.message)
          ? 'Sending needs the keep_notifications migration applied first.'
          : error.message,
      );
      return;
    }
    // The function returns 0 when the topic is still inside its window. Saying
    // "sent to 0 people" would be a lie about what happened.
    const sent = typeof data === 'number' ? data : 0;
    if (sent === 0) {
      toast('Nothing sent — either nobody has opted into this topic yet, or you sent one recently.');
      return;
    }
    toast.success(`Sent to ${sent} ${sent === 1 ? 'person' : 'people'}`);
    setTitle('');
    setBody('');
  };

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white min-h-[44px]';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Heart size={15} className="fill-rose-500 text-rose-500" /> Keep updates
        </h2>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          {loading
            ? 'Counting your audience…'
            : total === 0
              ? 'Nobody keeps you yet. The Keep button on your profile is how people opt in.'
              : audienceSummary(total) || `${total} ${total === 1 ? 'person keeps' : 'people keep'} you`}
        </p>
      </div>

      {/* What each topic reaches. Shown for all six, including the four that
          send themselves, because an owner should be able to see the whole
          audience — not only the part they can message by hand. */}
      {!loading && total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {KEEP_TOPICS.map((t) => {
            const n = reachFor(rows, t.key);
            const manual = SENDABLE.includes(t.key);
            return (
              <div key={t.key} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{t.label}</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{n}</p>
                <p className="text-[9px] text-gray-400">{manual ? 'you send' : 'sends itself'}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {SENDABLE.map((key) => {
            const meta = KEEP_TOPICS.find((t) => t.key === key)!;
            return (
              <button
                key={key}
                onClick={() => setTopic(key)}
                aria-pressed={topic === key}
                className={`px-3 min-h-[44px] rounded-full text-xs font-semibold transition ${
                  topic === key
                    ? 'bg-rose-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className={field}
          placeholder={topic === 'promotions' ? '20% off all cuts this weekend' : 'Closed Monday for a public holiday'}
          aria-label="Headline"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={400}
          rows={3}
          className={`${field} min-h-[80px]`}
          placeholder="A line or two more (optional)"
          aria-label="Details"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Users size={12} />
            {loading ? '…' : `Goes to ${reach} ${reach === 1 ? 'person' : 'people'} who asked for this`}
          </p>
          <button
            onClick={send}
            disabled={sending || loading}
            className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg text-sm font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send update
          </button>
        </div>

        {/* Said before they hit send, not discovered afterwards. */}
        <p className="text-[10px] text-gray-400">
          One send per topic every few hours. It lands in their notifications, and only for the
          people who chose this topic.
        </p>
      </div>
    </div>
  );
}
