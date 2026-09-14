import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Archive, CheckCircle2, Loader2, Pause, Play, Plus,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { isUnprovisionedError } from '../../../lib/enrichmentOps';
import {
  AFRICAN_COUNTRIES, CITIES, CATEGORIES, NEIGHBORHOODS, PRODUCTS, SERVICES,
  campaignDefaults, campaignTargetSummary, validateCampaign,
  type CampaignInput, type CampaignStatus,
} from '../../../lib/discoveryEngine';
import { Card, EmptyState, StatusChip, WarnBanner } from './shared';

interface CampaignRow {
  id: string;
  name: string;
  status: CampaignStatus;
  countries: string[];
  regions: string[];
  cities: string[];
  neighborhoods: string[];
  categories: string[];
  services: string[];
  products: string[];
  source_keys: string[];
  review_threshold: number;
  auto_publish_threshold: number;
  outreach_enabled: boolean;
  outreach_channel: string | null;
  records_discovered: number;
  records_published: number;
  claims_linked: number;
  created_at: string;
}

interface RunRow {
  id: string;
  campaign_id: string;
  status: string;
  records_discovered: number;
  records_published: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'active', 'paused', 'completed', 'archived'];

const ACTIONS: Record<string, { next: CampaignStatus; label: string; icon: typeof Play }> = {
  draft: { next: 'active', label: 'Activate', icon: Play },
  paused: { next: 'active', label: 'Resume', icon: Play },
  active: { next: 'paused', label: 'Pause', icon: Pause },
};

