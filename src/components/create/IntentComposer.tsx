import { useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUp, Paperclip, Palette } from 'lucide-react';

import {
  categoryForIntent, classifyIntent, deliverableForIntent, needForIntent, routeFor,
  type CreateIntent,
} from '../../lib/create/intent';
import { NEEDS, needFromLegacy, type NeedSlug } from '../../lib/create/needs';
import { parseQuery, searchCatalogue } from '../../lib/create/searchRank';
import { SUBCATEGORIES } from '../../lib/create/catalogueTaxonomy';

/**
 * The request bar: "What do you need?" and the need tiles under it.
 *
 * ── A REQUEST IS ANSWERED WITH A NEED, NOT A PARAGRAPH ───────────────────
 *
 * The sentence is read by the deterministic classifier in
 * lib/create/intent.ts. No model is involved and none is pretended.
 *
 * When the words resolve to a need (and, often, the exact thing inside it),
 * the page opens that need's view — the same place tapping the tile lands —
 * and this box says nothing more. It used to answer with a panel of text
 * ("This opens as an editable design…") and a button into the editor on a
 * guessed layout; the visitor then had to scroll past it to the designs the
 * words had actually picked.
 *
 * When they resolve to nothing, it says so in one line, offers the nearest
 * need it can honestly point at, and the made-for-you lane. Where the ask
 * is something we cannot make here — a film, an original logo, written copy
 * — the line is the honest boundary from `routeFor`, not a generic shrug.
 *
 * ── WHAT WENT ──────────────────────────────────────────────────────────────
 *
 * The five example chips ("Create a video", "Write copy" …) and the hero
 * photograph. Popular now and the need tiles are the shortcuts now; a third
 * row of them, two of which led to "cannot do yet", was clutter.
 */

type Signal = { need: NeedSlug | ''; deliverable: string; n: number };

/** The nearest need to point at when the words resolved to nothing exact. */
function nearestNeed(intent: CreateIntent, offer: NeedSlug[]): NeedSlug | null {
  const fromWords = categoryForIntent(intent);
  const guess = (fromWords ? needFromLegacy(fromWords) : null) ?? (intent.kind === 'brand' ? 'brand' : null);
  return guess && offer.includes(guess) ? guess : null;
}

export default function IntentComposer({
  onCategory, offer = [], children,
}: {
  onCategory?: (signal: Signal) => void;
  /** Needs this page can open well enough to suggest as "nearest". */
  offer?: NeedSlug[];
  /** The need tiles, which belong to the request bar. */
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [miss, setMiss] = useState<{ message: string; nearest: NeedSlug | null } | null>(null);
  /* Counted so two identical readings in a row are still two events. */
  const asked = useRef(0);

  const emit = (need: NeedSlug | '', deliverable: string) => {
    asked.current += 1;
    onCategory?.({ need, deliverable, n: asked.current });
  };

  const understand = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    /*
     * A product the lexicon knows but the catalogue lacks (a pitch deck) is
     * said plainly, the miss is recorded, and the nearest real product in the
     * same category is offered. Ranked results themselves are Task 15's cards.
     */
    const parsed = parseQuery(trimmed);
    if (parsed.subcategory && !SUBCATEGORIES.some((s) => s.key === parsed.subcategory)) {
      const out = searchCatalogue(trimmed, [], new Map());
      if (out.status === 'not-in-catalogue') {
        const near = NEEDS.find((n) => n.deliverables.some((d) => d.slug === out.nearest))?.slug ?? null;
        setMiss({ message: out.message, nearest: near && offer.includes(near) ? near : null });
        emit('', '');
        return;
      }
    }
    const intent = classifyIntent(trimmed);
    const need = needForIntent(intent);
    if (need) {
      setMiss(null);
      /* The exact thing, when the words named one - see intent.ts. */
      emit(need, deliverableForIntent(intent) ?? '');
      return;
    }
    const route = routeFor(intent);
    setMiss({
      message: route.action === 'explain'
        ? route.cannotDo
        : 'We could not match that to a design yet. Try naming the thing — “business card”, “menu”, “sale flyer”.',
      nearest: nearestNeed(intent, offer),
    });
    /* Withdraws a view an earlier request opened, so it is not read as this answer. */
    emit('', '');
  };

  const nearest = miss?.nearest ? NEEDS.find((n) => n.slug === miss.nearest) : undefined;

  return (
    <section
      data-create-section="request"
      aria-labelledby="create-intent"
      className="rounded-3xl border border-gray-200 bg-white px-4 py-6 shadow-sm dark:border-gray-700 dark:bg-gray-800/60 sm:px-8 sm:py-9"
    >
      <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-green-700 dark:text-green-400">
        <Palette size={14} /> NowOpen Create
      </p>
      {/*
        * The page h1, not an h2.
        *
        * The crawler snapshot in lib/marketingPageRender.ts serves the h1
        * it expects to find here, and this question IS what the page is
        * for — a test enforces that the two keep saying the same thing.
        */}
      <h1 id="create-intent" className="mt-2 text-[1.6rem] font-bold leading-[1.15] tracking-tight text-gray-900 dark:text-white sm:text-[2.25rem]">
        What do you need?
      </h1>
      <p className="mt-2 max-w-xl text-sm text-gray-600 dark:text-gray-400">
        Say it in your own words, or pick what you need. Every design is editable and made from your brand.
      </p>

      {/* min-w-0 so the send button never sits off a 375px screen. */}
      <div className="mt-5 min-w-0">
        <div className="flex items-end gap-2 rounded-2xl border border-gray-300 bg-white p-2 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/30 dark:border-gray-600 dark:bg-gray-900">
          <label htmlFor="create-prompt" className="sr-only">Describe what you need</label>
          <textarea
            id="create-prompt"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              /* Enter sends; Shift+Enter is a new line. */
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); understand(text); }
            }}
            rows={1}
            placeholder="A business card for my salon"
            className="min-h-[44px] min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-white"
          />
          {/*
            * Attach opens the reference recreation that already exists: a
            * picture of a design is rebuilt as editable layers. A real
            * feature, which is why it is offered here.
            */}
          <button
            type="button"
            onClick={() => navigate('/media/studio')}
            aria-label="Attach a reference"
            title="Attach a reference"
            className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <Paperclip size={17} />
          </button>
          <button
            type="button"
            onClick={() => understand(text)}
            disabled={!text.trim()}
            aria-label="Read my idea"
            className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
          >
            <ArrowUp size={18} />
          </button>
        </div>

        {miss && (
          <div
            data-testid="intent-no-match"
            role="status"
            className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-900/60"
          >
            <p className="mr-auto min-w-0 text-sm text-gray-700 dark:text-gray-300">{miss.message}</p>
            {nearest && (
              <button
                type="button"
                onClick={() => { setMiss(null); emit(nearest.slug, ''); }}
                className="inline-flex items-center min-h-[44px] rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:border-green-400 dark:border-gray-600 dark:text-gray-200"
              >
                See {nearest.title.toLowerCase()}
              </button>
            )}
            <Link
              to="/media/services#made-for-you"
              className="inline-flex items-center gap-1.5 min-h-[44px] rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
            >
              Have it made for you <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </div>

      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}
