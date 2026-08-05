import { useState } from 'react';
import { LayoutDashboard, Bot, Radio, CalendarDays, ShoppingBag, Factory, Gauge, Bell, PenTool, Send, Sparkles } from 'lucide-react';
import { Business } from '../../types';
import { GrowthPlanModule } from '../../lib/growth';
import { OCCASION_TEMPLATES, SOCIAL_FORMATS } from '../../data/studioPresets';
import DesignStudio from './DesignStudio';
import SchedulePublish from './SchedulePublish';
import DailyGrowthDashboard from './DailyGrowthDashboard';
import MarketingDirector from './MarketingDirector';
import TrendRadarPanel from './TrendRadarPanel';
import MonthlyPlanner from './MonthlyPlanner';
import CampaignMarketplace from './CampaignMarketplace';
import ContentFactory from './ContentFactory';
import GrowthScorePanel from './GrowthScorePanel';
import AiNotificationCenter from './AiNotificationCenter';

// The AI Marketing Department. Eight departments that cover the whole
// marketing job — daily growth, a director you can talk to, trend radar,
// monthly planning, campaign marketplace, content factory, growth score and
// notifications — plus the two classic tools (Design Studio and Schedule &
// Publish) so every idea can still become a designed, scheduled post.
const DEPARTMENTS = [
  { key: 'dashboard', label: 'Daily Growth', icon: LayoutDashboard, blurb: 'Today’s dashboard & mission' },
  { key: 'director', label: 'AI Director', icon: Bot, blurb: 'Talk to your marketing lead' },
  { key: 'radar', label: 'Trend Radar', icon: Radio, blurb: 'What is trending near you' },
  { key: 'planner', label: 'Monthly Planner', icon: CalendarDays, blurb: 'The whole month, generated' },
  { key: 'marketplace', label: 'Campaign Marketplace', icon: ShoppingBag, blurb: 'Ready-made campaign packs' },
  { key: 'factory', label: 'Content Factory', icon: Factory, blurb: 'Captions, copy packs & designs' },
  { key: 'score', label: 'Growth Score', icon: Gauge, blurb: '11-dimension health' },
  { key: 'notifications', label: 'Notifications', icon: Bell, blurb: 'Morning brief & AI notices' },
] as const;

const TOOLS = [
  { key: 'create', label: 'Design Studio', icon: PenTool, blurb: 'Design posts & stories' },
  { key: 'publish', label: 'Schedule & Publish', icon: Send, blurb: 'Post once, publish everywhere' },
] as const;

type DeptKey = (typeof DEPARTMENTS)[number]['key'];
type ToolKey = (typeof TOOLS)[number]['key'];
export type StudioTab = DeptKey | ToolKey;

interface Props {
  business: Business;
  onNavigate: (module: GrowthPlanModule) => void;
  initialTab?: StudioTab;
}

export default function SocialStudioHub({ business, onNavigate, initialTab = 'dashboard' }: Props) {
  const [tab, setTab] = useState<StudioTab>(initialTab);
  const [designTemplateKey, setDesignTemplateKey] = useState<string | null>(null);
  const [publishPrefill, setPublishPrefill] = useState<{ title: string; text: string } | null>(null);

  const openDesign = (templateKey: string) => {
    setDesignTemplateKey(templateKey);
    setTab('create');
  };
  const openPublish = (title: string, text: string) => {
    setPublishPrefill({ title, text });
    setTab('publish');
  };

  const allTabs = [...DEPARTMENTS, ...TOOLS];
  const activeMeta = allTabs.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      {/* Hub header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles size={18} className="text-purple-500" /> AI Marketing Department
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{activeMeta.blurb}</p>
        </div>
      </div>

      {/* Department tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {DEPARTMENTS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${tab === t.key ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
        <span className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block" />
        {TOOLS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${tab === t.key ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Department views */}
      {tab === 'dashboard' && <DailyGrowthDashboard business={business} onNavigate={onNavigate} onGo={(d) => setTab(d as StudioTab)} />}
      {tab === 'director' && <MarketingDirector key={`${business.id}-director`} business={business} onNavigate={onNavigate} />}
      {tab === 'radar' && <TrendRadarPanel key={`${business.id}-radar`} business={business} />}
      {tab === 'planner' && <MonthlyPlanner key={`${business.id}-planner`} business={business} />}
      {tab === 'marketplace' && <CampaignMarketplace key={`${business.id}-marketplace`} business={business} />}
      {tab === 'factory' && (
        <ContentFactory
          key={`${business.id}-factory`}
          business={business}
          onDesign={openDesign}
          onSchedule={openPublish}
          onNavigate={onNavigate}
        />
      )}
      {tab === 'score' && <GrowthScorePanel key={`${business.id}-score`} business={business} onNavigate={onNavigate} />}
      {tab === 'notifications' && <AiNotificationCenter key={`${business.id}-notifications`} business={business} onNavigate={onNavigate} />}

      {/* Tool views */}
      {tab === 'create' && (
        <DesignStudio
          key={`${business.id}-social-${designTemplateKey || 'default'}`}
          business={business}
          templates={OCCASION_TEMPLATES}
          formats={SOCIAL_FORMATS}
          initialTemplateKey={designTemplateKey || undefined}
          templateLabel="Post type"
          hint="All formats = Instagram post, Story/WhatsApp, Facebook, LinkedIn, TikTok, X, Pinterest, YouTube & Reels covers. Export PNG, PDF, or MP4 video."
        />
      )}
      {tab === 'publish' && (
        <SchedulePublish
          key={`${business.id}-social-publish`}
          business={business}
          prefill={publishPrefill}
          onClearPrefill={() => setPublishPrefill(null)}
        />
      )}
    </div>
  );
}
