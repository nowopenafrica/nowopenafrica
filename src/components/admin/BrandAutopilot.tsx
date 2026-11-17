import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CalendarDays, Loader2, RefreshCw, Sparkles } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { CHANNEL_RULES, formatLagos, lagosDay, lagosLocalToUtc, type ChannelId } from '../../lib/brandSocial';
import {
  FORMATS, MAX_CHANNELS_PER_BRIEF, MAX_TOPIC_CHARS, planWeek, validateBrief,
  type AutopilotBrief, type AutopilotProfile, type WeekSlot,
} from '../../lib/brandAutopilot';

/**
 * Brand autopilot — AI drafting for NowOpen Africa's own accounts.
 *
 * Everything made here is a DRAFT in the Brand social queue. It is checked,
 * reviewed and approved there exactly like a post a person wrote; this screen
 * has no approve or send button on purpose.
 *
 * Drafting stays off until the founder switches it on and sets a monthly
 * token ceiling. Tokens shown are what the provider reported, never a price:
 * the rate card belongs to whoever pays the bill.
 */

interface Channel { id: ChannelId; label: string; connected: boolean; active: boolean }
interface Campaign { id: string; name: string }
interface Status {
  enabled: boolean; monthlyTokenLimit: number; usedTokens: number; runs: number; unreportedRuns: number;
  provider: string; providerLabel: string; verdict: { ok: true; remaining: number } | { ok: false; reason: string };
}
interface Run {
  id: string; status: 'running' | 'done' | 'failed'; provider: string | null; model: string | null;
  input_tokens: number | null; output_tokens: number | null; error: string | null; started_at: string;
  brief: { topic?: string } | null;
}
type Result = { ok: true; code: string; sensitive: boolean; blocked_channels: string[]; similar_to_recent: boolean } | { ok: false; error: string };

