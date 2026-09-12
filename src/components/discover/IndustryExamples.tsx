import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Eye, ExternalLink,
  LayoutTemplate, X,
} from 'lucide-react';

import {
  INDUSTRY_EXAMPLES, demoPath, examplePath, orderedExamples, placeholderFor,
  type IndustryExample,
} from '../../lib/industryExamples';
import IndustryPageMock from './IndustryPageMock';

/**
 * "See what your industry's page looks like."
 *
 * Cards that fill the space a nearly-empty directory leaves, WITHOUT inventing
 * a business. Each one is an industry, not a listing: it opens a panel showing
 * the modules that industry's profiles actually run and the features they
 * actually carry, both read from the live config.
 *
 * ── THE THREE THINGS THAT KEEP THIS HONEST ────────────────────────────────
 *
 * 1. SEPARATE, LABELLED BLOCK. Never interleaved with real listings. Mixing is
 *    exactly how "example" becomes "listing" in a reader's head, and it would
 *    also make the grid contradict the count above it.
 *
 * 2. NAMED AFTER THE INDUSTRY. "Restaurants", not "Mama's Kitchen, Lekki".
 *    There is no business here to be mistaken for one you could ring.
 *
 * 3. NO CONTACT, NO PROFILE LINK, NO CLAIM. A card opens an explanation of the
 *    software. It does not open a page pretending to be somebody's business,
 *    and there is nothing on it to tap and be disappointed by.
 *
 * The action it drives is the real one: send us your business and we build the
 * page you just looked at.
 *
 * ── WHY A CAROUSEL AND NOT A GRID ─────────────────────────────────────────
 *
 * A grid of forty-four industries is a wall, and a grid of six is a sample
 * that makes the platform look smaller than it is. A strip holds every one of
 * them at no vertical cost, which matters because this sits between real
 * listings and the call to action — the two things it must not push apart.
 *
 * It is NOT reusing InfiniteSlider. That component is shaped for business
 * cards: rating, price, location, verified, and a link to a profile. Dressing
 * an example in it would make an example look like a listing, which is the one
 * failure this whole file exists to avoid.
 */

