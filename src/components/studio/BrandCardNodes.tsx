import { forwardRef } from 'react';
import { ShieldCheck, Phone, Globe, MapPin, Clock, MessageCircle, BadgeCheck, Fingerprint } from 'lucide-react';
import { Business } from '../../types';
import { deriveTier, TIERS } from '../../lib/trust';
import { profileUrl } from '../../lib/studio';
import { CardSettings, DEFAULT_CARD_SETTINGS } from '../../lib/cardSettings';
import NowOpenMark from '../NowOpenMark';

// The exportable digital business card. Shared by BrandCardStudio (live
// preview + download) and the Export Centre so "download everything" produces
// the exact same pixels as the Brand Kit module.
export const CardExportNode = forwardRef<HTMLDivElement, { business: Business; qr: string; settings?: CardSettings }>(
  function CardExportNode({ business, qr, settings }, ref) {
    const s = settings ?? DEFAULT_CARD_SETTINGS;
    const url = profileUrl(business);
    const tier = deriveTier(business as any);
    const coverStyle: React.CSSProperties = business.image_url
      ? { backgroundImage: `url(${business.image_url})` }
      : { backgroundImage: s.accentColor ? `linear-gradient(135deg, ${s.accentColor}, #831843)` : 'linear-gradient(135deg,#4c1d95,#831843)' };
    return (
      <div ref={ref} style={{ width: 640, maxWidth: '100%' }} className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-lg bg-white">
        <div className="h-24 bg-cover bg-center" style={coverStyle} />
        <div className="px-6 pb-6 -mt-8">
          <div className="flex items-end justify-between">
            <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 overflow-hidden flex items-center justify-center shadow">
              {business.logo_url
                ? <img src={business.logo_url} alt="" crossOrigin="anonymous" className="w-full h-full object-cover" />
                : <span className="text-xl font-bold text-gray-400">{business.name.slice(0, 1)}</span>}
            </div>
            {qr && <img src={qr} alt="QR" className="w-20 h-20" />}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <h3 className="text-xl font-bold text-gray-900">{business.name}</h3>
            {tier !== 'none' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#eef2ff', color: '#3730a3' }}>
                <ShieldCheck size={11} /> {TIERS[tier].label}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">{s.categoryLabel || business.category}</p>
          {s.tagline && <p className="text-sm font-medium text-gray-700 mt-0.5">{s.tagline}</p>}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-gray-700">
            {business.phone && s.showPhone && <span className="flex items-center gap-1.5"><Phone size={13} /> {business.phone}</span>}
            {business.phone && s.showWhatsApp && <span className="flex items-center gap-1.5"><MessageCircle size={13} /> WhatsApp: {business.phone}</span>}
            {s.showWebsite && <span className="flex items-center gap-1.5 truncate font-semibold text-gray-800"><Globe size={13} /> {url.replace(/^https?:\/\//, '')}</span>}
            {business.location && s.showLocation && <span className="flex items-center gap-1.5 truncate"><MapPin size={13} /> {business.location}</span>}
            {business.hours && s.showHours && <span className="flex items-center gap-1.5"><Clock size={13} /> {business.hours}</span>}
          </div>
          <p className="mt-3 text-[11px] text-gray-500 font-medium">Scan the QR code to view the live profile</p>
        </div>
        <div className="absolute bottom-3 right-4">
          <NowOpenMark size={30} />
        </div>
      </div>
    );
  },
);

// The co-branded smart QR lockup (QR + NowOpen mark + business logo).
export const QrLockupNode = forwardRef<HTMLDivElement, { business: Business; qr: string }>(
  function QrLockupNode({ business, qr }, ref) {
    return (
      <div ref={ref} className="mx-auto w-fit rounded-xl bg-white p-4">
        {qr
          ? <img src={qr} alt="Business QR" className="w-40 h-40 mx-auto rounded-lg" />
          : <div className="w-40 h-40 mx-auto bg-gray-100 rounded-lg animate-pulse" />}
        <div className="mt-3 flex items-center justify-center gap-3">
          <NowOpenMark size={30} />
          <span className="h-7 w-px bg-gray-200" />
          <div className="h-9 w-9 rounded-full overflow-hidden bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
            {business.logo_url
              ? <img src={business.logo_url} crossOrigin="anonymous" alt="" className="h-full w-full object-cover" />
              : <span className="text-sm font-bold text-gray-400">{business.name.slice(0, 1)}</span>}
          </div>
        </div>
      </div>
    );
  },
);

// The contactless-chip motif that gives the Smart ID its "card" feel.
function NfcChip() {
  return (
    <div className="w-9 h-7 rounded-[6px] relative flex-shrink-0" style={{ background: 'linear-gradient(160deg,#fde68a,#f59e0b 60%,#b45309)' }}>
      <div className="absolute inset-[3px] rounded-[4px] border border-amber-900/30" />
      <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-amber-900/30" />
      <div className="absolute top-1/2 left-[3px] right-[3px] h-px -translate-y-1/2 bg-amber-900/30" />
    </div>
  );
}

// The modern smart ID card — a premium identity-style card (holder, contact
// chips, NFC-chip motif, verification badge and the live QR). Shared by
// BrandCardStudio (live preview + download) and the Export Centre so both
// produce the exact same pixels.
export const SmartIdNode = forwardRef<HTMLDivElement, { business: Business; qr: string; settings?: CardSettings }>(
  function SmartIdNode({ business, qr, settings }, ref) {
    const s = settings ?? DEFAULT_CARD_SETTINGS;
    const url = profileUrl(business);
    const tier = deriveTier(business as any);
    const host = url.replace(/^https?:\/\//, '');
    const shortId = String(business.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
    return (
      <div ref={ref} style={{ width: 640, maxWidth: '100%' }} className="relative overflow-hidden rounded-2xl text-white shadow-xl">
        {/* Layered backdrop: deep gradient + glowing accent blobs + faint grid */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 45%,#4c1d95 100%)' }} />
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full opacity-40" style={{ background: s.accentColor ? `radial-gradient(circle, ${s.accentColor}, #8b5cf6)` : 'radial-gradient(circle,#ec4899,#8b5cf6)', filter: 'blur(24px)' }} />
        <div className="absolute -bottom-28 -left-12 w-80 h-80 rounded-full opacity-30" style={{ background: 'radial-gradient(circle,#3b82f6,#22c55e)', filter: 'blur(28px)' }} />
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '44px 44px' }} />

        <div className="relative p-6 flex gap-6">
          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-[0.3em] text-white/70">SMART ID</span>
              <span className="h-px flex-1 bg-white/20" />
              <NfcChip />
              <NowOpenMark size={22} glow={false} />
            </div>

            <div className="mt-5 flex items-center gap-3">
              <div className="w-16 h-16 rounded-2xl border border-white/20 bg-white/10 backdrop-blur overflow-hidden flex items-center justify-center flex-shrink-0">
                {business.logo_url
                  ? <img src={business.logo_url} alt="" crossOrigin="anonymous" className="w-full h-full object-cover" />
                  : <span className="text-2xl font-bold text-white/80">{business.name.slice(0, 1)}</span>}
              </div>
              <div className="min-w-0">
                <h3 className="text-2xl font-bold leading-tight truncate">{business.name}</h3>
                <p className="text-xs text-white/70 truncate">{s.categoryLabel || business.category || 'Business'}</p>
                {s.tagline && <p className="text-sm text-white/85 font-medium truncate">{s.tagline}</p>}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {tier !== 'none' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.25)', color: '#c7d2fe', border: '1px solid rgba(129,140,248,0.4)' }}>
                  <ShieldCheck size={11} /> {TIERS[tier].label} verified
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.18)', color: '#86efac', border: '1px solid rgba(74,222,128,0.35)' }}>
                <BadgeCheck size={11} /> On NowOpen Africa
              </span>
            </div>

            <div className="mt-4 space-y-1.5 text-[11px] text-white/85">
              {business.phone && s.showPhone && (
                <span className="flex items-center gap-2"><Phone size={12} className="text-white/60" /> <span className="truncate">{business.phone}</span></span>
              )}
              {business.location && s.showLocation && (
                <span className="flex items-center gap-2"><MapPin size={12} className="text-white/60" /> <span className="truncate">{business.location}</span></span>
              )}
              {s.showWebsite && (
                <span className="flex items-center gap-2"><Globe size={12} className="text-white/60" /> <span className="truncate font-semibold">{host}</span></span>
              )}
            </div>
          </div>

          {/* Scannable QR panel */}
          <div className="w-44 shrink-0 self-center rounded-xl bg-white p-3 flex flex-col items-center">
            {qr
              ? <img src={qr} alt="Business QR" className="w-36 h-36 rounded-md" />
              : <div className="w-36 h-36 bg-gray-100 rounded-md animate-pulse" />}
            <p className="mt-2 text-center text-[9px] font-bold text-gray-800 leading-tight tracking-wider">SCAN TO VIEW<br />LIVE PROFILE</p>
          </div>
        </div>

        {/* Footer strip */}
        <div className="relative border-t border-white/15 bg-black/25 px-6 py-2.5 flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold text-white/70 tracking-wider">NOWOPEN AFRICA</span>
          <span className="text-[10px] text-white/60 font-medium truncate">{host}</span>
          <span className="text-[10px] text-white/60 font-medium flex items-center gap-1"><Fingerprint size={11} /> {shortId}</span>
        </div>
      </div>
    );
  },
);

// The front of the Smart ID card — the identity side with the card holder's
// photograph, name, role and ID number. Paired with SmartIdNode (the back /
// "scan to view live profile" side). Holder details come from cardSettings.
export const SmartIdFrontNode = forwardRef<HTMLDivElement, { business: Business; settings?: CardSettings }>(
  function SmartIdFrontNode({ business, settings }, ref) {
    const s = settings ?? DEFAULT_CARD_SETTINGS;
    const tier = deriveTier(business as any);
    const accent = s.accentColor || '#7c3aed';
    const holderName = s.holderName.trim() || business.name;
    const holderRole = s.holderRole.trim() || business.category;
    const shortId = String(business.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
    const holderId = s.holderId.trim() || `NX-${shortId}`;
    const initials = holderName.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    return (
      <div ref={ref} style={{ width: 640, maxWidth: '100%' }} className="relative overflow-hidden rounded-2xl bg-white shadow-xl border border-gray-200">
        {/* Top accent band */}
        <div className="h-16 px-6 flex items-center justify-between text-white" style={{ background: `linear-gradient(120deg, ${accent}, #1e1b4b)` }}>
          <div className="flex items-center gap-2.5">
            <NfcChip />
            <span className="text-sm font-black tracking-[0.28em]">SMART ID</span>
          </div>
          <div className="flex items-center gap-2">
            {business.logo_url && (
              <img src={business.logo_url} alt="" crossOrigin="anonymous" className="w-7 h-7 rounded-full object-cover border border-white/40" />
            )}
            <span className="text-[11px] font-semibold tracking-wider text-white/80">NOWOPEN AFRICA</span>
            <NowOpenMark size={26} glow={false} />
          </div>
        </div>

        {/* Identity */}
        <div className="px-6 py-6 flex gap-6">
          <div className="w-28 h-28 rounded-2xl overflow-hidden flex-shrink-0 border-4 flex items-center justify-center bg-gray-50" style={{ borderColor: accent }}>
            {s.holderPhoto
              ? <img src={s.holderPhoto} alt="" crossOrigin="anonymous" className="w-full h-full object-cover" />
              : <span className="text-4xl font-black text-gray-400">{initials}</span>}
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className="text-[11px] font-bold tracking-[0.22em] text-gray-400">CARD HOLDER</p>
            <h3 className="text-3xl font-black text-gray-900 leading-tight truncate">{holderName}</h3>
            <p className="text-base font-semibold truncate" style={{ color: accent }}>{holderRole}</p>
            <p className="text-sm text-gray-500 truncate mt-1">
              {business.name}
              {(s.categoryLabel || business.category) && ` · ${s.categoryLabel || business.category}`}
            </p>
            {tier !== 'none' && (
              <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit" style={{ background: '#eef2ff', color: '#3730a3' }}>
                <ShieldCheck size={11} /> {TIERS[tier].label} verified
              </span>
            )}
          </div>
        </div>

        {/* ID strip */}
        <div className="mx-6 mb-6 rounded-xl px-4 py-3 flex items-center justify-between text-white" style={{ background: accent }}>
          <div className="flex items-center gap-2 text-sm font-bold tracking-wider">
            HOLDER ID <span className="font-mono tracking-widest">{holderId}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/90">
            <Fingerprint size={14} /> Verified member
          </div>
        </div>
      </div>
    );
  },
);
