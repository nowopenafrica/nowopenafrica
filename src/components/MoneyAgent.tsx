import { useMemo, useState } from 'react';
import {
  Wallet, Send, Banknote, Smartphone, ReceiptText, Landmark, Globe,
  MessageCircle, ArrowRight,
} from 'lucide-react';

export interface MoneyService {
  id: string | number;
  name: string;
  description?: string;
  price?: string;   // fee / rate note
  service_category?: string | null;   // service type
}

interface Props {
  services: MoneyService[];
  ctaLabel: string;
  providers?: string[];
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: MoneyService) => void;
  onEnquire: (context: string) => void;
}

// Quick-service tiles that map to an enquiry context.
const QUICK = [
  { icon: Banknote, label: 'Withdraw cash', ctx: 'a cash withdrawal' },
  { icon: Send, label: 'Send money', ctx: 'sending money / a transfer' },
  { icon: Smartphone, label: 'Airtime & data', ctx: 'airtime or data top-up' },
  { icon: ReceiptText, label: 'Pay a bill', ctx: 'a bill payment' },
];

const iconFor = (cat?: string | null) => {
  switch ((cat || '').toLowerCase()) {
    case 'cash-out': return Banknote;
    case 'transfer': return Send;
    case 'remittance': return Globe;
    case 'airtime & data': return Smartphone;
    case 'bills': return ReceiptText;
    case 'account': return Landmark;
    default: return Wallet;
  }
};

export default function MoneyAgent({
  services, ctaLabel, providers = [], hasPhone, onBook, onWhatsApp, onEnquire,
}: Props) {
  const [type, setType] = useState('All');

  const types = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => { if (s.service_category) set.add(s.service_category); });
    return ['All', ...[...set].sort()];
  }, [services]);

  const filtered = type === 'All' ? services : services.filter((s) => s.service_category === type);

  if (services.length === 0) {
    return (
      <div className="text-center py-12">
        <Wallet size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Services aren’t listed yet.</p>
        <button onClick={() => onEnquire('a transaction')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition text-sm">
          Get started
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Quick services */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {QUICK.map((q) => (
          <button
            key={q.label}
            onClick={() => onEnquire(q.ctx)}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-4 hover:border-green-400 hover:bg-green-50/50 dark:hover:bg-green-900/20 transition"
          >
            <span className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
              <q.icon size={18} className="text-green-600 dark:text-green-400" />
            </span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 text-center">{q.label}</span>
          </button>
        ))}
      </div>

      {/* Supported providers */}
      {providers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Supported wallets &amp; rails</p>
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 text-xs font-semibold">
                <Wallet size={14} /> {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Service-type filter */}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${type === t ? 'bg-green-600 border-green-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-green-300'}`}>{t}</button>
        ))}
      </div>

      {/* Services */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map((s) => {
          const Icon = iconFor(s.service_category);
          return (
            <div key={s.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                <Icon size={18} className="text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">{s.name}</h4>
                  {s.service_category && <span className="text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{s.service_category}</span>}
                </div>
                {s.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.description}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-green-600 dark:text-green-400">{s.price}</span>
                  <div className="flex items-center gap-1.5">
                    {hasPhone && (
                      <button onClick={() => onWhatsApp(s)} aria-label={`Ask about ${s.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                    )}
                    <button onClick={() => onBook(String(s.id))} className="inline-flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition">
                      {ctaLabel} <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
