import { useMemo, useState } from 'react';

import { type TrustClaim } from '../lib/trustClaims';
import {
  Landmark, Calculator, BadgeCheck, PhoneCall, CalendarCheck, MessageCircle, Percent,
} from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';

export interface FinancialProduct {
  id: string | number;
  name: string;
  description?: string;
  price?: string;   // rate / fee summary
  service_category?: string | null;   // product type
}

interface Props {
  products: FinancialProduct[];
  ctaLabel: string;
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: FinancialProduct) => void;
  onEnquire: (context: string) => void;
  /** Only claims the record actually backs; see lib/trustClaims. */
  claims?: TrustClaim[];
}

export default function FinanceCenter({ products, ctaLabel, hasPhone, claims = [], onBook, onWhatsApp, onEnquire }: Props) {
  const [type, setType] = useState('All');

  const types = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => { if (p.service_category) set.add(p.service_category); });
    return ['All', ...[...set].sort()];
  }, [products]);

  const filtered = type === 'All' ? products : products.filter((p) => p.service_category === type);

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <Landmark size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Products aren’t listed yet.</p>
        <button onClick={() => onEnquire('your financial products')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask an advisor
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a call with a financial advisor')} className="inline-flex items-center gap-2 bg-blue-700 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-blue-800 transition">
          <PhoneCall size={18} /> Speak to an advisor
        </button>
        {claims.map((c) => (
          <span key={c.key} title={c.detail}
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-2 text-xs font-semibold">
            <BadgeCheck size={14} /> {c.label}
          </span>
        ))}
      </div>

      {/* Loan calculator */}
      <LoanCalculator />

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${type === t ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'}`}>{t}</button>
        ))}
      </div>

      {/* Products */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Products</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Landmark size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">{p.name}</h4>
                  {p.service_category && <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{p.service_category}</span>}
                </div>
                {p.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{p.description}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-blue-600 dark:text-blue-400"><Percent size={12} /> {p.price}</span>
                  <div className="flex items-center gap-1.5">
                    {hasPhone && (
                      <button onClick={() => onWhatsApp(p)} aria-label={`Ask about ${p.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                    )}
                    <button onClick={() => onBook(String(p.id))} className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition">
                      <CalendarCheck size={13} /> {ctaLabel}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoanCalculator() {
  const { info } = useCurrency();
  const money = (n: number) =>
    new Intl.NumberFormat(info.locale, { style: 'currency', currency: info.code, maximumFractionDigits: 0 })
      .format(Math.round(Number.isFinite(n) ? n : 0));

  const [amount, setAmount] = useState('500000');
  const [rate, setRate] = useState('4');       // monthly %
  const [months, setMonths] = useState('12');

  const P = Number(amount) || 0;
  const r = (Number(rate) || 0) / 100;         // monthly rate
  const n = Number(months) || 0;
  const monthly = n <= 0 ? 0 : r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const totalInterest = Math.max(0, monthly * n - P);

  const field = (label: string, value: string, onChange: (v: string) => void, suffix: string) => (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <div className="mt-1 relative">
        <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">{suffix}</span>
      </div>
    </label>
  );

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calculator size={16} className="text-blue-600 dark:text-blue-400" />
        <h3 className="font-bold text-gray-900 dark:text-white text-sm">Loan calculator</h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {field(`Amount (${info.code})`, amount, setAmount, '')}
        {field('Rate / month', rate, setRate, '%')}
        {field('Term', months, setMonths, 'mo')}
      </div>
      <div className="mt-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span><span className="text-xs text-gray-500 dark:text-gray-400">Monthly repayment </span><span className="text-lg font-extrabold text-blue-700 dark:text-blue-300">{money(monthly)}</span></span>
        <span className="text-xs text-gray-600 dark:text-gray-300">Total interest: <span className="font-semibold">{money(totalInterest)}</span></span>
      </div>
      <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">Estimate only — actual terms are subject to approval.</p>
    </div>
  );
}
