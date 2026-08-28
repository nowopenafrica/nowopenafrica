import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Heart, Bell, Loader2, Check } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  KEEP_TOPICS, DEFAULT_TOPICS, normaliseTopics, toggleTopic, keepLabel,
  rememberPendingKeep, takePendingKeep,
  type KeepTopic,
} from '../lib/keeps';

/**
 * "Keep this business on my radar."
 *
 * The middle step of the loop the product needs: DISCOVER → KEEP → GET NOTIFIED
 * → VISIT → BUY → RETURN. Without it, every return visit has to be bought
 * again.
 *
 * SIGNING IN IS REQUIRED, and that is not an oversight. A Keep is a promise to
 * send someone updates, and notifications.user_id references a real account —
 * an anonymous keep would be a promise the product could not deliver on. What
 * IS handled is the cost of that requirement: the tap is remembered across the
 * sign-in round trip and completes itself on return, so nobody is made to do
 * the work twice.
 *
 * The topics are shown at the moment of keeping rather than buried in settings,
 * because that is the moment the permission is being given and the only moment
 * someone is thinking about it.
 */
interface KeepButtonProps {
  businessId: string;
  businessName: string;
  /** Compact form for a card; the full one carries the topic panel. */
  compact?: boolean;
  /**
   * 'sm' shrinks the control for dense card layouts, where the details are what
   * the reader came for and the button should not crowd them out. Still 36px
   * tall — below that it stops being comfortably tappable on a phone.
   */
  size?: 'sm' | 'md';
  className?: string;
}

export default function KeepButton({ businessId, businessName, compact, size = 'md', className = '' }: KeepButtonProps) {
  const { user } = useAuth();
  const [keeping, setKeeping] = useState(false);
  const [topics, setTopics] = useState<KeepTopic[]>(DEFAULT_TOPICS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  // Guards the resume-after-sign-in path so it can only fire once per mount.
  const resumed = useRef(false);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('business_keeps')
      .select('topics')
      .eq('user_id', user.id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (data) {
      setKeeping(true);
      setTopics(normaliseTopics((data as { topics?: unknown }).topics));
    }
    setLoading(false);
  }, [user, businessId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (next: KeepTopic[]) => {
    if (!user) return false;
    setSaving(true);
    const { error } = await supabase
      .from('business_keeps')
      .upsert(
        { user_id: user.id, business_id: businessId, topics: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,business_id' },
      );
    setSaving(false);
    if (error) {
      toast.error(
        /does not exist|schema cache/i.test(error.message)
          ? 'Keeping needs the business_keeps migration applied first.'
          : `Could not save: ${error.message}`,
      );
      return false;
    }
    return true;
  }, [user, businessId]);

  const startKeeping = useCallback(async (chosen: KeepTopic[] = DEFAULT_TOPICS) => {
    if (!user) {
      rememberPendingKeep(businessId);
      setNeedsSignIn(true);
      return;
    }
    if (!(await save(chosen))) return;
    setKeeping(true);
    setTopics(chosen);
    setShowTopics(true);
    toast.success(`Keeping ${businessName}`);
  }, [user, businessId, businessName, save]);

  // A tap that was interrupted by signing in completes itself on return.
  useEffect(() => {
    if (!user || loading || keeping || resumed.current) return;
    if (!takePendingKeep(businessId)) return;
    resumed.current = true;
    startKeeping();
  }, [user, loading, keeping, businessId, startKeeping]);

  const stopKeeping = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('business_keeps').delete()
      .eq('user_id', user.id).eq('business_id', businessId);
    setSaving(false);
    if (error) { toast.error(`Could not stop keeping: ${error.message}`); return; }
    setKeeping(false);
    setShowTopics(false);
    setTopics(DEFAULT_TOPICS);
    toast.success(`Stopped keeping ${businessName}`);
  };

  const changeTopic = async (topic: KeepTopic) => {
    const next = toggleTopic(topics, topic);
    setTopics(next);           // optimistic: a checkbox that lags feels broken
    if (!(await save(next))) setTopics(topics);
  };

  if (loading) {
    return (
      <span className={`inline-flex items-center justify-center gap-2 px-3 min-h-[44px] rounded-lg text-sm text-gray-400 ${className}`}>
        <Loader2 size={15} className="animate-spin" />
      </span>
    );
  }

  if (needsSignIn) {
    return (
      <Link
        to="/login"
        className={`inline-flex items-center justify-center gap-1.5 px-3 sm:px-6 min-h-[44px] rounded-lg text-xs sm:text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 transition ${className}`}
      >
        <Heart size={15} /> Sign in to Keep
      </Link>
    );
  }

  return (
    <div className={compact ? '' : 'relative'}>
      <button
        onClick={() => (keeping ? setShowTopics((v) => !v) : startKeeping())}
        disabled={saving}
        aria-pressed={keeping}
        aria-label={keeping ? `Keeping ${businessName} — change what you hear about` : `Keep ${businessName}`}
        title={keeping ? 'Change what you hear about' : 'Keep this business on your radar'}
        className={`inline-flex items-center justify-center rounded-lg font-medium transition disabled:opacity-60 ${
          size === 'sm'
            ? 'gap-1 px-2.5 min-h-[36px] text-[11px]'
            : 'gap-1.5 sm:gap-2 px-3 sm:px-6 min-h-[44px] text-xs sm:text-sm'
        } ${
          keeping
            ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
            : 'bg-rose-600 text-white hover:bg-rose-700'
        } ${className}`}
      >
        {saving
          ? <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin" />
          : <Heart size={size === 'sm' ? 13 : 15} className={keeping ? 'fill-current' : ''} />}
        {keepLabel(keeping)}
        {keeping && topics.length > 0 && <Bell size={size === 'sm' ? 11 : 13} aria-hidden="true" />}
      </button>

      {/* The consent panel. Shown right after keeping, because that is the
          moment the permission is being given and the only moment anyone is
          thinking about it. */}
      {keeping && showTopics && !compact && (
        <div className="absolute z-20 mt-2 w-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5 shadow-xl">
          <p className="text-xs font-bold text-gray-900 dark:text-white">What would you like to hear about?</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 mb-2">
            Only these. You can change it any time.
          </p>

          <div className="space-y-1.5">
            {KEEP_TOPICS.map((t) => {
              const on = topics.includes(t.key);
              return (
                <button
                  key={t.key}
                  onClick={() => changeTopic(t.key)}
                  aria-pressed={on}
                  className="w-full flex items-start gap-2.5 text-left rounded-lg px-2 py-1.5 min-h-[44px] hover:bg-gray-50 dark:hover:bg-gray-700/60 transition"
                >
                  <span className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${
                    on ? 'bg-rose-600 border-rose-600 text-white' : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {on && <Check size={11} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-gray-900 dark:text-white">{t.label}</span>
                    {/* The example is what makes a checkbox mean something. */}
                    <span className="block text-[10px] text-gray-500 dark:text-gray-400">“{t.example}”</span>
                  </span>
                </button>
              );
            })}
          </div>

          {topics.length === 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
              You will still see {businessName} in your Keeps, but we will not message you.
            </p>
          )}

          <button
            onClick={stopKeeping}
            className="mt-3 w-full min-h-[44px] rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition"
          >
            Stop keeping {businessName}
          </button>
        </div>
      )}
    </div>
  );
}
