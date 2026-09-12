import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, CheckCircle2, Loader2, Send } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { track } from '../../lib/telemetry';
import { readSource, shortReferrer, type Source } from '../../lib/acquisition';

/**
 * "Send us your business name. We'll set up your NowOpen profile."
 *
 * The acquisition problem was never that owners refuse to join. It is that
 * joining meant finding the waitlist, filling in a form about themselves, and
 * still having no profile at the end — all the work sitting with the person we
 * are asking for a favour.
 *
 * This inverts it. They send a name and a way to be reached; NowOpen does the
 * building.
 *
 * TWO FIELDS, AND WHY NOT ONE. "Send your business name" is the promise, but a
 * name with no way to reach anybody is a note nobody can act on — it would look
 * like a working funnel and produce nothing. The second field takes whatever
 * they have: a WhatsApp number, a phone number, an Instagram handle, an email.
 * Making somebody classify their own contact detail is a dropdown that earns
 * nothing.
 *
 * NO ACCOUNT REQUIRED. An owner who has to sign up before telling us their
 * business name is an owner we have already lost.
 *
 * This does NOT create a business. It writes a request to a queue a person
 * reads. Anyone can say a business exists; saying so must not make it appear.
 */

interface Props {
  /**
   * Where this instance sits, used only when the visit carries no attribution
   * of its own. A visitor who arrived from Instagram and then used the box on
   * the homepage came from Instagram — recording "homepage" would credit the
   * page they happened to land on rather than the thing that worked.
   */
  fallbackSource: Source;
  className?: string;
}

export default function SendYourBusiness({ fallbackSource, className = '' }: Props) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const attribution = useMemo(() => {
    const detected = readSource(window.location.search, document.referrer);
    return {
      source: detected === 'direct' ? fallbackSource : detected,
      referrer: shortReferrer(document.referrer),
    };
  }, [fallbackSource]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const businessName = name.trim();
    const reach = contact.trim();
    if (!businessName || !reach) {
      toast.error('A business name and one way to reach you.');
      return;
    }

    setBusy(true);
    // No .select() on the insert. This table is insert-only to the public, so
    // asking for the row back makes RLS refuse the whole statement — and the
    // error blames the insert, which is a confusing hour for whoever debugs it.
    const { error } = await supabase.from('profile_requests').insert({
      business_name: businessName.slice(0, 160),
      contact: reach.slice(0, 160),
      kind: 'owner',
      source: attribution.source,
      referrer: attribution.referrer,
    });
    setBusy(false);

    if (error) {
      toast.error('That did not send. Please try again.');
      return;
    }

    track('profile_requested', { source: attribution.source, kind: 'owner' });
    setSent(true);
    setName('');
    setContact('');
  };

  if (sent) {
    return (
      <div className={`rounded-2xl border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-6 text-center ${className}`}>
        <CheckCircle2 size={28} className="mx-auto text-green-600 dark:text-green-400" />
        <h3 className="mt-3 font-bold text-green-900 dark:text-green-200">Got it — we'll build your profile.</h3>
        <p className="mt-1 text-sm text-green-800 dark:text-green-300">
          Someone will reach out on the contact you gave us. Nothing goes live until you have seen it and claimed it.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-3 text-sm font-semibold text-green-800 dark:text-green-300 underline"
        >
          Send another business
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 ${className}`}>
      <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
        Send us your business name. We'll set up your NowOpen profile.
      </h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        No account, no forms. We build it, you check it, then it is yours.
      </p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        <Link to="/send-business" className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          Or let us walk you through it <ArrowRight size={13} />
        </Link>
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={160}
          required
          aria-label="Your business name"
          placeholder="Your business name"
          className="flex-1 min-h-[48px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={160}
          required
          aria-label="WhatsApp, phone, Instagram or email"
          placeholder="WhatsApp, phone or Instagram"
          className="flex-1 sm:max-w-[16rem] min-h-[48px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-50 shrink-0"
        >
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
          Send
        </button>
      </form>
    </div>
  );
}
