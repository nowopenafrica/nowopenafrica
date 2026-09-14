import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { isUnprovisionedError } from '../../../lib/enrichmentOps';
import { Card, EmptyState, StatCard, StatusChip, WarnBanner } from './shared';

interface Stats {
  pending: number;
  review: number;
  held: number;
  published: number;
  merged: number;
  rejected: number;
  today: number;
  sources_active: number;
  sources_blocked: number;
  mode: string;
}

interface BusinessCounts {
  claimed: number;
  claim_pending: number;
  unclaimed: number;
  verified: number;
}

const bar = (part: number, total: number): string => {
  if (total <= 0) return '0%';
  return `${Math.max(2, Math.round((part / total) * 100))}%`;
};

export default function OverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [counts, setCounts] = useState<BusinessCounts | null>(null);
  const [campaigns, setCampaigns] = useState<Array<{ status: string }>>([]);
  const [recent, setRecent] = useState<Array<{ id: string; name: string; category: string | null; confidence: number; status: string; source_key: string; created_at: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    const load = async () => {
      setLoading(true);
      const [s, b, c, r] = await Promise.all([
        supabase.rpc('radar_stats'),
        supabase.from('businesses').select('claim_status,verification_status'),
        supabase.from('business_discovery_campaigns').select('status'),
        supabase.from('radar_candidates').select('id,name,category,confidence,status,source_key,created_at').order('created_at', { ascending: false }).limit(6),
      ]);
      if (!live) return;
      setError(isUnprovisionedError(s.error?.message) ? 'Some tables are not provisioned yet. Migration shipped but not applied to this database.' : s.error?.message ?? null);
      if (s.data) setStats(s.data as unknown as Stats);
      if (!b.error && b.data) {
        const bc: BusinessCounts = { claimed: 0, claim_pending: 0, unclaimed: 0, verified: 0 };
        for (const row of b.data) {
          if (row.claim_status === 'claimed') bc.claimed += 1;
          else if (row.claim_status === 'claim_pending') bc.claim_pending += 1;
          else bc.unclaimed += 1;
          if (row.verification_status === 'verified') bc.verified += 1;
        }
        setCounts(bc);
      }
      if (!c.error && c.data) setCampaigns(c.data);
      if (!r.error && r.data) setRecent(r.data);
      setLoading(false);
    };
    void load();
    return () => { live = false; };
  }, []);

  if (loading) {
    return <div className="py-10 text-center text-sm text-gray-400">Reading the state of discovery…</div>;
  }

  const inDiscovery = (stats?.pending ?? 0) + (stats?.review ?? 0) + (stats?.held ?? 0);
  const funnelTotal = inDiscovery + (stats?.published ?? 0);
  const campaignActive = campaigns.filter((x) => x.status === 'active').length;

  return (
    <div className="space-y-5">
      {error && <WarnBanner>{error}</WarnBanner>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="In discovery" value={inDiscovery} sub={`${stats?.pending ?? 0} pending · ${stats?.review ?? 0} review · ${stats?.held ?? 0} held`} tone="blue" />
        <StatCard label="Published profiles" value={stats?.published ?? 0} tone="emerald" />
        <StatCard label="Claims" value={counts?.claimed ?? 0} sub={`${counts?.claim_pending ?? 0} pending claim`} tone={counts && counts.claimed > 0 ? 'purple' : 'gray'} />
        <StatCard label="Discovered today" value={stats?.today ?? 0} tone="emerald" />
        <StatCard label="Sources" value={`${stats?.sources_active ?? 0}/${(stats?.sources_active ?? 0) + (stats?.sources_blocked ?? 0)}`} sub={`${stats?.sources_blocked ?? 0} blocked`} tone="gray" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Discovery → public funnel" className="lg:col-span-2">
          {funnelTotal === 0 ? (
            <EmptyState>Nothing in the pipeline yet — create a campaign to start discovering.</EmptyState>
          ) : (
            <div className="space-y-3">
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700 flex">
                <div className="bg-blue-500" style={{ width: bar(inDiscovery, funnelTotal) }} />
                <div className="bg-emerald-500" style={{ width: bar(stats?.published ?? 0, funnelTotal) }} />
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-gray-500 dark:text-gray-400">
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />discovery ({inDiscovery})</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />published ({stats?.published ?? 0})</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-purple-500" />claimed ({counts?.claimed ?? 0})</span>
                <span className="ml-auto">autonomy: {stats?.mode ?? 'off'}</span>
              </div>
            </div>
          )}
        </Card>

        <Card title="Claims & verification">
          <div className="space-y-2 text-[13px]">
            <Row label="Claimed & live" value={counts?.claimed ?? 0} />
            <Row label="Claim pending" value={counts?.claim_pending ?? 0} />
            <Row label="Unclaimed shells" value={counts?.unclaimed ?? 0} />
            <Row label="Verified" value={counts?.verified ?? 0} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Campaigns" action={campaignActive > 0 ? <StatusChip status="active">{campaignActive} active</StatusChip> : undefined}>
          {campaigns.length === 0 ? (
            <EmptyState>No campaigns yet.</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              {Object.entries(campaigns.reduce<Record<string, number>>((acc, x) => { acc[x.status] = (acc[x.status] ?? 0) + 1; return acc; }, {})).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2">
                  <StatusChip status={k}>{k}</StatusChip>
                  <span className="font-semibold tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Latest discoveries">
          {recent.length === 0 ? (
            <EmptyState>No candidates yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-gray-200">{r.name}</span>
                  <span className="hidden truncate text-gray-400 sm:block">{r.category ?? '—'}</span>
                  <StatusChip status={r.status}>{r.status}</StatusChip>
                  <span className="w-9 text-right tabular-nums text-gray-500">{r.confidence}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-200">{value}</span>
    </div>
  );
}