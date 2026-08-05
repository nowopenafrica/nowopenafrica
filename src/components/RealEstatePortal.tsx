import { useMemo, useState } from 'react';
import {
  Bed, Bath, Maximize, MapPin, BadgeCheck, ShieldCheck, CalendarCheck,
  MessageCircle, Calculator, X, ChevronLeft, ChevronRight, Home, Star,
  Building2, TrendingUp,
} from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';

/** A property = a business_products row enriched with real-estate columns. */
export interface PortalProperty {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  gallery?: string[];
  listing_type?: 'sale' | 'rent' | 'shortlet' | null;
  property_type?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area_sqm?: number | null;
  property_location?: string | null;
  is_featured?: boolean | null;
  verified_property?: boolean | null;
}

interface Props {
  properties: PortalProperty[];
  ctaLabel: string;
  agentName: string;
  agentLocation?: string;
  verifiedAgent?: boolean;
  hasPhone?: boolean;
  onBookViewing: (id: string) => void;
  onWhatsApp: (property: PortalProperty) => void;
  onEnquire: (context: string) => void;
}

const LISTING_META: Record<string, { label: string; cls: string }> = {
  sale: { label: 'For Sale', cls: 'bg-green-600' },
  rent: { label: 'For Rent', cls: 'bg-blue-600' },
  shortlet: { label: 'Short-let', cls: 'bg-purple-600' },
};

type Filter = 'all' | 'sale' | 'rent' | 'shortlet';

