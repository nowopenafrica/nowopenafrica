import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Send, ShieldAlert, CheckCircle2, Clock, Phone, XCircle, Eye, ShieldCheck } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { invokeSendOnboarding } from '../../lib/onboarding';

/**
 * Onboarding messaging — the admin half of the welcome pipeline.
 *
 * LEFT: a manual send. Business name + a recipient per channel — the admin
 * picks WhatsApp-only, Instagram-only, or both. WhatsApp needs a number; IG
 * needs the recipient's Instagram user ID (from an open conversation) or the
 * @handle. The edge function (`send-onboarding` mode=manual) is what actually
 * talks to Meta; this screen only authenticates itself with the signed-in
 * admin's JWT (invokeSendOnboarding attaches it — deliberately not
 * supabase.functions.invoke, whose `apikey` header trips the gateway for this
 * no-verify-jwt function) and reports the truth.
 *
 * RIGHT: the ledger. Both the automatic queue (`onboarding_messages`, fed by
 * the businesses trigger and drained by the cron) and the manual sends
 * (`onboarding_manual_sends`) — every row carries a channel + a status, so
 * "it should have gone out" and "it went out" are always distinguishable.
 *
 * HONESTY: nothing here pretends a send happened. If a provider or the
 * approved WhatsApp template is not configured, a send records
 * needs_provider / needs_template and the screen says so — the same refusal
 * the automatic drain would give. Instagram DM is conversation-only under
 * Meta's rules: without an open conversation it records needs_conversation
 * and is never cold-DM'd. The admin role is enforced server-side too (the
 * function rejects non-admins with 403) and the tab is hidden from editors.
 */

type Channel = 'whatsapp' | 'instagram' | 'email';

type SendStatus =
  | 'sent' | 'no_phone' | 'blocked' | 'suppressed' | 'needs_provider'
  | 'needs_template' | 'needs_conversation' | 'failed';

interface ManualChannelResult {
  channel: Channel;
  ok: boolean;
  status: SendStatus;
  reason: string | null;
  error: string | null;
}

interface ManualSendResult {
  ok: boolean;
  status: SendStatus;
  results: ManualChannelResult[];
}

interface AutoRow {
  id: string;
  business_id: string;
  channel: string;
  phone: string | null;
  handle: string | null;
  status: string;
  reason: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  sent_at: string | null;
}

interface ManualRow {
  id: string;
  business_name: string;
  channel: string;
  phone: string | null;
  handle: string | null;
  owner_name: string | null;
  status: string;
  reason: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  /*
   * What Meta said AFTER accepting. NULL means genuinely unknown — either the
   * send predates delivery tracking, or no webhook has arrived yet. It must
   * never render as "delivered".
   */
  email: string | null;
  delivery_status: string | null;
  failure_detail: string | null;
  /** Our next step, for failure codes we recognise. NULL otherwise — we do not guess. */
  failure_advice: string | null;
}

interface InboundReply {
  id: string;
  from_phone: string;
  sender_name: string | null;
  body: string | null;
  reference: string | null;
  business_id: string | null;
  business_name: string | null;
  received_at: string;
}

interface PipelineStatus {
  scheduled: boolean;
  schedule: string | null;
  active: boolean;
  last_run: string | null;
  last_status: string | null;
  configured: boolean;
  queued: number;
  sent: number;
  blocked: number;
}

/**
 * What the sender renders for THIS form's values — text and the honest
 * configuration flags per channel, all from the server so the preview can
 * never drift from what actually gets sent.
 */
interface ChannelPreview {
  text: string;
  params: string[];
  template: string | null;
  templateLang: string;
  providerConfigured: boolean;
  templateConfigured: boolean;
}

interface PreviewInfo {
  whatsapp: ChannelPreview;
  instagram: Pick<ChannelPreview, 'text' | 'providerConfigured'>;
  /*
   * The brand-kit email. Missing from the preview entirely until 2026-10-10,
   * so the panel promised "exactly what this recipient receives" and showed
   * nothing for the one channel that can currently deliver.
   */
  email?: { subject: string; html: string; providerConfigured: boolean };
}

const RETRYABLE = new Set(['queued', 'needs_provider', 'needs_template']);

const STATUS_TONE: Record<string, string> = {
  sent: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  sending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  queued: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  needs_provider: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  needs_template: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  needs_conversation: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  no_phone: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  blocked: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  suppressed: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  failed: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WA',
  instagram: 'IG',
  email: 'EMAIL',
};

/*
 * Delivery is a different fact from sending.
 *
 * `sent` means the Cloud API accepted the request — nothing more. A manual
 * send to a number with no country code was recorded `sent` on 2026-10-10 and
 * could never have arrived. This chip reports Meta's own later verdict, and
 * says "unconfirmed" when there is none rather than letting `sent` imply one.
 */
const DELIVERY_TONE: Record<string, string> = {
  delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  read: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
  accepted: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
};

