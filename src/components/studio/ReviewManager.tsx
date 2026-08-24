import { useState } from 'react';
import toast from 'react-hot-toast';
import { Star, StarHalf, Copy, MessageCircle, Send, Plus, Sparkles, ThumbsUp, ThumbsDown, Minus as MinusIcon, CheckCircle2 } from 'lucide-react';
import { Business } from '../../types';
import { Review, Sentiment, sentimentOf, replyFor, reviewStats, loadReviews, saveReviews, makeReview, sampleReviews } from '../../lib/reviews';

interface Props {
  business: Business;
}

function Stars({ value, size = 14, onPick }: { value: number; size?: number; onPick?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" disabled={!onPick} onClick={() => onPick?.(i)}
          className={onPick ? 'cursor-pointer' : 'cursor-default'}>
          <Star size={size} className={i <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'} />
        </button>
      ))}
    </div>
  );
}

const SENTIMENT_STYLE: Record<Sentiment, { label: string; chip: string; icon: typeof ThumbsUp }> = {
  positive: { label: 'Positive', chip: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300', icon: ThumbsUp },
  neutral: { label: 'Neutral', chip: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300', icon: MinusIcon },
  negative: { label: 'Negative', chip: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300', icon: ThumbsDown },
};

export default function ReviewManager({ business }: Props) {
  const [reviews, setReviews] = useState<Review[]>(() => loadReviews(business.id));
  const [showAdd, setShowAdd] = useState(false);
  const [author, setAuthor] = useState('');
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const persist = (next: Review[]) => {
    setReviews(next);
    saveReviews(business.id, next);
  };

  const stats = reviewStats(reviews);

  const add = () => {
    if (!author.trim() || !text.trim()) return toast.error('Add a name and a few words.');
    const r = makeReview({ author: author.trim(), rating, text: text.trim() });
    persist([r, ...reviews]);
    setAuthor(''); setText(''); setRating(5);
    setShowAdd(false);
    toast.success('Review added');
  };

  const loadSamples = () => {
    persist([...sampleReviews(business), ...reviews]);
    toast.success('Sample reviews added — replace them with real ones anytime.');
  };

  const suggest = (r: Review) => {
    setDraftReplies((prev) => ({ ...prev, [r.id]: replyFor(business, r) }));
  };

  const reply = (r: Review) => {
    const draft = (draftReplies[r.id] || '').trim();
    if (!draft) return toast.error('Generate a suggested reply first.');
    persist(reviews.map((x) => x.id === r.id ? { ...x, replied: true, reply: draft } : x));
    setDraftReplies((prev) => { const next = { ...prev }; delete next[r.id]; return next; });
    toast.success('Reply posted — great service touch.');
  };

  const copyReply = (r: Review) => {
    navigator.clipboard?.writeText(r.reply || '').then(() => {
      setCopied(r.id);
      setTimeout(() => setCopied(null), 1200);
    }).catch(() => toast.error('Could not copy — select the text manually.'));
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex items-center gap-2">
            <Star className="text-amber-400 fill-amber-400" size={18} />
            <span className="text-2xl font-black text-gray-900 dark:text-white">{stats.avg || '—'}</span>
          </div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-1">Average rating</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-2xl font-black text-gray-900 dark:text-white">{stats.total}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-1">Reviews</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-2xl font-black text-green-600 dark:text-green-400">{stats.responded}/{stats.total}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-1">Responded</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex items-center justify-between">
            <ThumbsUp size={16} className="text-green-500" />
            <ThumbsDown size={16} className="text-red-500" />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-1">{stats.positive} positive · {stats.negative} negative</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowAdd((v) => !v)} className="inline-flex items-center gap-1.5 px-3.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
          <Plus size={15} /> {showAdd ? 'Close' : 'Add a review'}
        </button>
        {reviews.length === 0 && (
          <button onClick={loadSamples} className="inline-flex items-center gap-1.5 px-3.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition min-h-[44px]">
            <Sparkles size={15} /> Load sample reviews
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Customer</label>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. Aminata"
              className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Rating</label>
            <div className="pt-1.5"><Stars value={rating} size={20} onPick={setRating} /></div>
          </div>
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Review</label>
            <div className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="What did the customer say?"
                className="flex-1 px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px] items-center" />
              <button onClick={add} className="inline-flex items-center px-4 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review list */}
      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <StarHalf size={24} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No reviews yet. Add one, or load sample reviews to see the manager in action.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => {
            const s = sentimentOf(r.text);
            const style = SENTIMENT_STYLE[s];
            return (
              <div key={r.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-700 dark:text-purple-300 text-sm font-bold shrink-0">
                      {(r.author || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{r.author} <span className="font-normal text-gray-400 text-xs">· {r.date}</span></p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Stars value={r.rating} />
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${style.chip}`}>
                          <style.icon size={10} /> {style.label}
                        </span>
                        {r.replied && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                            <CheckCircle2 size={10} /> Replied
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-200 mt-3 leading-relaxed">“{r.text}”</p>

                {r.replied && r.reply ? (
                  <div className="mt-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 p-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Your reply</p>
                      <button onClick={() => copyReply(r)} className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        {copied === r.id ? 'Copied!' : 'Copy'} <Copy size={11} />
                      </button>
                    </div>
                    <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed whitespace-pre-wrap">{r.reply}</p>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl bg-gray-50 dark:bg-gray-700/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <Sparkles size={11} /> AI-drafted reply
                      </p>
                      <button onClick={() => suggest(r)} className="inline-flex items-center gap-1 min-h-[44px] px-2 rounded-lg text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">
                        <MessageCircle size={11} /> Generate suggestion
                      </button>
                    </div>
                    <textarea value={draftReplies[r.id] || ''} onChange={(e) => setDraftReplies((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="Your AI reply will appear here — edit it, then post."
                      className="w-full min-h-[70px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 text-sm text-gray-800 dark:text-gray-200 leading-relaxed resize-y focus:outline-none" />
                    <div className="flex justify-end mt-2">
                      <button onClick={() => reply(r)}
                        className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                        <Send size={12} /> Post reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
