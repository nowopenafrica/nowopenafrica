// NowOpen Studio — Landing Page Builder.
//
// Turns a business profile into a shareable one-page site: hero, services,
// gallery, promo, pricing and contact. Every section is editable and the
// finished page publishes straight to the business profile link.

import { Business } from '../types';
import { profileUrl } from './studio';

export type LandingSectionType = 'hero' | 'services' | 'gallery' | 'promo' | 'pricing' | 'contact';

export type LandingTheme = 'light' | 'dark';

export interface LandingMedia {
  url: string;
  type: 'image' | 'video';
}

export interface LandingSection {
  id: string;
  type: LandingSectionType;
  title: string;
  subtitle: string;
  body: string;
  items: string[];
  ctaLabel: string;
  media?: LandingMedia;
  visible: boolean;
}

export interface LandingPage {
  id: string;
  title: string;
  tagline: string;
  theme: LandingTheme;
  accent: string;
  showLogo: boolean;
  sections: LandingSection[];
  createdAt: string;
  updatedAt: string;
}

export const LANDING_ACCENTS = ['#7c3aed', '#2563eb', '#0f766e', '#b91c1c', '#b45309', '#be185d', '#4338ca', '#15803d'];

export const SECTION_LABELS: Record<LandingSectionType, string> = {
  hero: 'Hero',
  services: 'Services',
  gallery: 'Gallery',
  promo: 'Offer',
  pricing: 'Pricing',
  contact: 'Contact',
};

const SERVICE_SUGGESTIONS: [RegExp, string[]][] = [
  [/restaurant|fast food|caf|bar|grill|kitch|eatery|barbecue|bbq/i, ['Signature meals', 'Private dining', 'Takeaway & delivery', 'Birthday & event catering']],
  [/hotel|lodg|short|b&b|inn/i, ['Comfortable rooms', 'Breakfast & dining', 'Conference space', 'Weekend getaways']],
  [/fashion|apparel|cloth|tailor|attire/i, ['Ready-to-wear', 'Bespoke tailoring', 'Custom fits', 'Bridal & occasion wear']],
  [/pharm|chemist|clinic|hospital|dental|vet/i, ['Consultations', 'Trusted advice', 'Health checks', 'Prescriptions']],
  [/beauty|salon|barber|spa|wellness|massage/i, ['Signature treatments', 'Hair & grooming', 'Skincare & relaxation', 'Appointments on WhatsApp']],
  [/gym|fitness|sport|wellness/i, ['Personal training', 'Group classes', 'Membership plans', 'Nutrition guidance']],
  [/school|academy|tutor|educ|training|learn/i, ['Expert-led classes', 'Small group sessions', '1:1 tutoring', 'Certification']],
  [/photograph|video|media|design|creative/i, ['Photography', 'Video production', 'Brand design', 'Social media content']],
  [/marketing|advert|agency/i, ['Social media management', 'Ad campaigns', 'Brand strategy', 'Content creation']],
  [/soft|tech|web|app|it|repair|gadget/i, ['Consultation', 'Setup & support', 'Repairs', 'Maintenance plans']],
  [/auto|car|vehicle|mechanic/i, ['Servicing', 'Repairs & diagnostics', 'Detailing', 'Tyres & parts']],
  [/legal|law|consult|account|tax|finance|insurance|bank|money/i, ['Expert advice', 'Tailored plans', 'Ongoing support', 'No-stress process']],
  [/real estate|property|estate|house|apartment/i, ['Buying & selling', 'Rental management', 'Property valuation', 'Investment advice']],
  [/event|planning|party|catering/i, ['Full event planning', 'Decoration & styling', 'Catering', 'Day-of coordination']],
  [/clean|laundry|logistic|transport|delivery/i, ['Reliable service', 'Quick turnaround', 'Affordable rates', 'On-demand bookings']],
];

