import { useMemo, useState } from 'react';
import {
  ShieldCheck, Shield, FileText, PhoneCall, MessageCircle, CheckCircle2,
  Car, HeartPulse, Home, Plane, Briefcase, Users,
} from 'lucide-react';

export interface Policy {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  service_category?: string | null;   // policy class
}

interface Props {
  policies: Policy[];
  ctaLabel: string;
  capabilities?: string[];
  hasPhone?: boolean;
  phoneHref?: string | null;
  onBook: (id: string) => void;
  onWhatsApp: (item: Policy) => void;
  onEnquire: (context: string) => void;
}

// Pick a class-appropriate icon for each policy row.
const iconFor = (cat?: string | null) => {
  switch ((cat || '').toLowerCase()) {
    case 'motor': return Car;
    case 'health': return HeartPulse;
    case 'life': return Users;
    case 'property': return Home;
    case 'travel': return Plane;
    case 'business': return Briefcase;
    default: return Shield;
  }
};

export default function InsuranceCenter({
  policies, ctaLabel, capabilities = [], hasPhone, phoneHref, onBook, onWhatsApp, onEnquire,
}: Props) {
  const [type, setType] = useState('All');

  const types = useMemo(() => {
    const set = new Set<string>();
    policies.forEach((p) => { if (p.service_category) set.add(p.service_category); });
    return ['All', ...[...set].sort()];
  }, [policies]);

  const filtered = type === 'All' ? policies : policies.filter((p) => p.service_category === type);

  if (policies.length === 0) {
    return (
      <div className="text-center py-12">
        <ShieldCheck size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Policies aren’t listed yet.</p>
        <button onClick={() => onEnquire('cover')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition text-sm">
          Get a quote
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a policy quote')} className="inline-flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-teal-700 transition">
          <FileText size={18} /> Get a quote
        </button>
        <button onClick={() => onEnquire('filing a claim')} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-teal-400 transition">
          <CheckCircle2 size={18} /> File a claim
        </button>
        {hasPhone && phoneHref && (
          <a href={phoneHref} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-teal-400 transition">
            <PhoneCall size={18} /> Speak to an agent
          </a>
        )}
      </div>

      {/* Trust badges */}
      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {capabilities.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-3 py-1.5 text-xs font-semibold">
              <ShieldCheck size={14} /> {c}
            </span>
          ))}
        </div>
      )}

      {/* Policy-class filter */}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${type === t ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-teal-300'}`}>{t}</button>
        ))}
      </div>

      {/* Policies */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map((p) => {
          const Icon = iconFor(p.service_category);
          return (
            <div key={p.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
                <Icon size={18} className="text-teal-600 dark:text-teal-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">{p.name}</h4>
                  {p.service_category && <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{p.service_category}</span>}
                </div>
                {p.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{p.description}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-teal-600 dark:text-teal-400">{p.price}</span>
                  <div className="flex items-center gap-1.5">
                    {hasPhone && (
                      <button onClick={() => onWhatsApp(p)} aria-label={`Ask about ${p.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                    )}
                    <button onClick={() => onBook(String(p.id))} className="inline-flex items-center gap-1 bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700 transition">
                      <FileText size={13} /> {ctaLabel}
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
