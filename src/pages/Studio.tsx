import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft, Sparkles, Palette, CreditCard, Instagram, LayoutPanelTop, PenLine, ImagePlus, PackageOpen, CalendarDays, WalletCards, Printer, Presentation, Stamp, Camera, Home, MessageCircle, Activity, Mail, Heart, Receipt, Trophy, LayoutTemplate, Zap, TrendingUp, Store, FileText, Mic, Clapperboard, Globe, Wand2, Podcast, Bot, CalendarCheck, Users, Banknote, Radar, Search, Workflow, ReceiptText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import { Business } from '../types';
import MotionGraphicsStudio from '../components/admin/MotionGraphicsStudio';
import DesignStudioHub from '../components/studio/DesignStudioHub';
import CampaignManager from '../components/studio/CampaignManager';
import BrandKitStudio from '../components/studio/BrandKitStudio';
import BrandCardStudio from '../components/studio/BrandCardStudio';
import MediaLibrary from '../components/studio/MediaLibrary';
import ExportCentre from '../components/studio/ExportCentre';
import GrowthHome from '../components/studio/GrowthHome';
import HealthDashboard from '../components/studio/HealthDashboard';
import LivePromoCenter from '../components/studio/LivePromoCenter';
import GrowthChallenges from '../components/studio/GrowthChallenges';
import CustomerLoyaltyHub from '../components/studio/CustomerLoyaltyHub';
import CampaignAnalytics from '../components/studio/CampaignAnalytics';
import InvoicesStudio from '../components/studio/InvoicesStudio';
import ReceiptStudio from '../components/studio/ReceiptStudio';
import CustomersPanel from '../components/studio/CustomersPanel';
import LandingPageBuilder from '../components/studio/LandingPageBuilder';
import ProposalStudio from '../components/studio/ProposalStudio';
import DigitalCatalogue from '../components/studio/DigitalCatalogue';
import SocialStudioHub from '../components/studio/SocialStudioHub';
import { GrowthPlanModule } from '../lib/growth';
import { HUBS, HOME_MODULES, INTENTS, greeting, type ModuleKey } from '../lib/studioHubs';


interface ModuleMeta {
  key: ModuleKey;
  label: string;
  icon: typeof Palette;
  desc: string;
  soon?: boolean;
}