export function serviceSuggestions(category: string): string[] {
  const match = SERVICE_SUGGESTIONS.find(([re]) => re.test(category || ''));
  if (match) return match[1];
  return ['Expert service', 'Quality you can trust', 'Great value', 'Friendly support'];
}

export function ctaFor(category: string): string {
  const bookingCats = /restaurant|fast food|caf|hotel|salon|barber|spa|gym|clinic|hospital|dental|vet|school|tutor|travel|photograph|video|legal|auto|repair/i;
  if (bookingCats.test(category || '')) return 'Book on WhatsApp';
  return 'Order on WhatsApp';
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultSections(business: Business): LandingSection[] {
  const category = business.category || '';
  const services = serviceSuggestions(category);
  return [
    {
      id: 'hero',
      type: 'hero',
      title: business.name,
      subtitle: business.description,
      body: business.location ? `📍 ${business.location}` : '',
      items: [],
      ctaLabel: ctaFor(category),
      visible: true,
    },
    {
      id: 'services',
      type: 'services',
      title: 'What we offer',
      subtitle: 'Everything you need, in one place.',
      body: '',
      items: services,
      ctaLabel: ctaFor(category),
      visible: true,
    },
    {
      id: 'gallery',
      type: 'gallery',
      title: 'Our work',
      subtitle: 'See what we do best.',
      body: '',
      items: [],
      ctaLabel: 'See more',
      visible: false,
    },
    {
      id: 'promo',
      type: 'promo',
      title: 'Limited offer',
      subtitle: 'Something special for NowOpen visitors.',
      body: 'Mention NowOpen Africa when you reach out to claim this offer.',
      items: [],
      ctaLabel: 'Claim offer',
      visible: false,
    },
    {
      id: 'pricing',
      type: 'pricing',
      title: 'Pricing',
      subtitle: 'Simple, honest rates.',
      body: 'Message us for exact pricing and packages.',
      items: ['Starting from ₦5,000'],
      ctaLabel: 'Ask for a quote',
      visible: false,
    },
    {
      id: 'contact',
      type: 'contact',
      title: 'Get in touch',
      subtitle: 'We reply fast on WhatsApp.',
      body: [business.location, business.hours, business.website].filter(Boolean).join('\n'),
      items: [],
      ctaLabel: 'Message us',
      visible: true,
    },
  ];
}

export function generateLanding(business: Business, accent = LANDING_ACCENTS[0]): LandingPage {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: business.name,
    tagline: business.description,
    theme: 'light',
    accent,
    showLogo: true,
    sections: defaultSections(business),
    createdAt: now,
    updatedAt: now,
  };
}

export function landingUrl(business: Business): string {
  return profileUrl(business);
}

export function landingShareText(business: Business, page: LandingPage): string {
  const promo = page.sections.find((s) => s.type === 'promo' && s.visible);
  return [
    `${page.title} is live! 👋`,
    page.tagline,
    promo ? `🎉 ${promo.title} — ${promo.subtitle}` : '',
    business.phone ? `Message us on ${business.phone}.` : '',
    `See us here → ${landingUrl(business)}`,
  ].filter(Boolean).join('\n');
}

export function landingCss(page: LandingPage): string {
  const text = page.theme === 'dark' ? '#f9fafb' : '#111827';
  const bg = page.theme === 'dark' ? '#0f172a' : '#ffffff';
  const muted = page.theme === 'dark' ? '#94a3b8' : '#6b7280';
  return `:root{--landing-accent:${page.accent};--landing-text:${text};--landing-bg:${bg};--landing-muted:${muted}}`;
}

