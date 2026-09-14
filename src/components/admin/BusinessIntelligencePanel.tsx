import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Filter, Layers, ScrollText, ToggleLeft } from 'lucide-react';
import OverviewTab from './businessIntelligence/OverviewTab';
import CampaignsTab from './businessIntelligence/CampaignsTab';
import SourcesTab from './businessIntelligence/SourcesTab';
import ReviewTab from './businessIntelligence/ReviewTab';
import ComplianceTab from './businessIntelligence/ComplianceTab';

const TABS = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'campaigns', label: 'Campaigns', icon: Layers },
  { key: 'sources', label: 'Sources', icon: Filter },
  { key: 'review', label: 'Review', icon: ScrollText },
  { key: 'compliance', label: 'Compliance', icon: ToggleLeft },
] as const;

export default function BusinessIntelligencePanel() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'overview';
  const active = TABS.some((t) => t.key === tab) ? tab : 'overview';

  return (
    <div className="min-h-[70vh] px-4 py-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          to="/admin"
          className="rounded-lg border border-gray-200 dark:border-gray-700 p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
          title="Back to Admin"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Business Intelligence</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">
            Discover, verify, publish unclaimed profiles and support claim — internal ops area.
          </p>
        </div>
        <span className="ml-auto rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          internal · noindex
        </span>
      </header>

      <nav className="mb-5 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setParams({ tab: t.key })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition ${
                active === t.key
                  ? 'bg-nowopen-500 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {active === 'overview' && <OverviewTab />}
      {active === 'campaigns' && <CampaignsTab />}
      {active === 'sources' && <SourcesTab />}
      {active === 'review' && <ReviewTab />}
      {active === 'compliance' && <ComplianceTab />}
    </div>
  );
}