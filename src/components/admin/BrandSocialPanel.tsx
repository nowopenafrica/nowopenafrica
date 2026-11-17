import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, BarChart3, Check, ChevronDown, ChevronRight, CircleDot, Clock, Download, Megaphone, Plus, RefreshCw, Send, ShieldAlert, Upload, X,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import ConfirmDialog from '../ConfirmDialog';
import BrandAutopilot from './BrandAutopilot';
import BrandDirectPublish from './BrandDirectPublish';
import BrandConnections from './BrandConnections';
import {
  CHANNEL_RULES, checkVariant, countChars, findNearDuplicates, formatLagos, isBlocked, isSensitive,
  lagosLocalToUtc, postsThatDay, trackedUrl, utcToLagosLocal,
  type CalendarEntry, type ChannelId, type Check as RuleCheck,
} from '../../lib/brandSocial';
import { buildZohoBulkCsv, type BulkResult } from '../../lib/zohoBulkCsv';
import { FORMAT_LABEL, formatProblem, formatsFor, type PostFormat } from '../../lib/brandPublish';

/**
 * Brand social — the founder's desk for NowOpen Africa's OWN accounts.
 *
 * ── WHAT THIS IS, AND IS NOT ────────────────────────────────────────────────
 *
 * Not the Studio's Schedule & Publish (social_scheduled_posts), which posts
 * for a *business on the platform* to *its* accounts. This is the brand:
 * @nowopenafrica and friends, which live in Zoho Social. Audited 2026-10-28:
 * ten channels connected, about 200 followers in total, a team member already
 * posting there daily.
 *
 * ── THE PATH A POST TAKES ───────────────────────────────────────────────────
 *
 *   write → checks run as you type → submit for review → a person approves
 *   → "Send to Zoho" → brand-social-dispatch re-checks on the server → Zoho
 *   Flow webhook → Draft post in Zoho Social → (Flow calls back) confirmed.
 *
 * The database, not this screen, enforces the important parts: only admins
 * can see any of it, only an approved post with a recorded approver can be
 * claimed for sending, editing an approved post sends it back to review, and
 * every step is written to the audit trail by trigger.
 *
 * ── HONEST LABELS ───────────────────────────────────────────────────────────
 *
 * "Sent" means Zoho Flow accepted it. "Confirmed in Zoho" means Flow called
 * back after creating the draft. Neither is "published", and this screen never
 * says published: that happens in Zoho, under the founder's eye.
 */

/** Published by brand-social-publish (Meta token or an OAuth connection), not Zoho. */
const isDirect = (route: string | undefined | null) => route === 'meta_direct' || route === 'direct';

type Status = 'draft' | 'in_review' | 'approved' | 'rejected' | 'cancelled' | 'sending' | 'sent' | 'failed';

interface Channel {
  id: ChannelId; label: string; handle: string; connected: boolean; active: boolean; sort: number; note: string | null; verified_at: string | null;
  publish_route?: 'zoho' | 'meta_direct' | 'direct'; external_account_id?: string | null;
}
interface Campaign { id: string; slug: string; name: string; objective: string; status: string }
interface Variant {
  id: string; content_id: string; channel: ChannelId; caption: string; tracked_url: string | null; checks: RuleCheck[];
  dispatch_status: 'pending' | 'sending' | 'sent' | 'failed'; attempts: number; last_error: string | null;
  sent_at: string | null; zoho_reference: string | null; zoho_confirmed_at: string | null;
  external_post_id?: string | null; published_url?: string | null; published_at?: string | null; verified_at?: string | null; next_attempt_at?: string | null;
  format?: PostFormat;
}
interface Content {
  id: string; code: string; campaign_id: string | null; pillar: string; audience: string; objective: string;
  hook: string | null; caption: string; creative_brief: string | null; media_url: string | null; media_urls?: string[]; cta: string | null;
  destination_url: string | null; evidence: string | null; sensitive: boolean; planned_at: string | null;
  status: Status; review_note: string | null; approved_at: string | null; created_at: string;
  variants: Variant[];
}
interface Metric { id: string; channel: ChannelId; metric: string; value: number; period_start: string; period_end: string; source: string; captured_at: string }
interface External { id: string; channel: ChannelId; posted_at: string; caption: string; source: string }
interface ExportRow { id: string; file_name: string; row_count: number; downloaded_at: string; uploaded_at: string | null }
interface Audit { id: number; content_id: string; action: string; actor: string | null; detail: Record<string, unknown> | null; at: string }
interface Settings { autonomy_mode: 'draft' | 'approval' | 'automation'; zoho_action: 'draft' | 'schedule'; daily_limit_per_channel: number; direct_publish_enabled?: boolean }
interface Profile { pillars: { id: string; label: string }[]; audiences: { id: string; label: string }[]; objectives: string[]; main_cta: string }

const STATUS_LABEL: Record<Status, string> = {
  draft: 'Draft', in_review: 'Waiting for approval', approved: 'Approved, not sent', rejected: 'Rejected',
  cancelled: 'Cancelled', sending: 'Sending', sent: 'Sent to Zoho', failed: 'Needs attention',
};
const STATUS_TONE: Record<Status, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  in_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  rejected: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  sending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  sent: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};
const FILTERS: { id: 'open' | Status | 'all'; label: string }[] = [
  { id: 'open', label: 'To do' }, { id: 'in_review', label: 'Waiting for approval' }, { id: 'approved', label: 'Approved' },
  { id: 'sent', label: 'Sent' }, { id: 'failed', label: 'Needs attention' }, { id: 'all', label: 'All' },
];
const OPEN: Status[] = ['draft', 'in_review', 'approved', 'failed'];
const METRIC_LABEL: Record<string, string> = {
  followers: 'Followers', new_followers: 'New followers', posts: 'Posts', reach: 'Reach', engagements: 'Engagements',
  impressions: 'Impressions', link_clicks: 'Link clicks', video_views: 'Video views',
};

/** supabase.functions.invoke hides a non-2xx body inside error.context. */
async function fnError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { const b = await ctx.json(); if (b?.error) return String(b.error); } catch { /* fall through */ }
  }
  return (error as Error)?.message ?? 'Something went wrong.';
}

