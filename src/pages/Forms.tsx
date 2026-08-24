import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowRight, ArrowLeft, Check, CheckCircle2, Loader2,
  Paperclip, ShieldCheck, Sparkles, Upload, X, Globe, Link2,
} from 'lucide-react';
import { applySeo } from '../lib/seo';
import { supabase } from '../lib/supabase';
import {
  HUB_RELATIONSHIPS, HUB_RELATIONSHIP_TYPES, hubRelationshipById,
  schemaFor, validateForm, hasErrors, missingRequiredAgreements,
  createFormSubmission, toNewApplicationRow, isAllowedUpload, formatFileSize,
  MAX_UPLOAD_MB,
  type HubRelationshipType, type FormField, type FormSchema,
  type UploadedFile, type FormApplication,
} from '../lib/formsEngine';

const DRAFT_KEY = 'nowopen_form_draft';
const SUBMISSIONS_KEY = 'nowopen_form_submissions';

interface Draft {
  type: HubRelationshipType;
  answers: Record<string, unknown>;
  stepIndex: number;
}

function loadDraft(type: HubRelationshipType): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    return parsed.type === type ? parsed : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage full or blocked — autosave is best-effort */
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function saveLocalSubmission(app: FormApplication): void {
  try {
    const raw = localStorage.getItem(SUBMISSIONS_KEY);
    const list: FormApplication[] = raw ? (JSON.parse(raw) as FormApplication[]) : [];
    list.unshift(app);
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500';

const chipClass = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-semibold border transition cursor-pointer ` +
  (active
    ? 'bg-purple-600 text-white border-purple-600'
    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-purple-400');

function FieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const chips = Array.isArray(value) ? value as string[] : [];
  const file = (value ?? undefined) as UploadedFile | undefined;

  const toggleChip = (option: string) => {
    const next = chips.includes(option) ? chips.filter((c) => c !== option) : [...chips, option];
    onChange(next);
  };

  if (field.type === 'longtext') {
    return (
      <textarea
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder={field.placeholder}
        aria-label={field.label}
        className={inputClass}
      />
    );
  }

  if (field.type === 'select' || field.type === 'country' || field.type === 'timezone') {
    return (
      <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={field.label} className={inputClass}>
        <option value="">Select…</option>
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === 'radio') {
    return (
      <div className="flex flex-wrap gap-2">
        {(field.options ?? []).map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              aria-label={`${field.label}: ${o.label}`}
              className={chipClass(active)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-start gap-2.5 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={field.label}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
        />
        <span>{field.help ?? field.label}</span>
      </label>
    );
  }

  if (field.type === 'multiselect' || field.type === 'skills') {
    return (
      <div>
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => (
            <button key={o.value} type="button" onClick={() => toggleChip(o.value)} aria-pressed={chips.includes(o.value)} aria-label={`${field.label}: ${o.label}`} className={chipClass(chips.includes(o.value))}>
              {o.label}
            </button>
          ))}
        </div>
        {field.type === 'skills' && (
          <CustomSkillAdder chips={chips} onAdd={(skill) => onChange([...chips, skill])} />
        )}
      </div>
    );
  }

  if (field.type === 'file') {
    return (
      <div>
        {!file ? (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl px-4 py-6 cursor-pointer hover:border-purple-400 transition text-center">
            <Upload size={20} className="text-gray-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Upload {(field.accept ?? []).join(', ')} · up to {MAX_UPLOAD_MB} MB
            </span>
            <input
              type="file"
              className="hidden"
              accept={(field.accept ?? []).join(',')}
              aria-label={field.label}
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (!picked) return;
                if (!isAllowedUpload(picked)) {
                  toast.error('Unsupported file type');
                  return;
                }
                if (picked.size > MAX_UPLOAD_MB * 1024 * 1024) {
                  toast.error(`Keep uploads under ${MAX_UPLOAD_MB} MB`);
                  return;
                }
                onChange({ name: picked.name, type: picked.type, size: picked.size });
              }}
            />
          </label>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Paperclip size={14} className="shrink-0 text-purple-500" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{file.name}</p>
                <p className="text-[10px] text-gray-500">{file.type || 'file'} · {formatFileSize(file.size)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="shrink-0 p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              aria-label={`Remove ${file.name}`}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  const typeMap: Record<string, string> = {
    text: 'text', email: 'email', phone: 'tel', url: 'url', number: 'number', date: 'date',
  };
  return (
    <input
      type={typeMap[field.type] ?? 'text'}
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      aria-label={field.label}
      className={inputClass}
    />
  );
}

function CustomSkillAdder({ chips, onAdd }: { chips: string[]; onAdd: (skill: string) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const skill = text.trim();
    if (skill && !chips.includes(skill)) onAdd(skill);
    setText('');
  };
  return (
    <div className="mt-2 flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        placeholder="Add your own skill…"
        className={inputClass}
      />
      <button type="button" onClick={add} className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition">
        Add
      </button>
    </div>
  );
}

export default function Forms() {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam = searchParams.get('type');
  const source = searchParams.get('source') ?? undefined;
  const initialType = HUB_RELATIONSHIP_TYPES.find((r) => r === typeParam) ?? null;

  const [relationship, setRelationship] = useState<HubRelationshipType | null>(initialType);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<FormApplication | null>(null);
  const [fallback, setFallback] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consent, setConsent] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const schema: FormSchema | null = relationship ? schemaFor(relationship) : null;
  const sections = schema?.sections ?? [];
  const sectionCount = sections.length;
  const reviewIdx = sectionCount;
  const submitIdx = sectionCount + 1;
  const steps = schema?.steps ?? [];
  const currentStep = Math.min(stepIndex, Math.max(steps.length - 1, 0));

  useEffect(() => {
    return applySeo({
      title: 'Join NowOpen Africa — Universal Forms Hub',
      description:
        'One link to join, collaborate, partner, create and build with NowOpen Africa. Choose your relationship — employee, intern, volunteer, partner, collaborator, business, advisor or media — and complete the right journey.',
      path: '/forms',
      type: 'website',
    });
  }, []);

  // Restore an autosaved draft when a relationship journey is entered.
  useEffect(() => {
    if (!relationship) return;
    const draft = loadDraft(relationship);
    if (draft) {
      setAnswers(draft.answers);
      setStepIndex(draft.stepIndex);
    } else {
      setAnswers({});
      setStepIndex(0);
    }
  }, [relationship]);

  // Autosave progress as the user types.
  useEffect(() => {
    if (!relationship || submitted) return;
    saveDraft({ type: relationship, answers, stepIndex });
  }, [relationship, answers, stepIndex, submitted]);

  const selectRelationship = useCallback((type: HubRelationshipType) => {
    setRelationship(type);
    setErrors({});
    setConsent(false);
    const params = new URLSearchParams(searchParams);
    params.set('type', type);
    setSearchParams(params, { replace: true });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [searchParams, setSearchParams]);

  const setAnswer = useCallback((id: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const sectionFields = useMemo(
    () => (currentStep < sectionCount ? new Set(sections[currentStep].fields.map((f) => f.id)) : new Set<string>()),
    [currentStep, sectionCount, sections],
  );

  const validateSection = (): boolean => {
    if (!schema) return false;
    const all = validateForm(schema, answers);
    const sectionErrors: Record<string, string> = {};
    for (const [id, msg] of Object.entries(all)) {
      if (sectionFields.has(id)) sectionErrors[id] = msg;
    }
    setErrors(all);
    return !hasErrors(sectionErrors);
  };

  const goBack = () => {
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const goNext = () => {
    if (currentStep < reviewIdx) {
      if (!validateSection()) return;
    }
    setStepIndex((i) => Math.min(submitIdx, i + 1));
  };

  const fieldError = (id: string): string | undefined =>
    (currentStep < sectionCount || currentStep === reviewIdx) ? errors[id] : undefined;

  const applicantName = (() => {
    const a = answers;
    return String(a.company_name ?? a.business_name ?? a.creator_name ?? a.full_name ?? '').trim();
  })();

  const handleSubmit = async () => {
    if (!schema || !relationship) return;
    const all = validateForm(schema, answers);
    if (hasErrors(all)) {
      setErrors(all);
      toast.error('A few required fields are still missing');
      const firstSectionWithError = sections.findIndex((s) => s.fields.some((f) => all[f.id]));
      if (firstSectionWithError >= 0) setStepIndex(firstSectionWithError);
      return;
    }
    const missing = missingRequiredAgreements(schema, answers);
    if (missing.length > 0) {
      toast.error(`Accept the required agreements: ${missing.join(', ')}`);
      return;
    }
    if (!consent) {
      setErrors((prev) => ({ ...prev, consent: 'Accept the privacy notice to submit' }));
      toast.error('Accept the privacy notice to submit');
      return;
    }
    setSubmitting(true);
    const result = createFormSubmission({
      relationship,
      applicantName,
      email: String(answers.email ?? ''),
      country: String(answers.country ?? ''),
      answers,
      consent: true,
      source,
    });
    if (!result.ok) {
      setErrors((prev) => ({ ...prev, ...result.errors }));
      setSubmitting(false);
      return;
    }
    const app = result.application;
    // Honeypot filled → look like a success but persist nothing (bot trap).
    if (!(honeypotRef.current && honeypotRef.current.value)) {
      try {
        // No .select() here, deliberately. Applications are submitted by people
        // who are not signed in: the table grants anon INSERT but restricts
        // SELECT to admins, and `.select()` makes PostgREST read the new row
        // back — which RLS then denies. The insert had already succeeded, but the
        // read-back error looked like a failed submission, so every application
        // was quietly diverted to localStorage and never reached the dashboard.
        const { error } = await supabase
          .from('os_form_applications')
          .insert([toNewApplicationRow(app)]);
        if (error) {
          // Keep the reason: this was swallowed before, which is why the cause
          // had to be guessed at from a misleading on-screen note.
          console.error('Application insert failed:', error.message, error);
          saveLocalSubmission(app);
          setFallback(true);
        }
      } catch (err) {
        console.error('Application insert threw:', err);
        saveLocalSubmission(app);
        setFallback(true);
      }
    }
    clearDraft();
    setSubmitted(app);
    setSubmitting(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (submitted) {
    const option = hubRelationshipById(submitted.relationship);
    return (
      <div className="min-h-[80vh] bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="w-full max-w-xl">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-8 sm:p-10 text-center shadow-sm">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-white" />
            </div>
            <h1 className="mt-6 text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">Application received</h1>
            <p className="mt-3 text-gray-600 dark:text-gray-400">
              Thank you for your interest in building with NowOpen Africa.
            </p>
            <div className="mt-6 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 p-5 text-left">
              <Row label="Application reference" value={submitted.reference} mono />
              <Row label="Relationship" value={option?.label ?? submitted.relationship} />
              <Row label="Submission date" value={new Date(submitted.submitted_at).toLocaleDateString()} />
              <Row label="Current status" value="New — received" />
            </div>
            <div className="mt-5 flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 text-left">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              <span>
                Your application reference is private to you. Someone on the NowOpen team will review it —
                no legally binding relationship is created by submitting. Agreements, where applicable, are
                separately executed.
              </span>
            </div>
            {/* An applicant should be told plainly that it did not go through,
                and what to do — not handed a database table name. The technical
                reason is logged for whoever runs the platform. */}
            {fallback && (
              <div className="mt-4 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-3 text-left">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  We couldn&apos;t reach our servers, so this hasn&apos;t been submitted yet.
                </p>
                <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
                  Your answers are saved on this device — reopen this form on the same browser to send
                  it again. If it keeps failing, email{' '}
                  <a href="mailto:hello@nowopenafrica.com" className="underline">hello@nowopenafrica.com</a>{' '}
                  with your reference above.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gray-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(76,29,149,0.45),transparent_60%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium">
            <Globe size={16} className="text-purple-300" />
            One link · every journey
          </span>
          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            NowOpen Africa
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-white/85 max-w-2xl mx-auto">
            Join the people building what comes next.
          </p>
          <p className="mt-3 text-white/70 max-w-2xl mx-auto">
            One place to join, collaborate, partner, create and build with NowOpen Africa.
          </p>
        </div>
      </section>

      {/* Relationship selector */}
      <section className="py-14 sm:py-16" ref={formRef}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="text-sm font-semibold tracking-wide text-purple-600 dark:text-purple-400 uppercase">
              What brings you to NowOpen?
            </div>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              {relationship ? 'Choose your relationship' : 'Select who you are joining as'}
            </h2>
          </div>

          {!relationship ? (
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {HUB_RELATIONSHIPS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => selectRelationship(o.id)}
                  className="group text-left rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 hover:border-purple-400 hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{o.emoji}</span>
                    <ArrowRight size={16} className="text-gray-300 group-hover:text-purple-500 group-hover:translate-x-0.5 transition" />
                  </div>
                  <h3 className="mt-3 font-bold text-gray-900 dark:text-white">{o.label}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{o.blurb}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <div className="flex flex-wrap gap-2 justify-center">
                {HUB_RELATIONSHIPS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => selectRelationship(o.id)}
                    aria-pressed={relationship === o.id}
                    className={chipClass(relationship === o.id)}
                  >
                    {o.emoji} {o.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
                You can change your relationship at any time before submitting.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* The wizard */}
      {relationship && schema && (
        <section className="pb-20">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Progress rail */}
            <div className="mb-8 flex items-center gap-1 overflow-x-auto pb-2">
              {steps.map((label, i) => (
                <div key={`${label}-${i}`} className="flex items-center shrink-0">
                  <div
                    className={`flex flex-col items-center px-1 ${i === currentStep ? 'text-purple-600 dark:text-purple-400' : i < currentStep ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border ${
                        i === currentStep
                          ? 'bg-purple-600 text-white border-purple-600'
                          : i < currentStep
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {i < currentStep ? <Check size={12} /> : String(i + 1).padStart(2, '0')}
                    </div>
                    <span className="mt-1 text-[10px] font-semibold whitespace-nowrap">{label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`h-px w-6 sm:w-10 mx-0.5 ${i < currentStep ? 'bg-emerald-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Hidden honeypot — real people never see or fill this. */}
            <input
              ref={honeypotRef}
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 sm:p-8">
              {currentStep < sectionCount ? (
                <StepBody
                  schema={schema}
                  stepIndex={currentStep}
                  answers={answers}
                  setAnswer={setAnswer}
                  fieldError={fieldError}
                />
              ) : currentStep === reviewIdx ? (
                <ReviewBody schema={schema} answers={answers} />
              ) : (
                <SubmitBody
                  schema={schema}
                  answers={answers}
                  setAnswer={setAnswer}
                  consent={consent}
                  setConsent={setConsent}
                  consentError={errors.consent}
                />
              )}

              <div className="mt-8 flex items-center justify-between">
                {currentStep > 0 ? (
                  <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                ) : (
                  <span />
                )}
                {currentStep < reviewIdx ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-bold hover:opacity-90 transition"
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                ) : currentStep === reviewIdx ? (
                  <button
                    type="button"
                    onClick={() => setStepIndex(submitIdx)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-bold hover:opacity-90 transition"
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold hover:opacity-90 transition disabled:opacity-60"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    Submit application
                  </button>
                )}
              </div>
            </div>

            <p className="mt-4 text-center text-[11px] text-gray-400 dark:text-gray-500">
              <Link2 size={11} className="inline mr-1" />
              Privacy: we collect only what this relationship needs and never share it publicly.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-sm font-semibold text-gray-900 dark:text-white ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function StepBody({
  schema, stepIndex, answers, setAnswer, fieldError,
}: {
  schema: FormSchema;
  stepIndex: number;
  answers: Record<string, unknown>;
  setAnswer: (id: string, value: unknown) => void;
  fieldError: (id: string) => string | undefined;
}) {
  const section = schema.sections[stepIndex];
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{section.title}</h2>
      {section.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{section.description}</p>}
      <div className="mt-6 space-y-5">
        {section.fields.map((f) => (
          <div key={f.id}>
            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
              {f.label}
              {f.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <FieldInput field={f} value={answers[f.id]} onChange={(v) => setAnswer(f.id, v)} error={fieldError(f.id)} />
            {f.help && f.type !== 'checkbox' && (
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{f.help}</p>
            )}
            {fieldError(f.id) && (
              <p className="mt-1 text-xs font-medium text-red-500">{fieldError(f.id)}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewBody({ schema, answers }: { schema: FormSchema; answers: Record<string, unknown> }) {
  const readable = (value: unknown): string => {
    if (value === undefined || value === null || value === '') return '—';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') {
      const f = value as UploadedFile;
      return `${f.name} (${formatFileSize(f.size)})`;
    }
    return String(value);
  };
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Review</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Check everything before you submit.</p>
      <div className="mt-6 space-y-6">
        {schema.sections.map((section) => (
          <div key={section.id}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400">{section.title}</h3>
            <dl className="mt-2 divide-y divide-gray-100 dark:divide-gray-700/60">
              {section.fields.map((f) => {
                const value = readable(answers[f.id]);
                if (value === '—' && !f.required) return null;
                return (
                  <div key={f.id} className="flex items-start justify-between gap-4 py-2">
                    <dt className="text-sm text-gray-500 dark:text-gray-400">{f.label}</dt>
                    <dd className="text-sm font-medium text-gray-900 dark:text-white text-right">{value}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubmitBody({
  schema, answers, setAnswer, consent, setConsent, consentError,
}: {
  schema: FormSchema;
  answers: Record<string, unknown>;
  setAnswer: (id: string, value: unknown) => void;
  consent: boolean;
  setConsent: (v: boolean) => void;
  consentError?: string;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Submit</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        One last thing — accept the required agreements and the privacy notice.
      </p>
      <div className="mt-6 space-y-3">
        {schema.agreements.map((a) => (
          <label
            key={a.id}
            className="flex items-start gap-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={answers[`agreed_${a.id}`] === true}
              onChange={(e) => setAnswer(`agreed_${a.id}`, e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {a.title}
                {a.required && <span className="text-red-500 ml-1">*</span>}
              </p>
              {!a.required && <p className="text-[11px] text-gray-500">Optional — where applicable.</p>}
            </div>
          </label>
        ))}

        <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              I consent to NowOpen Africa processing this information for my application and the relationship I selected.
            </span>
          </label>
          {consentError && <p className="mt-1.5 text-xs font-medium text-red-500">{consentError}</p>}
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-purple-50 dark:bg-purple-900/20 p-4 text-xs text-purple-800 dark:text-purple-200">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" />
          <span>
            Acknowledgement above does not create a legally binding relationship. Where an agreement is required
            (e.g. NDA, employment or partnership), it will be separately reviewed and executed with the appropriate
            signature workflow.
          </span>
        </div>
      </div>
    </div>
  );
}
