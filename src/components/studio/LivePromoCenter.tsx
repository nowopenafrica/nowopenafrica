import { useState } from 'react';
import toast from 'react-hot-toast';
import { Radio, Zap, WalletCards, Share2, Send, Trash2, CheckCircle2, Clock, Plus, ArrowRight, CalendarClock } from 'lucide-react';
import { Business } from '../../types';
import { GrowthPlanModule } from '../../lib/growth';
import { Promo, PromoStatus, promoStatus, daysLeft, dateLabel, promoBlurb, suggestDates, loadPromos, savePromos, createPromo, promoCounts } from '../../lib/promotions';
import { PROMO_TEMPLATES } from '../../data/studioPresets';

interface Props {
  business: Business;
  onNavigate: (module: GrowthPlanModule) => void;
}

const CHANNELS = ['social', 'whatsapp', 'email', 'sms'];

const STATUS_STYLES: Record<PromoStatus, { label: string; chip: string; dot: string }> = {
  live: { label: 'LIVE', chip: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  scheduled: { label: 'Scheduled', chip: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  ended: { label: 'Ended', chip: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400', dot: 'bg-gray-400' },
};

function whatsappLink(phone: string, text: string): string {
  const digits = String(phone || '').replace(/[^\d]/g, '').replace(/^0/, '234');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default function LivePromoCenter({ business, onNavigate }: Props) {
  const [promos, setPromos] = useState<Promo[]>(() => loadPromos(business.id));
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('');
  const [offer, setOffer] = useState('');
  const [template, setTemplate] = useState(PROMO_TEMPLATES[0].key);
  const [duration, setDuration] = useState(3);
  const [channels, setChannels] = useState<string[]>(['social', 'whatsapp']);
  const [startsAt, setStartsAt] = useState(suggestDates(3).startsAt);
  const [endsAt, setEndsAt] = useState(suggestDates(3).endsAt);

  const persist = (next: Promo[]) => {
    setPromos(next);
    savePromos(business.id, next);
  };

  const useSuggestion = () => {
    setTemplate('weekend-offer');
    setTitle('Weekend Special');
    setOffer('Enjoy a special offer all weekend long — first come, first served.');
    const d = suggestDates(3);
    setStartsAt(d.startsAt);
    setEndsAt(d.endsAt);
    setShowForm(true);
  };

  const add = () => {
    if (!title.trim() || !offer.trim()) return toast.error('Give the promo a title and an offer.');
    const p = createPromo({ title: title.trim(), offer: offer.trim(), template, startsAt, endsAt, channels });
    persist([p, ...promos]);
    setTitle(''); setOffer('');
    setShowForm(false);
    toast.success('Promotion created');
  };

  const setLive = (id: string) => {
    const today = new Date().toISOString().slice(0, 10);
    persist(promos.map((p) => p.id === id ? { ...p, startsAt: p.startsAt > today ? today : p.startsAt, endsAt: p.endsAt < today ? today : p.endsAt } : p));
    toast.success('Promotion is now live');
  };

  const end = (id: string) => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    persist(promos.map((p) => p.id === id ? { ...p, endsAt: yesterday } : p));
    toast.success('Promotion ended');
  };

  const share = (p: Promo) => {
    const text = promoBlurb(business, p);
    persist(promos.map((x) => x.id === p.id ? { ...x, shared: true } : x));
    if (business.phone) window.open(whatsappLink(business.phone, text), '_blank');
    else toast.success('Copy the message and send it from your phone.');
  };

  const remove = (id: string) => persist(promos.filter((p) => p.id !== id));

  const counts = promoCounts(promos);
  const ordered = [...promos].sort((a, b) => {
    const rank: Record<PromoStatus, number> = { live: 0, scheduled: 1, ended: 2 };
    return rank[promoStatus(a)] - rank[promoStatus(b)] || String(b.created_at).localeCompare(String(a.created_at));
  });

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          ['Live now', counts.live, 'text-green-600 dark:text-green-400'],
          ['Scheduled', counts.scheduled, 'text-amber-600 dark:text-amber-400'],
          ['Ended', counts.ended, 'text-gray-500 dark:text-gray-400'],
          ['Shared', counts.shared, 'text-blue-600 dark:text-blue-400'],
        ] as [string, number, string][]).map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-center">
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Suggestion + create */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 p-5 text-white">
          <div className="flex items-start gap-3">
            <Zap size={18} className="mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-bold">Suggested next promo</h3>
              <p className="text-xs mt-1 opacity-90 leading-relaxed">Weekend offers are the fastest way to pull customers in. Schedule one for this {new Date().toLocaleDateString(undefined, { weekday: 'long' })}.</p>
              <button onClick={useSuggestion} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium bg-white text-purple-700 px-3 rounded-lg hover:bg-purple-50 transition min-h-[44px]">
                Use this idea <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <CalendarClock size={16} className="text-purple-600 dark:text-purple-400" /> Promotion lifecycle
            </h3>
            <button onClick={() => setShowForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
              <Plus size={15} /> {showForm ? 'Close' : 'New promotion'}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Create a promo, schedule it, then take it live when the day comes. Every promo becomes a shareable WhatsApp message.</p>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend Special"
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Offer</label>
              <input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="e.g. 20% off everything"
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Asset template</label>
              <select value={template} onChange={(e) => setTemplate(e.target.value)}
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]">
                {PROMO_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Starts</label>
              <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Ends</label>
              <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Run for</label>
              <select value={duration} onChange={(e) => { const d = Number(e.target.value); setDuration(d); const s = suggestDates(d); setStartsAt(s.startsAt); setEndsAt(s.endsAt); }}
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]">
                <option value={2}>2 days</option>
                <option value={3}>3 days (weekend)</option>
                <option value={7}>1 week</option>
                <option value={14}>2 weeks</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Promote on</label>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <button key={c} onClick={() => setChannels((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])}
                  className={`inline-flex items-center px-3 rounded-lg text-xs font-medium capitalize transition ${channels.includes(c) ? 'bg-purple-600 text-white' : 'border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'} min-h-[44px]`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={add} className="inline-flex items-center gap-1.5 px-4 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
              <Plus size={15} /> Create promotion
            </button>
          </div>
        </div>
      )}

      {/* Promo list */}
      {ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <Radio size={24} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No promotions yet. Create your first one and take it live.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map((p) => {
            const st = promoStatus(p);
            const style = STATUS_STYLES[st];
            return (
              <div key={p.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${style.chip}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} /> {style.label}
                      </span>
                      <span className="text-[11px] text-gray-400">{PROMO_TEMPLATES.find((t) => t.key === p.template)?.label}</span>
                    </div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white mt-1.5">{p.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{p.offer}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                      {dateLabel(p.startsAt)} → {dateLabel(p.endsAt)}
                      {' · '}
                      {st === 'live' && <span className="font-semibold text-green-600 dark:text-green-400">{daysLeft(p)} day{daysLeft(p) === 1 ? '' : 's'} left</span>}
                      {st === 'scheduled' && <span>starts soon</span>}
                      {st === 'ended' && <span>finished</span>}
                      {p.shared && <span className="text-blue-600 dark:text-blue-400"> · shared on WhatsApp</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {st === 'scheduled' && (
                      <button onClick={() => setLive(p.id)} className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition min-h-[44px]">
                        <CheckCircle2 size={13} /> Go live
                      </button>
                    )}
                    {st === 'live' && (
                      <button onClick={() => end(p.id)} className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition min-h-[44px]">
                        <Clock size={13} /> End
                      </button>
                    )}
                    <button onClick={() => share(p)} className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition min-h-[44px]">
                      <Send size={13} /> WhatsApp
                    </button>
                    <button onClick={() => onNavigate('promotions')} className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                      <WalletCards size={13} /> Design asset
                    </button>
                    <button onClick={() => remove(p.id)} className="inline-flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium text-gray-400 hover:text-red-500 transition min-h-[44px]">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {st === 'live' && (
                  <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${100 - daysLeft(p)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <Share2 size={12} /> Promotions are saved on this device for {business.name}. Share on WhatsApp to mark a promo as shared.
      </p>
    </div>
  );
}
