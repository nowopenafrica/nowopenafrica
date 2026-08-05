import { useMemo } from 'react';
import { Activity, ArrowRight, CheckCircle2, ShieldCheck, XCircle, Lightbulb, Sparkles, TrendingUp } from 'lucide-react';
import { Business } from '../../types';
import { growthScore, scoreLabel, healthTips, GrowthPlanModule } from '../../lib/growth';

interface Props {
  business: Business;
  onNavigate: (module: GrowthPlanModule) => void;
}

const TRUST_SIGNALS: { key: string; label: string }[] = [
  { key: 'phone_verified', label: 'Phone verified' },
  { key: 'email_verified', label: 'Email verified' },
  { key: 'id_verified', label: 'ID verified' },
  { key: 'registration_verified', label: 'Business registration' },
  { key: 'address_verified', label: 'Address verified' },
  { key: 'documents_reviewed', label: 'Documents reviewed' },
  { key: 'onsite_verified', label: 'On-site check' },
];

export default function HealthDashboard({ business, onNavigate }: Props) {
  const { score, items } = useMemo(() => growthScore(business), [business]);
  const tips = useMemo(() => healthTips(business), [business]);

  const verifiedCount = TRUST_SIGNALS.filter((s) => (business as unknown as Record<string, unknown>)[s.key]).length;
  const verified = Boolean(business.verified);
  const tier = business.verification_tier;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="relative w-36 h-36 shrink-0 mx-auto md:mx-0">
            <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
              <circle cx="64" cy="64" r="54" fill="none" strokeWidth="12" className="stroke-gray-100 dark:stroke-gray-700" />
              <circle cx="64" cy="64" r="54" fill="none" strokeWidth="12" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 54}
                strokeDashoffset={2 * Math.PI * 54 - (score / 100) * 2 * Math.PI * 54}
                className="stroke-purple-500 transition-all duration-700" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-gray-900 dark:text-white">{score}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">of 100</span>
            </div>
          </div>
          <div className="flex-1 text-center md:text-left">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center justify-center md:justify-start gap-2">
              <Activity size={18} className="text-purple-600 dark:text-purple-400" /> {scoreLabel(score)}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xl mx-auto md:mx-0">
              Your Business Health combines how complete your profile is, how trusted you look, and how long you have been growing on NowOpen Africa.
            </p>
            <div className="flex flex-wrap gap-2 mt-3 justify-center md:justify-start">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                <TrendingUp size={13} /> {business.category || 'General'} in {business.location || 'your area'}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${verified ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                <ShieldCheck size={13} /> {verified ? 'Verified business' : 'Not yet verified'}{tier ? ` · ${tier}` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score breakdown */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4">How your score is built</h4>
          <div className="space-y-4">
            {items.map((i) => (
              <div key={i.label}>
                <div className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <span>{i.label}</span>
                  <span className="text-gray-400">{i.earned}/{i.max}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-700"
                    style={{ width: `${(i.earned / i.max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trust signals */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Trust &amp; verification <span className="font-normal text-gray-400">({verifiedCount}/{TRUST_SIGNALS.length})</span></h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TRUST_SIGNALS.map((s) => {
              const ok = Boolean((business as unknown as Record<string, unknown>)[s.key]);
              return (
                <div key={s.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${ok ? 'bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {ok ? <CheckCircle2 size={15} className="text-green-600 dark:text-green-400 shrink-0" /> : <XCircle size={15} className="text-gray-300 dark:text-gray-600 shrink-0" />}
                  {s.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Coach tips */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <Lightbulb size={16} className="text-amber-500" /> Coach’s recommendations
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tips.map((t, i) => (
            <button key={i} onClick={() => onNavigate(t.module)}
              className="text-left flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 transition group">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-purple-600 dark:text-purple-400" />
              <span className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{t.tip}</span>
              <ArrowRight size={14} className="ml-auto shrink-0 self-center text-gray-300 dark:text-gray-600 group-hover:text-purple-500 transition" />
            </button>
          ))}
        </div>
        <button onClick={() => onNavigate('home')}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-purple-600 dark:text-purple-400 hover:underline">
          Open your weekly Growth Plan <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
