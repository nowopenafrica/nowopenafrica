import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Copy, Loader2, MessageCircle, Search, Send,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { applySeo, SITE_URL } from '../lib/seo';
import { track } from '../lib/telemetry';
import {
  STEPS, answerError, readSource, shortReferrer, shareText, whatsappShareUrl,
  type Answers, type StepKey,
} from '../lib/acquisition';

/**
 * NOWOPEN YOUR BUSINESS — nowopenafrica.com/send-business
 *
 * One link. One action. Zero friction.
 *
 * This is a campaign destination, not a page on the website. It exists to be
 * printed on a flyer, put behind a QR code, pasted into a WhatsApp status and
 * said out loud at the end of a founder video — so the URL has to be
 * repeatable, the promise has to fit in one line, and what happens after the
 * click has to be shorter than the person expects.
 *
 * WHY IT IS A CONVERSATION AND NOT A FORM. A form is judged on its length
 * before a single field is filled: seven inputs and a Submit button says "this
 * will take a while", and the visitor leaves without reading one label. Three
 * questions asked one at a time never show their own length, and each answer is
 * a small commitment that makes the next one easier. Same data, different
 * decision being asked for.
 *
 * WHAT IT DOES NOT DO. It creates nothing public and it makes no account. A
 * submission is a job of work in a queue a person reads. Anyone can say a
 * business exists; saying so must never make it appear — that rule is the only
 * reason the directory can be trusted.
 *
 * WHAT IT MUST NEVER DO. Promise a page by a date nobody has committed to, or
 * imply the profile already exists. The copy says what we will do and who
 * decides, and nothing about how fast.
 */

const TOTAL = STEPS.length;

