import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Check, Eye, Info } from 'lucide-react';

import IndustryPageMock from '../components/discover/IndustryPageMock';
import { applySeo } from '../lib/seo';
import {
  INDUSTRY_EXAMPLES, demoPath, exampleBySlug, examplePath, orderedExamples,
  placeholderFor,
} from '../lib/industryExamples';

/**
 * /example/<industry> — the linkable reference page.
 *
 * ── WHY THIS URL AND NOT /business/lagos-prime-realty ─────────────────────
 *
 * That was the shape asked for, and it is the right instinct: a preview you can
 * send somebody beats a panel that closes. But /business/ is the namespace of
 * real businesses, and there is no Lagos Prime Realty — putting an example
 * there would mean inventing a company, giving it a profile URL, and leaving it
 * one screenshot away from looking real. That is the thing this whole feature
 * was built to avoid, and the fact that the SPA answers 200 for any path makes
 * it worse rather than better: a made-up profile URL would look like it worked.
 *
 * So the industry is the subject and the path says so. `/example/restaurants`
 * cannot be mistaken for a listing in an address bar, in a WhatsApp message, or
 * in a screenshot — and it is still a real page you can send.
 *
 * ── NOINDEX, DELIBERATELY ─────────────────────────────────────────────────
 *
 * Somebody searching "restaurant Lekki" must never be handed this. It is worth
 * a great deal inside the product and nothing at all in a results page, where
 * its only possible effect is to look like a business that is not one.
 *
 * ── ONE RENDERER ──────────────────────────────────────────────────────────
 *
 * The mock is IndustryPageMock, the same component the popup uses. Two copies
 * of "what the page looks like" would start disagreeing within a month, and the
 * whole value here is that the preview matches what gets built.
 */

export default function IndustryExamplePage() {
  const { slug } = useParams<{ slug: string }>();
  const example = slug ? exampleBySlug(slug) : undefined;

  useEffect(() => applySeo({
    title: example
      ? `Example: what a ${example.name} page looks like — NowOpen Africa`
      : 'Industry page examples — NowOpen Africa',
    description: example
      ? `A preview of the NowOpen profile a ${example.name.toLowerCase()} business gets, with placeholder content. Not a real business.`
      : 'Previews of the NowOpen profile each industry gets, with placeholder content.',
    path: example ? examplePath(example.slug) : '/example',
    // Never a search result. See the note above.
    robots: 'noindex, nofollow',
  }), [example]);

  if (!example) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
          No example for that industry
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Pick one of the {INDUSTRY_EXAMPLES.length} we do have.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {orderedExamples().slice(0, 12).map((e) => (
            <Link
              key={e.slug}
              to={examplePath(e.slug)}
              className="inline-flex items-center min-h-[40px] px-3 rounded-full border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:border-pink-400"
            >
              {e.name}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const Icon = example.icon;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      {/*
        The first thing on the page, above the name, and it stays on screen for
        a full paragraph. A reader who scrolls straight to the mock must have
        already passed this.
      */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3.5">
        <Info size={16} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
        <p className="text-sm text-amber-900 dark:text-amber-200">
          <strong>This is an example page, not a business.</strong> No business is named, nothing
          here is a listing, and there is nobody to contact. It shows the profile a{' '}
          {example.name.toLowerCase()} business gets on NowOpen, filled with placeholder content.
        </p>
      </div>

      <header className="mt-6 flex items-start gap-3">
        <span className={`inline-flex w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br ${example.accent} items-center justify-center`}>
          <Icon size={21} className="text-white" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
            Industry page example
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white leading-tight">
            {example.name}
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{example.tagline}</p>
        </div>
      </header>

      <div className="mt-6">
        <IndustryPageMock example={example} />
      </div>

      {/* The detail the mock cannot show at that size. Same source. */}
      {example.modules.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            What customers can do on it
          </h2>
          <ul className="mt-3 grid sm:grid-cols-2 gap-2">
            {example.modules.map((m) => (
              <li key={m.key} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-sm font-bold text-gray-900 dark:text-white">{m.ctaLabel}</p>
                <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                  {[
                    placeholderFor(m),
                    m.showDateRange ? 'check-in and check-out' : m.showDate ? 'a date' : null,
                    m.showTime ? 'a time' : null,
                    m.showQuantity ? (m.quantityLabel ?? 'quantity').toLowerCase() : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
          {example.category && (
            <p className="mt-2 text-xs text-gray-500">
              Shown for {example.category}. Other categories in this industry run their own tools.
            </p>
          )}
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
          What the page carries
        </h2>
        <ul className="mt-3 grid sm:grid-cols-2 gap-1.5">
          {example.highlights.map((f) => (
            <li key={f} className="flex items-start gap-1.5 text-sm text-gray-700 dark:text-gray-300">
              <Check size={15} className="mt-0.5 shrink-0 text-green-600" /> {f}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        {/* The real thing, when it exists. This page is the layout; that page
            is the product running. */}
        {demoPath(example.slug) && (
          <Link
            to={demoPath(example.slug) as string}
            className="inline-flex items-center gap-2 min-h-[50px] px-6 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold"
          >
            <Eye size={16} /> See a live {example.name.toLowerCase()} page
          </Link>
        )}
        <Link
          to="/send-business"
          className="inline-flex items-center gap-2 min-h-[50px] px-6 rounded-xl bg-pink-600 text-white font-bold hover:bg-pink-700"
        >
          Get this page for my business <ArrowRight size={16} />
        </Link>
        <Link
          to="/platform"
          className="inline-flex items-center min-h-[50px] px-5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200"
        >
          Everything in this system
        </Link>
      </div>

      {/* Somewhere to go next, so the page is not a cul-de-sac. */}
      <section className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Other industries</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {orderedExamples().filter((e) => e.slug !== example.slug).slice(0, 10).map((e) => (
            <Link
              key={e.slug}
              to={examplePath(e.slug)}
              className="inline-flex items-center min-h-[38px] px-3 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:border-pink-400"
            >
              {e.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