const input = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white min-h-[44px]';
const label = 'block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1';
const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 min-h-[44px] text-sm font-semibold transition disabled:opacity-50';
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700`;
const btnQuiet = `${btn} border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700`;
const card = 'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4';

async function fnError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { const b = await ctx.json(); if (b?.error) return String(b.error); } catch { /* fall through */ }
  }
  return (error as Error)?.message ?? 'Something went wrong.';
}

async function draftOne(brief: AutopilotBrief): Promise<Result> {
  const { data, error } = await supabase.functions.invoke('brand-social-generate', { body: { action: 'generate', brief } });
  if (error) return { ok: false, error: await fnError(error) };
  if (!data?.ok) return { ok: false, error: String(data?.error ?? 'Nothing was drafted.') };
  return data as Result;
}

const num = (n: number) => n.toLocaleString('en-GB');

export default function BrandAutopilot({ channels, campaigns, profile, onDrafted }: {
  channels: Channel[]; campaigns: Campaign[]; profile: AutopilotProfile | null; onDrafted: () => void;
}) {
  const usable = useMemo(() => channels.filter((c) => c.active && c.connected && c.id in CHANNEL_RULES), [channels]);
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [limitDraft, setLimitDraft] = useState('');
  const [mode, setMode] = useState<'one' | 'week'>('one');
  const [busy, setBusy] = useState(false);

  // The brief. Channels default to the text-first four the calendar already uses.
  const [pillar, setPillar] = useState('');
  const [audience, setAudience] = useState('');
  const [objective, setObjective] = useState('');
  const [topic, setTopic] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [format, setFormat] = useState<(typeof FORMATS)[number]>('text');
  const [tone, setTone] = useState('');
  const [cta, setCta] = useState('');
  const [link, setLink] = useState('');
  const [when, setWhen] = useState('');
  const [campaignId, setCampaignId] = useState('');

  const [startDay, setStartDay] = useState(() => lagosDay(new Date(Date.now() + 86_400_000)));
  const [perDay, setPerDay] = useState(1);
  const [topics, setTopics] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ slot: WeekSlot; result: Result }[]>([]);

  const load = useCallback(async () => {
    setStatusError(null);
    const { data, error } = await supabase.functions.invoke('brand-social-generate', { body: { action: 'status' } });
    if (error || !data?.ok) {
      setStatus(null);
      setStatusError(error ? await fnError(error) : String(data?.error ?? 'Unknown error'));
    } else {
      setStatus(data as Status);
      setLimitDraft(String((data as Status).monthlyTokenLimit || ''));
    }
    const r = await supabase.from('brand_social_ai_runs')
      .select('id,status,provider,model,input_tokens,output_tokens,error,started_at,brief')
      .order('started_at', { ascending: false }).limit(20);
    if (!r.error) setRuns((r.data ?? []) as Run[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!profile) return;
    setPillar((p) => p || profile.pillars[0]?.id || '');
    setAudience((a) => a || profile.audiences[0]?.id || '');
    setObjective((o) => o || profile.objectives[0] || '');
  }, [profile]);

  useEffect(() => {
    setPicked((p) => (p.length ? p : usable.filter((c) => !CHANNEL_RULES[c.id].requires).slice(0, 4).map((c) => c.id)));
  }, [usable]);

  const saveSettings = async (patch: { ai_generation_enabled?: boolean; ai_monthly_token_limit?: number }) => {
    const { error } = await supabase.from('brand_social_settings').update(patch).eq('id', true);
    if (error) { toast.error(error.message); return; }
    toast.success('Saved');
    void load();
  };

  const briefFor = (t: string, p: string, plannedAt: string | null): AutopilotBrief => ({
    pillar: p, audience, objective, topic: t, channels: picked, format,
    tone: tone || undefined, cta: cta || undefined, destinationUrl: link || undefined,
    plannedAt, campaignId: campaignId || null,
  });

  const slots = useMemo(() => planWeek(startDay, profile?.pillars.map((p) => p.id) ?? [], perDay), [startDay, perDay, profile]);
  const slotTopic = (s: WeekSlot) => topics[s.local] ?? topic;

  const problems = profile ? validateBrief(briefFor(topic, pillar, null), profile, usable.map((c) => c.id)) : ['The brand profile has not loaded.'];
  const weekMissing = slots.filter((s) => slotTopic(s).trim().length < 8).length;
  const canDraft = !!status?.verdict.ok && !busy;

  const runOne = async () => {
    setBusy(true);
    const result = await draftOne(briefFor(topic, pillar, when ? lagosLocalToUtc(when) : null));
    setBusy(false);
    if (result.ok) { toast.success(`${result.code} is in the queue as a draft.`); onDrafted(); } else toast.error(result.error);
    void load();
  };

  const runWeek = async () => {
    setBusy(true);
    setProgress([]);
    for (const slot of slots) {
      const result = await draftOne(briefFor(slotTopic(slot), slot.pillar, lagosLocalToUtc(slot.local)));
      setProgress((p) => [...p, { slot, result }]);
      // Stop at the first refusal: the ceiling, a dead key or a rate limit will
      // refuse every later slot too, and each attempt would be logged as a failure.
      if (!result.ok) { toast.error(`Stopped at ${slot.day} ${slot.time}: ${result.error}`); break; }
    }
    setBusy(false);
    onDrafted();
    void load();
  };

  if (statusError) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-6 text-sm text-amber-900 dark:text-amber-100">
        <p className="font-semibold flex items-center gap-2"><AlertTriangle size={16} /> AI drafting is not set up yet.</p>
        <p className="mt-1">{statusError}</p>
        <p className="mt-2">It needs the migration 20261115010000_brand_autopilot.sql applied and the brand-social-generate function deployed. Nothing has been generated.</p>
        <button type="button" onClick={() => void load()} className={`${btnQuiet} mt-4`}><RefreshCw size={16} /> Check again</button>
      </div>
    );
  }
  if (!status) return <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">Loading Autopilot…</div>;

  return (
    <div className="space-y-6">
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Sparkles size={18} /> AI drafting</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 max-w-2xl">
              A model writes drafts from your brief. Every draft goes to the queue for a person to check and approve. Nothing here approves or sends a post.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white min-h-[44px]">
            <input type="checkbox" className="h-5 w-5" checked={status.enabled}
              onChange={(e) => void saveSettings({ ai_generation_enabled: e.target.checked })} />
            AI drafting on
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="ap-limit">Monthly limit (tokens)</label>
            <div className="flex gap-2">
              <input id="ap-limit" className={input} inputMode="numeric" placeholder="e.g. 500000" value={limitDraft}
                onChange={(e) => setLimitDraft(e.target.value.replace(/\D/g, ''))} />
              <button type="button" className={btnQuiet} disabled={Number(limitDraft || 0) === status.monthlyTokenLimit}
                onClick={() => void saveSettings({ ai_monthly_token_limit: Number(limitDraft || 0) })}>Save</button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">One post uses a few thousand tokens. With no limit set, nothing is generated.</p>
          </div>
          <div>
            <p className={label}>Used this month (Lagos)</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{num(status.usedTokens)} <span className="text-sm font-normal text-gray-500">of {num(status.monthlyTokenLimit)}</span></p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {num(status.runs)} run{status.runs === 1 ? '' : 's'}, as reported by the provider.
              {status.unreportedRuns > 0 && ` ${num(status.unreportedRuns)} did not report tokens and are not in this total.`}
            </p>
          </div>
          <div>
            <p className={label}>Model provider</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{status.provider === 'none' ? 'None configured' : status.providerLabel}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">The first configured provider answers; the run log shows which one did.</p>
          </div>
        </div>
        {!status.verdict.ok && (
          <p className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-100 flex gap-2">
            <AlertTriangle size={16} className="flex-none mt-0.5" /> {status.verdict.reason}
          </p>
        )}
      </div>

      <div className={card}>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="What to draft">
          {([['one', 'One post'], ['week', 'A week of posts']] as const).map(([id, text]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
              className={`rounded-full px-4 min-h-[44px] text-sm font-semibold ${mode === id ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
              {text}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mode === 'one' && (
            <div>
              <label className={label} htmlFor="ap-pillar">Content pillar</label>
              <select id="ap-pillar" className={input} value={pillar} onChange={(e) => setPillar(e.target.value)}>
                {profile?.pillars.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={label} htmlFor="ap-audience">Audience</label>
            <select id="ap-audience" className={input} value={audience} onChange={(e) => setAudience(e.target.value)}>
              {profile?.audiences.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ap-objective">Objective</label>
            <select id="ap-objective" className={input} value={objective} onChange={(e) => setObjective(e.target.value)}>
              {profile?.objectives.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ap-format">Format</label>
            <select id="ap-format" className={input} value={format} onChange={(e) => setFormat(e.target.value as (typeof FORMATS)[number])}>
              {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ap-campaign">Campaign</label>
            <select id="ap-campaign" className={input} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">No campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ap-tone">Tone (optional)</label>
            <input id="ap-tone" className={input} value={tone} maxLength={80} onChange={(e) => setTone(e.target.value)} placeholder="Usual brand voice" />
          </div>
          <div>
            <label className={label} htmlFor="ap-cta">Call to action (optional)</label>
            <input id="ap-cta" className={input} value={cta} maxLength={80} onChange={(e) => setCta(e.target.value)} placeholder={profile?.main_cta ?? 'Add your business'} />
          </div>
          <div>
            <label className={label} htmlFor="ap-link">Link (optional)</label>
            <input id="ap-link" className={input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.nowopenafrica.com/…" />
          </div>
          {mode === 'one' && (
            <div>
              <label className={label} htmlFor="ap-when">Planned time, Lagos (optional)</label>
              <input id="ap-when" type="datetime-local" className={input} value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
          )}
        </div>

        <div>
          <label className={label} htmlFor="ap-topic">{mode === 'one' ? 'What is the post about?' : 'Theme for the week'}</label>
          <textarea id="ap-topic" className={input} rows={2} maxLength={MAX_TOPIC_CHARS} value={topic} onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Why a business with no website still needs to be findable online" />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Give facts you want used. The model is told not to invent numbers, partners, prices, quotes or business names; anything it needs is left as a [placeholder], which blocks sending until a person fills it in.</p>
        </div>

        <fieldset>
          <legend className={label}>Channels (up to {MAX_CHANNELS_PER_BRIEF})</legend>
          <div className="flex flex-wrap gap-2">
            {usable.map((c) => {
              const on = picked.includes(c.id);
              const needs = CHANNEL_RULES[c.id].requires;
              return (
                <label key={c.id} className={`inline-flex items-center gap-2 rounded-full border px-3 min-h-[44px] text-sm cursor-pointer ${on ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-100' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`}>
                  <input type="checkbox" className="h-4 w-4" checked={on}
                    onChange={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))} />
                  {CHANNEL_RULES[c.id].label}{needs && <span className="text-xs opacity-70">· needs {needs.replace(/_/g, ' ')}</span>}
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Channels that need an image or video get a caption and a creative brief; the draft stays blocked there until finished media is attached.</p>
        </fieldset>

        {mode === 'one' ? (
          <div className="space-y-2">
            {problems.length > 0 && <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
            <button type="button" className={btnPrimary} disabled={!canDraft || problems.length > 0} onClick={() => void runOne()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Draft this post
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={label} htmlFor="ap-start">First day (Lagos)</label>
                <input id="ap-start" type="date" className={input} value={startDay} onChange={(e) => setStartDay(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="ap-perday">Posts per day</label>
                <select id="ap-perday" className={input} value={perDay} onChange={(e) => setPerDay(Number(e.target.value))}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <th className="py-2 pr-3">When (Lagos)</th><th className="py-2 pr-3">Pillar</th><th className="py-2 pr-3">Topic</th><th className="py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s) => {
                    const done = progress.find((p) => p.slot.local === s.local)?.result;
                    return (
                      <tr key={s.local} className="border-t border-gray-200 dark:border-gray-700 align-top">
                        <td className="py-2 pr-3 whitespace-nowrap text-gray-900 dark:text-white">{formatLagos(lagosLocalToUtc(s.local))}</td>
                        <td className="py-2 pr-3 text-gray-700 dark:text-gray-200">{profile?.pillars.find((p) => p.id === s.pillar)?.label ?? s.pillar}</td>
                        <td className="py-2 pr-3 min-w-[16rem]">
                          <input aria-label={`Topic for ${s.day} ${s.time}`} className={input} maxLength={MAX_TOPIC_CHARS} value={slotTopic(s)}
                            onChange={(e) => setTopics((t) => ({ ...t, [s.local]: e.target.value }))} />
                        </td>
                        <td className="py-2 text-xs">
                          {!done ? <span className="text-gray-400">—</span>
                            : done.ok ? <span className="text-green-700 dark:text-green-300">{done.code} drafted{done.blocked_channels.length ? ' · has blocks to fix' : ''}{done.similar_to_recent ? ' · close to a recent post' : ''}</span>
                            : <span className="text-red-700 dark:text-red-300">{done.error}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {weekMissing > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{weekMissing} slot{weekMissing === 1 ? ' needs' : 's need'} a topic. Set a theme above or fill them in.</p>}
            <button type="button" className={btnPrimary}
              disabled={!canDraft || weekMissing > 0 || slots.length === 0 || problems.some((p) => !p.startsWith('Say what'))}
              onClick={() => void runWeek()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CalendarDays size={16} />}
              {busy ? `Drafting ${progress.length + 1} of ${slots.length}…` : `Draft ${slots.length} posts`}
            </button>
          </div>
        )}
      </div>

      <div className={card}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-white">Run log</h3>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 min-h-[44px]"><RefreshCw size={14} /> Refresh</button>
        </div>
        {runs.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No model calls yet.</p> : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="py-2 flex flex-wrap gap-x-4 gap-y-1">
                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatLagos(r.started_at)}</span>
                <span className={r.status === 'failed' ? 'text-red-700 dark:text-red-300 font-semibold' : 'text-gray-900 dark:text-white font-semibold'}>{r.status === 'done' ? 'Drafted' : r.status === 'failed' ? 'Failed' : 'Running'}</span>
                <span className="text-gray-700 dark:text-gray-200">{r.provider ? `${r.provider} ${r.model ?? ''}` : 'No provider answered'}</span>
                <span className="text-gray-500 dark:text-gray-400">{r.input_tokens === null && r.output_tokens === null ? 'tokens not reported' : `${num((r.input_tokens ?? 0) + (r.output_tokens ?? 0))} tokens`}</span>
                <span className="text-gray-500 dark:text-gray-400 truncate max-w-full">{r.error ?? r.brief?.topic ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
