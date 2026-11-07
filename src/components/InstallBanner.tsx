import { useState } from 'react';
import { Download, X } from 'lucide-react';

import { useInstall } from '../lib/pwa/useInstall';
import { track } from '../lib/telemetry';

/**
 * A one-tap install bar, shown only when the browser really will install.
 *
 * ── WHY THIS HAD TO EXIST ────────────────────────────────────────────────
 *
 * The install code calls `preventDefault()` on `beforeinstallprompt`, which
 * suppresses Chrome's OWN install prompt so the site can offer a nicer one.
 * That is the normal pattern and it carries an obligation: if you take the
 * browser's prompt away, you must actually show one.
 *
 * It was only offered from a button in the footer — twenty-six links down, at
 * the very bottom of the page. So in practice the browser's prompt had been
 * removed and nothing replaced it, which is worse than having done nothing at
 * all. This bar is the replacement.
 *
 * ── WHEN IT APPEARS, AND WHEN IT STAYS QUIET ─────────────────────────────
 *
 * ONLY when a real deferred prompt is in hand — so tapping it opens the
 * browser's install dialog and the app installs. One tap, no instructions.
 *
 * It does NOT appear on iOS, where no such API exists: a bar promising a tap
 * that cannot happen is the thing to avoid. iOS keeps the honest route (the
 * /install page and the Share → Add to Home Screen steps).
 *
 * It also stays quiet once dismissed, and once installed.
 */
export default function InstallBanner() {
  const { state, dismissed, promptInstall, dismiss } = useInstall();
  const [gone, setGone] = useState(false);

  /* A prompt, or nothing. No bar for a route that needs instructions. */
  if (state.kind !== 'prompt' || dismissed || gone) return null;

  const install = async () => {
    track('install_cta_clicked', { kind: 'banner' });
    const result = await promptInstall();
    if (result === 'accepted') track('install_prompt_accepted', {});
    else if (result === 'dismissed') track('install_prompt_dismissed', {});
    /* Either way the moment has passed; the footer button and /install remain. */
    setGone(true);
  };

  return (
    <div className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
      <div className="site-container flex items-center gap-3 py-2">
        <img src="/icon-192.png" alt="" width={28} height={28} className="shrink-0 rounded-lg" />
        <p className="min-w-0 flex-1 text-xs text-gray-700 dark:text-gray-300">
          <span className="font-bold text-gray-900 dark:text-white">Install NowOpen</span>
          <span className="hidden sm:inline"> — open it from your home screen, like any other app.</span>
        </p>
        <button
          type="button"
          onClick={() => void install()}
          className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 text-xs font-bold text-white dark:bg-white dark:text-gray-900"
        >
          <Download size={14} /> Install
        </button>
        <button
          type="button"
          onClick={() => { dismiss(); setGone(true); }}
          aria-label="Not now"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
