import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Pencil, Search, Shuffle } from 'lucide-react';

import TemplateSurface from '../studio/TemplateSurface';
import TemplateCustomiser from './TemplateCustomiser';
import { defaultMediaScrim, type DesignTemplate } from '../../lib/designTemplates';
import { useDesignCatalogue } from '../../hooks/useDesignCatalogue';
import { sampleFor } from '../../lib/create/sampleCopy';
import { previewPhotoFor } from '../../lib/design/previewMedia';
import { cardTitle, formatForTemplate } from '../../lib/design/deliverables';
import {
  deliverableSlugFor, isListed, needFor, type NeedSlug,
} from '../../lib/create/needs';
import { DESIGN_FORMATS } from '../../data/studioPresets';
import { DESIGN_STYLES, applyStyle, styleColours, styleOf } from '../../lib/design/styles';
import {
  TEMPLATE_USES, diversify, findTemplates, type TemplateUse,
} from '../../lib/design/taxonomy';
import { ensureTypefacesReady } from '../../lib/design/typefaces';
import { track } from '../../lib/telemetry';

/**
 * The design library, on the PUBLIC Create page.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * Everything built into the design engine — the self-hosted typefaces, the
 * eight styles, the thirty-nine layouts, the search — lived entirely inside
 * /studio, which sits behind a sign-in. So the main Create page said "make it
 * free with your own logo and colours" and then showed a price list. A visitor
 * had to create an account to find out whether the designs were any good.
 *
 * That is the wrong way round. Design quality is the ONLY thing that decides
 * whether somebody trusts a creative tool, and it is the one thing we were
 * hiding. Pricing was public and the work was private.
 *
 * ── THESE ARE THE REAL TEMPLATES ─────────────────────────────────────────
 *
 * Not screenshots and not a marketing mock-up. Each card renders the actual
 * DesignTemplate through the same TemplateSurface the editor and the exporter
 * use, in the real typefaces, restyled live. What a visitor sees here is
 * exactly what Studio will produce — which is the only version of this section
 * worth having, because a gallery of prettier-than-real previews is a promise
 * the product then breaks.
 *
 * ── THE COLOUR CONTROL IS THE ARGUMENT ───────────────────────────────────
 *
 * Canva shows you a template. This shows you YOUR template: change the colour
 * and all thirty-nine restyle, because a style is a rule applied to the brand's
 * own accent rather than a fixed palette. That is the whole difference between
 * a template library and a brand-aware one, and it cannot be explained in a
 * paragraph as well as it can be demonstrated with one swatch.
 *
 * ── NOT FABRICATED ───────────────────────────────────────────────────────
 *
 * The preview copy is obviously placeholder — "Your headline here", "Your
 * phone". No invented business name, no invented phone number, no invented
 * review. A gallery populated with plausible fake businesses would be the
 * exact thing this codebase refuses to do everywhere else.
 */

/*
 * Placeholder copy, now shaped to each layout's purpose.
 *
 * MEASURED 2026-10-14: every card in the grid rendered the same four lines,
 * so a catalogue of hundreds of designs read as one poster repeated. The
 * differed and nobody could see it.
 *
 * Still labels, never data — see lib/create/sampleCopy.ts, which keeps the
 * no-invented-business rule this file established.
 */

/**
 * Colours somebody might actually have, spread across the hue circle AND
 * across lightness — a row of six mid-tone colours would hide the fact that
 * the styles handle a pale yellow and a near-black brand differently.
 */
const SWATCHES = ['#2563eb', '#e11d48', '#059669', '#f59e0b', '#7c3aed', '#0f172a'];

/** Rendered at this size, then scaled down by CSS. One coordinate space. */
const DESIGN = 1080;

/*
 * The column count at each Tailwind breakpoint.
 *
 * These are the prefixes on the grid below (2 / sm:3 / md:4 / lg:6 / xl:7),
 * mirrored in JS so the reveal can be measured in rows. If one changes, the
 * other has to change with it.
 */
