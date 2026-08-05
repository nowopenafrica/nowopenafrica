import { forwardRef } from 'react';
import { Business } from '../../types';
import { BrandIdentity } from '../../lib/brandIdentity';
import { profileUrl } from '../../lib/studio';
import NowOpenMark from '../NowOpenMark';

// Offscreen export nodes for the AI Brand Kit generator. Each one is a plain
// DOM node captured with html-to-image, so the PNG files Studio produces are
// pixel-identical to what the owner previews in Brand OS.

interface KitNodeProps {
  business: Business;
  identity: BrandIdentity;
  accent: string;
}

const GRID = {
  backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.06) 1px,transparent 1px)',
  backgroundSize: '48px 48px',
} as const;

// Light, inline-styled signature — also mirrored by the HTML version.
export const EmailSignatureNode = forwardRef<HTMLDivElement, KitNodeProps>(
  function EmailSignatureNode({ business, identity, accent }, ref) {
    const host = profileUrl(business).replace(/^https?:\/\//, '');
    return (
      <div ref={ref} style={{ width: 640, maxWidth: '100%', fontFamily: 'Arial, sans-serif' }} className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="h-1 w-full rounded-full mb-4" style={{ background: `linear-gradient(90deg, ${accent}, #1e1b4b)` }} />
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
            {business.logo_url
              ? <img src={business.logo_url} alt="" crossOrigin="anonymous" className="w-full h-full object-cover" />
              : <span className="text-xl font-bold" style={{ color: accent }}>{business.name.slice(0, 1)}</span>}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900 leading-tight truncate">{business.name}</p>
            <p className="text-xs text-gray-500 truncate">{identity.tagline || business.category}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
          {business.phone && <span>{business.phone}</span>}
          {business.email && <span>{business.email}</span>}
          <span className="font-semibold" style={{ color: accent }}>{host}</span>
          {business.location && <span>{business.location}</span>}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <NowOpenMark size={18} />
          <span className="text-[10px] text-gray-400 tracking-wider font-semibold">NOWOPEN AFRICA MEMBER</span>
        </div>
      </div>
    );
  },
);

// Square avatar / WhatsApp DP — accent gradient with the logo centred.
export const SocialAvatarNode = forwardRef<HTMLDivElement, KitNodeProps>(
  function SocialAvatarNode({ business, accent }, ref) {
    return (
      <div ref={ref} style={{ width: 640, height: 640, background: `linear-gradient(135deg, ${accent}, #1e1b4b)` }} className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-40" style={{ background: `radial-gradient(circle at 30% 20%, rgba(255,255,255,0.35), transparent 55%)` }} />
        <div className="absolute inset-6 rounded-full border border-white/20 flex items-center justify-center">
          {business.logo_url
            ? <img src={business.logo_url} alt="" crossOrigin="anonymous" className="w-2/3 h-2/3 rounded-full object-cover" />
            : <span className="text-8xl font-black text-white/90">{business.name.slice(0, 1)}</span>}
        </div>
        <div className="absolute bottom-4 right-5 opacity-90"><NowOpenMark size={34} glow={false} /></div>
      </div>
    );
  },
);

// 1584 × 396 LinkedIn banner (node at half size, exported at 2×).
export const LinkedinBannerNode = forwardRef<HTMLDivElement, KitNodeProps>(
  function LinkedinBannerNode({ business, identity, accent }, ref) {
    const host = profileUrl(business).replace(/^https?:\/\//, '');
    return (
      <div ref={ref} style={{ width: 792, height: 198, background: `linear-gradient(120deg, ${accent}, #1e1b4b)` }} className="relative overflow-hidden">
        <div className="absolute inset-0" style={GRID} />
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full opacity-40" style={{ background: 'radial-gradient(circle,#ec4899,transparent 70%)', filter: 'blur(18px)' }} />
        <div className="relative h-full flex items-center px-10 gap-6">
          <div className="w-20 h-20 rounded-2xl bg-white/95 border border-white/40 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {business.logo_url
              ? <img src={business.logo_url} alt="" crossOrigin="anonymous" className="w-full h-full object-cover" />
              : <span className="text-3xl font-black" style={{ color: accent }}>{business.name.slice(0, 1)}</span>}
          </div>
          <div className="min-w-0">
            <p className="text-3xl font-black text-white leading-tight truncate">{business.name}</p>
            <p className="text-sm text-white/80 truncate">{identity.tagline || business.category}</p>
            <p className="text-xs font-semibold text-white/60 mt-1">{host}</p>
          </div>
        </div>
      </div>
    );
  },
);

// 600 × 200 email banner (node at half size, exported at 2×).
export const EmailBannerNode = forwardRef<HTMLDivElement, KitNodeProps>(
  function EmailBannerNode({ business, identity, accent }, ref) {
    const host = profileUrl(business).replace(/^https?:\/\//, '');
    return (
      <div ref={ref} style={{ width: 600, height: 200, background: `linear-gradient(120deg, ${accent}, #1e1b4b)` }} className="relative overflow-hidden flex items-center px-8 gap-5">
        <div className="absolute inset-0" style={GRID} />
        <div className="relative w-16 h-16 rounded-2xl bg-white/95 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {business.logo_url
            ? <img src={business.logo_url} alt="" crossOrigin="anonymous" className="w-full h-full object-cover" />
            : <span className="text-2xl font-black" style={{ color: accent }}>{business.name.slice(0, 1)}</span>}
        </div>
        <div className="relative min-w-0">
          <p className="text-2xl font-black text-white leading-tight truncate">{business.name}</p>
          <p className="text-xs text-white/80 truncate">{identity.tagline || business.category}</p>
          <p className="text-[10px] font-semibold text-white/60">{host}</p>
        </div>
      </div>
    );
  },
);

// 1280 × 720 Zoom background — centre-stage identity.
export const ZoomBackgroundNode = forwardRef<HTMLDivElement, KitNodeProps>(
  function ZoomBackgroundNode({ business, identity, accent }, ref) {
    const host = profileUrl(business).replace(/^https?:\/\//, '');
    return (
      <div ref={ref} style={{ width: 1280, height: 720, background: `linear-gradient(135deg, #0f172a, ${accent} 180%)` }} className="relative overflow-hidden">
        <div className="absolute inset-0" style={GRID} />
        <div className="absolute -top-32 -right-24 w-96 h-96 rounded-full opacity-30" style={{ background: `radial-gradient(circle, ${accent}, transparent 70%)`, filter: 'blur(30px)' }} />
        <div className="relative h-full flex flex-col items-center justify-center gap-4 px-20 text-center">
          <div className="w-24 h-24 rounded-3xl bg-white/95 flex items-center justify-center overflow-hidden">
            {business.logo_url
              ? <img src={business.logo_url} alt="" crossOrigin="anonymous" className="w-full h-full object-cover" />
              : <span className="text-4xl font-black" style={{ color: accent }}>{business.name.slice(0, 1)}</span>}
          </div>
          <p className="text-5xl font-black text-white">{business.name}</p>
          <p className="text-lg text-white/80">{identity.tagline || business.category}</p>
          <p className="text-sm font-semibold text-white/50">{host} · nowopenafrica.com</p>
        </div>
      </div>
    );
  },
);
