import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, PenTool, Clapperboard, Video, Instagram, Rocket, FileText, MessageCircle,
  Boxes, Newspaper, Users, Bot, TrendingUp, Radar, Braces, LayoutTemplate, Component,
  BookOpen, Crown, ChevronDown, ArrowLeft, Sparkles, type LucideIcon,
} from 'lucide-react';
import {
  ADMIN_SECTIONS, ADMIN_GROUPS, sectionById,
  type AdminSection, type AdminGroup,
} from '../../lib/adminCreator';
import CommandCenter from './CommandCenter';
import SocialMediaDepartment from './SocialMediaDepartment';
import CampaignFactory from './CampaignFactory';
import CreativeStudio from './CreativeStudio';
import VideoStudio from './VideoStudio';
import ContentFactoryDepartment from './ContentFactoryDepartment';
import CommunityManagement from './CommunityManagement';
import BrandAssetManager from './BrandAssetManager';
import BrandDirector from './BrandDirector';
import TrendDiscovery from './TrendDiscovery';
import AnalyticsWarRoom from './AnalyticsWarRoom';
import FounderDashboard from './FounderDashboard';
import MotionGraphicsStudio from './MotionGraphicsStudio';
import VideoTemplateLibrary from './VideoTemplateLibrary';
import DesignSystem from './DesignSystem';
import PromptLibrary from './PromptLibrary';
import PressRoom from './PressRoom';
import PartnershipCrm from './PartnershipCrm';
import LaunchControl from './LaunchControl';
import KnowledgeBase from './KnowledgeBase';
import SectionPlanned from './SectionPlanned';

// One internal frame for the whole team: every department in the sidebar,
// Command Center as the front door. Sections that are live get a real
// component; the rest open a real "planned" page that explains what the
// department will do and what it builds on. Each module receives onOpenSection
// so embedded Studio tools can jump between departments ("design this" →
// Creative Studio, a pack → AI Video Studio, etc.).
const LIVE_MODULES: Record<string, (open: (id: string) => void) => JSX.Element> = {
  social: (open) => <SocialMediaDepartment onOpenSection={open} />,
  'campaign-factory': (open) => <CampaignFactory onOpenSection={open} />,
  creative: (open) => <CreativeStudio onOpenSection={open} />,
  'video-studio': (open) => <VideoStudio onOpenSection={open} />,
  'content-factory': (open) => <ContentFactoryDepartment onOpenSection={open} />,
  community: () => <CommunityManagement />,
  'brand-assets': (open) => <BrandAssetManager onOpenSection={open} />,
  'brand-director': (open) => <BrandDirector onOpenSection={open} />,
  trends: (open) => <TrendDiscovery onOpenSection={open} />,
  'analytics-war-room': (open) => <AnalyticsWarRoom onOpenSection={open} />,
  founder: (open) => <FounderDashboard onOpenSection={open} />,
  motion: () => <MotionGraphicsStudio />,
  'video-templates': (open) => <VideoTemplateLibrary onOpenSection={open} />,
  'design-system': () => <DesignSystem />,
  'prompt-library': () => <PromptLibrary />,
  'press-room': () => <PressRoom />,
  partners: () => <PartnershipCrm />,
  launch: () => <LaunchControl />,
  knowledge: () => <KnowledgeBase />,
};

function PlannedPage({ section }: { section: AdminSection }) {
  return <SectionPlanned section={section} />;
}

const SECTION_ICONS: Record<string, LucideIcon> = {
  command: LayoutDashboard,
  'analytics-war-room': TrendingUp,
  founder: Crown,
  creative: PenTool,
  motion: Clapperboard,
  'video-studio': Video,
  'video-templates': LayoutTemplate,
  'design-system': Component,
  'prompt-library': Braces,
  social: Instagram,
  'campaign-factory': Rocket,
  'content-factory': FileText,
  community: MessageCircle,
  'brand-assets': Boxes,
  'press-room': Newspaper,
  partners: Users,
  'brand-director': Bot,
  trends: Radar,
  launch: Rocket,
  knowledge: BookOpen,
};

const GROUP_ICONS: Record<AdminGroup, LucideIcon> = {
  Oversight: LayoutDashboard,
  Create: PenTool,
  Produce: Rocket,
  Operate: Users,
  Grow: Sparkles,
  Run: BookOpen,
};

function ModuleCard({ section, onOpen }: { section: AdminSection; onOpen: (id: string) => void }) {
  const Icon = SECTION_ICONS[section.id] ?? LayoutDashboard;
  return (
    <button onClick={() => onOpen(section.id)}
      className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 transition hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
          <Icon size={18} className="text-purple-600 dark:text-purple-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            {section.label}
            {section.status === 'live' && (
              <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full">Live</span>
            )}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{section.blurb}</p>
        </div>
      </div>
      {section.reuses && section.reuses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400 mt-0.5">Builds on:</span>
          {section.reuses.map((r) => (
            <span key={r} className="px-2 py-0.5 rounded-full text-[10px] font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30">{r}</span>
          ))}
        </div>
      )}
    </button>
  );
}

export default function AdminCreatorShell() {
  const [active, setActive] = useState('command');
  const [openGroups, setOpenGroups] = useState<Record<AdminGroup, boolean>>(
    () => Object.fromEntries(ADMIN_GROUPS.map((g) => [g, g === 'Oversight'])) as Record<AdminGroup, boolean>,
  );

  const section = sectionById(active) ?? sectionById('command')!;
  const LiveModule = LIVE_MODULES[active];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NowOpen Admin Creator</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">The growth operating system for NowOpen Africa · internal team</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
              <ArrowLeft size={15} /> Admin console
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[250px,1fr] gap-6 mt-6">
          {/* Sidebar */}
          <aside>
            <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0">
              {ADMIN_GROUPS.map((group) => {
                const GroupIcon = GROUP_ICONS[group];
                const members = ADMIN_SECTIONS.filter((s) => s.group === group);
                const open = openGroups[group];
                return (
                  <div key={group} className="shrink-0 lg:w-full">
                    <button type="button"
                      onClick={() => setOpenGroups((g) => ({ ...g, [group]: !g[group] }))}
                      className="hidden lg:flex w-full items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                      <GroupIcon size={12} /> {group}
                      <ChevronDown size={11} className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    <div className={`flex lg:flex-col gap-1 ${open ? '' : 'lg:hidden'} pb-1 lg:pb-2`}>
                      {members.map((s) => {
                        const Icon = SECTION_ICONS[s.id] ?? LayoutDashboard;
                        return (
                          <button key={s.id} onClick={() => setActive(s.id)}
                            aria-current={active === s.id ? 'page' : undefined}
                            className={`inline-flex items-center gap-2 px-2.5 min-h-[44px] rounded-lg text-sm font-medium whitespace-nowrap lg:w-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${active === s.id ? 'bg-purple-600 text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                            <Icon size={15} />
                            <span className="truncate">{s.label}</span>
                            <span className={`ml-auto hidden lg:inline text-[9px] font-bold uppercase ${s.status === 'live' ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                              {s.num}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <section className="min-w-0">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{section.label}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{section.blurb}</p>
            </div>

            {active === 'command' ? (
              <CommandCenter onOpenModule={setActive} />
            ) : LiveModule ? (
              LiveModule(setActive)
            ) : (
              <PlannedPage section={section} />
            )}

            {/* When on the command center, surface the roadmap too */}
            {active === 'command' && (
              <div className="mt-8">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Departments on the roadmap</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {ADMIN_SECTIONS.filter((s) => s.id !== 'command').map((s) => (
                    <ModuleCard key={s.id} section={s} onOpen={setActive} />
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
