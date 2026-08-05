import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Mail, MessageCircle, Copy, Download, Save, Send, Trash2, Clock, Sparkles } from 'lucide-react';
import { Business } from '../../types';
import { COPY_GOALS, copyForGoal, copyPack, CopyGoal } from '../../lib/copywriter';
import { downloadText, slugForFile } from '../../lib/studio';

interface Props {
  business: Business;
}

interface CampaignDraft {
  id: string;
  title: string;
  goal: CopyGoal;
  email: string;
  sms: string;
  createdAt: string;
}

const BEST_TIMES = [
  ['WhatsApp / SMS', '12pm – 2pm', 'People check messages over lunch.'],
  ['Email', '9am – 11am', 'Start-of-day inboxes get the most opens.'],
  ['Social', '6pm – 9pm', 'Evenings are when people actually scroll.'],
  ['Avoid', 'Weekend mornings', 'Save those for stories — save campaigns for weekdays.'],
];

function campaignsKey(businessId: string) {
  return `nowopen_campaigns_${businessId}`;
}

function load(businessId: string): CampaignDraft[] {
  try {
    const raw = localStorage.getItem(campaignsKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as CampaignDraft[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function CampaignStudio({ business }: Props) {
  const [goal, setGoal] = useState<CopyGoal>('weekend-promo');
  const [drafts, setDrafts] = useState<CampaignDraft[]>(() => load(business.id));
  const [draftTitle, setDraftTitle] = useState('');
  const [copied, setCopied] = useState<'email' | 'sms' | null>(null);

  const email = useMemo(() => copyForGoal(business, goal, 'email'), [business, goal]);
  const sms = useMemo(() => copyForGoal(business, goal, 'sms'), [business, goal]);
  const goalLabel = COPY_GOALS.find((g) => g.key === goal)?.label || goal;

  const copy = (kind: 'email' | 'sms') => {
    const text = kind === 'email' ? email : sms;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1200);
    }).catch(() => toast.error('Could not copy — select the text manually.'));
  };

  const saveDraft = () => {
    const title = draftTitle.trim() || goalLabel;
    const next = [{ id: `${Date.now()}`, title, goal, email, sms, createdAt: new Date().toISOString() }, ...drafts];
    setDrafts(next);
    localStorage.setItem(campaignsKey(business.id), JSON.stringify(next));
    setDraftTitle('');
    toast.success('Draft saved');
  };

  const removeDraft = (id: string) => {
    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next);
    localStorage.setItem(campaignsKey(business.id), JSON.stringify(next));
  };

  const sendSms = () => {
    if (!business.phone) return toast.error('Add a phone number first to send via WhatsApp.');
    const digits = business.phone.replace(/[^\d]/g, '').replace(/^0/, '234');
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(sms)}`, '_blank');
  };

  const downloadPack = () => {
    const pack = copyPack(business, goal);
    const text = pack.map((p) => `--- ${p.platform.toUpperCase()} ---\n\n${p.text}`).join('\n\n');
    downloadText(text, `${slugForFile(business.name)}-${goal}-campaign.txt`);
    toast.success('Campaign pack downloaded (all platforms)');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Controls */}
      <div className="lg:col-span-2 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Campaign goal</label>
          <div className="grid grid-cols-2 gap-2">
            {COPY_GOALS.map((g) => (
              <button key={g.key} onClick={() => setGoal(g.key)}
                className={`text-left px-3 py-2 rounded-lg text-xs font-medium border transition ${goal === g.key ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1.5">
            <Clock size={13} /> Best send times
          </h4>
          <div className="space-y-2">
            {BEST_TIMES.map(([channel, time, why]) => (
              <div key={channel} className="flex items-start gap-2 text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-200 w-28 shrink-0">{channel}</span>
                <span className="font-medium text-purple-600 dark:text-purple-400 w-28 shrink-0">{time}</span>
                <span className="text-gray-500 dark:text-gray-400">{why}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Draft title (optional)"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <button onClick={saveDraft} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition">
              <Save size={15} /> Save draft
            </button>
          </div>
          <button onClick={downloadPack} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition">
            <Download size={15} /> Download all-platform campaign pack
          </button>
        </div>
      </div>

      {/* Outputs */}
      <div className="lg:col-span-3 space-y-5">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Mail size={16} className="text-purple-600 dark:text-purple-400" /> Email · {goalLabel}
            </h2>
            <button onClick={() => copy('email')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition">
              {copied === 'email' ? 'Copied!' : 'Copy'} <Copy size={12} />
            </button>
          </div>
          <textarea readOnly value={email}
            className="w-full min-h-[200px] rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-800 dark:text-gray-200 leading-relaxed resize-y focus:outline-none" />
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageCircle size={16} className="text-green-600 dark:text-green-400" /> SMS · {goalLabel} <span className="text-[10px] font-medium text-gray-400">({sms.length}/160 chars)</span>
            </h2>
            <div className="flex gap-2">
              <button onClick={sendSms} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition">
                <Send size={12} /> Send via WhatsApp
              </button>
              <button onClick={() => copy('sms')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition">
                {copied === 'sms' ? 'Copied!' : 'Copy'} <Copy size={12} />
              </button>
            </div>
          </div>
          <textarea readOnly value={sms}
            className="w-full min-h-[80px] rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-800 dark:text-gray-200 leading-relaxed resize-y focus:outline-none" />
        </div>

        {drafts.length > 0 && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Saved drafts ({drafts.length})</h3>
            <div className="space-y-2">
              {drafts.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{d.title}</p>
                    <p className="text-[11px] text-gray-400">{COPY_GOALS.find((g) => g.key === d.goal)?.label} · {new Date(d.createdAt).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => { setGoal(d.goal); setDraftTitle(''); }} className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline">
                    Load
                  </button>
                  <button onClick={() => removeDraft(d.id)} className="text-gray-400 hover:text-red-500 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-400 flex items-center gap-1">
          <Sparkles size={12} /> Written from your profile — switch the goal and every copy regenerates instantly.
        </p>
      </div>
    </div>
  );
}
