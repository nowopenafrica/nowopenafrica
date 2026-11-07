import { useState } from 'react';
import { Check, Download, Share, Plus, CheckCircle2, Smartphone, X } from 'lucide-react';

import { useInstall } from '../lib/pwa/useInstall';
import { installLabel, instructionsFor } from '../lib/pwa/install';
import { track } from '../lib/telemetry';

/**
 * "Install the app" — the button, and the sheet it opens when it has to.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────
 *
 * It will not say the app was installed because somebody tapped it. On
 * Chromium the browser reports accepted or dismissed and that is what gets
 * recorded; on iOS nothing is knowable, so nothing is claimed. A tap is a
 * tap.
 *
 * It also will not pretend to be an app-store download. There is no APK and
 * no IPA here — this installs the website as an app, which is a real thing
 * and a different thing, and the sheet says so.
 */

export default function InstallApp({ variant = 'button' }: { variant?: 'button' | 'link' }) {
  const { state, promptInstall } = useInstall();
  const [sheet, setSheet] = useState(false);
  const [outcome, setOutcome] = useState<'accepted' | 'dismissed' | null>(null);

  /* Already an app. Offering to install it again is noise. */
  if (state.kind === 'installed') return null;

  const onClick = async () => {
    track('install_cta_clicked', { kind: state.kind });

    if (state.kind === 'prompt') {
      const result = await promptInstall();
      if (result === 'unavailable') { setSheet(true); return; }
      setOutcome(result);
      /*
       * Recorded from the browser's own answer, never from the click — and
       * written as two literal calls rather than a ternary so the event
       * names can be FOUND. A guard in the suite scans for a call site per
       * declared event, and it is right to: an event name that only exists
       * inside an expression is one nobody can grep for when they are trying
       * to work out where a number came from.
       */
      if (result === 'accepted') track('install_prompt_accepted', {});
      else track('install_prompt_dismissed', {});
      return;
    }

    track('install_instructions_viewed', {
      platform: state.platform,
      inAppBrowser: state.inAppBrowser,
    });
    setSheet(true);
  };

  const label = installLabel(state);

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        className={variant === 'link'
          ? 'inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          : 'inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-bold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900'}
      >
        <Download size={15} /> {label}
      </button>

      {outcome === 'accepted' && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
          <Check size={13} /> Installing — look for NowOpen with your other apps.
        </p>
      )}

      {sheet && state.kind === 'instructions' && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setSheet(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-sheet"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-gray-900 sm:rounded-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 dark:bg-gray-800">
                <Smartphone size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="install-sheet" className="text-base font-bold text-gray-900 dark:text-white">
                  Add NowOpen to your home screen
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {/* Said plainly, because the difference matters to people. */}
                  This installs the website as an app. It is not a Play Store or App Store download.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSheet(false)}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={16} />
              </button>
            </div>

            <ol className="mt-4 space-y-2.5">
              {instructionsFor(state.platform, state.inAppBrowser).map((step, i) => {
                /* The glyph people are being asked to look for, drawn beside
                   the words. Hunting for an unnamed icon is most of what makes
                   "add to home screen" feel difficult. */
                const Glyph = step.icon === 'share' ? Share
                  : step.icon === 'add' ? Plus
                    : step.icon === 'done' ? CheckCircle2 : null;
                return (
                  <li key={step.text} className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gray-900 text-[11px] font-bold text-white dark:bg-white dark:text-gray-900">
                      {i + 1}
                    </span>
                    <span className="flex-1">{step.text}</span>
                    {Glyph && (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        <Glyph size={15} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>

            {/* The full page, for anyone who wants the other platforms or
                the questions answered. */}
            <a
              href="/install"
              className="mt-4 inline-block text-xs font-semibold text-gray-500 underline hover:text-gray-900 dark:hover:text-white"
            >
              All the ways to install it
            </a>
          </div>
        </div>
      )}
    </>
  );
}