// How each module presents itself. WHERE it appears is decided by lib/studioHubs
// — keeping the two apart is what lets the IA be tested without importing React.
const META: Record<ModuleKey, ModuleMeta> = {
  home: { key: 'home', label: 'Growth Center', icon: Home, desc: 'Your growth score, weekly plan and quick wins — the heartbeat of Studio.' },
  challenges: { key: 'challenges', label: 'Growth Challenges', icon: Trophy, desc: 'Gamified sprints that turn advice into finished actions — earn points as you grow.' },

  design: { key: 'design', label: 'Creative Studio', icon: LayoutPanelTop, desc: 'Flyers, posters, banners, stories and social graphics — one studio, every size. Quick Create, AI copy, live previews and a full campaign pack.' },
  // The module key stays 'video' on purpose: it is in saved hub layouts and in
  // links that have already been emailed out. Only what it opens has changed.
  video: { key: 'video', label: 'Motion Studio', icon: Clapperboard, desc: 'Design a motion graphic and render a real video — templates, storyboard, timeline, backgrounds and voiceover, in every aspect ratio.' },
  'brand-kit': { key: 'brand-kit', label: 'Brand OS', icon: Palette, desc: 'Your identity, voice, colours, stationery and brand health — how your entire brand works.' },
  card: { key: 'card', label: 'Digital Business Card', icon: CreditCard, desc: 'A professional business card with a live QR that always points to your profile.' },
  landing: { key: 'landing', label: 'Landing Pages', icon: LayoutTemplate, desc: 'A one-page site for launches, events and offers.' },

  social: { key: 'social', label: 'AI Marketing Department', icon: Instagram, desc: 'Daily Growth, AI Director, Trend Radar, Monthly Planner, Campaign Marketplace, Content Factory, Growth Score and AI Notifications.' },
  campaigns: { key: 'campaigns', label: 'Campaign Manager', icon: Mail, desc: 'Email, SMS, WhatsApp, announcements and one-click campaigns — coordinated in one place.' },
  'live-promo': { key: 'live-promo', label: 'Live Promotion Center', icon: Zap, desc: 'Create, schedule, launch and count down promotions — then share them on WhatsApp.' },

  quotations: { key: 'quotations', label: 'Quotes & Proposals', icon: FileText, desc: 'Professional quotes and proposals customers can approve in one tap.' },
  invoices: { key: 'invoices', label: 'Invoices & Payments', icon: Receipt, desc: 'Invoices and payment reminders that look the part.' },
  receipts: { key: 'receipts', label: 'Receipts', icon: ReceiptText, desc: 'Branded receipts in the shape your trade’s customers expect.' },
  customers: { key: 'customers', label: 'Customers', icon: Users, desc: 'Everyone who booked, enquired or reviewed — and how to reach them.' },
  catalogues: { key: 'catalogues', label: 'Product Catalogue', icon: Store, desc: 'Turn your products or menu into a shareable digital catalogue.' },
  loyalty: { key: 'loyalty', label: 'Loyalty Hub', icon: Heart, desc: 'Reward regulars and bring them back with points, stamp cards and VIP perks.' },
  health: { key: 'health', label: 'Business Health', icon: Activity, desc: 'Your growth score, trust signals and coach recommendations in one dashboard.' },
  analytics: { key: 'analytics', label: 'Campaign Analytics', icon: TrendingUp, desc: 'Your Marketing Health Score, weekly activity and rule-based next steps in one dashboard.' },
  media: { key: 'media', label: 'Media Library', icon: ImagePlus, desc: 'Your logo, cover and brand files — cloud synced for every Studio export.' },
  export: { key: 'export', label: 'Export Centre', icon: PackageOpen, desc: 'Download every asset Studio has created for you, all in one place.' },

  // Merged into larger tools; reachable by deep link so emailed brand kits and
  // old links keep working.
  promotions: { key: 'promotions', label: 'Promotion Builder', icon: WalletCards, desc: 'BOGO, discounts, referrals, loyalty and more — designed & ready to share in Creative Studio.' },
  planner: { key: 'planner', label: 'Content Planner', icon: CalendarDays, desc: 'Plan posts, promos and stories — now in the AI Marketing Department > Monthly Planner.' },
  copywriter: { key: 'copywriter', label: 'AI Copywriter', icon: PenLine, desc: 'Captions, ads, emails and hashtags — now in the AI Marketing Department > Content Factory.' },
  assistant: { key: 'assistant', label: 'AI Business Assistant', icon: MessageCircle, desc: 'Ask anything about customers, campaigns and growth — now in the AI Marketing Department > AI Director.' },
};

const ALIAS: Partial<Record<GrowthPlanModule, ModuleKey>> = {
  flyer: 'design',
  poster: 'design',
  banner: 'design',
  campaign: 'campaigns',
  announce: 'campaigns',
};

// Modules that moved into a broader hub (Design Studio / AI Marketing
// Department) but are still valid deep-link targets from growth plans,
// challenges and the AI assistant. They stay out of the sidebar so nothing is
// duplicated.
const ROADMAP: { label: string; icon: typeof Printer }[] = [
  { label: 'Presentation Builder', icon: Presentation },
  { label: 'Print Studio', icon: Printer },
  { label: 'Business Email Signature', icon: Stamp },
  { label: 'AI Product Photography', icon: Camera },
  { label: 'AI Presenter', icon: Clapperboard },
  { label: 'AI Voiceovers', icon: Mic },
  { label: 'AI Website Builder', icon: Globe },
  { label: 'AI Logo Animator', icon: Wand2 },
  { label: 'AI Podcast Studio', icon: Podcast },
  { label: 'AI Customer Support Agent', icon: Bot },
];

const ROADMAP_PLANNED: { label: string; icon: typeof CalendarCheck }[] = [
  { label: 'Booking Manager', icon: CalendarCheck },
  { label: 'Order Manager', icon: Store },
  { label: 'Customer CRM', icon: Users },
  { label: 'Payment Center', icon: Banknote },
  { label: 'Competitor Insights', icon: Radar },
  { label: 'SEO & Discoverability Center', icon: Search },
  { label: 'Smart Content Generator', icon: Wand2 },
  { label: 'Business Automation', icon: Workflow },
];