export default function CampaignsTab() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [filter, setFilter] = useState<CampaignStatus | 'all'>('all');
  const [building, setBuilding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const [c, r] = await Promise.all([
      supabase.from('business_discovery_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('business_discovery_runs').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    if (c.error) {
      setError(isUnprovisionedError(c.error.message) ? 'Campaign tables not provisioned in this database yet.' : c.error.message);
    } else {
      setError(null);
      setRows(c.data as unknown as CampaignRow[]);
    }
    if (!r.error) setRuns(r.data as unknown as RunRow[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setStatus = async (id: string, status: CampaignStatus) => {
    const { error: e } = await supabase
      .from('business_discovery_campaigns')
      .update({ status })
      .eq('id', id);
    if (e) toast.error(e.message);
    else { toast.success(`Campaign ${status}.`); void load(); }
  };

  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {['all', ...CAMPAIGN_STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s as CampaignStatus | 'all')}
className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === s
                  ? 'bg-nowopen-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {s}
            </button>
        ))}
        <button
          onClick={() => setBuilding(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-nowopen-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-nowopen-600"
        >
          <Plus size={14} /> New campaign
        </button>
      </div>

      {error && <WarnBanner>{error}</WarnBanner>}

      {building && (
        <CampaignBuilder
          onDone={() => { setBuilding(false); void load(); }}
          onCancel={() => setBuilding(false)}
        />
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-400">Loading campaigns…</div>
      ) : visible.length === 0 ? (
        <Card><EmptyState>No campaigns{filter !== 'all' ? ` in ${filter}` : ''}. Build one to scope a discovery run.</EmptyState></Card>
      ) : (
        visible.map((c) => (
          <Card
            key={c.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {c.name}
                <StatusChip status={c.status}>{c.status}</StatusChip>
              </span>
            }
            action={
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setStatus(c.id, ACTIONS[c.status]?.next ?? c.status)}
                  disabled={!ACTIONS[c.status]}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-[12px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                  title={ACTIONS[c.status]?.label}
                >
                  {ACTIONS[c.status] ? (
                    <>
                      {(() => { const A = ACTIONS[c.status].icon; return <A size={13} />; })()}
                      {ACTIONS[c.status].label}
                    </>
                  ) : (
                    <>{c.status}</>
                  )}
                </button>
                {c.status !== 'completed' && (
                  <button
                    onClick={() => setStatus(c.id, 'completed')}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-[12px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    title="Complete"
                  >
                    <CheckCircle2 size={13} /> Done
                  </button>
                )}
                {c.status !== 'archived' && (
                  <button
                    onClick={() => setStatus(c.id, 'archived')}
                    className="rounded-lg border border-gray-200 dark:border-gray-600 p-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                    title="Archive"
                  >
                    <Archive size={13} />
                  </button>
                )}
              </div>
            }
          >
            <div className="space-y-4">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-200">{campaignTargetSummary(c)}</span>
                <span>{c.source_keys.length} sources</span>
                <span>approve ≥ {c.review_threshold} · auto-publish ≥ {c.auto_publish_threshold}</span>
                <span>{c.outreach_enabled ? `outreach: ${c.outreach_channel}` : 'outreach off'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat label="discovered" value={c.records_discovered} tone="blue" />
                <MiniStat label="published" value={c.records_published} tone="emerald" />
                <MiniStat label="claims linked" value={c.claims_linked} tone="purple" />
              </div>
              {c.status === 'active' && (
                <p className="text-[12px] text-amber-600 dark:text-amber-400">
                  No ingestor is wired to this campaign yet — this row is a plan. Discovery workers arrive in Phase 2.
                </p>
              )}
            </div>
          </Card>
        ))
      )}

      <Card title="Recent runs" action={refreshing ? <Loader2 size={14} className="animate-spin text-gray-400" /> : undefined}>
        {runs.length === 0 ? (
          <EmptyState>No runs recorded. Runs appear when an ingestor executes a campaign.</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                <StatusChip status={r.status}>{r.status}</StatusChip>
                <span className="text-gray-600 dark:text-gray-300">
                  {rows.find((x) => x.id === r.campaign_id)?.name ?? 'Campaign'}
                </span>
                <span className="ml-auto tabular-nums text-gray-500">
                  +{r.records_discovered} discovered · {r.records_published} published
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'emerald' | 'purple' }) {
  const tones = { blue: 'text-blue-600 dark:text-blue-300', emerald: 'text-emerald-600 dark:text-emerald-300', purple: 'text-purple-600 dark:text-purple-300' };
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-2 py-2">
      <p className={`text-lg font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function CampaignBuilder({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<CampaignInput>(campaignDefaults());
  const [sourceKeys, setSourceKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase.from('radar_sources').select('key,name,active').then(({ data }) => {
      if (data) setSourceKeys(data.filter((s) => s.active).map((s) => s.key));
    });
  }, []);

  const set = <K extends keyof CampaignInput>(key: K, value: CampaignInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggle = (lst: keyof CampaignInput, item: string) => {
    const arr = (form[lst] as string[]) ?? [];
    set(lst as 'countries', arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);
  };

  const errors = validateCampaign(form);
  const errorFields = new Set(errors.map((e) => e.field));

  const save = async () => {
    if (errors.length) { toast.error(errors[0].message); return; }
    setSaving(true);
    const { error } = await supabase.from('business_discovery_campaigns').insert({
      name: form.name.trim(),
      countries: form.countries,
      regions: form.regions,
      cities: form.cities,
      neighborhoods: form.neighborhoods,
      categories: form.categories,
      services: form.services,
      products: form.products,
      filters: form.filters,
      source_keys: form.sourceKeys,
      max_records: form.maxRecords,
      daily_limit: form.dailyLimit,
      budget_max: form.budgetMax,
      review_threshold: form.reviewThreshold,
      auto_publish_threshold: form.autoPublishThreshold,
      outreach_enabled: form.outreachEnabled,
      outreach_channel: form.outreachChannel,
      outreach_approval_required: form.outreachApprovalRequired,
      start_at: form.startAt,
      end_at: form.endAt,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success('Campaign saved as draft.'); onDone(); }
  };

  return (
    <Card
      title="New discovery campaign"
      action={
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
          <button
            onClick={() => void save()}
            disabled={saving || errors.length > 0}
            className="rounded-lg bg-nowopen-500 px-3 py-1 text-xs font-semibold text-white hover:bg-nowopen-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Campaign name *</label>
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Lagos Fashion — September 2026"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
          {errorFields.has('name') && <FieldError msg={errors.find((e) => e.field === 'name')?.message} />}
        </div>

        <PickField label="Countries" list={form.countries} options={AFRICAN_COUNTRIES} onToggle={(x) => toggle('countries', x)} error={errorFields.has('geography')} />
        <PickField label="Cities" list={form.cities} options={CITIES} onToggle={(x) => toggle('cities', x)} />
        <PickField label="Neighbourhoods" list={form.neighborhoods} options={NEIGHBORHOODS} onToggle={(x) => toggle('neighborhoods', x)} />

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Regions</label>
          <input
            value={form.regions.join(', ')}
            onChange={(e) => set('regions', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
            placeholder="e.g. Lagos State, Accra Metropolitan"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
          />
        </div>

        <PickField label="Categories" list={form.categories} options={CATEGORIES} onToggle={(x) => toggle('categories', x)} error={errorFields.has('subject')} />
        <PickField label="Services" list={form.services} options={SERVICES} onToggle={(x) => toggle('services', x)} />
        <PickField label="Products" list={form.products} options={PRODUCTS} onToggle={(x) => toggle('products', x)} />

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Discovery sources *</label>
          {sourceKeys.length === 0 ? (
            <p className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2 text-[12px] text-gray-500 dark:text-gray-400">
              No active radar sources found. Activate a source on the Sources tab first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {sourceKeys.map((k) => (
                <ToggleChip key={k} label={k} active={form.sourceKeys.includes(k)} onClick={() => toggleSelect(form.sourceKeys, k, set)} />
              ))}
            </div>
          )}
          {errorFields.has('sources') && <FieldError msg={errors.find((e) => e.field === 'sources')?.message} />}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <NumberField label="Review from (confidence)" value={form.reviewThreshold} onChange={(v) => { if (v !== null) set('reviewThreshold', v); }} />
          <NumberField label="Auto-publish from" value={form.autoPublishThreshold} onChange={(v) => { if (v !== null) set('autoPublishThreshold', v); }} />
          <NumberField label="Max records (optional)" value={form.maxRecords} onChange={(v) => set('maxRecords', v)} empty />
          <NumberField label="Daily limit" value={form.dailyLimit} onChange={(v) => set('dailyLimit', v)} empty />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-gray-700 dark:text-gray-200">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={form.outreachEnabled} onChange={(e) => set('outreachEnabled', e.target.checked)} />
            Outreach after claim is linked
          </label>
          {form.outreachEnabled && (
            <>
              <select
                value={form.outreachChannel ?? ''}
                onChange={(e) => set('outreachChannel', e.target.value || null)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-[13px]"
              >
                <option value="">choose channel…</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="instagram_interaction">Instagram (owner-initiated)</option>
                <option value="manual">Manual</option>
              </select>
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" checked={form.outreachApprovalRequired} onChange={(e) => set('outreachApprovalRequired', e.target.checked)} />
                Require prior approval of each message
              </label>
            </>
          )}
        </div>
        {errorFields.has('outreachChannel') && <FieldError msg={errors.find((e) => e.field === 'outreachChannel')?.message} />}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Starts</label>
            <input type="date" value={form.startAt?.slice(0, 10) ?? ''} onChange={(e) => set('startAt', e.target.value ? `${e.target.value}T00:00:00Z` : null)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Ends</label>
            <input type="date" value={form.endAt?.slice(0, 10) ?? ''} onChange={(e) => set('endAt', e.target.value ? `${e.target.value}T00:00:00Z` : null)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
          </div>
        </div>
        {errorFields.has('dates') && <FieldError msg={errors.find((e) => e.field === 'dates')?.message} />}

        <WarnBanner>
          Saving this campaign writes a plan — it does not start fetching anything. Workers that execute campaigns are the next phase.
        </WarnBanner>
      </div>
    </Card>
  );
}

function PickField({ label, list, options, onToggle, error }: {
  label: string;
  list: string[];
  options: string[];
  onToggle: (x: string) => void;
  error?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
        {label} {list.length > 0 && <span className="text-nowopen-500">· {list.length}</span>}
      </label>
      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 p-2">
        {options.map((o) => (
          <ToggleChip key={o} label={o} active={list.includes(o)} onClick={() => onToggle(o)} tone={error ? 'rose' : 'default'} />
        ))}
      </div>
      {error && <FieldError msg="Pick at least one geographical target." />}
    </div>
  );
}

function ToggleChip({ label, active, onClick, tone = 'default' }: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: 'default' | 'rose';
}) {
  const activeCls = tone === 'rose'
    ? 'border-rose-300 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200'
    : 'border-nowopen-300 bg-nowopen-50 text-nowopen-700 dark:bg-nowopen-900/40 dark:text-nowopen-200';
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition ${
        active ? activeCls : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      {label}
    </button>
  );
}

function NumberField({ label, value, onChange, empty }: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  empty?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</label>
      <input
        type="number"
        value={value ?? ''}
        placeholder={empty ? 'none' : '0'}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') { onChange(empty ? null : 0); return; }
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : (empty ? null : 0));
        }}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
      />
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-[12px] text-rose-600 dark:text-rose-400">{msg}</p>;
}

function toggleSelect(list: string[], item: string, set: (k: 'sourceKeys', v: string[]) => void) {
  set('sourceKeys', list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
}