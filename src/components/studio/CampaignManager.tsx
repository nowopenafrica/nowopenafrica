import { useState } from 'react';
import { Mail, Megaphone, Rocket } from 'lucide-react';
import { Business } from '../../types';
import CampaignStudio from './CampaignStudio';
import AnnouncementsStudio from './AnnouncementsStudio';
import OneClickCampaigns from './OneClickCampaigns';

// One Campaign Manager that coordinates email, SMS, announcements and
// one-click campaigns, so every outreach channel lives in a single place.
const TABS = [
  { key: 'email', label: 'Email & SMS', icon: Mail },
  { key: 'announce', label: 'Announcements', icon: Megaphone },
  { key: 'oneclick', label: 'One-Click Campaigns', icon: Rocket },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function CampaignManager({ business }: { business: Business }) {
  const [tab, setTab] = useState<TabKey>('email');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-semibold border transition ${tab === t.key ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'} min-h-[44px]`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'email' && <CampaignStudio key={`${business.id}-email`} business={business} />}
      {tab === 'announce' && <AnnouncementsStudio key={`${business.id}-announce`} business={business} />}
      {tab === 'oneclick' && <OneClickCampaigns key={`${business.id}-oneclick`} business={business} />}
    </div>
  );
}