export default function Studio() {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ModuleKey>('home');

  useEffect(() => {
    return applySeo({
      title: 'Studio — NowOpen Africa',
      description: 'Your business growth studio on NowOpen Africa.',
      path: '/studio',
      robots: 'noindex, nofollow',
    });
  }, []);

  const go = (m: GrowthPlanModule) => setActive(ALIAS[m] ?? (m as ModuleKey));

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase.from('businesses').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => {
        setBusinesses(data || []);
        if (data && data.length) setSelectedId(String(data[0].id));
        setLoading(false);
      });
  }, [user]);

  // Deep links like /studio?module=card open that tool directly (used by the
  // onboarding brand kit sent to new businesses). Legacy module names are
  // resolved through ALIAS into their merged home.
  useEffect(() => {
    const module = new URLSearchParams(window.location.search).get('module');
    if (!module) return;
    const target = ALIAS[module as GrowthPlanModule]
      ?? (module in META ? (module as ModuleKey) : undefined);
    if (target) setActive(target);
  }, []);

  const business = businesses.find((b) => String(b.id) === selectedId);
  const activeMeta = META[active];

  const renderModule = () => {
    if (!business) return null;
    switch (active) {
      case 'home': return <GrowthHome business={business} onNavigate={go} />;
      case 'brand-kit': return <BrandKitStudio business={business} />;
      case 'card': return <BrandCardStudio business={business} />;
      case 'social': return <SocialStudioHub key={`${business.id}-social`} business={business} onNavigate={go} />;
      case 'design': return <DesignStudioHub business={business} />;
      case 'video': return <MotionGraphicsStudio key={`${business.id}-video`} businessName={business.name} userId={user?.id} />;
      case 'promotions': return <DesignStudioHub key={`${business.id}-promo`} business={business} initialTab="promo" />;
      case 'copywriter': return <SocialStudioHub key={`${business.id}-social-factory`} business={business} onNavigate={go} initialTab="factory" />;
      case 'assistant': return <SocialStudioHub key={`${business.id}-social-director`} business={business} onNavigate={go} initialTab="director" />;
      case 'planner': return <SocialStudioHub key={`${business.id}-social-planner`} business={business} onNavigate={go} initialTab="planner" />;
      case 'live-promo': return <LivePromoCenter business={business} onNavigate={go} />;
      case 'campaigns': return <CampaignManager business={business} />;
      case 'loyalty': return <CustomerLoyaltyHub business={business} onNavigate={go} />;
      case 'analytics': return <CampaignAnalytics business={business} onNavigate={go} />;
      case 'invoices': return <InvoicesStudio key={`${business.id}-invoices`} business={business} />;
      case 'receipts': return <ReceiptStudio key={`${business.id}-receipts`} business={business} />;
      case 'customers': return <CustomersPanel key={`${business.id}-customers`} business={business} />;
      case 'quotations': return <ProposalStudio key={`${business.id}-quotations`} business={business} />;
      case 'catalogues': return <DigitalCatalogue key={`${business.id}-catalogues`} business={business} />;
      case 'landing': return <LandingPageBuilder key={`${business.id}-landing`} business={business} />;
      case 'challenges': return <GrowthChallenges business={business} onNavigate={go} />;
      case 'health': return <HealthDashboard business={business} onNavigate={go} />;
      case 'media': return <MediaLibrary business={business} />;
      case 'export': return <ExportCentre business={business} />;
      default: return <ComingSoon meta={activeMeta!} />;
    }
  };

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Sparkles size={18} className="text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NowOpen Studio</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Discover. Sell. Manage. Grow.</p>
          </div>
          <Link to="/dashboard" className="ml-auto inline-flex items-center gap-1.5 min-h-[44px] px-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <ArrowLeft size={15} /> Dashboard
          </Link>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          The growth department for your business. Build your brand, get discovered, sell more and manage customers — all from one place, no designer needed.
        </p>

        {businesses.length === 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
            <p className="text-gray-600 dark:text-gray-400">Create a business first to unlock its studio.</p>
            <Link to="/dashboard" className="mt-3 inline-block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Go to dashboard →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[230px,1fr] gap-6">
            {/* Sidebar */}
            <aside>
              {businesses.length > 1 && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Business</label>
                  <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm">
                    {businesses.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <nav className="flex lg:flex-col gap-1 lg:gap-0 overflow-x-auto pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0">
                {/* Growth sits above the hubs — it's the front door, not a peer. */}
                <div className="flex lg:flex-col gap-1 lg:gap-0 lg:mb-4 shrink-0">
                  {HOME_MODULES.map((key) => <NavItem key={key} meta={META[key]} active={active} onClick={setActive} />)}
                </div>

                {HUBS.map((hub) => (
                  <div key={hub.key} className="flex lg:flex-col gap-1 lg:gap-0 lg:mb-4 shrink-0">
                    <p className="hidden lg:block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold px-2 mb-1">{hub.label}</p>
                    {hub.modules.map((key) => <NavItem key={key} meta={META[key]} active={active} onClick={setActive} />)}
                  </div>
                ))}
              </nav>
            </aside>

            {/* Content */}
            <section className="min-w-0">
              {active === 'home' && <IntentLauncher name={business?.name} onPick={setActive} />}

              <div className="mb-5">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{activeMeta?.label}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{activeMeta?.desc}</p>
              </div>
              {renderModule()}

              {/* Roadmap */}
              <div className="mt-10 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">On the Studio roadmap</h3>
                <div className="flex flex-wrap gap-2">
                  {ROADMAP.map((r) => (
                    <span key={r.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800">
                      <r.icon size={13} /> {r.label}
                    </span>
                  ))}
                </div>
                <h4 className="mt-4 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Planned add-ons</h4>
                <div className="flex flex-wrap gap-2">
                  {ROADMAP_PLANNED.map((r) => (
                    <span key={r.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800">
                      <r.icon size={13} /> {r.label}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function NavItem({ meta, active, onClick }: { meta: ModuleMeta; active: ModuleKey; onClick: (k: ModuleKey) => void }) {
  const Icon = meta.icon;
  return (
    <button
      onClick={() => onClick(meta.key)}
      aria-current={active === meta.key ? 'page' : undefined}
      className={`inline-flex items-center gap-2 px-2.5 min-h-[44px] rounded-lg text-sm font-medium whitespace-nowrap lg:w-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${active === meta.key ? 'bg-purple-600 text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
    >
      <Icon size={15} />
      <span>{meta.label}</span>
      {meta.soon && <span className="ml-auto hidden lg:inline text-[9px] font-bold uppercase text-purple-300 dark:text-purple-400">Soon</span>}
    </button>
  );
}

/**
 * "What do you want to create today?"
 *
 * The old Studio opened on a dashboard of scores. That answers "how am I
 * doing?", which is a question owners ask occasionally, while the question they
 * arrive with is "I need a poster for Saturday". These tiles name outcomes, not
 * tools, and route to modules that already exist.
 */
function IntentLauncher({ name, onPick }: { name?: string; onPick: (k: ModuleKey) => void }) {
  // Read the clock once per mount. Impure calls don't belong in render or a
  // memo — the React Compiler flags them, and a greeting that flips mid-session
  // is worse than one that's a few minutes stale.
  const [hour] = useState(() => new Date().getHours());

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
        {greeting(hour)}{name ? `, ${name}` : ''} 👋
      </h2>
      <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">What do you want to create today?</p>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {INTENTS.map((intent) => (
          <button
            key={intent.id}
            onClick={() => onPick(intent.target)}
            className="group text-left p-3 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <span className="block text-sm font-bold text-gray-900 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-300">
              {intent.label}
            </span>
            <span className="block mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
              {intent.outcome}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ComingSoon({ meta }: { meta: ModuleMeta }) {
  const Icon = meta.icon;
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-10 text-center">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
        <Icon size={24} className="text-purple-600 dark:text-purple-400" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{meta.label}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">{meta.desc}</p>
      <span className="mt-4 inline-block text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
        Coming soon
      </span>
    </div>
  );
}
