import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, CheckCircle2, Loader2, MapPinned } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import { track } from '../lib/telemetry';
import { normalizeBusiness } from '../lib/radar/normalize';
import { readSource } from '../lib/acquisition';

/**
 * nowopenafrica.com/nominate — the second acquisition loop.
 *
 * The first loop needs an owner to act. This one does not: the person who
 * knows a business should be on NowOpen is very often not the person who runs
 * it. Their barber, their tailor, the restaurant on their street. Nobody has to
 * be persuaded of anything for a nomination to arrive.
 *
 * TWO FIELDS. Name and town. That is all somebody can honestly supply about a
 * business they do not own, and asking for a phone number or a category invites
 * a guess — a guess that would then sit in our data looking like a fact.
 *
 * IT WRITES A CANDIDATE, NOT A BUSINESS. Deliberately the same queue as the
 * existing "Suggest a business" form (radar_candidates), not a new table: it is
 * the same job, it has a reviewer, and a second pipeline would mean a second
 * place for nominations to be forgotten. A nomination sits there until a person
 * publishes it. Anyone can say a business exists, and saying so must never make
 * it appear.
 */

export default function Nominate() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [lastSent, setLastSent] = useState('');

  const source = useMemo(() => readSource(window.location.search, document.referrer), []);

  useEffect(() => applySeo({
    title: 'Nominate a business for NowOpen Africa',
    description:
      'Know a business that should be on NowOpen? Send us the name and where it is. We prepare the page and the owner claims it — no account needed.',
    path: '/nominate',
    image: '/og-image.png',
  }), []);

  const submit = async () => {
    const normalized = normalizeBusiness({ name, city });
    if (!normalized) { toast.error('What is the business called?'); return; }
    if (!normalized.cityKey) { toast.error('Which town or city is it in?'); return; }

    setBusy(true);
    /*
     * No .select() chained — radar_candidates has no SELECT policy for the
     * public, so asking for the row back makes RLS reject the whole insert and
     * report it as a write failure.
     *
     * confidence 0 and status 'pending' because the insert policy requires
     * exactly that: scoring here would let a submitter set their own
     * confidence, and a nomination is the least verified thing we hold.
     */
    const { error } = await supabase.from('radar_candidates').insert({
      source_key: 'public_suggestion',
      status: 'pending',
      confidence: 0,
      name: normalized.name,
      city: normalized.city,
      name_key: normalized.nameKey,
      city_key: normalized.cityKey,
      submitted_by: user?.id ?? null,
    });
    setBusy(false);

    if (error) {
      toast.error(/does not exist|schema cache/i.test(error.message)
        ? 'Nominations need the Radar migration applied first.'
        : 'That did not send. Please try again.');
      return;
    }

    track('business_nominated', { source });
    setLastSent(normalized.name);
    setSentCount((n) => n + 1);
    setName('');
    setCity('');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 sm:py-20">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-pink-600 dark:text-pink-400">
        NowOpen your business
      </p>
      <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white leading-tight">
        Know a business that should be on NowOpen?
      </h1>
      <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">
        Send us the name. We prepare the page, and the owner claims it when they are ready.
      </p>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Your barber, your tailor, your mechanic, the restaurant on your street. You do not need to
        know them, and they do not need an account.
      </p>

      {sentCount > 0 && (
        <div className="mt-6 rounded-2xl border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 flex gap-3">
          <CheckCircle2 size={20} className="text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-green-900 dark:text-green-200">
              Thank you — {lastSent} is with our reviewers.
            </p>
            <p className="mt-0.5 text-sm text-green-800 dark:text-green-300">
              We check every nomination before anything appears. Nothing is published on somebody
              else&apos;s say-so.
              {sentCount > 1 && ` That is ${sentCount} you have sent.`}
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6">
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300" htmlFor="nominate-name">
          Business name
        </label>
        <input
          id="nominate-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('nominate-city')?.focus(); }}
          maxLength={160}
          placeholder="e.g. Bella&apos;s Laundry"
          className="mt-1.5 w-full min-h-[52px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
        />

        <label className="mt-4 block text-sm font-semibold text-gray-700 dark:text-gray-300" htmlFor="nominate-city">
          Where it is
        </label>
        <input
          id="nominate-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          maxLength={160}
          placeholder="e.g. Yaba, Lagos"
          className="mt-1.5 w-full min-h-[52px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
        />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Town or city is enough. It is how we tell two businesses with the same name apart.
        </p>

        <button
          onClick={() => void submit()}
          disabled={busy}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl bg-pink-600 text-white font-bold hover:bg-pink-700 transition disabled:opacity-50"
        >
          {busy ? <Loader2 size={17} className="animate-spin" /> : <MapPinned size={17} />}
          {sentCount > 0 ? 'Send another one' : 'Send this business'}
        </button>
      </div>

      <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
        It is your own business?{' '}
        <Link to="/send-business" className="inline-flex items-center gap-1 font-semibold text-pink-600 hover:underline">
          Send it here instead <ArrowRight size={14} />
        </Link>{' '}
        — we will reach you when the page is ready so you can claim it.
      </p>
    </div>
  );
}
