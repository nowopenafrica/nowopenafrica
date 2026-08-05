import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';

// Minimal, privacy-preserving consent notice. Essential cookies (auth,
// theme, currency) always run; this records the user's choice on non-essential
// cookies. Defaults to declining until the user chooses.
const KEY = 'nowopen-cookie-consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setVisible(true);
    } catch {
      /* localStorage unavailable — don't nag */
    }
  }, []);

  const choose = (value: 'accepted' | 'declined') => {
    try { localStorage.setItem(KEY, value); } catch { /* ignore */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4">
      <div className="max-w-3xl mx-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1">
          <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-xs text-gray-600 dark:text-gray-300">
            We use essential cookies to keep you signed in and remember your preferences. With your consent we also use
            optional cookies to improve NowOpen Africa. See our{' '}
            <Link to="/privacy" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">Privacy Policy</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => choose('declined')}
            className="px-4 py-2 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Essential only
          </button>
          <button
            onClick={() => choose('accepted')}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
