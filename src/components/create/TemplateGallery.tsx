import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, Shuffle } from 'lucide-react';

import TemplateSurface, { type TemplateContent } from '../studio/TemplateSurface';
import TemplateCustomiser from './TemplateCustomiser';
import { DESIGN_TEMPLATES, type DesignTemplate } from '../../lib/designTemplates';
import { DESIGN_STYLES, applyStyle, styleColours, styleOf } from '../../lib/design/styles';
import {
  TEMPLATE_USES, diversify, findTemplates, libraryDepth, type TemplateUse,
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

/** Deliberately placeholder. Labels, not data. */
const SAMPLE: TemplateContent = {
  brand: 'Your business',
  eyebrow: 'This weekend',
  headline: 'Your headline here',
  subline: 'One line about the offer, the event or the thing you are announcing.',
  meta: 'yourbusiness.nowopenafrica.com',
  cta: 'Book now',
  services: ['Your first service', 'Your second service', 'Your third service', 'And a fourth'],
  stats: [
    { value: '3', label: 'Bedrooms' },
    { value: '2', label: 'Bathrooms' },
    { value: '180', label: 'Sq metres' },
    { value: '24/7', label: 'Security' },
  ],
  price: [
    { label: 'Your first item', price: '₦2,500' },
    { label: 'Your second item', price: '₦4,000' },
    { label: 'Your third item', price: '₦6,500', was: '₦8,000' },
    { label: 'Your fourth item', price: '₦9,000' },
    { label: 'Your fifth item', price: '₦12,000' },
  ],
  contact: ['Your phone', 'Your address', '@yourhandle'],
  logoUrl: null,
  qrUrl: null,
};

/**
 * Colours somebody might actually have, spread across the hue circle AND
 * across lightness — a row of six mid-tone colours would hide the fact that
 * the styles handle a pale yellow and a near-black brand differently.
 */
const SWATCHES = ['#2563eb', '#e11d48', '#059669', '#f59e0b', '#7c3aed', '#0f172a'];

/** Rendered at this size, then scaled down by CSS. One coordinate space. */
const DESIGN = 1080;

export default function TemplateGallery() {
  const [query, setQuery] = useState('');
  const [use, setUse] = useState<TemplateUse | ''>('');
  const [styleKey, setStyleKey] = useState(DESIGN_STYLES[0].key);
  const [brand, setBrand] = useState(SWATCHES[0]);
  /** 12: divisible by 2, 3, 4 and 6, so no row is ever part-full. */
  const PAGE = 12;
  const [shown, setShown] = useState(PAGE);
  /*
   * Which design is open for editing.
   *
   * The cards used to link to /studio?module=design, which opens Studio's
   * front door on whatever layout was last selected — not the one that was
   * clicked. It navigated, so it "worked", and it visibly did nothing, which
   * is the same thing as broken.
   */
  const [editing, setEditing] = useState<DesignTemplate | null>(null);

  // The previews are set in Playfair Display, Bebas Neue and the rest. Without
  // this the first paint is Georgia and Arial Narrow, and the gallery whose
  // entire job is to show off the typography shows the fallbacks instead.
  useEffect(() => { void ensureTypefacesReady(); }, []);

  const results = useMemo(() => {
    const found = findTemplates(query, { use: use || undefined });
    /*
     * Browsing gets variety; searching gets relevance.
     *
     * With no query the order is arbitrary, so it should be arranged to show
     * range — the catalogue's own order put three dark blue layouts first and
     * made a 312-design library look like one design. With a query the ranking
     * IS the answer and must not be shuffled for looks.
     */
    return query.trim() ? found : diversify(found);
  }, [query, use]);

  // Reset the window whenever the list changes, or "Show more" would reveal
  // rows from a previous search.
  useEffect(() => { setShown(PAGE); }, [query, use]);

  const visible = results.slice(0, shown);

  return (
    // Named, so the empty state further down the page can send somebody here
    // rather than to a tour of industries.
    <section id="create-designs" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {libraryDepth().toLocaleString('en-NG')} designs, made from your brand
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {DESIGN_TEMPLATES.length} layouts × {DESIGN_STYLES.length} styles. These are the real
            templates, rendered here exactly as Studio makes them.
          </p>
        </div>
        <Link
          to={`/studio?module=design&style=${encodeURIComponent(styleKey)}`}
          onClick={() => track('template_picked', { from: 'gallery_header', style: styleKey })}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-700"
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
                onClick={() => setBrand(hex)}
                aria-label={`Preview in ${hex}`}
                className={`h-7 w-7 rounded-full border-2 transition ${brand === hex ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                style={{ background: hex }}
              />
            ))}
            <label className="relative h-7 w-7 rounded-full border-2 border-dashed border-gray-400 overflow-hidden cursor-pointer" title="Any other colour">
              <input
                type="color"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                aria-label="Pick any colour"
                className="absolute -inset-2 h-12 w-12 cursor-pointer"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Style</span>
            {DESIGN_STYLES.map((st) => {
              const swatch = styleColours(st, brand);
              const on = st.key === styleKey;
              return (
                <button
                  key={st.key}
                  onClick={() => setStyleKey(st.key)}
                  title={st.blurb}
                  className={`inline-flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-full border text-[11px] font-semibold transition ${on ? 'border-transparent ring-2 ring-pink-500' : 'border-gray-300 dark:border-gray-600 hover:border-pink-400'}`}
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
          Every style derives its palette from the colour you picked — and checks the text stays
          readable on it. Nothing here is a fixed palette with your name typed into it.
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
            Six across on a desktop, stepping down to two on a phone.

            A gallery is browsed, not read: at three across the previews were
            big enough to study one and too big to compare six, which is the
            wrong way round for choosing. Every step is a divisor of the page
            size below, so a row is never left ragged.
          */}
          <div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {visible.map((tpl) => (
              <PreviewCard
                key={tpl.key}
                template={tpl}
                styleKey={styleKey}
                brand={brand}
                onOpen={() => {
                  setEditing(tpl);
                  track('template_picked', { template: tpl.key, style: styleKey });
                }}
              />
            ))}
          </div>

          {shown < results.length && (
            <button
              onClick={() => setShown((n) => n + PAGE)}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:border-pink-400"
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
          initialStyle={styleKey}
          initialBrand={brand}
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
function PreviewCard({
  template, styleKey, brand, onOpen,
}: {
  template: DesignTemplate;
  styleKey: string;
  brand: string;
  onOpen: () => void;
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

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Edit ${template.label}`}
      className="group block w-full text-left rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden hover:-translate-y-0.5 hover:shadow-lg transition"
    >
      <div ref={box} className="relative w-full overflow-hidden bg-gray-100 dark:bg-gray-900" style={{ aspectRatio: '1 / 1' }}>
        {seen && scale > 0 ? (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: DESIGN, height: DESIGN, transform: `scale(${scale})` }}
          >
            <TemplateSurface
              template={styled}
              content={SAMPLE}
              width={DESIGN}
              height={DESIGN}
              accent={tone.accent}
              base={tone.base}
            />
          </div>
        ) : null}
      </div>
      {/*
        At a sixth of the page width there is room for a name and one more
        line. The description is kept as the tooltip rather than wrapped to
        four lines under every card, which is what turns a grid into a wall of
        text with pictures in it.
      */}
      <div className="p-2.5" title={template.desc}>
        <p className="text-[13px] font-bold leading-tight text-gray-900 dark:text-white group-hover:text-pink-700 dark:group-hover:text-pink-300 truncate">
          {template.label}
        </p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-400 truncate">
          {template.use}
          {template.industries?.length ? ` · ${template.industries[0]}` : ''}
        </p>
        <p className="mt-1 text-[10px] font-semibold text-pink-600 dark:text-pink-400 opacity-0 group-hover:opacity-100 transition">
          Edit →
        </p>
      </div>
    </button>
  );
}