export function renderLandingHtml(business: Business, page: LandingPage): string {
  const waHref = (section: LandingSection) => business.phone
    ? `https://wa.me/${business.phone.replace(/[^\d]/g, '').replace(/^0/, '234')}?text=${encodeURIComponent(`Hi ${business.name}, I saw your ${section.title} on NowOpen Africa!`)}`
    : `#contact`;
  const blocks = page.sections.filter((s) => s.visible).map((s) => {
    const items = s.items.length
      ? `<ul class="items">${s.items.map((i) => `<li>${i}</li>`).join('')}</ul>`
      : '';
    const media = s.media
      ? s.media.type === 'video'
        ? `<video class="media" src="${s.media.url}" controls preload="metadata"></video>`
        : `<img class="media" src="${s.media.url}" alt="${s.title}">`
      : '';
    return `
      <section class="block">
        <h2>${s.title}</h2>
        ${s.subtitle ? `<p class="sub">${s.subtitle}</p>` : ''}
        ${s.body ? `<p class="body">${s.body.replace(/\n/g, '<br>')}</p>` : ''}
        ${items}
        ${media}
        ${s.ctaLabel ? `<a class="cta" href="${waHref(s)}">${s.ctaLabel}</a>` : ''}
      </section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${page.title} — NowOpen Africa</title>
<style>
:root{--accent:${page.accent}}*{box-sizing:border-box;margin:0}
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:${page.theme === 'dark' ? '#0f172a' : '#ffffff'};color:${page.theme === 'dark' ? '#f9fafb' : '#111827'};line-height:1.55}
header{padding:3rem 1.5rem 2rem;text-align:center;background:${page.theme === 'dark' ? '#111c33' : '#faf5ff'}}
header img{width:56px;height:56px;border-radius:16px;object-fit:cover;margin-bottom:.75rem}
header h1{font-size:1.9rem;font-weight:800;letter-spacing:-.02em}
header p{color:${page.theme === 'dark' ? '#94a3b8' : '#6b7280'};margin-top:.5rem;max-width:34rem;margin-left:auto;margin-right:auto}
main{max-width:44rem;margin:0 auto;padding:1.5rem}
.block{padding:1.4rem 0;border-bottom:1px solid ${page.theme === 'dark' ? '#1f2c47' : '#f0e9fb'}}
.block h2{font-size:1.25rem;font-weight:800;color:${page.theme === 'dark' ? '#f9fafb' : '#111827'}}
.block .sub{color:${page.theme === 'dark' ? '#94a3b8' : '#6b7280'};margin-top:.25rem}
.block .body{margin-top:.5rem;white-space:pre-line}
.block .media{width:100%;max-height:340px;object-fit:cover;border-radius:14px;margin-top:.9rem;background:#0f172a}
.items{list-style:none;padding:0;margin-top:.75rem;display:grid;gap:.5rem}
.items li{padding:.7rem .9rem;border-radius:12px;background:${page.theme === 'dark' ? '#111c33' : '#faf5ff'}}
.cta{display:inline-block;margin-top:1rem;padding:.65rem 1.3rem;border-radius:999px;background:var(--accent);color:#fff;font-weight:700;text-decoration:none}
footer{padding:2rem 1.5rem;text-align:center;color:${page.theme === 'dark' ? '#94a3b8' : '#6b7280'};font-size:.85rem}
</style></head>
<body>
<header>${page.showLogo && business.logo_url ? `<img src="${business.logo_url}" alt="">` : ''}<h1>${page.title}</h1><p>${page.tagline}</p></header>
<main>${blocks}</main>
<footer>${business.name} · ${business.location || ''} · <a href="${profileUrl(business)}" style="color:var(--accent)">Find us on NowOpen Africa</a></footer>
</body></html>`;
}

// --- Persistence ------------------------------------------------------------

export function landingKey(businessId: string): string {
  return `nowopen_landing_${businessId}`;
}

export function loadLanding(businessId: string): LandingPage | null {
  try {
    const raw = localStorage.getItem(landingKey(businessId));
    return raw ? (JSON.parse(raw) as LandingPage) : null;
  } catch {
    return null;
  }
}

export function saveLanding(businessId: string, page: LandingPage): void {
  try { localStorage.setItem(landingKey(businessId), JSON.stringify(page)); } catch { /* ignore */ }
}
