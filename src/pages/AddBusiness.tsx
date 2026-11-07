import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Globe2, Loader2,
  LogIn, MapPin, Share2, ShieldCheck, Sparkles, Store, Users,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { applySeo, SITE_URL } from '../lib/seo';
import { track } from '../lib/telemetry';
import { readSource } from '../lib/acquisition';
import { registerLinkTo, signInLinkTo } from '../lib/safeNext';
import { BUSINESS_CATEGORY_GROUPS } from '../data/categories';
import {
  SUBMISSION_TYPES, RELATIONSHIPS, BUSINESS_TYPES, stepsFor, stepError,
  consentError, CONSENT_LABEL, requiredConsents, toPayload, readCampaign,
  isSafeCampaignValue, resultHeadline, resultDetail, completeness, nextBestAction,
  submissionTypeSpec, EMPTY_CONSENTS,
  type SubmissionDraft, type SubmissionType, type Consents, type SubmissionResult,
} from '../lib/addBusiness';

/**
 * ADD YOUR BUSINESS — nowopenafrica.com/add-business
 *
 * One link, shareable anywhere: a WhatsApp status, an Instagram bio, a QR code
 * on a flyer, an outreach email. It is the public half of the acquisition
 * story — NowOpen discovers businesses, and businesses put themselves forward.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not publish on submit and it does not grant ownership. Both are
 * deliberate and both are enforced in the database, not here:
 * `submit_business()` states `profile_state` explicitly (the column DEFAULTS to
 * 'published', so anything that forgets it publishes instantly) and sets
 * `claim_status = 'claim_pending'`, because the person said they own it and
 * nobody has checked yet.
 *
 * A recommendation creates NO business at all. RLS on `businesses` requires
 * `auth.uid() = user_id` for an insert, so somebody adding a business they do
 * not own could not create one even if this page asked it to; it becomes a
 * radar_candidate in the queue a human already reads. That is the same rule
 * /send-business states in its own comment, and it is the reason the directory
 * can be trusted at all.
 *
 * THE AUTH GATE HOLDS THE FORM, NOT THE OTHER WAY ROUND
 *
 * Anyone may fill this in. Only a signed-in person may submit it. The draft is
 * saved server-side per user and in localStorage before that, so being sent to
 * sign in never costs the answers already given — that hand-off is where this
 * kind of form normally loses people.
 */

const PATH = '/add-business';
const CONSENT_VERSION = 'v1';

type Phase = 'landing' | 'form' | 'done';

interface Match {
  id: string;
  name: string;
  username: string | null;
  location: string | null;
  claim_status: string | null;
  match_reason: string;
}

const DRAFT_KEY = 'nowopen.addBusiness.draft';

const emptyDraft: SubmissionDraft = {
  submission_type: 'owner',
  name: '',
  category: '',
  languages: [],
  social_links: {},
};

