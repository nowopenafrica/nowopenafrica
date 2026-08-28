import { Store, User } from 'lucide-react';
import type { Audience } from '../../lib/audience';

/**
 * For the people who are both.
 *
 * A restaurant owner is also somebody who eats out. Rather than blending the
 * two navigations into one long menu — which is what makes a dashboard feel
 * like a directory and a directory feel like admin — the two stay separate and
 * this moves between them.
 *
 * Shown only to accounts that own something; for everyone else there is nothing
 * to switch to and a toggle offering an empty dashboard is just a puzzle.
 */
export default function AudienceSwitch({
  audience,
  onChange,
}: {
  audience: Audience;
  onChange: (a: Audience) => void;
}) {
  const base = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition min-h-[36px]';
  return (
    <div
      className="hidden lg:flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-700/60"
      role="group"
      aria-label="Switch between browsing and managing"
    >
      <button
        type="button"
        onClick={() => onChange('people')}
        aria-pressed={audience === 'people'}
        className={`${base} ${
          audience === 'people'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        <User size={13} /> Browse
      </button>
      <button
        type="button"
        onClick={() => onChange('business')}
        aria-pressed={audience === 'business'}
        className={`${base} ${
          audience === 'business'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        <Store size={13} /> Manage
      </button>
    </div>
  );
}