export default function IndustryExamples({
  /** What the visitor was looking for, so the heading answers them. */
  label = 'businesses',
  /** Everything, by default: a strip costs no vertical space to hold it. */
  limit = INDUSTRY_EXAMPLES.length,
}: { label?: string; limit?: number }) {
  const [open, setOpen] = useState<IndustryExample | null>(null);
  const examples = orderedExamples().slice(0, limit);

  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  /*
   * Which arrows are usable.
   *
   * Measured from the element rather than counted from an index, because the
   * number of cards on screen changes with the viewport and a card can be
   * part-scrolled. An arrow that looks available and does nothing is worse than
   * one that is visibly spent.
   */
  const readEdges = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    // 2px of slack: sub-pixel widths mean scrollLeft never quite reaches the
    // computed maximum, so an exact comparison leaves the arrow live forever.
    setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    readEdges();
    const el = strip.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(readEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [readEdges, examples.length]);

  /**
   * Roughly a screenful, so nothing is skipped over unseen.
   *
   * INSTANT, NOT SMOOTH, AND THAT IS NOT A SHORTCUT. CSS scroll snapping and a
   * programmatic smooth scroll fight each other: measured on the live page,
   * `scrollBy({ behavior: 'smooth' })` on this element ended back at 0 with
   * `x mandatory` AND with `x proximity`, and only moved with snapping off
   * entirely. The snap animation cancels the scroll animation and wins.
   *
   * So the arrow jumps and the snap stays. Losing the easing on a button press
   * is a smaller cost than losing the button, and swipe and trackpad — where
   * snapping actually earns its place — are untouched.
   */
  const nudge = (direction: 1 | -1) => {
    const el = strip.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: 'auto' });
    // scrollBy does not fire a scroll event synchronously, so the arrows would
    // stay a frame stale — visible as an arrow that is still lit at the end.
    requestAnimationFrame(readEdges);
  };

  return (
    <section className="py-8">
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[11px] font-bold uppercase tracking-wide">
          <LayoutTemplate size={13} /> Examples, not listings
        </span>
        <h3 className="mt-3 text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          What your industry&apos;s page looks like on NowOpen
        </h3>
        {/* Says plainly what these are before the reader forms their own idea. */}
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          These are not {label} — no business is named, and there is nothing here to call. Each one
          shows the tools that industry&apos;s profile actually runs, so you can see what we would
          build before you send us anything.
        </p>
      </div>

      <div className="relative mt-6">
        {/* Arrows sit over the ends of the strip. Hidden on touch, where a
            swipe is the obvious gesture and a floating button is in the way. */}
        <button
          type="button"
          onClick={() => nudge(-1)}
          disabled={edges.start}
          aria-label="Previous industries"
          className="hidden sm:flex absolute -left-3 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md disabled:opacity-0 disabled:pointer-events-none transition"
        >
          <ChevronLeft size={17} />
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          disabled={edges.end}
          aria-label="More industries"
          className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md disabled:opacity-0 disabled:pointer-events-none transition"
        >
          <ChevronRight size={17} />
        </button>

        <div
          ref={strip}
          onScroll={readEdges}
          /* A real scroller, not a transform: swipe, trackpad, shift-wheel and
             keyboard all work for free, and a card scrolled into view by Tab
             stays in view. snap-start stops it resting mid-card. */
          className="no-scrollbar flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-1 pb-1"
        >
        {examples.map((ex) => {
          const Icon = ex.icon;
          return (
            <button
              key={ex.slug}
              onClick={() => setOpen(ex)}
              aria-label={`See the ${ex.name} page`}
              /* Dashed, deliberately. A solid card in this strip reads as a
                 listing; a dashed one reads as a placeholder, which is what it
                 is. The difference does more work than the label. */
              className="group shrink-0 snap-start w-[9.5rem] sm:w-[10.5rem] text-left rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-3.5 hover:border-pink-400 hover:-translate-y-0.5 transition"
            >
              <span className={`inline-flex w-9 h-9 rounded-xl bg-gradient-to-br ${ex.accent} items-center justify-center`}>
                <Icon size={17} className="text-white" />
              </span>
              <p className="mt-2.5 text-[13px] font-bold leading-tight text-gray-900 dark:text-white">
                {ex.name}
              </p>
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">
                {ex.tagline}
              </p>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {/* Says which industries can show a working page, so the
                    stronger demonstrations are visible before a click. */}
                {ex.demo
                  ? 'Live page'
                  : ex.modules.length
                    ? `${ex.modules.length} live ${ex.modules.length === 1 ? 'tool' : 'tools'}`
                    : 'Page features'}
              </p>
            </button>
          );
        })}
        </div>
      </div>

      {/* The action, immediately after the cards. Whatever somebody just looked
          at, the next thing they can do is get it. */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          to="/send-business"
          className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-700"
        >
          Send your business and we build yours <ArrowRight size={16} />
        </Link>
        <Link
          to="/platform"
          className="inline-flex items-center gap-2 min-h-[46px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200"
        >
          All {INDUSTRY_EXAMPLES.length} industry systems
        </Link>
      </div>

      {open && <ExamplePanel example={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/**
 * What this industry's page carries.
 *
 * Every line comes from config the product already ships — CATEGORY_FEATURES
 * for the modules, the industry's own feature groups for the rest. Nothing is
 * written for the panel, so the panel cannot over-promise.
 */
function ExamplePanel({ example, onClose }: { example: IndustryExample; onClose: () => void }) {
  const Icon = example.icon;
  /*
   * Two views, one panel.
   *
   * The list of tools answers "what can it do"; it does not answer "what does
   * it look like", which is the question somebody deciding whether to send us
   * their restaurant is actually asking. So the panel can switch to a rendered
   * mock of the page itself.
   */
  const [preview, setPreview] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${example.name} page`}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-800 shadow-2xl"
      >
        <header className="sticky top-0 flex items-start gap-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-4">
          <span className={`inline-flex w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br ${example.accent} items-center justify-center`}>
            <Icon size={19} className="text-white" />
          </span>
          <div className="flex-1">
            <h2 className="font-bold text-gray-900 dark:text-white">
              {preview ? `${example.name} page` : example.name}
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {preview ? 'A preview with placeholder content' : example.tagline}
            </p>
          </div>
          {preview && (
            <button
              onClick={() => setPreview(false)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              <ArrowLeft size={13} /> Back
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2 text-gray-500 hover:text-gray-900 dark:hover:text-white">
            <X size={19} />
          </button>
        </header>

        {preview ? (
          <IndustryPageMock
            example={example}
            footer={
              <div className="mt-4 flex flex-wrap gap-2">
                {/* The linkable page. This is what "see live preview" should
                    have been from the start: a real URL you can send somebody,
                    not a panel that closes. */}
                <Link
                  to={demoPath(example.slug) ?? examplePath(example.slug)}
                  onClick={onClose}
                  className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold"
                >
                  <ExternalLink size={15} />
                  {demoPath(example.slug) ? 'Open a live page' : 'Open the full page'}
                </Link>
                <Link
                  to="/send-business"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-700"
                >
                  Get this page <ArrowRight size={15} />
                </Link>
                <button
                  onClick={() => setPreview(false)}
                  className="inline-flex items-center gap-1.5 min-h-[46px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200"
                >
                  <ArrowLeft size={14} /> Back to the tools
                </button>
              </div>
            }
          />
        ) : (
        <div className="p-5 space-y-5">
          {/* First line in the panel, not a footnote. */}
          <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            This is an example of the page, not a business. Nothing here is a real listing and there
            is nobody to contact — a real {example.name.toLowerCase()} page is filled in by the owner.
          </p>

          {example.modules.length > 0 && (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">
                What customers can do on it
              </h3>
              <ul className="space-y-2">
                {example.modules.map((m) => (
                  <li key={m.key} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{m.ctaLabel}</p>
                    <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                      {/* Described from the module's own flags, so it matches
                          what the live booking form will actually ask for. */}
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
                <p className="mt-2 text-[11px] text-gray-500">
                  Shown for {example.category}. Other categories in this industry run their own
                  tools.
                </p>
              )}
            </section>
          )}

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">
              What the page carries
            </h3>
            <ul className="grid sm:grid-cols-2 gap-1.5">
              {example.highlights.map((f) => (
                <li key={f} className="flex items-start gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                  <Check size={14} className="mt-0.5 shrink-0 text-green-600" /> {f}
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-wrap gap-2">
            {/*
              The real page first, when there is one.

              A wireframe shows the SHAPE of a page; this opens the page —
              the real profile renderer running the real industry modules,
              which is what "see live preview" should always have meant. Six
              industries have no demo profile and get the layout instead, and
              the button says which one you are about to get.
            */}
            {demoPath(example.slug) ? (
              <Link
                to={demoPath(example.slug) as string}
                onClick={onClose}
                className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold"
              >
                <Eye size={15} /> See a live {example.name.toLowerCase()} page
              </Link>
            ) : (
              <button
                onClick={() => setPreview(true)}
                className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold"
              >
                <Eye size={15} /> See the page layout
              </button>
            )}
            {/* The wireframe stays reachable for the industries that have a
                demo too — it reads faster than a full profile when all you
                want is what sections the page has. */}
            {demoPath(example.slug) && (
              <button
                onClick={() => setPreview(true)}
                className="inline-flex items-center gap-2 min-h-[46px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200"
              >
                <LayoutTemplate size={15} /> Just the layout
              </button>
            )}
            <Link
              to="/send-business"
              onClick={onClose}
              className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-700"
            >
              Get this page <ArrowRight size={15} />
            </Link>
            <Link
              to="/platform"
              onClick={onClose}
              className="inline-flex items-center min-h-[46px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200"
            >
              Everything in this system
            </Link>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