export default function RealEstatePortal({
  properties, ctaLabel, agentName, agentLocation, verifiedAgent, hasPhone,
  onBookViewing, onWhatsApp, onEnquire,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | number | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: properties.length, sale: 0, rent: 0, shortlet: 0 };
    properties.forEach((p) => { if (p.listing_type) c[p.listing_type] += 1; });
    return c;
  }, [properties]);

  const featured = properties.filter((p) => p.is_featured);
  const filtered = filter === 'all' ? properties : properties.filter((p) => p.listing_type === filter);
  const open = properties.find((p) => String(p.id) === String(openId)) ?? null;

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'sale', label: 'For Sale' },
    { id: 'rent', label: 'For Rent' },
    { id: 'shortlet', label: 'Short-let' },
  ];

  if (properties.length === 0) {
    return (
      <div className="text-center py-12">
        <Home size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">No properties are listed yet.</p>
        <button
          onClick={() => onEnquire('available properties')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm"
        >
          Ask about listings
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-8">
      {/* Trust bar */}
      <div className="flex flex-wrap items-center gap-2">
        {verifiedAgent && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 text-xs font-semibold">
            <BadgeCheck size={14} /> Verified agent
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 text-xs font-semibold">
          <ShieldCheck size={14} /> Inspected & documented listings
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 text-xs font-semibold">
          <Building2 size={14} /> {properties.length} propert{properties.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      {/* Featured */}
      {featured.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Star size={18} className="text-amber-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Featured properties</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {featured.map((p) => (
              <FeaturedCard key={p.id} p={p} onOpen={() => setOpenId(p.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Filters + grid */}
      <section>
        <div className="flex flex-wrap gap-2 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${
                filter === f.id
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'
              }`}
            >
              {f.label} <span className="opacity-70">({counts[f.id]})</span>
            </button>
          ))}
        </div>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <PropertyCard key={p.id} p={p} onOpen={() => setOpenId(p.id)} />
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-500 dark:text-gray-400 py-10">No properties match this filter.</p>
        )}
      </section>

      {/* Calculators */}
      <Calculators />

      {/* Detail modal */}
      {open && (
        <PropertyModal
          p={open}
          ctaLabel={ctaLabel}
          agentName={agentName}
          agentLocation={agentLocation}
          hasPhone={hasPhone}
          onClose={() => setOpenId(null)}
          onBookViewing={() => { onBookViewing(String(open.id)); setOpenId(null); }}
          onWhatsApp={() => onWhatsApp(open)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- sub-cards ---- */

function Specs({ p, className = '' }: { p: PortalProperty; className?: string }) {
  const isLand = p.property_type?.toLowerCase() === 'land';
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300 ${className}`}>
      {!isLand && p.bedrooms != null && p.bedrooms > 0 && (
        <span className="inline-flex items-center gap-1"><Bed size={15} /> {p.bedrooms}</span>
      )}
      {!isLand && p.bathrooms != null && p.bathrooms > 0 && (
        <span className="inline-flex items-center gap-1"><Bath size={15} /> {p.bathrooms}</span>
      )}
      {p.area_sqm != null && p.area_sqm > 0 && (
        <span className="inline-flex items-center gap-1"><Maximize size={15} /> {p.area_sqm.toLocaleString()} m²</span>
      )}
    </div>
  );
}

function ListingBadge({ p }: { p: PortalProperty }) {
  const meta = p.listing_type ? LISTING_META[p.listing_type] : null;
  if (!meta) return null;
  return <span className={`text-white text-[11px] font-semibold px-2 py-1 rounded-md ${meta.cls}`}>{meta.label}</span>;
}

function PropertyCard({ p, onOpen }: { p: PortalProperty; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:shadow-lg transition-shadow group"
    >
      <div className="relative">
        {p.image ? (
          <img src={p.image} alt={p.name} className="w-full h-44 object-cover group-hover:scale-[1.02] transition-transform" />
        ) : (
          <div className="w-full h-44 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
            <Home size={36} className="text-blue-400 dark:text-gray-400" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <ListingBadge p={p} />
        </div>
        {p.verified_property && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 bg-white/90 dark:bg-gray-900/90 text-blue-700 dark:text-blue-300 text-[11px] font-semibold px-2 py-1 rounded-md">
            <BadgeCheck size={12} /> Verified
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{p.price}</div>
        <h3 className="mt-0.5 font-semibold text-gray-900 dark:text-white line-clamp-1">{p.name}</h3>
        {p.property_location && (
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <MapPin size={13} /> <span className="line-clamp-1">{p.property_location}</span>
          </div>
        )}
        <Specs p={p} className="mt-3" />
      </div>
    </button>
  );
}

function FeaturedCard({ p, onOpen }: { p: PortalProperty; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="text-left relative rounded-2xl overflow-hidden group h-56 w-full"
    >
      {p.image ? (
        <img src={p.image} alt={p.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute top-3 left-3 flex gap-1.5">
        <ListingBadge p={p} />
        {p.verified_property && (
          <span className="inline-flex items-center gap-1 bg-white/90 text-blue-700 text-[11px] font-semibold px-2 py-1 rounded-md">
            <BadgeCheck size={12} /> Verified
          </span>
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
        <div className="text-xl font-bold">{p.price}</div>
        <div className="font-semibold line-clamp-1">{p.name}</div>
        {p.property_location && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-white/80">
            <MapPin size={12} /> <span className="line-clamp-1">{p.property_location}</span>
          </div>
        )}
        <Specs p={p} className="mt-2 !text-white/90" />
      </div>
    </button>
  );
}

/* ------------------------------------------------------------- modal -------- */

function PropertyModal({
  p, ctaLabel, agentName, agentLocation, hasPhone, onClose, onBookViewing, onWhatsApp,
}: {
  p: PortalProperty; ctaLabel: string; agentName: string; agentLocation?: string; hasPhone?: boolean;
  onClose: () => void; onBookViewing: () => void; onWhatsApp: () => void;
}) {
  const images = (p.gallery && p.gallery.length > 0 ? p.gallery : p.image ? [p.image] : []).filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  const mapsQuery = encodeURIComponent(`${p.property_location ?? p.name}`);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Gallery */}
        <div className="relative">
          {images.length > 0 ? (
            <img src={images[idx]} alt={p.name} className="w-full h-60 sm:h-72 object-cover sm:rounded-t-2xl" />
          ) : (
            <div className="w-full h-60 bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Home size={48} className="text-white/80" />
            </div>
          )}
          <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
            <X size={20} />
          </button>
          {images.length > 1 && (
            <>
              <button onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)} aria-label="Previous photo" className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
                <ChevronLeft size={20} />
              </button>
              <button onClick={() => setIdx((i) => (i + 1) % images.length)} aria-label="Next photo" className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
                <ChevronRight size={20} />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((_, i) => (
                  <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === idx ? 'bg-white' : 'bg-white/50'}`} />
                ))}
              </div>
            </>
          )}
          <div className="absolute top-3 left-3 flex gap-1.5">
            <ListingBadge p={p} />
            {p.verified_property && (
              <span className="inline-flex items-center gap-1 bg-white/90 text-blue-700 text-[11px] font-semibold px-2 py-1 rounded-md">
                <BadgeCheck size={12} /> Verified property
              </span>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{p.price}</div>
            <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{p.name}</h2>
            {p.property_location && (
              <div className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                <MapPin size={14} /> {p.property_location}
              </div>
            )}
          </div>

          {/* Fact strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {p.property_type && <Fact label="Type" value={p.property_type} />}
            {p.bedrooms != null && p.bedrooms > 0 && <Fact label="Bedrooms" value={String(p.bedrooms)} />}
            {p.bathrooms != null && p.bathrooms > 0 && <Fact label="Bathrooms" value={String(p.bathrooms)} />}
            {p.area_sqm != null && p.area_sqm > 0 && <Fact label="Area" value={`${p.area_sqm.toLocaleString()} m²`} />}
          </div>

          {p.description && <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{p.description}</p>}

          <a
            href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            <MapPin size={15} /> View on map
          </a>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button onClick={onBookViewing} className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-700 transition">
              <CalendarCheck size={18} /> {ctaLabel}
            </button>
            {hasPhone && (
              <button onClick={onWhatsApp} className="inline-flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-green-700 transition">
                <MessageCircle size={18} /> WhatsApp agent
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">Listed by {agentName}{agentLocation ? ` · ${agentLocation}` : ''}</p>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

/* --------------------------------------------------------- calculators ------ */

function Calculators() {
  const { info } = useCurrency();
  const [tab, setTab] = useState<'mortgage' | 'yield'>('mortgage');
  const money = (n: number) =>
    new Intl.NumberFormat(info.locale, { style: 'currency', currency: info.code, maximumFractionDigits: 0 })
      .format(Math.round(Number.isFinite(n) ? n : 0));

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <Calculator size={18} className="text-blue-600 dark:text-blue-400" />
        <h3 className="font-bold text-gray-900 dark:text-white">Property tools</h3>
      </div>
      <div className="flex border-b border-gray-100 dark:border-gray-700">
        {([['mortgage', 'Mortgage calculator'], ['yield', 'Rental yield']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
              tab === id
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="p-5">
        {tab === 'mortgage' ? <Mortgage code={info.code} money={money} /> : <Yield money={money} />}
      </div>
    </section>
  );
}

function NumField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <div className="mt-1 relative">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{suffix}</span>}
      </div>
    </label>
  );
}

function Mortgage({ code, money }: { code: string; money: (n: number) => string }) {
  const [price, setPrice] = useState('50000000');
  const [downPct, setDownPct] = useState('20');
  const [rate, setRate] = useState('18');
  const [years, setYears] = useState('20');

  const P = Number(price) || 0;
  const down = (P * (Number(downPct) || 0)) / 100;
  const principal = Math.max(0, P - down);
  const r = (Number(rate) || 0) / 100 / 12;
  const n = (Number(years) || 0) * 12;
  const monthly = n <= 0 ? 0 : r === 0 ? principal / n : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const totalPaid = monthly * n;
  const interest = Math.max(0, totalPaid - principal);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <NumField label={`Property price (${code})`} value={price} onChange={setPrice} />
        <NumField label="Down payment" value={downPct} onChange={setDownPct} suffix="%" />
        <NumField label="Interest rate (annual)" value={rate} onChange={setRate} suffix="%" />
        <NumField label="Loan term" value={years} onChange={setYears} suffix="yrs" />
      </div>
      <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-4">
        <div className="text-xs text-gray-500 dark:text-gray-400">Estimated monthly repayment</div>
        <div className="text-2xl font-extrabold text-blue-700 dark:text-blue-300">{money(monthly)}</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
          <div>Loan amount: <span className="font-semibold">{money(principal)}</span></div>
          <div>Total interest: <span className="font-semibold">{money(interest)}</span></div>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500">Estimate only — actual terms depend on your lender.</p>
    </div>
  );
}

function Yield({ money }: { money: (n: number) => string }) {
  const [price, setPrice] = useState('50000000');
  const [rent, setRent] = useState('400000');

  const P = Number(price) || 0;
  const monthlyRent = Number(rent) || 0;
  const annual = monthlyRent * 12;
  const grossYield = P > 0 ? (annual / P) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Property price" value={price} onChange={setPrice} />
        <NumField label="Monthly rent" value={rent} onChange={setRent} />
      </div>
      <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <TrendingUp size={13} /> Gross rental yield
        </div>
        <div className="text-2xl font-extrabold text-green-700 dark:text-green-300">{grossYield.toFixed(1)}%</div>
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
          Annual rental income: <span className="font-semibold">{money(annual)}</span>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500">Gross yield excludes service charge, tax and vacancy.</p>
    </div>
  );
}
