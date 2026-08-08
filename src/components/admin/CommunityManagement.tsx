import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, MessageCircle, Inbox, Copy, Loader2, ExternalLink, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

// The Community Management inbox (#8) — every platform enquiry the team has
// received, from the real platform_enquiries table (admins can read it). Each
// row offers copy-to-clipboard for the contact details so the team can reply
// from their own inbox until the social + WhatsApp channels are wired in.

interface Enquiry {
  id: string;
  kind: string;
  item_title: string;
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  created_at?: string;
}

const KIND_LABEL: Record<string, string> = {
  advert: 'Advert',
  media_service: 'Media service',
  platform: 'Platform',
};

const KIND_TONE: Record<string, string> = {
  advert: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300',
  media_service: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300',
  platform: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300',
};

export default function CommunityManagement() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [kind, setKind] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('platform_enquiries')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEnquiries((data ?? []) as Enquiry[]);
      setError(false);
    } catch {
      setError(true);
      setEnquiries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () => (kind === 'all' ? enquiries : enquiries.filter((e) => e.kind === kind)),
    [enquiries, kind],
  );

  const kinds = useMemo(() => {
    const counts: Record<string, number> = { all: enquiries.length };
    enquiries.forEach((e) => { counts[e.kind] = (counts[e.kind] ?? 0) + 1; });
    return counts;
  }, [enquiries]);

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copied`)).catch(() => toast.error('Could not copy — select it manually.'));
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total enquiries', value: enquiries.length, icon: Inbox, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
          { label: 'Advert leads', value: kinds.advert ?? 0, icon: Mail, tone: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
          { label: 'Media service leads', value: kinds.media_service ?? 0, icon: MessageCircle, tone: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300' },
          { label: 'Platform leads', value: kinds.platform ?? 0, icon: ExternalLink, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
        ].map((w) => (
          <div key={w.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${w.tone}`}>
              <w.icon size={17} />
            </div>
            <div className="text-2xl font-black text-gray-900 dark:text-white">{w.value}</div>
            <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{w.label}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Could not load enquiries — check the backend connection.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'advert', 'media_service', 'platform'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${kind === k ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            {k === 'all' ? 'All' : KIND_LABEL[k]} <span className="opacity-70">({kinds[k] ?? 0})</span>
          </button>
        ))}
        <Link to="/admin" className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400">
          Admin console <ArrowRight size={12} />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center"><Loader2 className="animate-spin" size={16} /> Loading enquiries…</div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No {kind !== 'all' ? KIND_LABEL[kind].toLowerCase() : ''} enquiries yet.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => (
            <div key={e.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${KIND_TONE[e.kind] ?? 'bg-gray-100 text-gray-600'}`}>
                    {KIND_LABEL[e.kind] ?? e.kind}
                  </span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{e.name} <span className="text-gray-400 font-normal">→ {e.item_title}</span></span>
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">
                  {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-wrap">{e.message}</p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button onClick={() => copy(e.email, 'Email')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                  <Mail size={13} /> {e.email} <Copy size={12} className="opacity-60" />
                </button>
                {e.phone && (
                  <button onClick={() => copy(e.phone!, 'Phone')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                    <Phone size={13} /> {e.phone} <Copy size={12} className="opacity-60" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