export default function AddBusiness() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('landing');
  const [draft, setDraft] = useState<SubmissionDraft>(emptyDraft);
  const [consents, setConsents] = useState<Consents>(EMPTY_CONSENTS);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesFor, setMatchesFor] = useState<string>('');
  const [dismissedMatches, setDismissedMatches] = useState(false);

  /*
   * One key per attempt, generated once. `submit_business` returns the existing
   * business for a key it has already seen, so a double-tapped button on a slow
   * connection is one business rather than two.
   */
  const idempotencyKey = useRef<string>(
    (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()),
  );

  // Read once on arrival: navigation may replace the query string later.
  const attribution = useMemo(() => {
    const campaignRaw = new URLSearchParams(location.search).get('campaign');
    return {
      source: readSource(location.search, document.referrer),
      // A campaign slug carrying an email or a phone number is refused rather
      // than trimmed: it should never have been put in a shareable URL.
      campaign: isSafeCampaignValue(campaignRaw) ? readCampaign(location.search) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => applySeo({
    title: 'Add your business — free NowOpen Africa profile',
    description:
      'Put your business on the map. Create a free NowOpen profile so customers across Africa can find your services, products and opening hours.',
    path: PATH,
    image: '/og-image.png',
  }), []);

  // ── Draft persistence ─────────────────────────────────────────────────
  //
  // localStorage first so an unauthenticated visitor loses nothing at the sign-in
  // hand-off; the server copy then survives a different device entirely.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { draft?: SubmissionDraft; step?: number };
        if (parsed.draft?.name || parsed.draft?.category) {
          setDraft({ ...emptyDraft, ...parsed.draft });
          setStepIndex(parsed.step ?? 0);
          setPhase('form');
        }
      }
    } catch { /* a blocked or full localStorage is not a reason to fail the page */ }
  }, []);

  useEffect(() => {
    if (phase !== 'form') return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, step: stepIndex }));
    } catch { /* ignore */ }
  }, [draft, stepIndex, phase]);

  // Server-side draft, once there is a user to attach it to.
  useEffect(() => {
    if (!user || phase !== 'form') return;
    const id = setTimeout(() => {
      void supabase.from('business_submission_drafts').upsert({
        user_id: user.id,
        payload: draft as unknown as Record<string, unknown>,
        step: stepIndex,
        source: attribution.source,
        campaign: attribution.campaign,
        updated_at: new Date().toISOString(),
      });
    }, 1200);
    return () => clearTimeout(id);
  }, [user, draft, stepIndex, phase, attribution]);

  const steps = useMemo(() => stepsFor(draft.submission_type), [draft.submission_type]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const set = <K extends keyof SubmissionDraft>(k: K, v: SubmissionDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  // ── Duplicate check ───────────────────────────────────────────────────
  /*
   * Returns the matches as well as storing them.
   *
   * The caller needs the answer in the SAME tick to decide whether to hold the
   * user on this step. Reading `matches` from state instead would read the
   * value from the render that is already on screen -- still empty -- so the
   * warning would never appear on the click that found it, only if the user
   * happened to come back to this step later.
   */
  const checkMatches = useCallback(async (): Promise<Match[]> => {
    const name = (draft.name ?? '').trim();
    if (name.length < 3) return [];
    if (name === matchesFor) return matches;
    const { data } = await supabase.rpc('find_business_matches', {
      p_name: name,
      p_phone: draft.phone ?? null,
      p_website: draft.website ?? null,
      p_limit: 4,
    });
    const found = (data as Match[] | null) ?? [];
    setMatchesFor(name);
    setMatches(found);
    return found;
  }, [draft.name, draft.phone, draft.website, matchesFor, matches]);

  const advance = async () => {
    const problem = stepError(step.key, draft);
    if (problem) { toast.error(problem); return; }
    if (step.key === 'identity') {
      const found = await checkMatches();
      // Give them the chance to claim instead of duplicating — once.
      if (found.length > 0 && !dismissedMatches) return;
    }
    if (stepIndex + 1 < steps.length) {
      setStepIndex(stepIndex + 1);
      track('add_business_step', { step: steps[stepIndex + 1].key, type: draft.submission_type });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const submit = async () => {
    const problem = consentError(draft.submission_type, draft, consents);
    if (problem) { toast.error(problem); return; }

    /*
     * The auth gate. Client state alone is never trusted — `submit_business`
     * reads auth.uid() and refuses an anonymous caller — but checking here
     * means the user is sent to sign in BEFORE losing anything, and comes back
     * to this exact page with the draft intact.
     */
    if (!user) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, step: stepIndex })); } catch { /* ignore */ }
      toast('Create an account to save, manage and verify your business profile.', { icon: '🔐' });
      navigate(registerLinkTo(PATH + location.search));
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.rpc('submit_business', {
      p_payload: toPayload(draft),
      p_submission_type: draft.submission_type,
      p_consents: { ...consents, consent_text_version: CONSENT_VERSION },
      p_idempotency_key: idempotencyKey.current,
      p_source: attribution.source,
      p_campaign: attribution.campaign,
    });
    setBusy(false);

    if (error) { toast.error(error.message); return; }

    const res = (data ?? {}) as SubmissionResult;
    setResult(res);
    setPhase('done');
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    track('business_submitted', {
      type: draft.submission_type,
      source: attribution.source,
      campaign: attribution.campaign,
    });
    window.scrollTo({ top: 0 });
  };

  if (phase === 'done' && result) {
    return <Done result={result} draft={draft} onAnother={() => {
      setDraft(emptyDraft); setConsents(EMPTY_CONSENTS); setStepIndex(0);
      setResult(null); setMatches([]); setMatchesFor(''); setDismissedMatches(false);
      idempotencyKey.current = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
      setPhase('form');
    }} />;
  }

  if (phase === 'landing') {
    return <Landing onStart={() => { setPhase('form'); track('add_business_started', attribution); }} />;
  }

  // ── The form ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="flex items-center justify-between text-[12px] font-semibold text-gray-500 dark:text-gray-400">
            <span>Step {stepIndex + 1} of {steps.length}</span>
            <span>{step.title}</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-nowopen-500 transition-all"
              style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-7 shadow-sm">
          {step.key === 'type' && (
            <StepType value={draft.submission_type} relationship={draft.relationship}
              onChange={(t) => { set('submission_type', t); setStepIndex(0); }}
              onRelationship={(r) => set('relationship', r)} />
          )}

          {step.key === 'identity' && (
            <StepIdentity draft={draft} set={set} matches={matches}
              dismissed={dismissedMatches} onDismiss={() => setDismissedMatches(true)} />
          )}

          {step.key === 'about' && <StepAbout draft={draft} set={set} />}
          {step.key === 'contact' && <StepContact draft={draft} set={set} />}
          {step.key === 'hours' && <StepHours draft={draft} set={set} />}
          {step.key === 'media' && <StepMedia draft={draft} set={set} />}

          {step.key === 'review' && (
            <StepReview draft={draft} consents={consents} setConsents={setConsents}
              signedIn={!!user} />
          )}

          <div className="mt-7 flex items-center gap-3 border-t border-gray-100 dark:border-gray-700 pt-5">
            <button
              onClick={() => (stepIndex === 0 ? setPhase('landing') : setStepIndex(stepIndex - 1))}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <ArrowLeft size={15} /> Back
            </button>

            {step.key === 'review' ? (
              <button
                onClick={() => void submit()}
                disabled={busy}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-nowopen-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-nowopen-600 disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {user ? 'Create my business profile' : 'Sign in to submit'}
              </button>
            ) : (
              <button
                onClick={() => void advance()}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-nowopen-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-nowopen-600"
              >
                Continue <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>

        {!user && (
          <p className="mt-4 text-center text-[12px] text-gray-500 dark:text-gray-400">
            You can fill this in now. You will be asked to sign in before it is submitted —
            nothing you have typed is lost.
          </p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Landing
// ═══════════════════════════════════════════════════════════════════════

function Landing({ onStart }: { onStart: () => void }) {
  const points = [
    { icon: Globe2, text: 'Reach customers across Africa' },
    { icon: Store, text: 'Showcase services and products' },
    { icon: Building2, text: 'Manage your profile from one dashboard' },
    { icon: ShieldCheck, text: 'Update your information anytime' },
  ];
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-14 sm:py-20 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-nowopen-500/10 px-3.5 py-1.5 text-[12px] font-bold text-nowopen-600 dark:text-nowopen-300">
          <Sparkles size={13} /> Free to get started
        </span>

        <h1 className="mt-5 text-3xl sm:text-5xl font-black tracking-tight text-gray-900 dark:text-white">
          Put Your Business on the Map
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg text-gray-600 dark:text-gray-300">
          Your business deserves to be found. Create your free NowOpen profile and help customers
          discover your business, services, products and offers across Africa.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onStart}
            className="w-full sm:w-auto rounded-xl bg-nowopen-500 px-8 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-nowopen-600"
          >
            Add Your Business
          </button>
          <Link
            to="/businesses"
            className="w-full sm:w-auto rounded-xl border border-gray-300 dark:border-gray-600 px-8 py-3.5 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800"
          >
            Already listed? Claim your business
          </Link>
        </div>

        <ul className="mx-auto mt-12 grid max-w-xl grid-cols-1 sm:grid-cols-2 gap-3 text-left">
          {points.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.text} className="flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
                <Icon size={16} className="shrink-0 text-nowopen-500" />
                <span className="text-[13px] font-medium text-gray-700 dark:text-gray-200">{p.text}</span>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-[12px] text-gray-500 dark:text-gray-400">
          Free to get started. You can update your business information anytime.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Steps
// ═══════════════════════════════════════════════════════════════════════

const label = 'block text-[13px] font-semibold text-gray-700 dark:text-gray-200 mb-1.5';
const input = 'w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3.5 py-2.5 text-sm focus:border-nowopen-500 focus:outline-none focus:ring-1 focus:ring-nowopen-500';

function Field({ id, title, hint, children }: {
  id: string; title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={label}>{title}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

function StepType({ value, relationship, onChange, onRelationship }: {
  value: SubmissionType;
  relationship?: string;
  onChange: (t: SubmissionType) => void;
  onRelationship: (r: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading title="What are you adding?"
        sub="This decides who the profile belongs to, so it is worth getting right." />
      <div className="space-y-2.5">
        {SUBMISSION_TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            aria-pressed={value === t.key}
            className={`w-full rounded-xl border p-4 text-left transition ${
              value === t.key
                ? 'border-nowopen-500 bg-nowopen-500/5 ring-1 ring-nowopen-500'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
              {t.key === 'owner' && <Store size={15} />}
              {t.key === 'representative' && <Users size={15} />}
              {t.key === 'recommendation' && <MapPin size={15} />}
              {t.label}
            </span>
            <span className="mt-1 block text-[12px] text-gray-600 dark:text-gray-300">{t.blurb}</span>
            <span className="mt-1.5 block text-[11px] text-gray-500 dark:text-gray-400">{t.outcome}</span>
          </button>
        ))}
      </div>

      {value === 'representative' && (
        <Field id="relationship" title="How are you connected to this business?">
          <select id="relationship" className={input} value={relationship ?? ''}
            onChange={(e) => onRelationship(e.target.value)}>
            <option value="">Choose…</option>
            {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
      )}
    </div>
  );
}

function StepIdentity({ draft, set, matches, dismissed, onDismiss }: {
  draft: SubmissionDraft;
  set: <K extends keyof SubmissionDraft>(k: K, v: SubmissionDraft[K]) => void;
  matches: Match[];
  dismissed: boolean;
  onDismiss: () => void;
}) {
  const isRec = draft.submission_type === 'recommendation';
  // The category list is grouped, and 250 flat options in a phone's select
  // wheel is unusable. Rendering the groups as <optgroup> keeps it navigable.
  return (
    <div className="space-y-4">
      <Heading title="Business identity"
        sub={isRec ? 'Just the basics — you are telling us it exists, not writing its profile.' : 'How customers will recognise it.'} />

      <Field id="name" title="Business name">
        <input id="name" className={input} value={draft.name}
          onChange={(e) => set('name', e.target.value)} placeholder="e.g. Duchess Clinic" />
      </Field>

      {matches.length > 0 && !dismissed && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-[13px] font-bold text-amber-900 dark:text-amber-200">
            We found a possible existing profile for this business.
          </p>
          <ul className="mt-2.5 space-y-2">
            {matches.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                <span className="font-semibold text-gray-900 dark:text-white">{m.name}</span>
                {m.location && <span className="text-gray-600 dark:text-gray-300">{m.location}</span>}
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                  {m.match_reason}
                </span>
                {m.username && (
                  <Link to={`/${m.username}`} className="text-nowopen-600 font-semibold hover:underline">
                    View profile
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={onDismiss}
              className="rounded-lg border border-amber-300 dark:border-amber-700 px-3 py-1.5 text-[12px] font-semibold text-amber-900 dark:text-amber-200">
              This is a different business
            </button>
          </div>
          <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300">
            If one of these is yours, claiming it keeps its history and reviews — better than
            starting again.
          </p>
        </div>
      )}

      {!isRec && (
        <Field id="business_type" title="Business type">
          <select id="business_type" className={input} value={draft.business_type ?? ''}
            onChange={(e) => set('business_type', e.target.value)}>
            <option value="">Choose…</option>
            {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="country" title="Country">
          <input id="country" className={input} value={draft.country ?? ''}
            onChange={(e) => set('country', e.target.value)} placeholder="Nigeria" />
        </Field>
        <Field id="city" title="City">
          <input id="city" className={input} value={draft.city ?? ''}
            onChange={(e) => set('city', e.target.value)} placeholder="Lagos" />
        </Field>
      </div>

      {!isRec && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="category" title="Category">
            <select id="category" className={input} value={draft.category}
              onChange={(e) => set('category', e.target.value)}>
              <option value="">Choose…</option>
              {BUSINESS_CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((c) => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field id="subcategory" title="What you are known for" hint="Optional — a few words.">
            <input id="subcategory" className={input} value={draft.subcategory ?? ''}
              onChange={(e) => set('subcategory', e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}

function StepAbout({ draft, set }: {
  draft: SubmissionDraft;
  set: <K extends keyof SubmissionDraft>(k: K, v: SubmissionDraft[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading title="About the business" sub="In your own words. Short is fine." />
      <Field id="tagline" title="Slogan or tagline" hint="One line people will remember.">
        <input id="tagline" className={input} value={draft.tagline ?? ''}
          onChange={(e) => set('tagline', e.target.value)} maxLength={120} />
      </Field>
      <Field id="description" title="Short description">
        <textarea id="description" className={input} rows={2} maxLength={300}
          value={draft.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <Field id="about" title="About" hint="What you do, who you do it for, what makes it worth choosing.">
        <textarea id="about" className={input} rows={5} maxLength={2000}
          value={draft.about ?? ''} onChange={(e) => set('about', e.target.value)} />
      </Field>
      <Field id="service_area" title="Service area" hint="Where you serve, if you travel to customers.">
        <input id="service_area" className={input} value={draft.service_area ?? ''}
          onChange={(e) => set('service_area', e.target.value)} placeholder="Lagos Mainland and Island" />
      </Field>
    </div>
  );
}

function StepContact({ draft, set }: {
  draft: SubmissionDraft;
  set: <K extends keyof SubmissionDraft>(k: K, v: SubmissionDraft[K]) => void;
}) {
  const isRec = draft.submission_type === 'recommendation';
  return (
    <div className="space-y-4">
      <Heading title="Contact and location"
        sub={isRec ? 'Anything you know. One is enough.' : 'How customers reach you.'} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="phone" title="Business phone">
          <input id="phone" className={input} value={draft.phone ?? ''} inputMode="tel"
            onChange={(e) => set('phone', e.target.value)} placeholder="+234 801 234 5678" />
        </Field>
        <Field id="whatsapp" title="WhatsApp number">
          <input id="whatsapp" className={input} value={draft.whatsapp ?? ''} inputMode="tel"
            onChange={(e) => set('whatsapp', e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="email" title="Business email">
          <input id="email" className={input} type="email" value={draft.email ?? ''}
            onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field id="website" title="Website">
          <input id="website" className={input} value={draft.website ?? ''}
            onChange={(e) => set('website', e.target.value)} placeholder="example.com" />
        </Field>
      </div>

      <Field id="address" title="Physical address">
        <input id="address" className={input} value={draft.address ?? ''}
          onChange={(e) => set('address', e.target.value)} />
      </Field>

      {!isRec && (
        <fieldset className="rounded-xl border border-gray-200 dark:border-gray-600 p-4">
          <legend className="px-1.5 text-[12px] font-bold text-gray-700 dark:text-gray-200">
            What may we show publicly?
          </legend>
          {/*
            * Everything here is OFF by default, and anything left off is removed
            * from the payload in the browser rather than stored and hidden. For a
            * sole trader the business phone IS the personal phone, and publishing
            * one because a box was left alone is not a mistake worth risking.
            */}
          <p className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">
            Nothing is published unless you tick it. Anything left unticked is not sent to us at all.
          </p>
          <div className="space-y-2">
            <Toggle id="show_phone" checked={!!draft.show_phone}
              onChange={(v) => set('show_phone', v)} text="Show phone publicly" />
            <Toggle id="show_whatsapp" checked={!!draft.show_whatsapp}
              onChange={(v) => set('show_whatsapp', v)} text="Show WhatsApp button" />
            <Toggle id="show_email" checked={!!draft.show_email}
              onChange={(v) => set('show_email', v)} text="Show email publicly" />
            <Toggle id="show_full_address" checked={!!draft.show_full_address}
              onChange={(v) => set('show_full_address', v)} text="Show the full address" />
          </div>
        </fieldset>
      )}
    </div>
  );
}

function StepHours({ draft, set }: {
  draft: SubmissionDraft;
  set: <K extends keyof SubmissionDraft>(k: K, v: SubmissionDraft[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading title="Hours and availability" sub="Opening hours are the single most searched thing on NowOpen." />
      <Field id="opening_hours" title="Opening hours"
        hint="Plain text is fine — e.g. Mon–Sat 9am–6pm, Sun closed.">
        <textarea id="opening_hours" className={input} rows={3} value={draft.opening_hours ?? ''}
          onChange={(e) => set('opening_hours', e.target.value)} />
      </Field>
      <div className="space-y-2">
        <Toggle id="is_24_hours" checked={!!draft.is_24_hours}
          onChange={(v) => set('is_24_hours', v)} text="Open 24 hours" />
        <Toggle id="appointment_only" checked={!!draft.appointment_only}
          onChange={(v) => set('appointment_only', v)} text="By appointment only" />
        <Toggle id="temporarily_closed" checked={!!draft.temporarily_closed}
          onChange={(v) => set('temporarily_closed', v)} text="Temporarily closed" />
      </div>
      {/*
        * Says out loud what the platform will and will not claim on their behalf.
        * Hours submitted here are recorded as submitted-by-the-owner, never as
        * verified: a "verified hours" badge nobody checked is exactly the kind of
        * false confidence that makes a directory useless.
        */}
      <p className="rounded-xl bg-gray-50 dark:bg-gray-900 px-4 py-3 text-[11px] text-gray-500 dark:text-gray-400">
        Hours you enter are shown as provided by you, not as verified. They become owner-confirmed
        once your ownership is verified.
      </p>
    </div>
  );
}

function StepMedia({ draft, set }: {
  draft: SubmissionDraft;
  set: <K extends keyof SubmissionDraft>(k: K, v: SubmissionDraft[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <Heading title="Logo and cover" sub="Optional — but a profile with an image gets noticeably more visits." />
      <Field id="logo_url" title="Logo URL" hint="Paste a link for now; you can upload from your dashboard after submitting.">
        <input id="logo_url" className={input} value={draft.logo_url ?? ''}
          onChange={(e) => set('logo_url', e.target.value)} placeholder="https://…" />
      </Field>
      <Field id="image_url" title="Cover image URL">
        <input id="image_url" className={input} value={draft.image_url ?? ''}
          onChange={(e) => set('image_url', e.target.value)} placeholder="https://…" />
      </Field>
      <p className="rounded-xl bg-gray-50 dark:bg-gray-900 px-4 py-3 text-[11px] text-gray-500 dark:text-gray-400">
        Use images of this business only. Stock photos, competitor images, celebrity photos and
        unrelated pictures are removed — a cover that is not the business is worse than no cover.
      </p>
    </div>
  );
}

function StepReview({ draft, consents, setConsents, signedIn }: {
  draft: SubmissionDraft;
  consents: Consents;
  setConsents: (c: Consents) => void;
  signedIn: boolean;
}) {
  const spec = submissionTypeSpec(draft.submission_type);
  const required = requiredConsents(draft.submission_type, draft);
  const score = completeness(draft);

  const rows: Array<[string, string | undefined]> = [
    ['Name', draft.name],
    ['Type', spec.label],
    ['Category', draft.category],
    ['Location', [draft.city, draft.country].filter(Boolean).join(', ')],
    ['Phone', draft.show_phone ? draft.phone : draft.phone ? 'kept private' : undefined],
    ['Email', draft.show_email ? draft.email : draft.email ? 'kept private' : undefined],
    ['Address', draft.show_full_address ? draft.address : draft.address ? 'kept private' : undefined],
    ['Website', draft.website],
    ['Hours', draft.is_24_hours ? 'Open 24 hours' : draft.opening_hours],
  ];

  return (
    <div className="space-y-5">
      <Heading title="Review and submit" sub={spec.outcome} />

      <dl className="divide-y divide-gray-100 dark:divide-gray-700 rounded-xl border border-gray-100 dark:border-gray-700">
        {rows.filter(([, v]) => (v ?? '').trim()).map(([k, v]) => (
          <div key={k} className="flex gap-3 px-3.5 py-2 text-[12px]">
            <dt className="w-28 shrink-0 font-semibold text-gray-500 dark:text-gray-400">{k}</dt>
            <dd className="text-gray-900 dark:text-white break-words">{v}</dd>
          </div>
        ))}
      </dl>

      {draft.submission_type !== 'recommendation' && (
        <div className="rounded-xl bg-gray-50 dark:bg-gray-900 px-4 py-3">
          <div className="flex items-center justify-between text-[12px] font-semibold">
            <span className="text-gray-600 dark:text-gray-300">Profile completeness</span>
            <span className="tabular-nums text-gray-900 dark:text-white">{score}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${score}%` }} />
          </div>
        </div>
      )}

      <fieldset className="space-y-2.5">
        <legend className="text-[13px] font-bold text-gray-900 dark:text-white mb-1">
          Before you submit
        </legend>
        {(Object.keys(CONSENT_LABEL) as (keyof Consents)[])
          .filter((k: keyof Consents) => required.includes(k) || k === 'review_understood')
          .map((k) => (
            <Toggle
              key={k}
              id={k}
              checked={consents[k]}
              onChange={(v) => setConsents({ ...consents, [k]: v })}
              text={CONSENT_LABEL[k] + (required.includes(k) ? '' : ' (optional)')}
            />
          ))}
      </fieldset>

      {!signedIn && (
        <p className="flex items-start gap-2 rounded-xl border border-nowopen-500/30 bg-nowopen-500/5 px-4 py-3 text-[12px] text-gray-700 dark:text-gray-200">
          <LogIn size={14} className="mt-0.5 shrink-0 text-nowopen-500" />
          <span>
            <strong className="font-bold">Sign in to continue.</strong> Create an account or sign in
            to save your information, submit your business and manage your profile afterwards.
            Everything you have typed is kept.{' '}
            <Link to={signInLinkTo(PATH)} className="font-semibold text-nowopen-600 hover:underline">
              I already have an account
            </Link>
          </span>
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Confirmation
// ═══════════════════════════════════════════════════════════════════════

function Done({ result, draft, onAnother }: {
  result: SubmissionResult; draft: SubmissionDraft; onAnother: () => void;
}) {
  const url = result.username ? `${SITE_URL}/${result.username}` : null;
  const next = nextBestAction(draft);
  const isRecommendation = !!result.candidate_id && !result.business_id;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-12">
      <div className="mx-auto max-w-xl text-center">
        <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
        <h1 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
          {resultHeadline(result)}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-gray-600 dark:text-gray-300">
          {resultDetail(result)}
        </p>

        {!isRecommendation && (
          <dl className="mt-7 space-y-px overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-left">
            <Row k="Business" v={draft.name} />
            {url && <Row k="Profile URL" v={url} />}
            <Row k="Status" v={result.profile_state === 'published' ? 'Published' : 'Awaiting review'} />
            <Row k="Ownership" v="Claim pending — not yet verified" />
            <Row k="Verification" v="Unverified" />
            <Row k="Completeness" v={`${completeness(draft)}%`} />
          </dl>
        )}

        {next && !isRecommendation && (
          <p className="mt-4 rounded-xl bg-nowopen-500/5 px-4 py-3 text-[12px] text-gray-700 dark:text-gray-200">
            <strong className="font-bold">Next: </strong>{next}
          </p>
        )}

        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          {url && (
            <Link to={`/${result.username}`}
              className="rounded-xl bg-nowopen-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-nowopen-600">
              View business profile
            </Link>
          )}
          {!isRecommendation && (
            <Link to="/dashboard"
              className="rounded-xl border border-gray-300 dark:border-gray-600 px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800">
              Complete profile
            </Link>
          )}
          <button onClick={onAnother}
            className="rounded-xl border border-gray-300 dark:border-gray-600 px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800">
            Add another business
          </button>
          {url && (
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${draft.name} is on NowOpen Africa: ${url}`)}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 dark:border-gray-600 px-5 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800">
              <Share2 size={14} /> Share
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return (
    <div className="flex gap-3 px-4 py-2.5 text-[12px]">
      <dt className="w-28 shrink-0 font-semibold text-gray-500 dark:text-gray-400">{k}</dt>
      <dd className="break-words text-gray-900 dark:text-white">{v}</dd>
    </div>
  );
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h2 className="text-lg font-black text-gray-900 dark:text-white">{title}</h2>
      {sub && <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  );
}

function Toggle({ id, checked, onChange, text }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; text: string;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-2.5 text-[12px] text-gray-700 dark:text-gray-200 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-nowopen-500 focus:ring-nowopen-500"
      />
      <span>{text}</span>
    </label>
  );
}