function DeliveryChip({ status, sent }: { status: string | null; sent: boolean }) {
  if (!sent) return null;
  const label = status ?? 'unconfirmed';
  const tone = status
    ? DELIVERY_TONE[status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}
      title={status
        ? `Meta reports this message as ${status}.`
        : 'Meta has not reported on this message. "Sent" only means the API accepted it.'}
    >
      {label}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
      {status}
    </span>
  );
}

/** What the probe found, or that it could not be reached. */
type EmailProbe =
  | { unreachable: true; configured?: undefined; from?: undefined; canSendTo?: undefined }
  | { unreachable?: false; configured: boolean; from: string | null; canSendTo: string | null };

/** What Meta says about the WhatsApp token. Read-only: this never sends. */
interface WhatsAppProbe {
  unreachable?: boolean;
  missing?: string[];
  warnings?: string[];
  readyToSend?: boolean;
  productionReady?: boolean;
  /** Caps the account without stopping it — shown, but does not make it 'not ready'. */
  advisories?: string[];
  deliveryWebhook?: {
    appSecretSet: boolean;
    verifyTokenSet: boolean;
    /** null means the subscription list could not be read — NOT that it is missing. */
    wabaSubscribed: boolean | null;
    note: string;
  };
  token?: { hoursLeft: number | null; neverExpires: boolean; type: string | null };
}

/** What Meta says about the Instagram token. Read-only: this never DMs. */
interface InstagramProbe {
  unreachable?: boolean;
  /**
   * false when Meta refused the token outright.
   *
   * Carried because this screen had no way to say it: a refused token
   * rendered as "unknown token" above empty lists, which looks like nothing
   * much rather than like Instagram being off.
   */
  ok?: boolean;
  reason?: string;
  warnings?: string[];
  token?: { type: string | null; scopes?: string[] };
  discovery?: string[];
  dm?: { missingScopes?: string[]; repliesPossible?: boolean };
  extractor?: { missingScopes?: string[]; thisTokenCouldPowerIt?: boolean; proof?: { detail: string } };
}

/** The outcome of an actual send. `providerMessage` is Resend's own sentence. */
interface EmailTestResult {
  ok: boolean;
  reason?: string;
  to?: string;
  from?: string;
  providerMessage?: string | null;
}

