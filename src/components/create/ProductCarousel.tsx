import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

import { PreviewCard } from './TemplateGallery';
import { NEEDS, POPULAR, listedFor, type NeedSlug } from '../../lib/create/needs';
import { DESIGN_STYLES } from '../../lib/design/styles';
import type { DesignTemplate } from '../../lib/designTemplates';

export interface CarouselPick {
  template: DesignTemplate;
  deliverable: string;
  deliverableName: string;
  need: NeedSlug;
  needTitle: string;
}

const MAX = 12;
const MIN = 10;

/**
 * Which designs the carousel shows: real, listed templates only.
 *
 * One per deliverable, so the strip reads as the RANGE of things that can be
 * made rather than twelve business cards. Popular deliverables lead, then the
 * rest in the order the needs are listed. Capped at twelve. When fewer than
 * ten deliverables have a finished design, second designs fill up to ten — and
 * if the library holds fewer than ten in total, the strip shows what exists.
 * Nothing is invented to fill it.
 */
export function carouselPicks(listed: DesignTemplate[]): CarouselPick[] {
  const order: { need: NeedSlug; deliverable: string }[] = [
    ...POPULAR.map((p) => ({ need: p.need, deliverable: p.deliverable })),
    ...NEEDS.flatMap((n) => n.deliverables.map((d) => ({ need: n.slug, deliverable: d.slug }))),
  ];
  const seen = new Set<string>();
  const slots = order.filter((o) => (seen.has(o.deliverable) ? false : (seen.add(o.deliverable), true)));

  const describe = (template: DesignTemplate, slot: { need: NeedSlug; deliverable: string }): CarouselPick => {
    const need = NEEDS.find((n) => n.slug === slot.need)!;
    return {
      template,
      deliverable: slot.deliverable,
      deliverableName: need.deliverables.find((d) => d.slug === slot.deliverable)?.name ?? template.label,
      need: need.slug,
      needTitle: need.title,
    };
  };

  const picks: CarouselPick[] = [];
  const used = new Set<string>();
  for (const slot of slots) {
    if (picks.length >= MAX) break;
    const first = listedFor(slot.deliverable, listed)[0];
    if (first) { picks.push(describe(first, slot)); used.add(first.key); }
  }
  for (let round = 1; picks.length < MIN; round += 1) {
    let added = false;
    for (const slot of slots) {
      if (picks.length >= MIN) break;
      const next = listedFor(slot.deliverable, listed)[round];
      if (next && !used.has(next.key)) { picks.push(describe(next, slot)); used.add(next.key); added = true; }
    }
    if (!added) break;
  }
  return picks;
}

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduce, setReduce] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

/*
 * The loop is one transform on one element: translateX 0 → -50% across two
 * identical copies, so the second copy lands exactly where the first began.
 * Spacing is padding inside each item rather than a flex gap, which keeps
 * the two copies the same width and the seam invisible. Nothing re-lays out
 * while it runs; the browser composites it.
 */
const STYLES = `
@keyframes nowopen-products-marquee { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
.nowopen-products-track { animation: nowopen-products-marquee 50s linear infinite; will-change: transform; }
.nowopen-products-track.is-paused,
.nowopen-products-viewport:hover .nowopen-products-track,
.nowopen-products-viewport:focus-within .nowopen-products-track { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .nowopen-products-track { animation: none; } }
`;

const FADE = 'linear-gradient(to right, transparent, #000 40px, #000 calc(100% - 40px), transparent)';
/* Reduced motion, at the very start: no left fade, or the first card is half hidden. */
const FADE_RIGHT_ONLY = 'linear-gradient(to right, #000, #000 calc(100% - 40px), transparent)';
const BRAND = '#2563eb';

