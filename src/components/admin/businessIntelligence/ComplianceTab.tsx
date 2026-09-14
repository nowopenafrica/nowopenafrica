import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { isUnprovisionedError } from '../../../lib/enrichmentOps';
import { Card, EmptyState, StatusChip, WarnBanner } from './shared';

interface FlagRow {
  key: string;
  enabled: boolean;
  label: string | null;
  description: string | null;
}

interface ConfigRow {
  id: number;
  autonomy_mode: 'manual' | 'assisted' | 'autonomous';
  auto_publish_threshold: number;
  review_threshold: number;
}

/** The engine's own switches, grouped. Outbound reach is off by default. */
const ENGINE_FLAGS: Array<{ key: string; label: string; description: string; group: 'engine' | 'automation' | 'outreach' }> = [
  { key: 'business_discovery_engine', label: 'Discovery engine', description: 'Master switch for the discovery & claim engine workspace.', group: 'engine' },
  { key: 'source_registry', label: 'Source registry', description: 'Lets discovery consult the rights-checked source registry.', group: 'engine' },
  { key: 'continuous_sync', label: 'Continuous sync', description: 'Keeps published unclaimed profiles in step with their sources.', group: 'engine' },
  { key: 'image_intelligence', label: 'Image intelligence', description: 'Suggests open-licensed media for profile shells.', group: 'automation' },
  { key: 'enrichment_engine', label: 'Enrichment engine', description: 'Scans sources to propose additions to unclaimed profiles.', group: 'automation' },
  { key: 'auto_enrichment_enabled', label: 'Auto-applied enrichment', description: 'Writes enrichment proposals without a human click. Proposals still need provenance.', group: 'automation' },
  { key: 'media_discovery_enabled', label: 'Media discovery', description: 'Adds discovered media as proposed assets pending a rights decision.', group: 'automation' },
  { key: 'auto_profile_draft_enabled', label: 'Auto profile drafts', description: 'Turns held candidates into draft profiles on their own.', group: 'automation' },
  { key: 'auto_publish_enabled', label: 'Auto-publish', description: 'Lets the gate publish without the review screen. Thresholds still apply.', group: 'automation' },
  { key: 'claim_outreach', label: 'Claim outreach', description: 'Sends owners an invitation after a claim is linked. Off drills into nothing.', group: 'outreach' },
  { key: 'auto_outreach_enabled', label: 'Auto-outreach', description: 'Sends invitations without prior approval of each message.', group: 'outreach' },
  { key: 'email_outreach_enabled', label: 'Email channel', description: 'Permits email as an outreach channel.', group: 'outreach' },
  { key: 'whatsapp_outreach_enabled', label: 'WhatsApp channel', description: 'Permits WhatsApp as an outreach channel.', group: 'outreach' },
  { key: 'instagram_official_integration', label: 'Instagram official API', description: 'Owner-connected professional accounts only. Requires Meta app review.', group: 'outreach' },
  { key: 'instagram_interaction_flow_enabled', label: 'Instagram interaction', description: 'Reply-based flow; never cold-DMs any profile.', group: 'outreach' },
];

const GROUP_LABEL: Record<string, string> = {
  engine: 'Engine surface',
  automation: 'Automation',
  outreach: 'Outreach & sending',
};

