import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, X, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { TRIAL_MONTHS } from '../data/pricingPlans';

// Launch announcement shown once per account, the first time a signed-in user
// lands on the app after logging in. Announces the 3-month all-access trial
// every new business registration receives. Dismissal is remembered per user
// id in localStorage so it never nags on subsequent navigations/logins.
const seenKey = (userId: string) => `nowopen-trial-promo-seen:${userId}`;

const PERKS = [
  'Bookings, orders & reservations',
  'NowOpen Live streaming',
  'AI business assistant & content tools',
  'Premium analytics & CRM',
  'Verified badge & priority ranking',
  'Every industry module — unlocked',
];

export default function TrialPromoModal() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    let seen = false;
    try {
      seen = localStorage.getItem(seenKey(user.id)) === '1';
    } catch {
      // localStorage unavailable (private mode) — show it, just don't persist.
    }
    if (!seen) setOpen(true);
  }, [user, loading]);

  const dismiss = () => {
    if (user) {
      try {
        localStorage.setItem(seenKey(user.id), '1');
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  };

  const goSetUp = () => {
    dismiss();
    navigate('/dashboard');
  };

  if (!open || !user) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-promo-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-gray-800 shadow-2xl">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-full bg-white/20 p-1.5 text-white hover:bg-white/30 transition"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div
          className="px-6 pt-8 pb-6 text-center text-white"
          style={{ background: 'linear-gradient(135deg, #4c1d95 0%, #831843 45%, #9a3412 100%)' }}
        >
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
            <Gift size={30} className="text-yellow-300" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-yellow-300">Limited launch offer</p>
          <h2 id="trial-promo-title" className="mt-1 text-2xl font-bold leading-tight">
            {TRIAL_MONTHS} months free — all access
          </h2>
          <p className="mt-2 text-sm text-white/85">
            Every new business gets the full NowOpen platform — every premium feature — free for {TRIAL_MONTHS} months.
            No card required.
          </p>
        </div>

        {/* Perks */}
        <div className="px-6 py-5">
          <ul className="space-y-2">
            {PERKS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <Check size={16} className="mt-0.5 flex-shrink-0 text-green-500" />
                {p}
              </li>
            ))}
          </ul>

          <button
            onClick={goSetUp}
            className="mt-5 w-full rounded-lg bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-700"
          >
            Set up my business
          </button>
          <button
            onClick={dismiss}
            className="mt-2 w-full rounded-lg px-5 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Maybe later
          </button>
          <p className="mt-3 text-center text-[11px] text-gray-400 dark:text-gray-500">
            After {TRIAL_MONTHS} months your account moves to the free Free Launch plan unless you choose a plan.
          </p>
        </div>
      </div>
    </div>
  );
}