const input = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white min-h-[44px]';
const label = 'block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1';
const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 min-h-[44px] text-sm font-semibold transition disabled:opacity-50';
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700`;
const btnQuiet = `${btn} border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700`;

function CheckList({ checks }: { checks: RuleCheck[] }) {
  if (!checks.length) return <p className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1"><Check size={14} /> No problems found.</p>;
  const tone = { block: 'text-red-700 dark:text-red-300', sensitive: 'text-amber-700 dark:text-amber-300', warn: 'text-gray-600 dark:text-gray-300' };
  const word = { block: 'Blocks sending', sensitive: 'Needs a person', warn: 'Note' };
  return (
    <ul className="space-y-1">
      {checks.map((c, i) => (
        <li key={i} className={`text-xs ${tone[c.severity]}`}><span className="font-semibold">{word[c.severity]}:</span> {c.message}</li>
      ))}
    </ul>
  );
}

export default function BrandSocialPanel() {
  const [tab, setTab] = useState<'queue' | 'new' | 'autopilot' | 'baseline' | 'channels'>('queue');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [content, setContent] = useState<Content[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [external, setExternal] = useState<External[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [flow, setFlow] = useState<{ flowConfigured: boolean; callbackConfigured: boolean } | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('open');
  const [open, setOpen] = useState<string | null>(null);
  const [audit, setAudit] = useState<Record<string, Audit[]>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<Content | null>(null);
  const [confirmPublish, setConfirmPublish] = useState<Content | null>(null);
  const [editing, setEditing] = useState<Content | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoadError(null);
    const [ch, ca, co, va, me, ex, se, pr] = await Promise.all([
      supabase.from('brand_social_channels').select('*').order('sort'),
      supabase.from('brand_social_campaigns').select('*').order('created_at'),
      supabase.from('brand_social_content').select('*').order('planned_at', { ascending: true, nullsFirst: false }).limit(500),
      supabase.from('brand_social_variants').select('*').limit(1000),
      supabase.from('brand_social_metrics').select('*').order('captured_at', { ascending: false }).limit(1000),
      supabase.from('brand_social_external_posts').select('*').order('posted_at', { ascending: false }).limit(200),
      supabase.from('brand_social_settings').select('*').eq('id', true).maybeSingle(),
      supabase.from('brand_social_profile').select('profile').order('version', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const firstError = [ch, ca, co, va, me, ex, se, pr].find((r) => r.error)?.error;
    if (firstError) {
      setLoadError(firstError.message);
      setLoading(false);
      return;
    }
    const byContent = new Map<string, Variant[]>();
    for (const v of (va.data ?? []) as Variant[]) byContent.set(v.content_id, [...(byContent.get(v.content_id) ?? []), v]);
    setChannels((ch.data ?? []) as Channel[]);
    setCampaigns((ca.data ?? []) as Campaign[]);
    setContent(((co.data ?? []) as Omit<Content, 'variants'>[]).map((c) => ({ ...c, variants: byContent.get(c.id) ?? [] })));
    setMetrics((me.data ?? []) as Metric[]);
    setExternal((ex.data ?? []) as External[]);
    setSettings(se.data as Settings);
    setProfile((pr.data?.profile ?? null) as Profile | null);
    setLoading(false);

    const { data, error } = await supabase.functions.invoke('brand-social-dispatch', { body: { action: 'status' } });
    setFlow(error ? null : data);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const calendar: CalendarEntry[] = useMemo(() => [
    ...content.filter((c) => c.planned_at && !['rejected', 'cancelled'].includes(c.status))
      .flatMap((c) => c.variants.map((v) => ({ id: v.id, channel: v.channel, at: c.planned_at!, caption: v.caption }))),
    ...external.map((e) => ({ id: e.id, channel: e.channel, at: e.posted_at, caption: e.caption })),
  ], [content, external]);

  const shown = content.filter((c) => filter === 'all' ? true : filter === 'open' ? OPEN.includes(c.status) : c.status === filter);
  const counts = useMemo(() => ({
    review: content.filter((c) => c.status === 'in_review').length,
    approved: content.filter((c) => c.status === 'approved').length,
    failed: content.filter((c) => c.status === 'failed').length,
  }), [content]);

  const setStatus = async (c: Content, status: Status, note?: string) => {
    setWorking(c.id);
    const { error } = await supabase.from('brand_social_content').update({ status, review_note: note ?? c.review_note }).eq('id', c.id);
    setWorking(null);
    if (error) { toast.error(error.message); return; }
    toast.success(STATUS_LABEL[status]);
    void load();
  };

  const send = async (c: Content) => {
    setWorking(c.id);
    const { data, error } = await supabase.functions.invoke('brand-social-dispatch', { body: { action: 'dispatch', content_id: c.id } });
    setWorking(null);
    setConfirmSend(null);
    if (error) { toast.error(await fnError(error)); void load(); return; }
    if (data?.ok) toast.success(`${c.code} sent to Zoho as ${settings?.zoho_action === 'schedule' ? 'scheduled posts' : 'drafts'}.`);
    else toast.error(`${c.code}: some channels did not go. See the post for details.`);
    void load();
  };

  const directIds = useMemo(() => new Set(channels.filter((c) => isDirect(c.publish_route)).map((c) => c.id as string)), [channels]);
  const directPending = (c: Content) => c.variants.filter((v) => directIds.has(v.channel) && v.dispatch_status !== 'sent');

  const publishNow = async (c: Content) => {
    setWorking(c.id);
    const { data, error } = await supabase.functions.invoke('brand-social-publish', { body: { action: 'publish_now', content_id: c.id } });
    setWorking(null);
    setConfirmPublish(null);
    if (error) { toast.error(await fnError(error)); void load(); return; }
    if (data?.skipped) toast(String(data.skipped));
    else {
      const res = (data?.results ?? []) as { ok: boolean; channel: string; error?: string; processing?: boolean }[];
      const done = res.filter((r) => r.ok).length;
      const processing = res.filter((r) => r.processing).length;
      const failed = res.filter((r) => !r.ok && !r.processing);
      if (done) toast.success(`${c.code}: published on ${done} channel${done === 1 ? '' : 's'}.`);
      if (processing) toast(`${c.code}: video still processing on ${processing} channel${processing === 1 ? '' : 's'}; it finishes within minutes.`);
      if (failed.length) toast.error(`${c.code}: ${failed.map((f) => `${f.channel}: ${f.error}`).join(' · ')}`);
      if (!res.length) toast('Nothing to publish: every direct channel of this post has already gone out.');
    }
    void load();
  };

  const toggleOpen = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    const { data, error } = await supabase.from('brand_social_audit').select('*').eq('content_id', id).order('at', { ascending: false }).limit(50);
    if (!error) setAudit((a) => ({ ...a, [id]: (data ?? []) as Audit[] }));
  };

  const saveSettings = async (patch: Partial<Settings>) => {
    const { error } = await supabase.from('brand_social_settings').update(patch).eq('id', true);
    if (error) { toast.error(error.message); return; }
    setSettings((s) => (s ? { ...s, ...patch } : s));
    toast.success('Saved');
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Loading brand social…</div>;
  }
  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-sm text-red-800 dark:text-red-200">
        <p className="font-semibold">Brand social could not load.</p>
        <p className="mt-1">{loadError}</p>
        <p className="mt-2 text-red-700 dark:text-red-300">If the tables are missing, the migration 20261108010000_brand_social.sql has not been applied yet.</p>
        <button type="button" onClick={() => { setLoading(true); void load(); }} className={`${btnQuiet} mt-4`}><RefreshCw size={16} /> Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header: what mode we are in and whether Zoho is reachable. */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Megaphone size={22} /> Brand social</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 max-w-2xl">
            Posts for NowOpen Africa’s own accounts. Write them here, approve them, and send them to Zoho Social as {settings?.zoho_action === 'schedule' ? 'scheduled posts' : 'drafts'}. Times are Lagos time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Flow is off on purpose while Zoho's Flow-to-Social connection is broken
              (INVALID_OAUTHSCOPE, 2026-10-29). Say how posts reach Zoho instead of
              implying they cannot. */}
          <span title={flow?.flowConfigured ? undefined : 'Zoho Flow’s connection to Zoho Social is failing on Zoho’s side, so automatic sending is off. Posts go to Zoho with the Zoho file.'}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${flow?.flowConfigured ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'}`}>
            <CircleDot size={12} /> {flow === null ? 'Zoho status unknown' : flow.flowConfigured ? 'Sending through Zoho Flow' : 'Sending by Zoho file · Flow off'}
          </span>
          <label className="sr-only" htmlFor="bs-mode">Mode</label>
          <select id="bs-mode" className={`${input} w-auto`} value={settings?.autonomy_mode ?? 'approval'}
            onChange={(e) => void saveSettings({ autonomy_mode: e.target.value as Settings['autonomy_mode'] })}>
            <option value="draft">Draft mode: plan only, nothing is sent</option>
            <option value="approval">Approval mode: send after approval</option>
            <option value="automation" disabled>Automation: after a tested round trip</option>
          </select>
        </div>
      </div>

      {!flow?.flowConfigured && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-900 dark:text-amber-100 flex gap-3">
          <AlertTriangle size={18} className="flex-none mt-0.5" />
          <p>Automatic sending through Zoho Flow is off. Approved posts go to Zoho with the Zoho file below: download it, upload it in Zoho Social’s Bulk Scheduler, then mark it uploaded here.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Brand social sections">
        {([
          ['queue', `Queue${counts.review ? ` · ${counts.review} to approve` : ''}`],
          ['new', editing ? `Editing ${editing.code}` : 'New post'],
          ['autopilot', 'AI drafting'],
          ['baseline', 'Baseline'],
          ['channels', 'Channels'],
        ] as const).map(([id, text]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`rounded-full px-4 min-h-[44px] text-sm font-semibold ${tab === id ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200'}`}>
            {text}
          </button>
        ))}
      </div>

      {tab === 'autopilot' && (
        <BrandAutopilot channels={channels} campaigns={campaigns} profile={profile} onDrafted={() => void load()} />
      )}

      {tab === 'queue' && (
        <div className="space-y-4">
          <BulkActions content={content} onDone={load} />
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === f.id ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                {f.label}
              </button>
            ))}
            <button type="button" onClick={() => void load()} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300"><RefreshCw size={14} /> Refresh</button>
          </div>

          {shown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-300">Nothing here yet.</p>
              <button type="button" onClick={() => { setEditing(null); setTab('new'); }} className={`${btnPrimary} mt-4`}><Plus size={16} /> Write the first post</button>
            </div>
          ) : shown.map((c) => {
            const camp = campaigns.find((x) => x.id === c.campaign_id);
            const uncertain = c.variants.some((v) => v.last_error?.startsWith('UNCERTAIN'));
            return (
              <div key={c.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <button type="button" onClick={() => void toggleOpen(c.id)} className="w-full text-left p-4 flex gap-3 items-start">
                  {open === c.id ? <ChevronDown size={18} className="mt-1 flex-none" /> : <ChevronRight size={18} className="mt-1 flex-none" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-gray-500">{c.code}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                      {c.sensitive && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200"><ShieldAlert size={12} /> Needs a person</span>}
                      <span className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1"><Clock size={12} /> {formatLagos(c.planned_at)}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white line-clamp-2">{c.hook || c.caption}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {camp?.name ?? 'No campaign'} · {profile?.pillars.find((p) => p.id === c.pillar)?.label ?? c.pillar} · {c.variants.map((v) => CHANNEL_RULES[v.channel].label).join(', ') || 'No channels'}
                    </p>
                  </div>
                </button>

                {open === c.id && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
                    {uncertain && (
                      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-200 flex gap-2">
                        <AlertTriangle size={16} className="flex-none mt-0.5" />
                        Zoho Flow gave no clear answer for at least one channel. Check Zoho Social’s drafts before sending again, or it may arrive twice.
                      </div>
                    )}
                    {c.review_note && <p className="text-sm text-gray-700 dark:text-gray-200"><span className="font-semibold">Review note:</span> {c.review_note}</p>}
                    <div className="grid gap-3 md:grid-cols-2">
                      {c.variants.map((v) => (
                        <div key={v.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                              {CHANNEL_RULES[v.channel].label}
                              {v.format && v.format !== 'post' && <span className="ml-2 rounded-full bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 text-xs text-purple-800 dark:text-purple-200">{FORMAT_LABEL[v.format]}</span>}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {v.published_url || v.external_post_id
                                ? (v.verified_at ? 'Published, checked on Meta' : 'Published, not yet checked')
                                : v.zoho_confirmed_at ? 'Confirmed in Zoho'
                                : v.dispatch_status === 'sent' ? (v.zoho_reference?.startsWith('Zoho bulk file') ? 'In a Zoho file marked uploaded' : 'Accepted by Zoho Flow')
                                : v.dispatch_status === 'failed' ? (v.next_attempt_at ? `Retrying ${formatLagos(v.next_attempt_at)}` : 'Not sent')
                                : v.dispatch_status === 'sending' ? 'Sending'
                                : isDirect(channels.find((x) => x.id === v.channel)?.publish_route) ? 'Publishes directly at the planned time' : 'Not sent yet'}
                            </span>
                          </div>
                          {v.published_url && (
                            <a href={v.published_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold text-blue-700 dark:text-blue-300 underline break-all">View the live post</a>
                          )}
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-200">{v.caption}</p>
                          {v.tracked_url && <p className="mt-2 break-all font-mono text-xs text-gray-500">{v.tracked_url}</p>}
                          {v.last_error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{v.last_error}</p>}
                          <div className="mt-2"><CheckList checks={checkVariant({ channel: v.channel, caption: v.caption, mediaUrl: c.media_url, destinationUrl: c.destination_url })} /></div>
                        </div>
                      ))}
                    </div>
                    {c.media_url && <p className="text-xs text-gray-500 break-all">Media: {c.media_url}</p>}
                    {c.evidence && <p className="text-xs text-gray-500">Evidence: {c.evidence}</p>}

                    <div className="flex flex-wrap gap-2">
                      {['draft', 'in_review', 'rejected'].includes(c.status) && (
                        <button type="button" className={btnQuiet} onClick={() => { setEditing(c); setTab('new'); }}>Edit</button>
                      )}
                      {c.status === 'draft' && (
                        <button type="button" className={btnPrimary} disabled={working === c.id} onClick={() => void setStatus(c, 'in_review')}>Submit for approval</button>
                      )}
                      {c.status === 'in_review' && (() => {
                        const blocked = c.variants.some((v) => isBlocked(checkVariant({ channel: v.channel, caption: v.caption, mediaUrl: c.media_url, destinationUrl: c.destination_url })));
                        return (
                          <>
                            <button type="button" className={btnPrimary} disabled={working === c.id || blocked || !c.variants.length}
                              title={blocked ? 'Fix the problems that block sending first.' : undefined}
                              onClick={() => void setStatus(c, 'approved')}><Check size={16} /> Approve</button>
                            <button type="button" className={btnQuiet} disabled={working === c.id || !(notes[c.id] ?? '').trim()}
                              title={(notes[c.id] ?? '').trim() ? undefined : 'Write what needs to change first.'}
                              onClick={() => void setStatus(c, 'rejected', notes[c.id])}>
                              <X size={16} /> Send back
                            </button>
                            <div className="basis-full">
                              <label className={label} htmlFor={`bs-note-${c.id}`}>What needs to change (for sending back)</label>
                              <input id={`bs-note-${c.id}`} className={input} value={notes[c.id] ?? ''}
                                onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))} />
                            </div>
                          </>
                        );
                      })()}
                      {c.status === 'approved' && (
                        <button type="button" className={btnPrimary} disabled={working === c.id || !flow?.flowConfigured || settings?.autonomy_mode === 'draft'}
                          title={!flow?.flowConfigured ? 'Zoho Flow is not connected yet.' : settings?.autonomy_mode === 'draft' ? 'Draft mode is on.' : undefined}
                          onClick={() => setConfirmSend(c)}><Send size={16} /> Send to Zoho</button>
                      )}
                      {['approved', 'sent'].includes(c.status) && directPending(c).length > 0 && (
                        <button type="button" className={btnPrimary} disabled={working === c.id || !settings?.direct_publish_enabled || settings?.autonomy_mode === 'draft'}
                          title={!settings?.direct_publish_enabled ? 'Direct publishing is off (Channels tab).' : settings?.autonomy_mode === 'draft' ? 'Draft mode is on.' : undefined}
                          onClick={() => setConfirmPublish(c)}><Send size={16} /> Publish now</button>
                      )}
                      {c.status === 'failed' && (
                        <button type="button" className={btnQuiet} disabled={working === c.id} onClick={() => void setStatus(c, 'approved')}>Approve again to retry</button>
                      )}
                      {OPEN.includes(c.status) && (
                        <button type="button" className={btnQuiet} disabled={working === c.id} onClick={() => void setStatus(c, 'cancelled')}>Cancel post</button>
                      )}
                    </div>

                    <div>
                      <p className={label}>History</p>
                      <ul className="space-y-1">
                        {(audit[c.id] ?? []).map((a) => (
                          <li key={a.id} className="text-xs text-gray-600 dark:text-gray-300">
                            <span className="font-mono">{formatLagos(a.at)}</span> · {a.action.replace(/_/g, ' ')}
                            {a.actor ? '' : ' (by the dispatcher)'}
                            {a.detail && typeof a.detail.channel === 'string' ? ` · ${a.detail.channel}` : ''}
                          </li>
                        ))}
                        {!audit[c.id]?.length && <li className="text-xs text-gray-500">No history yet.</li>}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <ZohoFile content={content} campaigns={campaigns} channels={channels} onSaved={load} />

          <ExternalPosts channels={channels} external={external} onSaved={load} />
        </div>
      )}

      {tab === 'new' && profile && (
        <PostEditor
          key={editing?.id ?? 'new'}
          editing={editing}
          channels={channels.filter((c) => c.connected && c.active)}
          campaigns={campaigns}
          profile={profile}
          calendar={calendar}
          dailyLimit={settings?.daily_limit_per_channel ?? 3}
          onDone={() => { setEditing(null); setTab('queue'); void load(); }}
        />
      )}

      {tab === 'baseline' && <Baseline channels={channels} metrics={metrics} onSaved={load} />}

      {tab === 'channels' && (
        <div className="space-y-3">
          <BrandDirectPublish onChanged={() => void load()} />
          <BrandConnections channels={channels} onChanged={() => void load()} />
          <p className="text-sm text-gray-600 dark:text-gray-300">As connected in Zoho Social. Inactive channels are connected but not posted to from here. “Direct” channels publish straight to Meta; the rest go through Zoho.</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="p-3">Channel</th><th className="p-3">Account</th><th className="p-3">Posting from here</th><th className="p-3">Note</th></tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.id} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="p-3 font-semibold text-gray-900 dark:text-white">{c.label}{isDirect(c.publish_route) && <span className="ml-2 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs text-blue-800 dark:text-blue-200">Direct</span>}</td>
                    <td className="p-3 text-gray-700 dark:text-gray-200">{c.handle}</td>
                    <td className="p-3">
                      <button type="button" className={`rounded-full px-3 py-1 text-xs font-semibold ${c.active ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
                        onClick={async () => {
                          const { error } = await supabase.from('brand_social_channels').update({ active: !c.active }).eq('id', c.id);
                          if (error) toast.error(error.message); else void load();
                        }}>{c.active ? 'Active' : 'Inactive'}</button>
                    </td>
                    <td className="p-3 text-xs text-gray-500 dark:text-gray-400">{c.note ?? ''}{c.verified_at ? ` Checked in Zoho ${c.verified_at.slice(0, 10)}.` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-center gap-3">
            <label htmlFor="bs-limit" className="text-sm text-gray-700 dark:text-gray-200">Most posts per channel per day</label>
            <input id="bs-limit" type="number" min={1} max={20} className={`${input} w-24`} defaultValue={settings?.daily_limit_per_channel ?? 3}
              onBlur={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= 20) void saveSettings({ daily_limit_per_channel: n }); }} />
            <span className="text-xs text-gray-500">Counts posts sent from here and posts the team entered from Zoho.</span>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmSend)}
        title={`Send ${confirmSend?.code ?? ''} to Zoho?`}
        message={confirmSend ? (
          <span>
            It goes to {confirmSend.variants.map((v) => CHANNEL_RULES[v.channel].label).join(', ')} as
            {' '}{settings?.zoho_action === 'schedule' ? `scheduled posts for ${formatLagos(confirmSend.planned_at)} Lagos time` : 'drafts in Zoho Social. Nothing is published until someone publishes it there'}.
          </span>
        ) : ''}
        confirmLabel="Send to Zoho"
        busy={working === confirmSend?.id}
        onConfirm={() => confirmSend && void send(confirmSend)}
        onCancel={() => setConfirmSend(null)}
      />
      <ConfirmDialog
        open={Boolean(confirmPublish)}
        title={`Publish ${confirmPublish?.code ?? ''} now?`}
        message={confirmPublish ? (
          <span>
            It goes public straight away on {directPending(confirmPublish).map((v) => `${CHANNEL_RULES[v.channel].label}${v.format && v.format !== 'post' ? ` (${FORMAT_LABEL[v.format]})` : ''}`).join(', ')},
            {' '}instead of at {formatLagos(confirmPublish.planned_at)}. Channels that go through Zoho are not affected.
          </span>
        ) : ''}
        confirmLabel="Publish now"
        busy={working === confirmPublish?.id}
        onConfirm={() => confirmPublish && void publishNow(confirmPublish)}
        onCancel={() => setConfirmPublish(null)}
      />
    </div>
  );
}

// ── Writing a post ───────────────────────────────────────────────────────────

function PostEditor({ editing, channels, campaigns, profile, calendar, dailyLimit, onDone }: {
  editing: Content | null; channels: Channel[]; campaigns: Campaign[]; profile: Profile;
  calendar: CalendarEntry[]; dailyLimit: number; onDone: () => void;
}) {
  const [campaignId, setCampaignId] = useState(editing?.campaign_id ?? campaigns.find((c) => c.slug === 'always-on')?.id ?? '');
  const [pillar, setPillar] = useState(editing?.pillar ?? profile.pillars[0]?.id ?? '');
  const [audience, setAudience] = useState(editing?.audience ?? profile.audiences[0]?.id ?? '');
  const [objective, setObjective] = useState(editing?.objective ?? profile.objectives[0] ?? 'awareness');
  const [hook, setHook] = useState(editing?.hook ?? '');
  const [caption, setCaption] = useState(editing?.caption ?? '');
  const [brief, setBrief] = useState(editing?.creative_brief ?? '');
  const [media, setMedia] = useState(editing?.media_url ?? '');
  const [cta, setCta] = useState(editing?.cta ?? profile.main_cta ?? 'Add your business');
  const [dest, setDest] = useState(editing?.destination_url ?? 'https://www.nowopenafrica.com/add-business');
  const [evidence, setEvidence] = useState(editing?.evidence ?? '');
  const [when, setWhen] = useState(utcToLagosLocal(editing?.planned_at));
  const [picked, setPicked] = useState<Record<string, string>>(
    () => Object.fromEntries((editing?.variants ?? []).map((v) => [v.channel, v.caption])),
  );
  const [formats, setFormats] = useState<Record<string, PostFormat>>(
    () => Object.fromEntries((editing?.variants ?? []).map((v) => [v.channel, v.format ?? 'post'])),
  );
  const [extraMedia, setExtraMedia] = useState((editing?.media_urls ?? []).join('\n'));
  const [saving, setSaving] = useState(false);
  const extras = extraMedia.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  const allMedia = [media, ...extras].filter(Boolean);
  const directIds = new Set(channels.filter((c) => isDirect(c.publish_route)).map((c) => c.id as string));

  const plannedUtc = when ? lagosLocalToUtc(when) : null;
  const slug = campaigns.find((c) => c.id === campaignId)?.slug ?? 'always-on';
  const code = editing?.code ?? 'NOA-SOC-NEW';

  const perChannel = Object.entries(picked).map(([ch, text]) => {
    const channel = ch as ChannelId;
    const checks = checkVariant({ channel, caption: text, mediaUrl: media || null, destinationUrl: dest || null });
    const entry: CalendarEntry = { id: editing?.variants.find((v) => v.channel === channel)?.id ?? `new-${channel}`, channel, at: plannedUtc ?? new Date().toISOString(), caption: text };
    const dupes = plannedUtc ? findNearDuplicates(entry, calendar) : [];
    const sameDay = plannedUtc ? postsThatDay(entry, calendar) : 0;
    const format = formats[channel] ?? 'post';
    // Only checked for channels that publish directly; Zoho channels only take posts.
    const fmtProblem = directIds.has(channel) ? formatProblem(channel, format, allMedia) : null;
    return { channel, text, checks, dupes, sameDay, format, fmtProblem };
  });
  const anyBlocked = perChannel.some((p) => isBlocked(p.checks) || p.fmtProblem);
  const anySensitive = perChannel.some((p) => isSensitive(p.checks));

  const toggleChannel = (id: ChannelId) => setPicked((p) => {
    const next = { ...p };
    if (id in next) delete next[id]; else next[id] = caption;
    return next;
  });

  const save = async (submit: boolean) => {
    if (!caption.trim()) { toast.error('Write the master caption first.'); return; }
    if (!Object.keys(picked).length) { toast.error('Pick at least one channel.'); return; }
    if (when && !plannedUtc) { toast.error('That time could not be read.'); return; }
    if (submit && anyBlocked) { toast.error('Fix the problems that block sending before submitting.'); return; }
    setSaving(true);
    const row = {
      campaign_id: campaignId || null, pillar, audience, objective, hook: hook || null, caption, creative_brief: brief || null,
      media_url: media || null, media_urls: extras.slice(0, 9), cta: cta || null, destination_url: dest || null, evidence: evidence || null,
      sensitive: anySensitive, planned_at: plannedUtc, status: submit ? 'in_review' : 'draft',
    };
    // The id is chosen here so the channel rows can reference it without a
    // read-after-insert (.insert().select() is where RLS hides failures).
    const id = editing?.id ?? crypto.randomUUID();
    const { error } = editing
      ? await supabase.from('brand_social_content').update(row).eq('id', id)
      : await supabase.from('brand_social_content').insert({ ...row, id });
    if (error) { setSaving(false); toast.error(error.message); return; }

    // Channels: upsert the picked ones, delete the dropped ones.
    const existing = new Map((editing?.variants ?? []).map((v) => [v.channel, v]));
    for (const [ch, text] of Object.entries(picked)) {
      const prev = existing.get(ch as ChannelId);
      const format = formats[ch] ?? 'post';
      const res = prev
        ? await supabase.from('brand_social_variants').update({ caption: text, format }).eq('id', prev.id)
        : await supabase.from('brand_social_variants').insert({ content_id: id, channel: ch, caption: text, format });
      if (res.error) { setSaving(false); toast.error(`${CHANNEL_RULES[ch as ChannelId].label}: ${res.error.message}`); return; }
    }
    for (const [ch, v] of existing) {
      if (!(ch in picked)) await supabase.from('brand_social_variants').delete().eq('id', v.id);
    }
    setSaving(false);
    toast.success(submit ? 'Submitted for approval' : 'Saved as draft');
    onDone();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4 min-w-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={label} htmlFor="bs-campaign">Campaign</label>
            <select id="bs-campaign" className={input} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">No campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div><label className={label} htmlFor="bs-when">Planned for (Lagos time)</label>
            <input id="bs-when" type="datetime-local" className={input} value={when} onChange={(e) => setWhen(e.target.value)} /></div>
          <div><label className={label} htmlFor="bs-pillar">Content pillar</label>
            <select id="bs-pillar" className={input} value={pillar} onChange={(e) => setPillar(e.target.value)}>
              {profile.pillars.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select></div>
          <div><label className={label} htmlFor="bs-audience">Audience</label>
            <select id="bs-audience" className={input} value={audience} onChange={(e) => setAudience(e.target.value)}>
              {profile.audiences.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select></div>
          <div><label className={label} htmlFor="bs-objective">Objective</label>
            <select id="bs-objective" className={input} value={objective} onChange={(e) => setObjective(e.target.value)}>
              {profile.objectives.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
            </select></div>
          <div><label className={label} htmlFor="bs-cta">Call to action</label>
            <input id="bs-cta" className={input} value={cta} onChange={(e) => setCta(e.target.value)} /></div>
        </div>
        <div><label className={label} htmlFor="bs-hook">Hook (first line)</label>
          <input id="bs-hook" className={input} value={hook} onChange={(e) => setHook(e.target.value)} placeholder="The line that stops the scroll" /></div>
        <div><label className={label} htmlFor="bs-caption">Master caption</label>
          <textarea id="bs-caption" rows={6} className={input} value={caption} onChange={(e) => setCaption(e.target.value)} /></div>
        <div><label className={label} htmlFor="bs-dest">Link</label>
          <input id="bs-dest" className={input} value={dest} onChange={(e) => setDest(e.target.value)} />
          {dest && <p className="mt-1 break-all font-mono text-xs text-gray-500">Tracked as {trackedUrl(dest, 'instagram', slug, code)?.replace('utm_source=instagram', 'utm_source={channel}')}</p>}</div>
        <div><label className={label} htmlFor="bs-media">Finished image or video (link)</label>
          <input id="bs-media" className={input} value={media} onChange={(e) => setMedia(e.target.value)} placeholder="https://…/post.png" /></div>
        <div><label className={label} htmlFor="bs-media-more">More images or videos, for a carousel (one link per line, up to 9)</label>
          <textarea id="bs-media-more" rows={2} className={input} value={extraMedia} onChange={(e) => setExtraMedia(e.target.value)} placeholder="https://…/slide-2.jpg" /></div>
        <div><label className={label} htmlFor="bs-brief">Creative brief</label>
          <textarea id="bs-brief" rows={3} className={input} value={brief} onChange={(e) => setBrief(e.target.value)} /></div>
        <div><label className={label} htmlFor="bs-evidence">Evidence for any fact in the post</label>
          <input id="bs-evidence" className={input} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Where a number or claim comes from" /></div>
      </div>

      <div className="space-y-4 min-w-0">
        <div>
          <p className={label}>Channels</p>
          <div className="flex flex-wrap gap-2">
            {channels.map((c) => (
              <button key={c.id} type="button" onClick={() => toggleChannel(c.id)} aria-pressed={c.id in picked}
                className={`rounded-full border px-3 min-h-[44px] text-sm font-semibold ${c.id in picked ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {perChannel.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">Pick channels to write each one’s version. Each starts from the master caption.</p>}
        {perChannel.map((p) => {
          const rule = CHANNEL_RULES[p.channel];
          const n = countChars(p.channel, p.text);
          return (
            <div key={p.channel} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor={`bs-v-${p.channel}`} className="text-sm font-semibold text-gray-900 dark:text-white">{rule.label}</label>
                <span className={`text-xs tabular-nums ${n > rule.maxChars ? 'text-red-600' : 'text-gray-500'}`}>{n} / {rule.maxChars}</span>
              </div>
              {directIds.has(p.channel) && formatsFor(p.channel).length > 1 && (
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`${rule.label} format`}>
                  {formatsFor(p.channel).map((f) => (
                    <button key={f} type="button" role="radio" aria-checked={p.format === f}
                      onClick={() => setFormats((x) => ({ ...x, [p.channel]: f }))}
                      className={`rounded-full border px-3 min-h-[36px] text-xs font-semibold ${p.format === f ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                      {FORMAT_LABEL[f]}
                    </button>
                  ))}
                </div>
              )}
              <textarea id={`bs-v-${p.channel}`} rows={4} className={input} value={p.text}
                onChange={(e) => setPicked((x) => ({ ...x, [p.channel]: e.target.value }))} />
              {p.fmtProblem && <p className="text-xs text-red-700 dark:text-red-300"><span className="font-semibold">Blocks sending:</span> {p.fmtProblem}</p>}
              {p.format === 'story' && <p className="text-xs text-gray-500 dark:text-gray-400">Stories show the image or video only; the caption is kept for the record.</p>}
              <CheckList checks={p.checks} />
              {p.dupes.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Very close to {p.dupes.length} other post{p.dupes.length > 1 ? 's' : ''} on this channel within two weeks.</p>}
              {p.sameDay >= dailyLimit && <p className="text-xs text-red-700 dark:text-red-300">This channel already has {p.sameDay} posts that day; the limit is {dailyLimit}.</p>}
            </div>
          );
        })}

        {anySensitive && (
          <p className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-100">
            This post makes a claim that needs a person to approve it. It can never be sent automatically.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnQuiet} disabled={saving} onClick={() => void save(false)}>Save draft</button>
          <button type="button" className={btnPrimary} disabled={saving || anyBlocked || !perChannel.length} onClick={() => void save(true)}>Submit for approval</button>
          <button type="button" className={btnQuiet} disabled={saving} onClick={onDone}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Baseline: every number with its source ───────────────────────────────────

function Baseline({ channels, metrics, onSaved }: { channels: Channel[]; metrics: Metric[]; onSaved: () => void }) {
  const [form, setForm] = useState({ channel: channels[0]?.id ?? 'instagram', metric: 'followers', value: '', period_start: '', period_end: '', source: 'Zoho Social Brand Health' });
  const [saving, setSaving] = useState(false);
  const periods = [...new Set(metrics.map((m) => `${m.period_start}|${m.period_end}|${m.source}`))];

  const add = async () => {
    const value = Number(form.value);
    if (!form.period_start || !form.period_end || !form.source.trim() || !Number.isFinite(value) || value < 0) {
      toast.error('Every number needs a value, a period and a source.'); return;
    }
    setSaving(true);
    const { error } = await supabase.from('brand_social_metrics').insert({ ...form, value });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Added');
    onSaved();
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-300 max-w-3xl">
        Numbers as the source reported them. A blank cell means the source did not report it, not zero. Zoho Social has no API for these, so they are entered from its reports until a direct source is connected.
      </p>
      {periods.map((key) => {
        const [start, end, source] = key.split('|');
        const rows = metrics.filter((m) => m.period_start === start && m.period_end === end && m.source === source);
        const shownChannels = channels.filter((c) => rows.some((r) => r.channel === c.id));
        const cols = ['followers', 'new_followers', 'posts', 'reach', 'engagements'];
        return (
          <div key={key} className="space-y-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><BarChart3 size={16} /> {source}, {start} to {end}</p>
            <p className="text-xs text-gray-500">Captured {formatLagos(rows[0]?.captured_at)}</p>
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-gray-50 dark:bg-gray-900 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr><th className="p-3">Channel</th>{cols.map((c) => <th key={c} className="p-3 text-right">{METRIC_LABEL[c]}</th>)}</tr>
                </thead>
                <tbody>
                  {shownChannels.map((ch) => (
                    <tr key={ch.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="p-3 font-semibold text-gray-900 dark:text-white">{ch.label}</td>
                      {cols.map((col) => {
                        const m = rows.find((r) => r.channel === ch.id && r.metric === col);
                        return <td key={col} className="p-3 text-right text-gray-700 dark:text-gray-200">{m ? m.value.toLocaleString() : <span className="text-gray-400" title="Not reported by this source">–</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Add a number from a report</p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div><label className={label} htmlFor="m-ch">Channel</label>
            <select id="m-ch" className={input} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as ChannelId })}>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></div>
          <div><label className={label} htmlFor="m-metric">Metric</label>
            <select id="m-metric" className={input} value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
              {Object.entries(METRIC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className={label} htmlFor="m-value">Value</label>
            <input id="m-value" type="number" min={0} className={input} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
          <div><label className={label} htmlFor="m-start">From</label>
            <input id="m-start" type="date" className={input} value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
          <div><label className={label} htmlFor="m-end">To</label>
            <input id="m-end" type="date" className={input} value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
          <div><label className={label} htmlFor="m-source">Source</label>
            <input id="m-source" className={input} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
        </div>
        <button type="button" className={btnPrimary} disabled={saving} onClick={() => void add()}><Plus size={16} /> Add</button>
      </div>
    </div>
  );
}

// ── Posts the team schedules by hand in Zoho ─────────────────────────────────

// ── Bulk submit and approve ──────────────────────────────────────────────────
//
// For a batch loaded from the content library: dozens of posts, one click each
// is how approval stops being read. Bulk still goes through the same row
// updates (the database stamps the approver on each), and two things are never
// bulked: a post the checks block, and a post marked "needs a person", which
// must be opened and approved on its own.

function BulkActions({ content, onDone }: { content: Content[]; onDone: () => void }) {
  const [working, setWorking] = useState(false);
  const [confirm, setConfirm] = useState<'submit' | 'approve' | null>(null);

  const blocked = (c: Content) => !c.variants.length
    || c.variants.some((v) => isBlocked(checkVariant({ channel: v.channel, caption: v.caption, mediaUrl: c.media_url, destinationUrl: c.destination_url })));
  const drafts = content.filter((c) => c.status === 'draft' && !blocked(c));
  const waiting = content.filter((c) => c.status === 'in_review' && !blocked(c) && !c.sensitive);
  const waitingSensitive = content.filter((c) => c.status === 'in_review' && c.sensitive).length;

  if (!drafts.length && !waiting.length && !waitingSensitive) return null;

  const run = async (kind: 'submit' | 'approve') => {
    const list = kind === 'submit' ? drafts : waiting;
    setWorking(true);
    let ok = 0; let failed = 0;
    for (const c of list) {
      const { error } = await supabase.from('brand_social_content').update({ status: kind === 'submit' ? 'in_review' : 'approved' }).eq('id', c.id);
      if (error) failed++; else ok++;
    }
    setWorking(false);
    setConfirm(null);
    if (failed) toast.error(`${ok} done, ${failed} failed. Refresh and check those posts.`);
    else toast.success(kind === 'submit' ? `${ok} posts sent for approval` : `${ok} posts approved`);
    onDone();
  };

  const first = (list: Content[]) => list.slice().sort((a, b) => (a.planned_at ?? '').localeCompare(b.planned_at ?? ''));
  const span = (list: Content[]) => list.length ? `${formatLagos(first(list)[0].planned_at)} to ${formatLagos(first(list)[list.length - 1].planned_at)}` : '';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Batch actions</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {drafts.length} draft{drafts.length === 1 ? '' : 's'} ready to submit · {waiting.length} waiting that can be approved together
          {waitingSensitive ? ` · ${waitingSensitive} marked “needs a person” must be approved one by one` : ''}
        </p>
      </div>
      <button type="button" className={btnQuiet} disabled={working || !drafts.length} onClick={() => setConfirm('submit')}>Submit {drafts.length} for approval</button>
      <button type="button" className={btnPrimary} disabled={working || !waiting.length} onClick={() => setConfirm('approve')}><Check size={16} /> Approve {waiting.length}</button>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm === 'approve' ? `Approve ${waiting.length} posts?` : `Submit ${drafts.length} drafts for approval?`}
        message={confirm === 'approve'
          ? <span>These are the posts waiting for approval that pass every check, {span(waiting)} Lagos time. Approving them lets them go into the next Zoho file. Posts marked “needs a person” are not included.</span>
          : <span>Every draft that passes the checks moves to “Waiting for approval”, {span(drafts)} Lagos time. Nothing is approved yet.</span>}
        confirmLabel={confirm === 'approve' ? 'Approve all' : 'Submit all'}
        busy={working}
        onConfirm={() => confirm && void run(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// ── Zoho Bulk Scheduler file ─────────────────────────────────────────────────
//
// The working route to Zoho while Zoho Flow's Zoho Social connection is
// broken. Two honest steps: download records which posts were in the file;
// "Mark uploaded" (after the team uploads it in Zoho) records the handover,
// through brand_social_mark_uploaded, which only touches posts still approved.

function ZohoFile({ content, campaigns, channels, onSaved }: { content: Content[]; campaigns: Campaign[]; channels: Channel[]; onSaved: () => void }) {
  // Channels published directly never go in the Zoho file: Zoho would post them a second time.
  const direct = new Set(channels.filter((c) => isDirect(c.publish_route)).map((c) => c.id));
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [preview, setPreview] = useState<BulkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ExportRow | null>(null);

  const approved = content.filter((c) => c.status === 'approved');

  const loadExports = useCallback(async () => {
    const { data, error } = await supabase.from('brand_social_exports')
      .select('id, file_name, row_count, downloaded_at, uploaded_at')
      .order('downloaded_at', { ascending: false }).limit(10);
    if (!error) setExports((data ?? []) as ExportRow[]);
  }, []);
  useEffect(() => { void loadExports(); }, [loadExports, content]);

  const build = () => buildZohoBulkCsv(approved.map((c) => ({
    contentId: c.id,
    code: c.code,
    campaignSlug: campaigns.find((x) => x.id === c.campaign_id)?.slug ?? 'always-on',
    plannedAt: c.planned_at,
    mediaUrl: c.media_url,
    destinationUrl: c.destination_url,
    // Only channels not already handed over.
    // Zoho's bulk file only schedules plain posts: no reels, stories or carousels.
    variants: c.variants.filter((v) => v.dispatch_status !== 'sent' && !direct.has(v.channel) && (v.format ?? 'post') === 'post').map((v) => ({ channel: v.channel, caption: v.caption })),
  })));

  const download = async () => {
    const result = build();
    setPreview(result);
    if (!result.rows.length) { toast.error('Nothing in the file yet. See the reasons below.'); return; }
    setBusy(true);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const fileName = `nowopen-zoho-bulk-${stamp}.csv`;
    const rows = result.rows.map((r) => {
      const c = approved.find((x) => x.id === r.contentId);
      return { content_id: r.contentId, variant_id: c?.variants.find((v) => v.channel === r.channel)?.id, channel: r.channel, code: r.code };
    });
    // Record first: a file nobody knows was made is how posts go out twice.
    const { error } = await supabase.from('brand_social_exports').insert({ file_name: fileName, rows, row_count: rows.length });
    setBusy(false);
    if (error) { toast.error(`Could not record the file: ${error.message}`); return; }
    const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`${fileName}: ${result.rows.length} post${result.rows.length === 1 ? '' : 's'}`);
    void loadExports();
  };

  const markUploaded = async (ex: ExportRow) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('brand_social_mark_uploaded', { p_export_id: ex.id });
    setBusy(false);
    setConfirm(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${data ?? 0} channel post${data === 1 ? '' : 's'} marked as handed to Zoho.`);
    onSaved();
  };

  const p = preview;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Zoho file</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl">
            Every approved post in Zoho Social’s Bulk Scheduler format, in Lagos time. In Zoho: Posts, New Post, Bulk Schedule, upload, set the date format to MM/DD/YYYY HH:MM and channels to “Choose channels from file”, then review and schedule.
          </p>
        </div>
        <button type="button" className={btnPrimary} disabled={busy || !approved.length} onClick={() => void download()}>
          <Download size={16} /> Download Zoho file ({approved.length} approved)
        </button>
      </div>

      {p && (p.skipped.length > 0 || p.notes.length > 0) && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-900 dark:text-amber-100 space-y-1">
          {p.skipped.map((s, i) => <p key={`s${i}`}><span className="font-semibold">Left out</span> {s.code}{s.channel ? ` · ${CHANNEL_RULES[s.channel].label}` : ''}: {s.reason}</p>)}
          {p.notes.map((s, i) => <p key={`n${i}`}><span className="font-semibold">Note</span> {s.code} · {s.channel ? CHANNEL_RULES[s.channel].label : ''}: {s.reason}</p>)}
        </div>
      )}

      {exports.length > 0 && (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {exports.map((ex) => (
            <li key={ex.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 break-all text-gray-700 dark:text-gray-200">
                <span className="font-mono text-xs">{ex.file_name}</span> · {ex.row_count} post{ex.row_count === 1 ? '' : 's'} · downloaded {formatLagos(ex.downloaded_at)}
              </span>
              {ex.uploaded_at
                ? <span className="text-xs font-semibold text-green-700 dark:text-green-300">Uploaded to Zoho {formatLagos(ex.uploaded_at)}</span>
                : <button type="button" className={btnQuiet} disabled={busy} onClick={() => setConfirm(ex)}><Upload size={16} /> Mark uploaded to Zoho</button>}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Mark this file as uploaded?"
        message={confirm ? <span>Only do this after the team has uploaded <span className="font-mono">{confirm.file_name}</span> in Zoho Social and scheduled it. Posts that were edited or un-approved since the download are left as they are.</span> : ''}
        confirmLabel="Mark uploaded"
        busy={busy}
        onConfirm={() => confirm && void markUploaded(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function ExternalPosts({ channels, external, onSaved }: { channels: Channel[]; external: External[]; onSaved: () => void }) {
  const [openForm, setOpenForm] = useState(false);
  const [channel, setChannel] = useState<ChannelId>(channels[0]?.id ?? 'instagram');
  const [when, setWhen] = useState('');
  const [caption, setCaption] = useState('');

  const add = async () => {
    const at = lagosLocalToUtc(when);
    if (!at || !caption.trim()) { toast.error('Add the time and the caption.'); return; }
    const { error } = await supabase.from('brand_social_external_posts').insert({ channel, posted_at: at, caption });
    if (error) { toast.error(error.message); return; }
    setCaption(''); setWhen(''); toast.success('Added to the calendar'); onSaved();
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Posts the team schedules in Zoho</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Enter them here so the daily limit and the duplicate check see the whole calendar. {external.length} entered.</p>
        </div>
        <button type="button" className={btnQuiet} onClick={() => setOpenForm((o) => !o)}>{openForm ? 'Close' : 'Add one'}</button>
      </div>
      {openForm && (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] items-end">
          <div><label className={label} htmlFor="ex-ch">Channel</label>
            <select id="ex-ch" className={input} value={channel} onChange={(e) => setChannel(e.target.value as ChannelId)}>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></div>
          <div><label className={label} htmlFor="ex-when">When (Lagos time)</label>
            <input id="ex-when" type="datetime-local" className={input} value={when} onChange={(e) => setWhen(e.target.value)} /></div>
          <div><label className={label} htmlFor="ex-cap">Caption</label>
            <input id="ex-cap" className={input} value={caption} onChange={(e) => setCaption(e.target.value)} /></div>
          <button type="button" className={btnPrimary} onClick={() => void add()}>Add</button>
        </div>
      )}
    </div>
  );
}