const COLUMNS: Array<[minWidth: number, columns: number]> = [
  [1280, 7],
  [1024, 6],
  [768, 4],
  [640, 3],
];

function columnsForWidth(width: number): number {
  return COLUMNS.find(([minWidth]) => width >= minWidth)?.[1] ?? 2;
}

function useColumns(): number {
  const [columns, setColumns] = useState(() => (
    typeof window === 'undefined' ? 2 : columnsForWidth(window.innerWidth)
  ));

  useEffect(() => {
    const sync = () => setColumns(columnsForWidth(window.innerWidth));
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  return columns;
}

export default function TemplateGallery(
  { focus, embedded = false }: {
    focus?: { need: NeedSlug | ''; deliverable: string; n: number };
    /*
     * Driven by a need view that already shows the needs (as tiles) and the
     * things inside the chosen one (as chips). The gallery's own "I need" and
     * item rows would repeat both, so they are hidden; `focus` still steers
     * the grid exactly as before.
     */
    embedded?: boolean;
  },
) {
  const [query, setQuery] = useState('');
  const [use, setUse] = useState<TemplateUse | ''>('');
  /*
   * What you are trying to MAKE, which is how people look for designs.
   *
   * Style stays available and stays secondary: a restaurant owner thinks
   * "I need a menu", not "I need an editorial split".
   */
  const [need, setNeed] = useState<NeedSlug | ''>('');
  /*
   * One THING inside that need, when the request named one: "a business
   * card" shows the cards and nothing else. The need alone would also hand
   * back letterheads and invoices, which are not cards.
   */
  const [deliverable, setDeliverable] = useState('');
  /*
   * Null means MIXED, and it is the default.
   *
   * MEASURED on production 2026-10-14: with one style selected, all 59 cards
   * rendered in that style's palette, so a catalogue of 649 designs across
   * eleven styles presented itself as one blue poster repeated down the page.
   * The variety was real and completely invisible, which is the same thing as
   * not having it.
   *
   * Mixed varies the STYLE and nothing else: the palette still derives from
   * the visitor's own brand colour, so "made from your brand" stays true
   * while the grid finally shows what the range actually is.
   */
  const [styleKey, setStyleKey] = useState<string | null>(null);
  const [brand, setBrand] = useState(SWATCHES[0]);
  /*
   * Whether the visitor has actually CHOSEN a colour.
   *
   * Until they do, the blue above is a default rather than their brand — so
   * the showcase is free to spread colours across the grid. The moment they
   * pick one, every card is theirs and stays theirs. That distinction is the
   * difference between a showcase and overriding somebody's brand.
   */
  const [brandPicked, setBrandPicked] = useState(false);
  /*
   * TWO ROWS OPEN, TWO MORE PER CLICK.
   *
   * The window is a number of ROWS rather than a number of cards, because the
   * grid is 2 / 3 / 4 / 6 / 7 across depending on width. A fixed card count
   * that fills seven columns leaves a ragged row at six, and a count fixed for
   * six leaves one at seven. Counting rows makes the reveal land on a whole
   * row at every breakpoint, including after a resize.
   */
  const columns = useColumns();
  const PAGE = columns * 2;
  const [pages, setPages] = useState(1);
  const shown = pages * PAGE;
  /*
   * Which design is open for editing.
   *
   * The cards used to link to /studio?module=design, which opens Studio's
   * front door on whatever layout was last selected — not the one that was
   * clicked. It navigated, so it "worked", and it visibly did nothing, which
   * is the same thing as broken.
   */
  const [editing, setEditing] = useState<DesignTemplate | null>(null);
  /*
   * A shared `?look=<seed>` link opens its design remixed. The customiser
   * validates the value (see lib/design/lookParam.ts); here it is only passed
   * on, and `?template=<key>` names the design to open.
   */
  const { search } = useLocation();
  const linkParams = useMemo(() => new URLSearchParams(search), [search]);
  const lookParam = linkParams.get('look');
  const linkTemplate = linkParams.get('template');
  /*
   * The link's look belongs to the design the link NAMED, and to its first
   * opening only. Without both, a shared seed leaked onto every card opened
   * afterwards and came back each time the same card was reopened.
   */
  const [linkConsumed, setLinkConsumed] = useState(false);
  useEffect(() => {
    if (lookParam && linkTemplate && editing?.key === linkTemplate) setLinkConsumed(true);
  }, [editing, lookParam, linkTemplate]);
  /* The style the opened card was rendered in. */
  const [openStyle, setOpenStyle] = useState<string>(DESIGN_STYLES[0].key);

  /*
   * The catalogue: the layouts in the bundle, plus any a creative manager
   * has published from the dashboard.
   *
   * It is never a loading state. The code templates are already here, so
   * waiting on a network call to show what we are holding would be slower
   * than what it replaces — and a failed call would leave the shop window
   * empty. Published uploads append when they land.
   */
  const { templates } = useDesignCatalogue();

  /* Opens the design a `?template=&look=` link names, once the catalogue has it. */
  const linkOpened = useRef(false);
  useEffect(() => {
    const key = linkParams.get('template');
    if (linkOpened.current || !key || !linkParams.get('look')) return;
    const found = templates.find((t) => t.key === key);
    if (found) { linkOpened.current = true; setEditing(found); }
  }, [templates, linkParams]);

  /*
   * Only FINISHED designs are offered: a template with no `look` is still
   * reachable by a direct ?template= link, but a gallery that lists half-built
   * layouts shows a visitor our worst work first. The filter runs AFTER the
   * uploaded rows are merged in, so an upload without a look is held back too.
   */
  const listed = useMemo(() => templates.filter(isListed), [templates]);

  /*
   * A request from the composer selects that shelf and brings it into view.
   *
   * It also CLEARS a shelf a previous request had chosen, when the new words
   * point nowhere. Measured: asking for a sale poster and then typing
   * something vague left thirteen sale designs on screen as though they were
   * the answer. A filter the visitor set by hand is left alone - only the
   * composer's own choice is withdrawn, which is why the signal is counted
   * rather than just read.
   *
   * A deliverable with no finished design yet is dropped to its need, so the
   * request lands on something rather than on an empty shelf.
   */
  const promptSet = useRef(false);
  useEffect(() => {
    if (!focus || focus.n === 0) return;
    if (focus.need) {
      promptSet.current = true;
      const hasAny = Boolean(focus.deliverable)
        && listed.some((t) => needFor(t) === focus.need && deliverableSlugFor(t) === focus.deliverable);
      setNeed(focus.need);
      setDeliverable(hasAny ? focus.deliverable : '');
      setPages(1);
      /* No scroll from here: the page scrolls the need view's own top into
         view, so its title and chips are not left above the fold. */
      return;
    }
    if (promptSet.current) {
      promptSet.current = false;
      setNeed('');
      setDeliverable('');
      setPages(1);
    }
    // `listed` is read once per signal; a late catalogue arrival must not re-fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const styleAt = (i: number): string => styleKey ?? DESIGN_STYLES[i % DESIGN_STYLES.length].key;

  /*
   * The colour for card `i`. Only spread while the visitor has chosen
   * neither a style nor a colour — the opening showcase. After that every
   * card uses their colour, because the promise on this page is that these
   * designs are made from THEIR brand, not from a palette we liked.
   *
   * Plain indexing, deliberately. An earlier version multiplied the index by
   * three to "avoid lockstep" — but three shares a factor with the six
   * swatches, so it cycled through TWO of them and quietly halved the variety
   * it was written to create. Eleven styles against six colours are already
   * coprime: a pairing does not repeat until the sixty-sixth card.
   */
  const showcase = styleKey === null && !brandPicked;
  const brandAt = (i: number): string => (showcase ? SWATCHES[i % SWATCHES.length] : brand);

  // The previews are set in Playfair Display, Bebas Neue and the rest. Without
  // this the first paint is Georgia and Arial Narrow, and the gallery whose
  // entire job is to show off the typography shows the fallbacks instead.
  useEffect(() => { void ensureTypefacesReady(); }, []);

  const results = useMemo(() => {
    const found = findTemplates(query, { use: use || undefined }, listed);
    /*
     * Browsing gets variety; searching gets relevance.
     *
     * With no query the order is arbitrary, so it should be arranged to show
     * range - the catalogue's own order put three dark blue layouts first and
     * made a 312-design library look like one design. With a query the ranking
     * IS the answer and must not be shuffled for looks.
     */
    const inNeed = need ? found.filter((t) => needFor(t) === need) : found;
    const inThing = deliverable
      ? inNeed.filter((t) => deliverableSlugFor(t) === deliverable)
      : inNeed;
    return query.trim() ? inThing : diversify(inThing);
  }, [query, use, need, deliverable, listed]);

  // Reset the window whenever the list changes, or "Show more" would reveal
  // rows from a previous search.
  useEffect(() => { setPages(1); }, [query, use, need, deliverable]);

  const visible = results.slice(0, shown);

  return (
    // Named, so the empty state further down the page can send somebody here
    // rather than to a tour of industries.
    <section id="create-designs" className="scroll-mt-24">
      <div className={`flex flex-wrap items-end gap-3 ${embedded ? 'justify-end' : 'justify-between'}`}>
        {/*
          * The count is the designs on offer, nothing multiplied.
          *
          * It read "layouts × styles" — 737 inside a need holding 7 designs.
          * A listed design has a finished look and renders as-is, so a style
          * does not make it a second design. Embedded, the need view already
          * titles the section and the heading is left out.
          */}
        {!embedded && (
        <div>
          <h3 data-testid="gallery-count" className="text-lg font-bold text-gray-900 dark:text-white">
            {listed.length.toLocaleString('en-NG')} designs, made from your brand
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Real templates, rendered here exactly as Studio makes them.
          </p>
        </div>
        )}
        <Link
          to={`/studio?module=design&style=${encodeURIComponent(styleKey ?? DESIGN_STYLES[0].key)}`}
          onClick={() => track('template_picked', { from: 'gallery_header', style: styleKey ?? 'mixed' })}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-5 rounded-xl bg-green-700 text-white text-sm font-bold hover:bg-green-800"
        >
          Make one free <ArrowRight size={16} />
        </Link>
      </div>

      {/* Brand colour first: it is the point of the section, not a setting. */}
      <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Your colour</span>
            {SWATCHES.map((hex) => (
              <button
                key={hex}
                onClick={() => { setBrand(hex); setBrandPicked(true); }}
                aria-label={`Preview in ${hex}`}
                className={`h-7 w-7 rounded-full border-2 transition ${brand === hex ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                style={{ background: hex }}
              />
            ))}
            <label className="relative h-7 w-7 rounded-full border-2 border-dashed border-gray-400 overflow-hidden cursor-pointer" title="Any other colour">
              <input
                type="color"
                value={brand}
                onChange={(e) => { setBrand(e.target.value); setBrandPicked(true); }}
                aria-label="Pick any colour"
                className="absolute -inset-2 h-12 w-12 cursor-pointer"
              />
            </label>
          </div>

        {/*
          * What you are making is chosen by the need view around this
          * gallery — its tiles and chips. The gallery's own need and item
          * rows repeated them, and no page renders the gallery on its own any
          * more, so they are gone; `focus` narrows the grid.
          */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Style</span>
            <button
              onClick={() => setStyleKey(null)}
              title="Show every style across the grid"
              className={`inline-flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-full border text-[11px] font-semibold transition ${
                styleKey === null ? 'border-transparent ring-2 ring-green-500 bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
              }`}
            >
              <span className="inline-flex shrink-0 rounded-full overflow-hidden border border-black/10" style={{ width: 20, height: 10 }}>
                {DESIGN_STYLES.slice(0, 4).map((st) => (
                  <span key={st.key} style={{ background: styleColours(st, brand).accent, width: 5 }} />
                ))}
              </span>
              All styles
            </button>
            {DESIGN_STYLES.map((st) => {
              const swatch = styleColours(st, brand);
              const on = st.key === styleKey;
              return (
                <button
                  key={st.key}
                  onClick={() => setStyleKey(st.key)}
                  title={st.blurb}
                  className={`inline-flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-full border text-[11px] font-semibold transition ${on ? 'border-transparent ring-2 ring-green-500' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'}`}
                  style={on ? { background: swatch.base, color: swatch.ink } : undefined}
                >
                  <span className="inline-flex shrink-0 rounded-full overflow-hidden border border-black/10" style={{ width: 20, height: 10 }}>
                    <span style={{ background: swatch.base, width: 10 }} />
                    <span style={{ background: swatch.accent, width: 10 }} />
                  </span>
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          {showcase
            ? 'Showing the range: every style, across a spread of brand colours. Pick a colour or a style and every design below becomes yours.'
            : 'Every style derives its palette from the colour you picked — and checks the text stays readable on it. Nothing here is a fixed palette with your name typed into it.'}
        </p>
      </div>

      {/* Find one. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search designs"
            placeholder="menu, hiring, house for sale, opening hours…"
            className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
          />
        </div>
        <button
          onClick={() => setUse('')}
          className={`px-3 min-h-[36px] rounded-full text-xs font-semibold border ${use === '' ? 'bg-gray-900 text-white border-transparent dark:bg-white dark:text-gray-900' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
        >
          All
        </button>
        {TEMPLATE_USES.map((u) => (
          <button
            key={u.key}
            onClick={() => setUse(u.key)}
            title={u.blurb}
            className={`px-3 min-h-[36px] rounded-full text-xs font-semibold border ${use === u.key ? 'bg-gray-900 text-white border-transparent dark:bg-white dark:text-gray-900' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
          >
            {u.label}
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
          <p className="text-sm text-gray-500">
            Nothing matches all of those words. Try one word — “menu”, “sale”, “hiring”.
          </p>
        </div>
      ) : (
        <>
          {/*
            Six across on a laptop, seven on a wide desktop, stepping down to
            two on a phone.

            A gallery is browsed, not read: at three across the previews were
            big enough to study one and too big to compare six, which is the
            wrong way round for choosing. Two rows open, and the window is
            measured in rows so "Show more" always lands on a whole one.
          */}
          <div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
            {visible.map((tpl, i) => {
              const cardStyle = styleAt(i);
              return (
                <PreviewCard
                  key={tpl.key}
                  template={tpl}
                  styleKey={cardStyle}
                  brand={brandAt(i)}
                  /* Named on the card when mixed, so what you see has a name. */
                  showStyleName={styleKey === null}
                  onOpen={() => {
                    /* Opens in the style that was ON THE CARD, not whatever
                       the picker happens to say. */
                    setOpenStyle(cardStyle);
                    /* Opening a showcase card adopts the colour it was shown in. */
                    if (showcase) { setBrand(brandAt(i)); setBrandPicked(true); }
                    setEditing(tpl);
                    track('template_picked', { template: tpl.key, style: cardStyle });
                  }}
                />
              );
            })}
          </div>

          {shown < results.length && (
            <button
              onClick={() => setPages((n) => n + 1)}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:border-green-400"
            >
              <Shuffle size={15} /> Show {Math.min(PAGE, results.length - shown)} more
              <span className="text-gray-400">({results.length - shown} left)</span>
            </button>
          )}
        </>
      )}

      {editing && (
        <TemplateCustomiser
          template={editing}
          initialStyle={openStyle}
          initialBrand={brand}
          initialLook={!linkConsumed && lookParam && editing.key === linkTemplate ? lookParam : null}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

/**
 * One preview.
 *
 * Rendered at 1080 and scaled with a CSS transform, which is how the editor and
 * the exporter share one coordinate space — a preview that laid itself out at
 * 320px would be a different design at a different size, and the whole point of
 * fractional geometry is that it is not.
 *
 * MOUNTED ONLY ONCE IN VIEW. A TemplateSurface is a real DOM tree of a dozen
 * absolutely-positioned nodes with gradients and clip paths; thirty-nine of
 * them at once is a visible stall on the mid-range Android this page is mostly
 * read on. The observer is the difference between a gallery and a jank demo.
 */
/**
 * The size a card draws its template at: the template's OWN canvas
 * proportion, long edge at DESIGN.
 *
 * Every card used to draw at 1080x1080, whatever the design was for. A
 * 3:1 shopfront sign, a 728x90 ad or a business card was squeezed into a
 * square — type ran into the column beside it — which made a correct
 * layout look broken in the one place a customer judges it. A template
 * with no canvas of its own keeps the square, as before.
 */
function previewPage(template: DesignTemplate): { w: number; h: number } {
  const format = DESIGN_FORMATS.find((f) => f.key === formatForTemplate(template));
  if (!format) return { w: DESIGN, h: DESIGN };
  const k = DESIGN / Math.max(format.w, format.h);
  return { w: Math.round(format.w * k), h: Math.round(format.h * k) };
}

/**
 * One design, drawn by the real renderer at its true shape.
 *
 * Exported for the products carousel on the Create page, which shows the
 * same cards: `caption` replaces the two lines under the picture, and
 * `tabIndex` lets a decorative duplicate be skipped by the keyboard.
 * `body` replaces everything under the picture, for the catalogue's
 * TemplateCard, which states more about the design than a gallery tile.
 */
export function PreviewCard({
  template, styleKey, brand, showStyleName = false, onOpen, caption, tabIndex, body,
}: {
  template: DesignTemplate;
  styleKey: string;
  brand: string;
  showStyleName?: boolean;
  onOpen: () => void;
  caption?: { title: string; sub: string };
  tabIndex?: number;
  body?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  /*
   * The scale is MEASURED, never assumed.
   *
   * The surface lays itself out at 1080 and the card is responsive, so a
   * hard-coded scale is correct at exactly one viewport width and wrong at
   * every other — cropped on a phone, floating in a gap on a desktop. Zero
   * until measured, so nothing paints at the wrong size first.
   */
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setScale(node.clientWidth / DESIGN);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const node = box.current;
    if (!node || seen) return;
    // No IntersectionObserver (old browsers, jsdom) means render immediately:
    // a blank card is worse than a slow one.
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '300px' });
    io.observe(node);
    return () => io.disconnect();
  }, [seen]);

  const styled = useMemo(() => applyStyle(template, styleOf(styleKey)), [template, styleKey]);
  /*
   * Per card, not once for the section.
   *
   * Under a 'keep' style each layout renders in its OWN scheme — Quiet Luxe is
   * light, Statement is dark — so one shared palette would paint a light
   * layout on a dark ground and let the renderer put near-black type on it.
   */
  const tone = useMemo(
    () => styleColours(styleOf(styleKey), brand, styled.scheme),
    [styleKey, brand, styled.scheme],
  );
  const page = useMemo(() => previewPage(template), [template]);

  /*
   * The card goes to the design's detail page (/media/templates/:key), which
   * says what the design is before you edit it. The Edit button over the
   * corner keeps the old one-tap way into the customiser for people who
   * already know what they want. Two siblings, not a button inside a link.
   */
  return (
    <div className="group relative rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden hover:-translate-y-0.5 hover:shadow-lg transition">
    <Link
      to={`/media/templates/${encodeURIComponent(template.key)}`}
      tabIndex={tabIndex}
      data-template={template.key}
      aria-label={`View ${caption?.title ?? cardTitle(template)}: ${template.label}`}
      className="block w-full text-left"
    >
      <div ref={box} className="relative w-full overflow-hidden bg-gray-100 dark:bg-gray-900" style={{ aspectRatio: '1 / 1' }}>
        {seen && scale > 0 ? (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: DESIGN, height: DESIGN, transform: `scale(${scale})` }}
          >
            <div
              className="absolute shadow-sm"
              style={{ left: (DESIGN - page.w) / 2, top: (DESIGN - page.h) / 2, width: page.w, height: page.h }}
            >
            <TemplateSurface
              template={styled}
              content={sampleFor(template)}
              width={page.w}
              height={page.h}
              accent={tone.accent}
              base={tone.base}
              /*
               * A photograph, for the layouts built around one.
               *
               * A template called "Half photo" that previews with no photograph
               * shows a customer the half without the photo. TemplateSurface has
               * carried `mediaUrl` all along and this gallery never passed one,
               * so every card was type on a coloured ground — which is most of
               * why the library read as plainer than the work it competes with.
               *
               * Only the eleven layouts marked photoLed: a price list or a
               * certificate is worse with a picture behind it, and the network
               * cost of a remote image matters on the connections this audience
               * uses. See design/previewMedia.ts for where the images come from
               * and why they are safe to use.
               */
              mediaUrl={styled.photoLed ? previewPhotoFor(styled.key) : null}
              mediaKind="image"
              mediaOpacity={100}
              /*
               * How much of the template's own tint stays over the picture.
               * defaultMediaScrim is scheme-aware — a light template needs a
               * pale ground under its near-black type, a dark one needs less —
               * and getting this wrong is how a headline vanishes into an image.
               */
              surfaceOpacity={styled.photoLed ? defaultMediaScrim(styled) : 1}
            />
            </div>
          </div>
        ) : null}
      </div>
      {/*
        At a seventh of the page width there is room for a name and one more
        line. The description is kept as the tooltip rather than wrapped to
        four lines under every card, which is what turns a grid into a wall of
        text with pictures in it.
      */}
      {body ?? (
      <div className="p-2.5" title={template.desc}>
        {caption ? (
          <>
            <p className="text-[13px] font-bold leading-tight text-gray-900 dark:text-white group-hover:text-green-700 dark:group-hover:text-green-300 truncate">
              {caption.title}
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-400 truncate">{caption.sub}</p>
          </>
        ) : (
        <>
        <p className="text-[13px] font-bold leading-tight text-gray-900 dark:text-white group-hover:text-green-700 dark:group-hover:text-green-300 truncate">
          {cardTitle(template)}
        </p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-400 truncate">
          {/*
            * Named when the grid is mixed, because a card showing a style the
            * picker does not name is a design the visitor cannot ask for again.
            */}
          {/* The style name is secondary now — description, not headline. */}
          {showStyleName ? styleOf(styleKey).label : template.label}
          {/* Said on the card, because it changes what you are downloading. */}
          {template.extraPages?.length ? ` · ${1 + template.extraPages.length} sides` : ''}
          {template.industries?.length ? ` · ${template.industries[0]}` : ''}
        </p>
        <p className="mt-1 text-[10px] font-semibold text-green-700 dark:text-green-400 opacity-0 group-hover:opacity-100 transition">
          Details →
        </p>
        </>
        )}
      </div>
      )}
    </Link>
    <button
      type="button"
      onClick={onOpen}
      tabIndex={tabIndex}
      aria-label={`Edit ${template.label}`}
      title="Edit now"
      className="absolute right-1.5 top-1.5 inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-2.5 rounded-xl bg-white/90 text-[12px] font-bold text-gray-900 shadow-sm hover:bg-white dark:bg-gray-900/90 dark:text-white"
    >
      <Pencil size={14} aria-hidden="true" /> Edit
    </button>
    </div>
  );
}
