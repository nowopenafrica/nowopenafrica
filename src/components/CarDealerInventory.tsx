import { useMemo, useState } from 'react';
import {
  Car, Gauge, Fuel, Cog, Calendar, BadgeCheck, ShieldCheck, CalendarCheck,
  MessageCircle, X, ChevronLeft, ChevronRight, Calculator, Hash,
} from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';

export interface Vehicle {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  gallery?: string[];
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_year?: number | null;
  mileage_km?: number | null;
  fuel_type?: string | null;
  transmission?: string | null;
  vin?: string | null;
  vehicle_condition?: string | null;
  is_featured?: boolean | null;
  verified_property?: boolean | null;
}

interface Props {
  vehicles: Vehicle[];
  ctaLabel: string;
  dealerName: string;
  verifiedDealer?: boolean;
  hasPhone?: boolean;
  onBookTestDrive: (id: string) => void;
  onWhatsApp: (vehicle: Vehicle) => void;
  onEnquire: (context: string) => void;
}

const CONDITION_CLS: Record<string, string> = {
  New: 'bg-green-600',
  'Foreign Used': 'bg-blue-600',
  'Nigerian Used': 'bg-amber-600',
};

type Filter = 'all' | 'New' | 'Foreign Used' | 'Nigerian Used';

export default function CarDealerInventory({
  vehicles, ctaLabel, dealerName, verifiedDealer, hasPhone,
  onBookTestDrive, onWhatsApp, onEnquire,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | number | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: vehicles.length };
    vehicles.forEach((v) => { if (v.vehicle_condition) c[v.vehicle_condition] = (c[v.vehicle_condition] ?? 0) + 1; });
    return c;
  }, [vehicles]);

  const filtered = filter === 'all' ? vehicles : vehicles.filter((v) => v.vehicle_condition === filter);
  const open = vehicles.find((v) => String(v.id) === String(openId)) ?? null;
  const FILTERS: Filter[] = ['all', 'New', 'Foreign Used', 'Nigerian Used'];

  if (vehicles.length === 0) {
    return (
      <div className="text-center py-12">
        <Car size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">No vehicles are listed yet.</p>
        <button onClick={() => onEnquire('available vehicles')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask about stock
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Trust bar */}
      <div className="flex flex-wrap items-center gap-2">
        {verifiedDealer && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 text-xs font-semibold">
            <BadgeCheck size={14} /> Verified dealer
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 text-xs font-semibold">
          <ShieldCheck size={14} /> Inspected & documented
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${
              filter === f
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'
            }`}
          >
            {f === 'all' ? 'All' : f} <span className="opacity-70">({counts[f] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v) => (
            <VehicleCard key={v.id} v={v} onOpen={() => setOpenId(v.id)} />
          ))}
        </div>
      ) : (
        <p className="text-center text-gray-500 dark:text-gray-400 py-10">No vehicles match this filter.</p>
      )}

      {open && (
        <VehicleModal
          v={open}
          ctaLabel={ctaLabel}
          dealerName={dealerName}
          hasPhone={hasPhone}
          onClose={() => setOpenId(null)}
          onBookTestDrive={() => { onBookTestDrive(String(open.id)); setOpenId(null); }}
          onWhatsApp={() => onWhatsApp(open)}
        />
      )}
    </div>
  );
}

function ConditionBadge({ v }: { v: Vehicle }) {
  if (!v.vehicle_condition) return null;
  return <span className={`text-white text-[11px] font-semibold px-2 py-1 rounded-md ${CONDITION_CLS[v.vehicle_condition] ?? 'bg-gray-600'}`}>{v.vehicle_condition}</span>;
}

function Specs({ v }: { v: Vehicle }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
      {v.vehicle_year != null && <span className="inline-flex items-center gap-1"><Calendar size={13} /> {v.vehicle_year}</span>}
      {v.mileage_km != null && <span className="inline-flex items-center gap-1"><Gauge size={13} /> {v.mileage_km.toLocaleString()} km</span>}
      {v.fuel_type && <span className="inline-flex items-center gap-1"><Fuel size={13} /> {v.fuel_type}</span>}
      {v.transmission && <span className="inline-flex items-center gap-1"><Cog size={13} /> {v.transmission}</span>}
    </div>
  );
}

function VehicleCard({ v, onOpen }: { v: Vehicle; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:shadow-lg transition-shadow group">
      <div className="relative">
        {v.image ? (
          <img loading="lazy" decoding="async" src={v.image} alt={v.name} className="w-full h-44 object-cover group-hover:scale-[1.02] transition-transform" />
        ) : (
          <div className="w-full h-44 bg-gradient-to-br from-slate-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
            <Car size={36} className="text-slate-400 dark:text-gray-400" />
          </div>
        )}
        <div className="absolute top-2 left-2"><ConditionBadge v={v} /></div>
      </div>
      <div className="p-4">
        <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{v.price}</div>
        <h3 className="mt-0.5 font-semibold text-gray-900 dark:text-white line-clamp-1">{v.name}</h3>
        <div className="mt-2"><Specs v={v} /></div>
      </div>
    </button>
  );
}

function VehicleModal({
  v, ctaLabel, dealerName, hasPhone, onClose, onBookTestDrive, onWhatsApp,
}: {
  v: Vehicle; ctaLabel: string; dealerName: string; hasPhone?: boolean;
  onClose: () => void; onBookTestDrive: () => void; onWhatsApp: () => void;
}) {
  const images = (v.gallery && v.gallery.length > 0 ? v.gallery : v.image ? [v.image] : []).filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);

  const facts: [string, string | number | null | undefined][] = [
    ['Make', v.vehicle_make], ['Model', v.vehicle_model], ['Year', v.vehicle_year],
    ['Mileage', v.mileage_km != null ? `${v.mileage_km.toLocaleString()} km` : null],
    ['Fuel', v.fuel_type], ['Transmission', v.transmission], ['Condition', v.vehicle_condition],
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="relative">
          {images.length > 0 ? (
            <img loading="lazy" decoding="async" src={images[idx]} alt={v.name} className="w-full h-60 sm:h-72 object-cover sm:rounded-t-2xl" />
          ) : (
            <div className="w-full h-60 bg-gradient-to-br from-slate-600 to-gray-800 flex items-center justify-center"><Car size={48} className="text-white/80" /></div>
          )}
          <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"><X size={20} /></button>
          {images.length > 1 && (
            <>
              <button onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)} aria-label="Previous" className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"><ChevronLeft size={20} /></button>
              <button onClick={() => setIdx((i) => (i + 1) % images.length)} aria-label="Next" className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"><ChevronRight size={20} /></button>
            </>
          )}
          <div className="absolute top-3 left-3"><ConditionBadge v={v} /></div>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{v.price}</div>
            <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{v.name}</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {facts.filter(([, val]) => val != null && val !== '').map(([label, val]) => (
              <div key={label} className="rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{val}</div>
              </div>
            ))}
          </div>

          {v.vin && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Hash size={13} /> VIN: <span className="font-mono">{v.vin}</span>
            </div>
          )}

          {v.description && <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{v.description}</p>}

          <FinanceCalculator price={v.price} />

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button onClick={onBookTestDrive} className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-700 transition">
              <CalendarCheck size={18} /> {ctaLabel}
            </button>
            {hasPhone && (
              <button onClick={onWhatsApp} className="inline-flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-green-700 transition">
                <MessageCircle size={18} /> WhatsApp dealer
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">Sold by {dealerName}</p>
        </div>
      </div>
    </div>
  );
}

// Extracts the first numeric run from a price string ("₦18,500,000" → 18500000).
function parseAmount(price?: string): number {
  if (!price) return 0;
  const m = price.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function FinanceCalculator({ price }: { price?: string }) {
  const { info } = useCurrency();
  const money = (n: number) =>
    new Intl.NumberFormat(info.locale, { style: 'currency', currency: info.code, maximumFractionDigits: 0 })
      .format(Math.round(Number.isFinite(n) ? n : 0));

  const [downPct, setDownPct] = useState('30');
  const [rate, setRate] = useState('20');
  const [years, setYears] = useState('4');

  const P = parseAmount(price);
  const principal = Math.max(0, P - (P * (Number(downPct) || 0)) / 100);
  const r = (Number(rate) || 0) / 100 / 12;
  const n = (Number(years) || 0) * 12;
  const monthly = n <= 0 ? 0 : r === 0 ? principal / n : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

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
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calculator size={16} className="text-blue-600 dark:text-blue-400" />
        <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Finance calculator</h4>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {field('Down payment', downPct, setDownPct, '%')}
        {field('Rate (annual)', rate, setRate, '%')}
        {field('Term', years, setYears, 'yrs')}
      </div>
      <div className="mt-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">Est. monthly repayment </span>
        <span className="text-lg font-extrabold text-blue-700 dark:text-blue-300">{money(monthly)}</span>
      </div>
    </div>
  );
}
