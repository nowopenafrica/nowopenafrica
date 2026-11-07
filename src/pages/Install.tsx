import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, Compass, Megaphone, Palette, Smartphone } from 'lucide-react';

import { applySeo } from '../lib/seo';
import { useInstall } from '../lib/pwa/useInstall';
import { instructionsFor, type Platform } from '../lib/pwa/install';
import InstallApp from '../components/InstallApp';

/**
 * /install — take NowOpen with you.
 *
 * ── WHAT THIS PAGE IS CAREFUL ABOUT ──────────────────────────────────────
 *
 * It is not an app-store listing and does not dress itself as one. There is
 * no Play badge, no App Store badge, no download count, no star rating and no
 * review, because none of those exist: this installs the website as an app,
 * which is a real and useful thing and a DIFFERENT thing. Somebody who
 * believes they downloaded a store app and then cannot find it in their
 * purchase history has been misled by the page that told them so.
 *
 * It also shows the steps for EVERY platform rather than only the one it
 * thinks you are on. Detection is good but not certain — an iPad reports a
 * Mac, an in-app browser reports a browser it is not — and somebody reading
 * on a laptop about installing on their phone is a completely ordinary thing
 * to be doing.
 */

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'android', label: 'Android' },
  { id: 'ios', label: 'iPhone & iPad' },
  { id: 'desktop', label: 'Computer' },
];

const REASONS = [
  { icon: Compass, title: 'Find businesses faster', text: 'Search the directory from your home screen, without opening a browser first.' },
  { icon: Palette, title: 'Create on the move', text: 'Open the Studio, edit a design and export it from your phone.' },
  { icon: Megaphone, title: 'Manage your listing', text: 'Update your hours, answer enquiries and check your profile anywhere.' },
];

export default function Install() {
  const { state } = useInstall();

  useEffect(() => applySeo({
    title: 'Install the NowOpen Africa app',
    description:
      'Add NowOpen Africa to your home screen on Android, iPhone, iPad or your computer. '
      + 'Find businesses, manage your listing and create designs from one icon.',
    path: '/install',
  }), []);

  const installed = state.kind === 'installed';

  return (
    <div className="site-container py-10">
      <header className="mx-auto max-w-2xl text-center">
        <img src="/icon-192.png" alt="" width={72} height={72} className="mx-auto rounded-2xl shadow-lg" />
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Take NowOpen Africa with you
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-gray-600 dark:text-gray-400">
          Add NowOpen to your home screen and it opens like any other app — full screen, one tap,
          no browser tabs. It is the same account and the same everything, just closer to hand.
        </p>

        <div className="mt-6 flex flex-col items-center gap-3">
          {installed ? (
            <p className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
              <Check size={16} /> You are using the app already.
            </p>
          ) : (
            <InstallApp />
          )}
          <Link to="/" className="text-xs font-semibold text-gray-500 underline hover:text-gray-900 dark:hover:text-white">
            Or carry on using the website
          </Link>
        </div>
      </header>

      <section className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-3">
        {REASONS.map((r) => (
          <div key={r.title} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <r.icon size={18} className="text-pink-600 dark:text-pink-400" />
            <h2 className="mt-2 text-sm font-bold text-gray-900 dark:text-white">{r.title}</h2>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{r.text}</p>
          </div>
        ))}
      </section>

      {/*
        Every platform, not just the detected one.

        Detection is good and not certain, and reading on a laptop about
        installing on your phone is an entirely normal thing to be doing.
      */}
      <section className="mx-auto mt-12 max-w-3xl">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">How to install it</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {PLATFORMS.map((p) => (
            <div key={p.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                <Smartphone size={15} /> {p.label}
              </h3>
              <ol className="mt-3 space-y-2">
                {instructionsFor(p.id, false).map((step, i) => (
                  <li key={step.text} className="flex gap-2.5 text-xs text-gray-600 dark:text-gray-400">
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      {i + 1}
                    </span>
                    {step.text}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-2xl">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Questions</h2>
        <dl className="mt-4 space-y-4">
          {/*
            The first question is the one that matters, answered without
            hedging. A page that leaves somebody believing they downloaded a
            store app has misled them.
          */}
          <div>
            <dt className="text-sm font-bold text-gray-900 dark:text-white">
              Is this the Play Store or App Store app?
            </dt>
            <dd className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              No. This installs the NowOpen website as an app on your device. It looks and opens
              like an app, and it is not a store download — you will not find it in your Play Store
              or App Store purchases. The store apps are being prepared separately.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-gray-900 dark:text-white">Does it work offline?</dt>
            <dd className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              No. Searching, your dashboard, designs and payments all need a connection. Without
              one you get a page telling you so rather than a broken screen.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-gray-900 dark:text-white">Will it take much space?</dt>
            <dd className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Very little. It stores the app&rsquo;s own files so it starts quickly — not your data,
              and nothing from your account.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold text-gray-900 dark:text-white">How do I remove it?</dt>
            <dd className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Press and hold the icon and remove it, exactly like any other app. Your account is
              untouched and the website keeps working.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