export default function SendBusiness() {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Read once, on arrival: by the time somebody finishes the conversation the
  // query string may have been replaced by navigation.
  const attribution = useMemo(() => ({
    source: readSource(window.location.search, document.referrer),
    referrer: shortReferrer(document.referrer),
  }), []);

  useEffect(() => applySeo({
    title: 'Send us your business name — we set up your NowOpen profile',
    description:
      'Own a business in Africa? Do not register. Send your business name and NowOpen sets up your profile. You check it, then you claim it. No account, no forms.',
    path: '/send-business',
    image: '/og-image.png',
  }), []);

  useEffect(() => {
    if (started) input.current?.focus();
  }, [started, step]);

  const current = STEPS[step];

  const advance = () => {
    const problem = answerError(current.key, value);
    if (problem) { toast.error(problem); return; }

    const next = { ...answers, [current.key]: value.trim() };
    setAnswers(next);
    setValue('');
    if (step + 1 < TOTAL) { setStep(step + 1); return; }
    void submit(next);
  };

  const back = () => {
    if (step === 0) { setStarted(false); return; }
    const previous = STEPS[step - 1];
    setValue(answers[previous.key] ?? '');
    setStep(step - 1);
  };

  const submit = async (final: Answers) => {
    setBusy(true);
    // No .select() — profile_requests is insert-only to the public, and asking
    // for the row back makes RLS refuse the whole statement.
    const { error } = await supabase.from('profile_requests').insert({
      business_name: (final.name ?? '').slice(0, 160),
      location: (final.location ?? '').slice(0, 160),
      contact: (final.contact ?? '').slice(0, 160),
      kind: 'owner',
      source: attribution.source,
      referrer: attribution.referrer,
    });
    setBusy(false);

    if (error) {
      toast.error('That did not send. Please try again.');
      // Put them back on the last question rather than losing three answers.
      setStep(TOTAL - 1);
      setValue(final.contact ?? '');
      return;
    }

    track('profile_requested', { source: attribution.source, kind: 'owner' });
    setSent(true);
  };

  if (sent) return <Received answers={answers} />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 sm:py-20">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-pink-600 dark:text-pink-400">
        NowOpen your business
      </p>
      <h1 className="mt-3 text-3xl sm:text-5xl font-extrabold text-gray-900 dark:text-white leading-[1.05]">
        Your business deserves to be found.
      </h1>
      <p className="mt-4 text-lg sm:text-xl text-gray-700 dark:text-gray-300">
        Send us your business name. We will set up your NowOpen profile.
      </p>
      <p className="mt-2 text-base text-gray-600 dark:text-gray-400">
        No account. No forms. No complicated setup.<br />
        We build it. You check it. Then it is yours.
      </p>

      {!started ? (
        <div className="mt-8">
          <button
            onClick={() => { setStarted(true); track('profile_request_started', { source: attribution.source }); }}
            className="inline-flex items-center gap-2 min-h-[56px] px-8 rounded-2xl bg-pink-600 text-white text-lg font-bold hover:bg-pink-700 transition shadow-lg shadow-pink-600/20"
          >
            Send my business <ArrowRight size={20} />
          </button>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Already running a business? Let us put it on NowOpen.
          </p>

          {/* Three lines, because "what happens next" is the actual objection —
              not "what is NowOpen". */}
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ['You send the name', 'Three questions. Nothing else, and no account.'],
              ['We build the page', 'From what you sent and what is already public. We never invent details.'],
              ['You claim it', 'Nothing goes live until you have seen it and said yes.'],
            ].map(([title, blurb], i) => (
              <li key={title} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 text-sm font-bold">
                  {i + 1}
                </span>
                <h2 className="mt-2 font-bold text-gray-900 dark:text-white">{title}</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{blurb}</p>
              </li>
            ))}
          </ol>

          <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
            Do not own a business but know one that should be here?{' '}
            <Link to="/nominate" className="font-semibold text-pink-600 hover:underline">Nominate it instead</Link>.
          </p>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-7 shadow-sm">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <span key={s.key}
                className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-pink-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
            ))}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Question {step + 1} of {TOTAL}
          </p>

          <h2 className="mt-1 text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            {current.asks}
          </h2>

          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); advance(); } }}
            maxLength={160}
            aria-label={current.label}
            placeholder={current.placeholder}
            className="mt-4 w-full min-h-[56px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
          {current.hint && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{current.hint}</p>}

          <div className="mt-5 flex items-center gap-3">
            <button onClick={back} disabled={busy}
              className="inline-flex items-center gap-1.5 min-h-[48px] px-4 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50">
              <ArrowLeft size={16} /> Back
            </button>
            <button onClick={advance} disabled={busy}
              className="ml-auto inline-flex items-center gap-2 min-h-[52px] px-7 rounded-xl bg-pink-600 text-white font-bold hover:bg-pink-700 transition disabled:opacity-50">
              {busy && <Loader2 size={17} className="animate-spin" />}
              {step + 1 < TOTAL ? 'Next' : 'Send my business'}
              {!busy && step + 1 < TOTAL && <ArrowRight size={17} />}
              {!busy && step + 1 === TOTAL && <Send size={17} />}
            </button>
          </div>

          {/* What they have already said, so the last question does not feel
              like the start of an endless form. */}
          {step > 0 && (
            <dl className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-1 text-sm">
              {STEPS.slice(0, step).map((s) => (
                <div key={s.key} className="flex gap-2">
                  <dt className="text-gray-500 dark:text-gray-400">{s.label}:</dt>
                  <dd className="font-semibold text-gray-900 dark:text-white">{answers[s.key as StepKey]}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The screen after they send it.
 *
 * Two jobs. Say precisely what happens next and who decides — an owner who
 * thinks a page is already live will go looking for it and find nothing. And
 * ask for one more business, because the person who just sent their own knows
 * their barber, their tailor and the restaurant on their street, and this is
 * the only moment they will ever be this willing.
 */
function Received({ answers }: { answers: Answers }) {
  const share = shareText(SITE_URL);

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 sm:py-24">
      <CheckCircle2 size={40} className="text-green-600" />
      <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
        Got it. We are preparing your page.
      </h1>
      <p className="mt-3 text-gray-700 dark:text-gray-300">
        We will build <strong>{answers.name}</strong>
        {answers.location ? <> in <strong>{answers.location}</strong></> : null}
        {' '}from what you sent and what is already public about your business, and reach you on{' '}
        <strong>{answers.contact}</strong> when it is ready to look at.
      </p>
      <p className="mt-3 text-gray-600 dark:text-gray-400">
        Nothing is published until you have seen it and claimed it. We never invent details about
        a business — anything we are unsure of, we will ask you.
      </p>

      <div className="mt-8 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h2 className="font-bold text-gray-900 dark:text-white">Know another business?</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Your barber, your tailor, the restaurant on your street. Send us the name and we will
          prepare their page too — they claim it when they are ready.
        </p>
        <Link to="/nominate"
          className="mt-3 inline-flex items-center gap-2 min-h-[48px] px-6 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold">
          Add another business <ArrowRight size={17} />
        </Link>
      </div>

      <div className="mt-5 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="font-bold text-gray-900 dark:text-white">Pass it on</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Send the link to another business owner.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={whatsappShareUrl(SITE_URL)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
          >
            <MessageCircle size={16} /> Share on WhatsApp
          </a>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(share)
                .then(() => toast.success('Copied'))
                .catch(() => toast.error('Could not copy — select the link and copy it.'));
            }}
            className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200"
          >
            <Copy size={16} /> Copy the message
          </button>
        </div>
      </div>

      <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
        In the meantime,{' '}
        <Link to="/discover" className="inline-flex items-center gap-1 font-semibold text-pink-600 hover:underline">
          <Search size={14} /> see who is already on NowOpen
        </Link>.
      </p>
    </div>
  );
}
