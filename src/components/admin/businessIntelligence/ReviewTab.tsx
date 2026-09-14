import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Eye, GitMerge, Loader2, Link2, Pause, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { isUnprovisionedError } from '../../../lib/enrichmentOps';
import { classifyCandidate, toRadarSource } from '../../../lib/discoveryEngine';
import { findDuplicates, type MatchResult } from '../../../lib/radar/entity';
import { normalizeBusiness, type NormalizedBusiness } from '../../../lib/radar/normalize';
import { Card, EmptyState, StatusChip, WarnBanner } from './shared';

interface CandidateRow {
  id: string;
  source_key: string;
  campaign_id: string | null;
  name: string;
  category: string | null;
  city: string | null;
  confidence: number;
  status: string;
  decision_reason: string | null;
  duplicate_of: string | null;
  published_business_id: string | null;
  source_url: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

interface EvidenceRow {
  id: number;
  candidate_id: string;
  evidence_field: string;
  field_value: string;
  source_key: string | null;
  method: string;
  source_url: string | null;
  confidence: number;
  owner_confirmed: boolean;
  can_auto_update: boolean;
  collected_at: string;
}

interface SourceLite {
  key: string;
  name: string;
  active: boolean;
  automated_access: string;
  bulk_extraction: string;
  competing_dataset: string;
  redistribution: string;
  licence: string | null;
  authorised_by: string | null;
}

interface CampaignLite { id: string; name: string; }

interface BusinessLite {
  id: string;
  name: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
}

type MatchTarget =
  | { kind: 'candidate'; key: string; name: string; city: string | null; source_key: string; row: CandidateRow }
  | { kind: 'business'; key: string; name: string; city: string | null; source_key: null; row: BusinessLite };

function toNormalizedCandidate(r: CandidateRow): NormalizedBusiness | null {
  return normalizeBusiness({
    name: r.name,
    city: r.city,
    address: r.address,
    phone: r.phone,
    whatsapp: r.whatsapp,
    email: r.email,
    website: r.website,
    latitude: r.latitude,
    longitude: r.longitude,
  });
}

type Segment = 'queue' | 'drafts' | 'duplicates';

const SEGMENTS: Array<{ key: Segment; label: string; match: (c: CandidateRow) => boolean }> = [
  { key: 'queue', label: 'Discovery queue', match: (c) => c.status === 'pending' || c.status === 'review' },
  { key: 'drafts', label: 'Profile drafts', match: (c) => c.status === 'held' },
  { key: 'duplicates', label: 'Duplicates', match: (c) => c.status === 'merged' || !!c.duplicate_of },
];

export default function ReviewTab() {
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [evidence, setEvidence] = useState<Record<string, EvidenceRow[]>>({});
  const [openEvidence, setOpenEvidence] = useState<Record<string, boolean>>({});
  const [openDupes, setOpenDupes] = useState<Record<string, boolean>>({});
  const [dupeFindings, setDupeFindings] = useState<Record<string, Array<{ target: MatchTarget; result: MatchResult }>>>({});
  const [businesses, setBusinesses] = useState<BusinessLite[]>([]);
  const [sources, setSources] = useState<Record<string, SourceLite>>({});
  const [campaigns, setCampaigns] = useState<CampaignLite[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [segment, setSegment] = useState<Segment>('queue');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, s, campaignsR, ev, biz] = await Promise.all([
      supabase.from('radar_candidates').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('radar_sources').select('key,name,active,automated_access,bulk_extraction,competing_dataset,redistribution,licence,authorised_by'),
      supabase.from('business_discovery_campaigns').select('id,name'),
      supabase.from('radar_candidate_evidence').select('*').limit(500),
      supabase.from('businesses').select('id,name,city,phone,email,website,latitude,longitude').limit(2000),
    ]);
    if (c.error) setError(isUnprovisionedError(c.error.message) ? 'Candidates table not provisioned.' : c.error.message);
    else { setError(null); setRows(c.data as unknown as CandidateRow[]); }
    if (!s.error && s.data) setSources(Object.fromEntries((s.data as SourceLite[]).map((x) => [x.key, x])));
    if (!campaignsR.error && campaignsR.data) setCampaigns(campaignsR.data as unknown as CampaignLite[]);
    if (!ev.error && ev.data) {
      const grouped: Record<string, EvidenceRow[]> = {};
      for (const row of ev.data as unknown as EvidenceRow[]) (grouped[row.candidate_id] ??= []).push(row);
      setEvidence(grouped);
    } else {
      setEvidence({});
    }
    if (!biz.error && biz.data) setBusinesses(biz.data as unknown as BusinessLite[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const seg = SEGMENTS.find((x) => x.key === segment);
    return rows.filter((r) => (seg ? seg.match(r) : true) && (campaignFilter === 'all' || r.campaign_id === campaignFilter));
  }, [rows, segment, campaignFilter]);

  const verdict = (r: CandidateRow) => {
    if (r.published_business_id) return { action: 'hold', reason: 'Already published.' };
    return classifyCandidate({
      candidate: r,
      source: sources[r.source_key] ? toRadarSource(sources[r.source_key]) : null,
      mode: 'manual',
    });
  };

  const publish = async (r: CandidateRow) => {
    setBusy(r.id);
    const { data, error: e } = await supabase.rpc('radar_publish_candidate', { p_candidate: r.id });
    if (e) toast.error(e.message);
    else {
      toast.success(`Published ${r.name} as an unclaimed profile${data ? ' — anyone may claim it.' : '.'}`);
      void load();
    }
    setBusy(null);
  };

  const setStatus = async (r: CandidateRow, status: 'rejected' | 'held', reason: string) => {
    setBusy(r.id);
    const { error: e } = await supabase
      .from('radar_candidates')
      .update({ status, decision_reason: reason })
      .eq('id', r.id);
    if (e) toast.error(e.message);
    else { toast.success(status === 'rejected' ? 'Rejected.' : 'Moved to profile drafts.'); void load(); }
    setBusy(null);
  };

  const matchesFor = (r: CandidateRow): Array<{ target: MatchTarget; result: MatchResult }> => {
    const norm = toNormalizedCandidate(r);
    if (!norm) return [];
    const existing: Array<{ record: MatchTarget; normalized: NormalizedBusiness }> = [
      ...rows
        .filter((o) => o.id !== r.id && !o.published_business_id)
        .flatMap((o) => {
          const n = toNormalizedCandidate(o);
          if (!n) return [];
          const record: MatchTarget = { kind: 'candidate', key: o.id, name: o.name, city: o.city, source_key: o.source_key, row: o };
          return [{ record, normalized: n }];
        }),
      ...businesses
        .flatMap((b) => {
          const n = normalizeBusiness({ name: b.name, city: b.city, phone: b.phone, email: b.email, website: b.website, latitude: b.latitude, longitude: b.longitude });
          if (!n) return [];
          const record: MatchTarget = { kind: 'business', key: b.id, name: b.name ?? b.id, city: b.city, source_key: null, row: b };
          return [{ record, normalized: n }];
        }),
    ];
    const report = findDuplicates(norm, existing);
    const results: Array<{ target: MatchTarget; result: MatchResult }> = [];
    if (report.best) results.push({ target: report.best.record, result: report.best.result });
    for (const p of report.possibles) results.push({ target: p.record, result: p.result });
    return results;
  };

  const toggleDupes = (r: CandidateRow) => {
    if (!openDupes[r.id]) {
      setDupeFindings((f) => (f[r.id] ? f : { ...f, [r.id]: matchesFor(r) }));
    }
    setOpenDupes((p) => ({ ...p, [r.id]: !p[r.id] }));
  };

  const markDuplicate = async (r: CandidateRow, target: MatchTarget) => {
    setBusy(r.id);
    const label = target.kind === 'candidate'
      ? `Duplicate of candidate "${target.name}" from ${sources[target.source_key]?.name ?? target.source_key}.`
      : `Duplicate of listed business "${target.name}".`;
    const patch: Record<string, unknown> = { status: 'rejected', decision_reason: label };
    if (target.kind === 'business') patch.duplicate_of = target.key;
    const { error: e } = await supabase.from('radar_candidates').update(patch).eq('id', r.id);
    if (e) toast.error(e.message);
    else {
      toast.success(`Rejected ${r.name} — logged as a duplicate.`);
      void load();
    }
    setBusy(null);
  };

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of SEGMENTS) out[s.key] = rows.filter(s.match).length;
    return out;
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSegment(s.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              segment === s.key
                ? 'bg-nowopen-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {s.label} · {counts[s.key] ?? 0}
          </button>
        ))}
        <select
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
          className="ml-auto rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
        >
          <option value="all">All campaigns</option>
          <option value="__none">No campaign</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {error && <WarnBanner>{error}</WarnBanner>}

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-400">Loading candidates…</div>
      ) : visible.length === 0 ? (
        <Card><EmptyState>Nothing here. The queue fills as discovery runs.</EmptyState></Card>
      ) : (
        visible.map((r) => {
          const v = verdict(r);
          const canPublish = !r.published_business_id && (v.action === 'review' || v.action === 'auto-publish') && r.status !== 'merged';
          const src = sources[r.source_key];
          return (
            <Card
              key={r.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {r.name}
                  <StatusChip status={r.status}>{r.status}</StatusChip>
                  <span className="text-xs font-bold text-nowopen-600 dark:text-nowopen-300">{r.confidence}</span>
                </span>
              }
              action={
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={!canPublish || busy === r.id}
                    onClick={() => void publish(r)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    title={canPublish ? v.reason : v.reason}
                  >
                    {busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Publish
                  </button>
                  {r.status !== 'held' && (
                    <button
                      disabled={busy === r.id}
                      onClick={() => void setStatus(r, 'held', 'Withheld in Business Intelligence review.')}
                      className="rounded-lg border border-gray-200 dark:border-gray-600 p-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                      title="Move to profile drafts"
                    >
                      <Pause size={13} />
                    </button>
                  )}
                  {r.status !== 'rejected' && (
                    <button
                      disabled={busy === r.id}
                      onClick={() => void setStatus(r, 'rejected', 'Rejected in Business Intelligence review.')}
                      className="rounded-lg border border-gray-200 dark:border-gray-600 p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-gray-700 disabled:opacity-40"
                      title="Reject"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              }
            >
              <div className="space-y-2 text-[12px]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500 dark:text-gray-400">
                  <span>{src ? src.name : r.source_key}</span>
                  {campaigns.find((x) => x.id === r.campaign_id) && (
                    <span>{campaigns.find((x) => x.id === r.campaign_id)?.name}</span>
                  )}
                  {r.city && <span>{r.city}</span>}
                  {r.category && <span>{r.category}</span>}
                  {r.source_url && <a className="text-nowopen-600 hover:underline" href={r.source_url} target="_blank" rel="noreferrer">source</a>}
                </div>
                {r.duplicate_of && (
                  <p className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <Link2 size={12} /> Duplicate merge target: {r.duplicate_of}
                  </p>
                )}
                <p className="text-gray-500 dark:text-gray-400">{v.reason}</p>
                <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 dark:border-gray-700 pt-2">
                  {(evidence[r.id]?.length ?? 0) > 0 && (
                    <button
                      onClick={() => setOpenEvidence((p) => ({ ...p, [r.id]: !p[r.id] }))}
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-nowopen-600 dark:text-nowopen-300 hover:underline"
                    >
                      <Eye size={12} /> Provenance · {evidence[r.id]?.length ?? 0}
                    </button>
                  )}
                  {r.status !== 'rejected' && r.status !== 'merged' && (
                    <button
                      onClick={() => toggleDupes(r)}
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-nowopen-600 dark:text-nowopen-300 hover:underline"
                    >
                      <GitMerge size={12} /> Check duplicates
                    </button>
                  )}
                </div>
                {openEvidence[r.id] && (
                  <ul className="rounded-lg border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                    {evidence[r.id]?.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5">
                        <span className="font-semibold">{e.evidence_field}</span>
                        <span className="max-w-[220px] truncate text-gray-600 dark:text-gray-300" title={e.field_value}>{e.field_value}</span>
                        <span className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:text-gray-300">{e.method}</span>
                        <span className="tabular-nums text-gray-500 dark:text-gray-400">{e.confidence}</span>
                        {e.source_key && <span className="text-gray-400 dark:text-gray-500">{sources[e.source_key]?.name ?? e.source_key}</span>}
                        {e.source_url && <a className="text-nowopen-600 hover:underline" href={e.source_url} target="_blank" rel="noreferrer">source</a>}
                        {e.owner_confirmed && <span className="rounded bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">owner confirmed</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {openDupes[r.id] && (
                  <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-2.5">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Possible duplicates · {dupeFindings[r.id]?.length ?? 0}
                    </p>
                    {(dupeFindings[r.id]?.length ?? 0) === 0 ? (
                      <p className="text-[12px] text-gray-500 dark:text-gray-400">
                        Nothing in the candidate queue or the directory looks like this one.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {dupeFindings[r.id]?.map((f, i) => (
                          <li key={`${f.target.kind}-${f.target.key}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                            <StatusChip status={f.result.verdict}>{f.result.verdict}</StatusChip>
                            <span className="font-semibold">{f.target.name}</span>
                            <span className="text-gray-400 dark:text-gray-500">
                              {f.target.kind === 'candidate' ? sources[f.target.source_key]?.name ?? f.target.source_key : 'listed business'}
                            </span>
                            {f.target.city && <span className="text-gray-500 dark:text-gray-400">{f.target.city}</span>}
                            <span className="tabular-nums text-gray-500 dark:text-gray-400">{f.result.score}</span>
                            {f.result.signals.length > 0 && (
                              <span
                                className="text-gray-400 dark:text-gray-500"
                                title={f.result.signals.map((s) => s.label).join(' · ')}
                              >
                                {f.result.signals.slice(0, 2).map((s) => s.label).join(' · ')}
                              </span>
                            )}
                            <button
                              disabled={busy === r.id}
                              onClick={() => void markDuplicate(r, f.target)}
                              className="ml-auto rounded-lg bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
                            >
                              Reject as duplicate
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                      Rejecting drops this row to the rejected segment with the reason recorded; the kept record keeps its provenance.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}