function SetupRow({ title, detail, ok, unknown }: { title: string; detail: string; ok?: boolean; unknown?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center mt-0.5 ${
        unknown
          ? 'bg-gray-200 dark:bg-gray-700'
          : ok
            ? 'bg-green-100 dark:bg-green-900/40'
            : 'bg-amber-100 dark:bg-amber-900/40'
      }`}>
        {unknown
          ? <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">?</span>
          : ok
            ? <CheckCircle2 size={13} className="text-green-600 dark:text-green-400" />
            : <Clock size={13} className="text-amber-600 dark:text-amber-400" />}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

export default function OnboardingMessagingPanel() {
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [handle, setHandle] = useState('');
  const [selection, setSelection] = useState<'whatsapp' | 'instagram' | 'both' | 'email'>('whatsapp');
  const [sendEmailTo, setSendEmailTo] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [profileUrl, setProfileUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ManualSendResult | null>(null);

  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [autoRows, setAutoRows] = useState<AutoRow[] | null>(null);
  const [manualRows, setManualRows] = useState<ManualRow[] | null>(null);
  const [replies, setReplies] = useState<InboundReply[] | null>(null);
  /*
   * Kept separate from `problem`. An unreadable replies list must not blank
   * the send ledger beside it, and an EMPTY list is not an error — this
   * codebase has reported "no rows" as "missing migration" eleven times.
   */
  const [repliesProblem, setRepliesProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [requeueing, setRequeueing] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  /*
   * Email configuration, ASKED rather than assumed.
   *
   * This row used to be hardcoded to "not configured". That was true the day
   * it was written and false from the day a key was set, with nothing watching
   * for the change. The probe costs one call and cannot go stale.
   */
  const [emailProbe, setEmailProbe] = useState<EmailProbe | null>(null);
  const [emailTest, setEmailTest] = useState<EmailTestResult | null>(null);
  const [emailTesting, setEmailTesting] = useState(false);

  useEffect(() => {
    let alive = true;
    // The whole body is guarded, not just the invoke: an unguarded promise
    // here becomes an unhandled rejection on the admin screen.
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('selftest-email', { body: { probe: true } });
        if (!alive) return;
        if (error) { setEmailProbe({ unreachable: true }); return; }
        const d = data as { providerConfigured?: boolean; from?: string; canSendTo?: string | null };
        setEmailProbe({
          configured: Boolean(d?.providerConfigured),
          from: d?.from ?? null,
          canSendTo: d?.canSendTo ?? null,
        });
      } catch {
        if (alive) setEmailProbe({ unreachable: true });
      }
    })();
    return () => { alive = false; };
  }, []);

  /*
   * WhatsApp, asked of Meta rather than inferred from which secrets exist.
   * A token can be set, valid, and still be an hour from expiry on a sandbox
   * number — which is what "configured" would otherwise have meant.
   */
  const [waProbe, setWaProbe] = useState<WhatsAppProbe | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('selftest-whatsapp', { body: {} });
        if (!alive) return;
        if (error) { setWaProbe({ unreachable: true }); return; }
        setWaProbe(data as WhatsAppProbe);
      } catch {
        if (alive) setWaProbe({ unreachable: true });
      }
    })();
    return () => { alive = false; };
  }, []);

  const [igProbe, setIgProbe] = useState<InstagramProbe | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('selftest-instagram', { body: {} });
        if (!alive) return;
        setIgProbe(error ? { unreachable: true } : (data as InstagramProbe));
      } catch {
        if (alive) setIgProbe({ unreachable: true });
      }
    })();
    return () => { alive = false; };
  }, []);

  const runEmailTest = useCallback(async () => {
    setEmailTesting(true);
    setEmailTest(null);
    try {
      const { data, error } = await supabase.functions.invoke('selftest-email', { body: {} });
      if (error) {
        setEmailTest({ ok: false, reason: error.message || 'The self-test could not be reached.' });
      } else {
        setEmailTest(data as EmailTestResult);
      }
    } catch (e) {
      setEmailTest({ ok: false, reason: e instanceof Error ? e.message : 'The self-test failed.' });
    } finally {
      setEmailTesting(false);
    }
  }, []);

  /*
   * Email is its own choice, not part of "both".
   *
   * It is also the only channel that currently reaches anybody: WhatsApp
   * cannot deliver at all while the account has no payment method (Meta code
   * 131042), so the brand-kit email had to stop being signup-only.
   */
  const includesEmail = selection === 'email';
  const includesWhatsapp = selection === 'whatsapp' || selection === 'both';
  const includesInstagram = selection === 'instagram' || selection === 'both';

  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const { data, error } = await invokeSendOnboarding<Partial<PreviewInfo>>({
        mode: 'preview',
        businessName: businessName.trim() || null,
        ownerName: ownerName.trim() || null,
        profileUrl: profileUrl.trim() || null,
      });
      if (error) throw new Error(error);
      const d = data as Partial<PreviewInfo> | null;
      if (!d || typeof d.whatsapp?.text !== 'string' || typeof d.instagram?.text !== 'string') {
        throw new Error('No preview came back');
      }
      setPreview({
        whatsapp: {
          text: d.whatsapp.text,
          params: d.whatsapp.params ?? [],
          template: d.whatsapp.template ?? null,
          templateLang: d.whatsapp.templateLang ?? 'en',
          providerConfigured: Boolean(d.whatsapp.providerConfigured),
          templateConfigured: Boolean(d.whatsapp.templateConfigured),
        },
        instagram: {
          text: d.instagram.text,
          providerConfigured: Boolean(d.instagram.providerConfigured),
        },
      });
      setPreviewError(null);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  }, [businessName, ownerName, profileUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    const [st, auto, manual, inbound] = await Promise.all([
      supabase.rpc('onboarding_welcome_status'),
      supabase.rpc('onboarding_messages_list', { p_limit: 20, p_offset: 0 }),
      supabase.rpc('onboarding_manual_sends_list', { p_limit: 20, p_offset: 0 }),
      supabase.rpc('whatsapp_inbound_list', { p_limit: 20, p_offset: 0 }),
    ]);
    if (st.error || auto.error || manual.error) {
      const msg = [
        st.error?.message ?? null,
        auto.error?.message ?? null,
        manual.error?.message ?? null,
      ].filter(Boolean)[0];
      setProblem(msg ? `Could not read the onboarding ledger: ${msg}` : 'Could not read the onboarding ledger.');
    } else {
      setPipeline((st.data as PipelineStatus | null) ?? null);
      setAutoRows((auto.data as AutoRow[] | null) ?? []);
      setManualRows((manual.data as ManualRow[] | null) ?? []);
    }
    if (inbound.error) {
      setReplies(null);
      setRepliesProblem(inbound.error.message);
    } else {
      setReplies((inbound.data as InboundReply[] | null) ?? []);
      setRepliesProblem(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => void fetchPreview(), 400);
    return () => clearTimeout(t);
  }, [fetchPreview]);

  const channels = (): Channel[] => (selection === 'both' ? ['whatsapp', 'instagram'] : [selection as Channel]);

  const sendManual = async () => {
    if (!businessName.trim()) {
      /*
       * Say WHY, like the two guards below already do.
       *
       * This returned `results: []`, and the results list is what renders the
       * explanation — so a missing business name produced a status chip with
       * no sentence beside it and no row in either ledger, because the request
       * never left the browser. On 2026-10-10 that looked exactly like a
       * welcome that had been sent and vanished.
       */
      setResult({
        ok: false,
        status: 'no_phone',
        results: [{
          channel: includesWhatsapp ? 'whatsapp' : 'instagram',
          ok: false,
          status: 'no_phone',
          reason: 'Business name is required — it is the name the template puts in the message, so nothing was sent.',
          error: null,
        }],
      });
      return;
    }
    if (includesEmail && !sendEmailTo.trim()) {
      setResult({
        ok: false,
        status: 'no_phone',
        results: [{ channel: 'email', ok: false, status: 'no_phone', reason: 'Enter the email address to send the brand kit to.', error: null }],
      });
      return;
    }
    if (includesWhatsapp && !phone.trim()) {
      setResult({
        ok: false,
        status: 'no_phone',
        results: [{ channel: 'whatsapp', ok: false, status: 'no_phone', reason: 'Business name and WhatsApp number are required.', error: null }],
      });
      return;
    }
    if (includesInstagram && !handle.trim()) {
      setResult({
        ok: false,
        status: 'needs_conversation',
        results: [{ channel: 'instagram', ok: false, status: 'needs_conversation', reason: 'Add the Instagram recipient — the IG user ID from your inbox, or the @handle.', error: null }],
      });
      return;
    }
    setSending(true);
    setResult(null);
    const chans = channels();
    try {
      const { data, error } = await invokeSendOnboarding<Partial<ManualSendResult>>({
        mode: 'manual',
        channels: chans,
        businessName: businessName.trim(),
        phone: includesWhatsapp ? phone.trim() : null,
        email: includesEmail ? sendEmailTo.trim() : null,
        handle: includesInstagram ? handle.trim() : null,
        ownerName: ownerName.trim() || null,
        profileUrl: profileUrl.trim() || null,
      });
      if (error) throw new Error(error);
      const d = data as Partial<ManualSendResult>;
      if (!Array.isArray(d.results) || typeof d.status !== 'string') throw new Error('No result came back');
      setResult({
        ok: Boolean(d.ok),
        status: d.status as SendStatus,
        results: d.results as ManualChannelResult[],
      });
    } catch (e) {
      setResult({
        ok: false,
        status: 'failed',
        results: channels().map((c) => ({ channel: c, ok: false, status: 'failed' as SendStatus, reason: null, error: e instanceof Error ? e.message : String(e) })),
      });
    } finally {
      setSending(false);
      void load();
    }
  };

  const requeue = async (rowId: string) => {
    setRequeueing(rowId);
    try {
      const { error } = await supabase.rpc('onboarding_messages_requeue', { p_id: rowId });
      if (error) setProblem(`Could not requeue: ${error.message}`);
    } finally {
      setRequeueing(null);
      void load();
    }
  };

  const refresh = () => {
    setResult(null);
    void load();
  };

  const pipelineChecks = [
    { label: 'Cron scheduled', value: pipeline ? (pipeline.scheduled ? 'yes' : 'no') : '—' },
    { label: 'Cron schedule', value: pipeline?.schedule ?? '—' },
    { label: 'Provider configured', value: pipeline?.configured ? 'yes' : 'no' },
    { label: 'Last run', value: pipeline?.last_run ? new Date(pipeline.last_run).toLocaleString() : 'never' },
    { label: 'Last run status', value: pipeline?.last_status ?? '—' },
  ];

  const selectedLabel = (c: Channel) => (c === 'whatsapp' ? 'WhatsApp' : 'Instagram');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Onboarding messaging</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manual welcomes on WhatsApp and/or Instagram, and the honest state of both pipelines — the automatic queue and every manual send.
          </p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {problem && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">The ledger could not be read.</p>
            <p className="mt-1">{problem}</p>
            <p className="mt-2 text-rose-700/80 dark:text-rose-300/80">This tab is (naturally) admin-only — if you can see it, the call itself was rejected, which is surprising and worth flagging.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Send size={17} className="text-violet-600 dark:text-violet-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Send a welcome now</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                {'Delivers the NowOpen Africa welcome right away, on the channel(s) you pick. WhatsApp uses the approved template ({{1}} name · {{2}} business · {{3}} profile). Instagram DMs need an open conversation to send.'}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">Channel</span>
                <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-900">
                  {(['email', 'whatsapp', 'instagram', 'both'] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSelection(opt)}
                      className={`px-2 py-1.5 rounded-md text-xs font-medium transition ${
                        selection === opt
                          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                    >
                      {opt === 'both' ? 'WA + IG' : opt === 'email' ? 'Email' : selectedLabel(opt)}
                    </button>
                  ))}
                </div>
              </div>
              {includesEmail && (
                <div>
                  <label htmlFor="onb-email" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
                    Send the brand kit to
                  </label>
                  <input
                    id="onb-email"
                    type="email"
                    value={sendEmailTo}
                    onChange={(e) => setSendEmailTo(e.target.value)}
                    placeholder="owner@example.com"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    Exactly the document new owners receive on signup — same subject, same content.
                  </p>
                </div>
              )}
              <div>
                <label htmlFor="onb-biz-name" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">Business name</label>
                <input
                  id="onb-biz-name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Ada's Kitchen"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                />
              </div>
              {includesWhatsapp && (
                <div>
                  <label htmlFor="onb-phone" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">WhatsApp number</label>
                  <input
                    id="onb-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+234 803 000 0000 (country code required)"
                    inputMode="tel"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                  />
                </div>
              )}
              {includesInstagram && (
                <div>
                  <label htmlFor="onb-handle" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">Instagram recipient</label>
                  <input
                    id="onb-handle"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="IG user ID from your inbox, or @handle"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                  />
                  <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                    A numeric IG user ID (from an open conversation) sends; an @handle alone is refused as needs_conversation — Meta only allows DMs inside a conversation window.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label htmlFor="onb-owner" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">Owner first name <span className="text-gray-400 dark:text-gray-500">(optional)</span></label>
                  <input
                    id="onb-owner"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g. Ada"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="onb-profile" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">Profile link <span className="text-gray-400 dark:text-gray-500">(optional)</span></label>
                  <input
                    id="onb-profile"
                    value={profileUrl}
                    onChange={(e) => setProfileUrl(e.target.value)}
                    placeholder="nowopenafrica.com/adas-kitchen"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                  />
                </div>
              </div>
              <button
                onClick={sendManual}
                disabled={sending}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition"
              >
                <Send size={15} />
                {sending ? 'Sending…' : selection === 'both' ? 'Send WhatsApp + Instagram welcome' : `Send ${selectedLabel(selection)} welcome`}
              </button>

              {result && (
                <div className={`p-3 rounded-lg text-sm border ${
                  result.ok
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
                    : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                }`}>
                  {result.results.map((r) => (
                    <div key={r.channel} className="flex items-start gap-2">
                      {r.ok
                        ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                        : <XCircle size={16} className="mt-0.5 shrink-0" />}
                      <div>
                        <p className="font-medium">{selectedLabel(r.channel)}: {r.ok ? 'Sent.' : `Not sent — ${r.reason ?? r.status}.`}</p>
                        {(r.status === 'needs_provider' || r.status === 'needs_template') && (
                          <p className="mt-1 opacity-90">
                            {/*
                              * "once it is configured" was wrong for the
                              * commonest case. A needs_template row is almost
                              * never waiting on configuration — the template
                              * is submitted and Meta has not approved it yet,
                              * and nothing an operator sets changes that.
                              * Worse, it invites the one action that breaks
                              * things: naming a pending template, which sends
                              * nothing and turns honest refusals into failures.
                              */}
                            Recorded in the ledger; it will go out automatically{' '}
                            {r.status === 'needs_template'
                              ? 'once Meta approves the template — nothing to configure here.'
                              : `once the ${selectedLabel(r.channel)} provider is configured.`}
                          </p>
                        )}
                        {r.status === 'needs_conversation' && (
                          <p className="mt-1 opacity-90">
                            Recorded as needs_conversation — supply the recipient's Instagram user ID from an open conversation and resend.
                          </p>
                        )}
                        {r.error && <p className="mt-1 opacity-90">{r.error}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                  <Eye size={14} className="text-gray-400 dark:text-gray-500" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Preview — exactly what this recipient receives</span>
                </div>
                <div className="p-3 space-y-3">
                  {previewError ? (
                    <p className="text-xs text-rose-600 dark:text-rose-400">{previewError}</p>
                  ) : !preview ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">{previewLoading ? 'Rendering…' : '…'}</p>
                  ) : (
                    <>
                      {includesEmail && preview.email && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Email</p>
                          <p className="text-[11px] text-gray-600 dark:text-gray-300">
                            <span className="text-gray-400">Subject:</span> {preview.email.subject}
                          </p>
                          {/*
                            * Rendered, not described — it is an HTML document
                            * and a paraphrase would not show what lands in the
                            * inbox.
                            *
                            * sandbox="" with no allow-scripts: the document
                            * interpolates a business name that came from a
                            * form, so it is treated as untrusted even though
                            * we generated it.
                            */}
                          <iframe
                            title="Brand kit email preview"
                            srcDoc={preview.email.html}
                            sandbox=""
                            className="mt-1.5 w-full h-80 rounded-lg border border-gray-200 dark:border-gray-700 bg-white"
                          />
                          {!preview.email.providerConfigured && (
                            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                              No email provider is configured, so this would not send.
                            </p>
                          )}
                        </div>
                      )}

                      {includesWhatsapp && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">WhatsApp</p>
                          <p className="text-[13px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{preview.whatsapp.text}</p>
                          {preview.whatsapp.template && (
                            <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                              Template {preview.whatsapp.template} · {preview.whatsapp.params.join(' · ')}
                            </p>
                          )}
                        </div>
                      )}
                      {includesInstagram && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Instagram DM</p>
                          <p className="text-[13px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{preview.instagram.text}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <ShieldCheck size={17} className="text-violet-600 dark:text-violet-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Switch real delivery on</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                Nothing sends until these are in place. Every refusal is recorded in the ledger, and the pipeline self-heals the moment they are.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <SetupRow
                title="WhatsApp Business API"
                ok={preview?.whatsapp.providerConfigured}
                unknown={!preview && !previewError}
                detail={preview?.whatsapp.providerConfigured
                  ? 'WHATSAPP_TOKEN and WHATSAPP_PHONE_ID are set as edge-function secrets.'
                  : 'Missing — run: supabase secrets set WHATSAPP_TOKEN=… WHATSAPP_PHONE_ID=… (Meta Cloud API credentials).'}
              />
              <SetupRow
                title="Approved welcome template"
                ok={preview?.whatsapp.templateConfigured}
                unknown={!preview && !previewError}
                detail={preview?.whatsapp.templateConfigured
                  ? `${preview.whatsapp.template} is set and approved in Meta (${preview.whatsapp.templateLang}).`
                  : 'Missing — approve a template in Meta Business Manager and set WHATSAPP_WELCOME_TEMPLATE to its name. The variables must stay in order {{1}} first name, {{2}} business, {{3}} profile link — use the preview above as the exact copy.'}
              />
              <SetupRow
                title="Instagram Messaging API"
                ok={preview?.instagram.providerConfigured}
                unknown={!preview && !previewError}
                detail={preview?.instagram.providerConfigured
                  ? 'INSTAGRAM_TOKEN and INSTAGRAM_BUSINESS_ID are set as edge-function secrets.'
                  : 'Missing — starting from scratch: create a Meta app, add the Instagram product with private messaging, link your IG business account to a Facebook Page, request instagram_business_manage_messages, pass app review and set up the webhook. Then run: supabase secrets set INSTAGRAM_TOKEN=… INSTAGRAM_BUSINESS_ID=…'}
              />
              <SetupRow
                title="Instagram DMs are conversation-only"
                ok={false}
                detail={'Meta only lets you DM inside an open conversation (the 24h window since their last inbound message). Cold DMs to a handle are never attempted — they record needs_conversation until you send to the recipient\'s numeric IG user ID from your inbox.'}
              />
              {/*
                * Instagram, as Meta describes it. The row above reports which
                * secrets exist; this reports what the token can actually do —
                * and a token named for Instagram may carry no Instagram
                * scopes at all.
                */}
              {/*
                * A REJECTED token is the state this screen most needs to show,
                * and it showed nothing.
                *
                * It rendered "Meta reports: unknown token" above three empty
                * lists, which reads as a quiet, uninteresting state rather
                * than as Instagram being off. Measured 2026-10-08: the page
                * token expired mid-session and this panel gave no sign of it.
                */}
              {igProbe && !igProbe.unreachable && igProbe.ok === false && (
                <div className="rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 p-3.5 ml-8">
                  <p className="text-[11px] font-semibold text-rose-900 dark:text-rose-100">
                    Instagram is not working — Meta refused the token
                  </p>
                  <p className="mt-1 text-[11px] text-rose-800 dark:text-rose-200">{igProbe.reason}</p>
                  <p className="mt-1.5 text-[11px] text-rose-700 dark:text-rose-300">
                    {/*
                      * Named precisely, because the obvious fix is the one
                      * that already failed: a token minted in the Graph API
                      * Explorer dies with the session that made it, whatever
                      * its reported expiry says.
                      */}
                    Issue the replacement from a <strong>System User</strong> in Business Settings — not from
                    the Graph API Explorer, whose tokens die with the session that made them.
                  </p>
                </div>
              )}

              {igProbe && !igProbe.unreachable && igProbe.ok !== false && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 ml-8">
                  <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                    Meta reports: {igProbe.token?.type ?? 'unknown'} token
                    {igProbe.extractor?.thisTokenCouldPowerIt ? ' · can also power the manual extractor' : ''}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {(igProbe.discovery ?? []).map((x) => (
                      <li key={x} className="text-[11px] text-gray-500 dark:text-gray-400">• {x}</li>
                    ))}
                    {(igProbe.dm?.missingScopes ?? []).length > 0 && (
                      <li className="text-[11px] text-amber-700 dark:text-amber-300">
                        • Missing for DMs: {(igProbe.dm?.missingScopes ?? []).join(', ')}
                      </li>
                    )}
                    {(igProbe.extractor?.missingScopes ?? []).length > 0 && (
                      <li className="text-[11px] text-amber-700 dark:text-amber-300">
                        • Missing for the manual extractor: {(igProbe.extractor?.missingScopes ?? []).join(', ')} (needs App Review)
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/*
                * What Meta actually says about the WhatsApp setup. The two
                * rows above report whether SECRETS exist; these report whether
                * the thing behind them is fit to point at a business owner.
                */}
              {waProbe && !waProbe.unreachable && (waProbe.missing?.length || waProbe.warnings?.length) ? (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3.5 ml-8">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                    Meta reports this WhatsApp setup is not ready for real businesses
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {(waProbe.missing ?? []).map((m) => (
                      <li key={m} className="text-[11px] text-amber-800 dark:text-amber-200">• {m}</li>
                    ))}
                    {(waProbe.warnings ?? []).map((w) => (
                      <li key={w} className="text-[11px] text-amber-800 dark:text-amber-200">• {w}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                    Checked live against Meta. Nothing was sent to anybody to find this out.
                  </p>
                </div>
              ) : null}

              {/*
                * Can this platform ever learn whether a message arrived?
                *
                * `sent` means the Cloud API accepted the request, nothing
                * more. Until the delivery webhook is wired, that is the last
                * thing we ever hear, and the table below would show a green
                * "sent" for a message that was silently dropped.
                */}
              {waProbe?.deliveryWebhook && (
                <div className={`rounded-xl border p-3.5 ml-8 ${
                  waProbe.deliveryWebhook.appSecretSet
                    && waProbe.deliveryWebhook.verifyTokenSet
                    && waProbe.deliveryWebhook.wabaSubscribed === true
                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'
                }`}>
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                    Delivery reporting
                  </p>
                  <p className="mt-1 text-[11px] text-gray-700 dark:text-gray-300">
                    {waProbe.deliveryWebhook.note}
                  </p>
                  <ul className="mt-2 space-y-0.5 text-[11px] text-gray-600 dark:text-gray-400">
                    <li>• App secret: {waProbe.deliveryWebhook.appSecretSet ? 'set' : 'not set'}</li>
                    <li>• Verify token: {waProbe.deliveryWebhook.verifyTokenSet ? 'set' : 'not set'}</li>
                    <li>
                      {/* Three states, not two: unknown is not "no". */}
                      • WhatsApp account subscribed to the app: {
                        waProbe.deliveryWebhook.wabaSubscribed === null
                          ? 'could not check'
                          : waProbe.deliveryWebhook.wabaSubscribed ? 'yes' : 'no'
                      }
                    </li>
                  </ul>
                </div>
              )}

              {/*
                * Capped, not broken.
                *
                * Business verification pending limits the messaging tier and
                * nothing else: the number is verified, the template approved,
                * and a real welcome was accepted by Meta on 2026-10-09 while
                * this was outstanding. It used to be filed as a warning, which
                * made the amber box above announce the setup was "not ready
                * for real businesses" directly over body text reading
                * "nothing to do but wait". Same claim-outlives-fact shape this
                * panel exists to catch, so it is reported in its own voice.
                */}
              {waProbe && !waProbe.unreachable && (waProbe.advisories?.length ?? 0) > 0 ? (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3.5 ml-8">
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                    Sending works — Meta is still capping how far it reaches
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {(waProbe.advisories ?? []).map((a) => (
                      <li key={a} className="text-[11px] text-gray-700 dark:text-gray-300">• {a}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/*
                * Email, checked rather than declared. This row read
                * "not configured" unconditionally for as long as it existed,
                * including after the key was set — so it told an operator to
                * fix something that was already done.
                */}
              <SetupRow
                title="Brand-kit email"
                ok={emailProbe?.configured}
                unknown={!emailProbe || emailProbe.unreachable}
                detail={
                  !emailProbe
                    ? 'Checking whether a provider key is set…'
                    : emailProbe.unreachable
                      ? 'Could not reach the self-test, so the state of email is unknown. It is not safe to assume either way.'
                      : emailProbe.configured
                        ? `A provider key is set and mail would be sent from ${emailProbe.from}. A key alone does not prove delivery — send the test below to prove it end to end.`
                        : 'Optional — RESEND_API_KEY + RESEND_FROM powers the full welcome email. The WhatsApp and Instagram welcomes work without it.'
                }
              />

              {emailProbe?.configured && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 ml-8">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {/* Stated before the click: this sends real mail, and only to you. */}
                      Sends one real email to <strong className="text-gray-700 dark:text-gray-300">{emailProbe.canSendTo ?? 'your own address'}</strong>.
                      It can only send to you — no other recipient is possible.
                    </p>
                    <button
                      onClick={() => void runEmailTest()}
                      disabled={emailTesting}
                      className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50 min-h-[44px]"
                    >
                      {emailTesting ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                      {emailTesting ? 'Sending…' : 'Send test email'}
                    </button>
                  </div>

                  {emailTest && (
                    <div className={`mt-3 rounded-lg p-3 text-xs ${
                      emailTest.ok
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100'
                        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100'
                    }`}>
                      <p className="font-semibold">
                        {emailTest.ok ? 'Accepted by the provider' : 'The provider refused it'}
                      </p>
                      <p className="mt-1">{emailTest.reason}</p>
                      {/*
                        * The provider's own words. `resend 403` is not
                        * actionable; "the domain is not verified" is, and it
                        * names a five-minute DNS fix.
                        */}
                      {emailTest.providerMessage && (
                        <p className="mt-1.5 font-mono text-[11px] opacity-80 break-words">
                          {emailTest.providerMessage}
                        </p>
                      )}
                      {emailTest.ok && (
                        <p className="mt-1.5 opacity-80">
                          Accepted is not the same as delivered — check the inbox to close the loop.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Clock size={17} className="text-violet-600 dark:text-violet-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Automatic pipeline</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                Triggered by every new business registration, drained by the 15-minute cron. Showing the most recent {autoRows?.length ?? '—'} rows.
              </p>
            </div>
            <div className="p-5">
              {loading && !pipeline ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                    {pipelineChecks.map((c) => (
                      <div key={c.label} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
                        <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{c.label}</div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{c.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 mb-4">
                    <span className="inline-flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300">
                      <Clock size={14} /> {pipeline?.queued ?? 0} waiting (queued / needs provider / needs template)
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm text-green-700 dark:text-green-300">
                      <CheckCircle2 size={14} /> {pipeline?.sent ?? 0} sent
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm text-rose-700 dark:text-rose-300">
                      <XCircle size={14} /> {pipeline?.blocked ?? 0} terminal refusals
                    </span>
                  </div>
                  {!autoRows?.length ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No queue rows yet — every new registration appears here on arrival.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 dark:text-gray-500 text-left">
                            <th className="pb-2 font-medium">Business</th>
                            <th className="pb-2 font-medium">Contact</th>
                            <th className="pb-2 font-medium">Status</th>
                            <th className="pb-2 font-medium">Why</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {autoRows.map((r) => (
                            <tr key={r.id}>
                              <td className="py-2 pr-3">
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                    r.channel === 'instagram'
                                      ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-200'
                                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                  }`}>{CHANNEL_LABEL[r.channel] ?? r.channel}</span>
                                  <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{r.business_id.slice(0, 8)}</span>
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{r.phone ?? (r.handle ? `@${r.handle}` : '—')}</td>
                              <td className="py-2 pr-3"><StatusChip status={r.status} /></td>
                              <td className="py-2 pr-3 text-xs text-gray-500 dark:text-gray-400 max-w-[220px] truncate">{r.reason ?? r.error ?? ''}</td>
                              <td className="py-2 text-right">
                                {!RETRYABLE.has(r.status) && r.status !== 'sent' && (
                                  <button
                                    onClick={() => requeue(r.id)}
                                    disabled={requeueing === r.id}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition"
                                  >
                                    <Clock size={12} />
                                    Requeue
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Phone size={17} className="text-violet-600 dark:text-violet-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Manual sends</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                Every welcome sent from this console, with its honest outcome per channel. Sending again for the same number is allowed — dedupe is only automatic for the trigger path.
              </p>
            </div>
            <div className="p-5">
              {loading && !manualRows ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
              ) : !manualRows?.length ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No manual sends yet. Use the form to send the first one.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 dark:text-gray-500 text-left">
                        <th className="pb-2 font-medium">Business</th>
                        <th className="pb-2 font-medium">Contact</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Why</th>
                        <th className="pb-2 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {manualRows.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                r.channel === 'instagram'
                                  ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-200'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                              }`}>{CHANNEL_LABEL[r.channel] ?? r.channel}</span>
                              <span className="font-medium text-gray-800 dark:text-gray-200">{r.business_name}</span>
                            </div>
                            {r.owner_name && <div className="mt-0.5 pl-8 text-xs text-gray-400 dark:text-gray-500">{r.owner_name}</div>}
                          </td>
                          <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{r.email ?? r.phone ?? (r.handle ? `@${r.handle}` : '—')}</td>
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <StatusChip status={r.status} />
                              <DeliveryChip status={r.delivery_status} sent={r.status === 'sent'} />
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-xs text-gray-500 dark:text-gray-400 max-w-[280px]">
                            <div className="truncate">{r.failure_detail ?? r.reason ?? r.error ?? ''}</div>
                            {/*
                              * Meta's sentence says what happened; this says
                              * what to do. 131042 reads like a suspension and
                              * is a missing payment method.
                              */}
                            {r.failure_advice && (
                              <div className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300 whitespace-normal">
                                {r.failure_advice}
                              </div>
                            )}
                          </td>
                          <td className="py-2 text-xs text-gray-400 dark:text-gray-500">{new Date(r.sent_at ?? r.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            {/*
              * Replies from owners, via the wa.me links.
              *
              * The table and the webhook that fills it existed before this
              * did, which is how the claim funnel once looked dead for weeks:
              * every part of the chain worked and nothing rendered the result.
              *
              * Outbound templates are blocked by billing (Meta code 131042),
              * so for now this is the ONLY WhatsApp direction that reaches
              * anybody — which makes it the more important of the two lists.
              */}
            <div className="mt-6">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Replies from owners</h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Messages people sent us from a “Message us on WhatsApp” link. Free to receive, and they open a window we can answer in.
              </p>

              {repliesProblem && (
                <p className="mt-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-[12px] text-amber-800 dark:text-amber-200">
                  Could not read the replies: {repliesProblem}
                </p>
              )}

              {/* Empty is a fact, not a failure. Say which. */}
              {!repliesProblem && replies?.length === 0 && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Nobody has written in yet. The links are live on the claim dialog and in the welcome email.
                </p>
              )}

              {!repliesProblem && replies && replies.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {replies.map((r) => (
                    <li key={r.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {r.sender_name ?? r.from_phone}
                          {r.sender_name && <span className="ml-1.5 font-normal text-gray-400">{r.from_phone}</span>}
                        </span>
                        <span className="text-[11px] text-gray-400">{new Date(r.received_at).toLocaleString()}</span>
                      </div>
                      {r.body && <p className="mt-1 text-[12px] text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{r.body}</p>}
                      <div className="mt-1.5 text-[11px]">
                        {r.business_name ? (
                          <span className="text-emerald-700 dark:text-emerald-300">About {r.business_name}</span>
                        ) : (
                          /*
                           * The row most worth seeing: somebody wrote in and
                           * we could not tell which listing they meant.
                           */
                          <span className="text-amber-700 dark:text-amber-300">
                            {r.reference
                              ? `Reference ${r.reference} did not match a listing`
                              : 'No listing reference in this message'}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}