/**
 * Creative products — a slow, continuous strip of what can be made here.
 *
 * Every card is a real finished design drawn by the same renderer as the
 * gallery, and opens the same editor the gallery opens.
 *
 * ── WHEN IT STOPS ────────────────────────────────────────────────────────
 *
 * Under the pointer, while a card has keyboard focus, when the visitor
 * presses the pause button (WCAG 2.2.2: anything that moves for more than
 * five seconds needs a way to stop it), when it is scrolled off screen and
 * when the tab is hidden — the last two because a loop nobody can see is
 * battery spent on nothing. With reduced motion asked for it never moves:
 * it is a plain strip you scroll yourself, and there is no button to show.
 */
export default function ProductCarousel({
  listed, onOpen,
}: { listed: DesignTemplate[]; onOpen: (template: DesignTemplate) => void }) {
  const picks = useMemo(() => carouselPicks(listed), [listed]);
  const reduce = usePrefersReducedMotion();
  const section = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const [tabHidden, setTabHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  /* Reduced motion only: whether the strip has been scrolled away from its start. */
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const node = section.current;
    if (!node || reduce || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => setOffscreen(!entries.some((e) => e.isIntersecting)));
    io.observe(node);
    return () => io.disconnect();
  }, [reduce]);

  useEffect(() => {
    const on = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  if (picks.length === 0) return null;

  const paused = userPaused || offscreen || tabHidden;
  const styleKey = DESIGN_STYLES[0].key;
  const card = (p: CarouselPick, clone: boolean) => (
    <li key={p.template.key} className="w-[160px] shrink-0 snap-start pr-3 sm:w-[220px] sm:pr-4">
      <PreviewCard
        template={p.template}
        styleKey={styleKey}
        brand={BRAND}
        caption={{ title: p.deliverableName, sub: p.needTitle }}
        tabIndex={clone ? -1 : undefined}
        onOpen={() => onOpen(p.template)}
      />
    </li>
  );

  const fadeLeft = !reduce || scrolled;
  const mask = fadeLeft ? FADE : FADE_RIGHT_ONLY;

  return (
    <section
      ref={section}
      data-create-section="products"
      aria-label="Creative products"
      className="relative overflow-hidden"
      /*
       * Focusing a card inside an overflow-hidden box makes the browser
       * scroll the box to show it. The transform carries on from there, so
       * the strip jumps by however far it scrolled. Put it back on the way out.
       */
      onBlur={() => {
        if (reduce) return;
        if (section.current) section.current.scrollLeft = 0;
        if (viewport.current) viewport.current.scrollLeft = 0;
      }}
    >
      {/*
        py-3: room for a card's hover lift and shadow inside the clip.
        mr-[52px] in motion mode: a gutter for the pause button, so it never
        sits over the caption of the right-most card on a phone.
      */}
      <div
        ref={viewport}
        data-testid="products-viewport"
        data-fade={fadeLeft ? "both" : "right"}
        className={`nowopen-products-viewport overflow-hidden py-3${reduce ? '' : ' mr-[52px]'}`}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        {reduce ? (
          <ul
            data-testid="products-list"
            onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 4)}
            className="flex snap-x snap-mandatory overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {picks.map((p) => card(p, false))}
          </ul>
        ) : (
          <>
            <style>{STYLES}</style>
            <div
              data-testid="products-track"
              className={`nowopen-products-track flex w-max${paused ? ' is-paused' : ''}`}
              style={paused ? { animationPlayState: 'paused' } : undefined}
            >
              <ul data-testid="products-list" className="flex">
                {picks.map((p) => card(p, false))}
              </ul>
              <ul data-testid="products-clone" aria-hidden="true" className="flex">
                {picks.map((p) => card(p, true))}
              </ul>
            </div>
          </>
        )}
      </div>

      {/* Outside the masked viewport, so the edge fade never dims it. */}
      {!reduce && (
        <button
          type="button"
          onClick={() => setUserPaused((v) => !v)}
          aria-pressed={userPaused}
          aria-label={userPaused ? 'Play products' : 'Pause products'}
          className="absolute bottom-4 right-0 grid h-[44px] w-[44px] place-items-center rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-md backdrop-blur hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800/95 dark:text-gray-200"
        >
          {userPaused ? <Play size={16} /> : <Pause size={16} />}
        </button>
      )}
    </section>
  );
}