export default function ComplianceTab() {
  const [flags, setFlags] = useState<Record<string, FlagRow>>({});
  const [config, setConfig] = useState<ConfigRow | null>(null);
  const [suppressions, setSuppressions] = useState<Array<{ id: string; contact: string; channel: string; reason: string; expires_at: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const keys = ENGINE_FLAGS.map((f) => f.key);
    const [f, c, su] = await Promise.all([
      supabase.from('feature_flags').select('key,enabled,label,description').in('key', keys),
      supabase.from('radar_config').select('id,autonomy_mode,auto_publish_threshold,review_threshold').order('id', { ascending: true }).limit(1),
      supabase.from('claimreach_suppressions').select('id,contact,channel,reason,expires_at,created_at').order('created_at', { ascending: false }).limit(50),
    ]);
    if (f.error) setError(isUnprovisionedError(f.error.message) ? 'Tables not provisioned in this database yet.' : f.error.message);
    else { setError(null); setFlags(Object.fromEntries((f.data as FlagRow[]).map((x) => [x.key, x]))); }
    if (!c.error && c.data && c.data.length > 0) setConfig(c.data[0] as unknown as ConfigRow);
    if (!su.error && su.data) setSuppressions(su.data as unknown as typeof suppressions);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (key: string, enabled: boolean) => {
    setBusy(key);
    const { error: e } = await supabase.rpc('set_feature_flag', { p_key: key, p_enabled: enabled });
    if (e) toast.error(e.message);
    else { setFlags((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { key, enabled, label: null, description: null }), enabled } })); toast.success('Saved.'); }
    setBusy(null);
  };

  const saveConfig = async (patch: Partial<ConfigRow>) => {
    if (!config) return;
    const next = { ...config, ...patch };
    const { error: e } = await supabase.from('radar_config').update({ autonomy_mode: next.autonomy_mode, auto_publish_threshold: next.auto_publish_threshold, review_threshold: next.review_threshold }).eq('id', config.id);
    if (e) toast.error(e.message);
    else { setConfig(next); toast.success('Queue thresholds saved.'); }
  };

  if (loading) return <div className="py-10 text-center text-sm text-gray-400">Loading compliance state…</div>;

  const groups = ['engine', 'automation', 'outreach'] as const;

  return (
    <div className="space-y-5">
      {error && <WarnBanner>{error}</WarnBanner>}

      <p className="text-[13px] text-gray-500 dark:text-gray-400">
        Every send-capable switch ships off and defaults to off when status is unknown — a failure must never turn
        into a fire-and-forget message.
      </p>

      {groups.map((g) => (
        <Card key={g} title={GROUP_LABEL[g]}>
          {ENGINE_FLAGS.filter((x) => x.group === g).length === 0 ? (
            <EmptyState>No switches in this group.</EmptyState>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {ENGINE_FLAGS.filter((x) => x.group === g).map((def) => {
                const row = flags[def.key];
                const enabled = row?.enabled ?? false;
                return (
                  <li key={def.key} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {def.label}
                        <span className="ml-2 font-normal text-gray-400">{def.key}</span>
                      </p>
                      <p className="text-[12px] text-gray-500 dark:text-gray-400">{def.description}</p>
                    </div>
                    <StatusChip status={enabled ? 'enabled' : 'off'}>{enabled ? 'on' : 'off'}</StatusChip>
                    <button
                      disabled={busy === def.key}
                      onClick={() => void toggle(def.key, !enabled)}
                      className={`relative h-6 w-11 rounded-full transition disabled:opacity-50 ${enabled ? 'bg-nowopen-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      aria-label={`Toggle ${def.label}`}
                    >
                      {busy === def.key ? (
                        <Loader2 size={12} className="absolute left-4 top-1.5 animate-spin text-white" />
                      ) : (
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ))}

      <Card title="Queue thresholds & autonomy">
        {!config ? (
          <EmptyState>radar_config not provisioned.</EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Autonomy mode</label>
              <select
                value={config.autonomy_mode}
                onChange={(e) => void saveConfig({ autonomy_mode: e.target.value as ConfigRow['autonomy_mode'] })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              >
                <option value="manual">Manual — nothing publishes without a person</option>
                <option value="assisted">Assisted — AI prepares, a person approves</option>
                <option value="autonomous">Autonomous — gate decides within thresholds</option>
              </select>
            </div>
            <NumberField label="Review from (confidence)" value={config.review_threshold} onChange={(v) => void saveConfig({ review_threshold: v })} />
            <NumberField label="Auto-publish from (confidence)" value={config.auto_publish_threshold} onChange={(v) => void saveConfig({ auto_publish_threshold: v })} />
            <p className="text-[12px] text-gray-500 dark:text-gray-400 lg:col-span-3">
              These are the queue-wide bars the whole engine leans on. Campaigns may raise theirs, never lower them.
            </p>
          </div>
        )}
      </Card>

      <Card title="Suppression list" action={suppressions.length > 0 ? <StatusChip status="active">{suppressions.length} active</StatusChip> : undefined}>
        {suppressions.length === 0 ? (
          <EmptyState>No opt-outs recorded. This list is read here and checked before any outreach — it is not edited here, on purpose.</EmptyState>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="py-2 pr-3">Contact</th>
                  <th className="py-2 pr-3">Channel</th>
                  <th className="py-2 pr-3">Reason</th>
                  <th className="py-2">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {suppressions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-3 font-medium text-gray-700 dark:text-gray-200" title={s.contact}>{masked(s.contact)}</td>
                    <td className="py-2 pr-3"><StatusChip status={s.channel}>{s.channel}</StatusChip></td>
                    <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{s.reason ?? '—'}</td>
                    <td className="py-2 text-gray-500 dark:text-gray-400">{s.expires_at ? new Date(s.expires_at).toLocaleDateString() : 'never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function masked(contact: string): string {
  if (contact.startsWith('+')) return `+${contact.slice(1, 4)}·${'•'.repeat(Math.max(contact.length - 7, 2))}${contact.slice(-2)}`;
  const [name, host = ''] = contact.split('@');
  return `${name.slice(0, 2)}•••@${host}`;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
      />
    </div>
  );
}