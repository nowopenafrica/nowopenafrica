import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, RotateCcw } from 'lucide-react';

import TemplateSurface from '../components/studio/TemplateSurface';
import TemplateCustomiser from '../components/create/TemplateCustomiser';
import TemplateFacts from '../components/create/TemplateFacts';
import { PreviewCard } from '../components/create/TemplateGallery';
import { defaultMediaScrim, type DesignTemplate } from '../lib/designTemplates';
import { invalidateCatalogue, useDesignCatalogue } from '../hooks/useDesignCatalogue';
import { isListed } from '../lib/create/needs';
import { sampleFor } from '../lib/create/sampleCopy';
import {
  canvasOf, detailElements, mmText, pxText, relatedTemplates, templateDetailFacts, uneditableTextRoles,
  mockupScenesFor,
} from '../lib/create/templateDetail';
import { cardTitle } from '../lib/design/deliverables';
import { previewPhotoFor } from '../lib/design/previewMedia';
import { DESIGN_STYLES, applyStyle, styleColours, styleOf } from '../lib/design/styles';
import { ensureTypefacesReady } from '../lib/design/typefaces';
import { applySeo } from '../lib/seo';
import { track } from '../lib/telemetry';

/**
 * /media/templates/:key — one design, before you edit it.
 *
 * A card used to open the customiser straight away, so nothing said what a
 * design WAS: its size, its sides, what can be changed, which fonts it uses
 * and under what licence. This page says those things (spec §10, "Detail
 * page") and its main action, "Use this template", opens the same
 * TemplateCustomiser a gallery card opens.
 *
 * A design the customiser cannot fully edit (C7: a text line with no field)
 * says "Preview only" and offers no "Use this template".
 */

/* The look the gallery opens a card in, and the customiser's default brand. */
const STYLE_KEY = DESIGN_STYLES[0].key;
const BRAND = '#2563eb';

/** Long edge the surface lays itself out at, then scaled by CSS (as the cards do). */
const DESIGN = 1080;

/**
 * The route element. A retry after a failed uploaded read remounts the body,
 * so the catalogue hook reads again once its cache has been dropped.
 */
export default function TemplateDetail() {
  const [attempt, setAttempt] = useState(0);
  return (
    <TemplateDetailBody
      key={attempt}
      onRetry={() => { invalidateCatalogue(); setAttempt((n) => n + 1); }}
    />
  );
}

function TemplateDetailBody({ onRetry }: { onRetry: () => void }) {
  const { key = '' } = useParams<{ key: string }>();
  const { templates, ready, incomplete } = useDesignCatalogue();
  const template = useMemo(() => templates.find((t) => t.key === key) ?? null, [templates, key]);
  const scenes = mockupScenesFor();
  const listed = useMemo(() => templates.filter(isListed), [templates]);
  const [editing, setEditing] = useState<DesignTemplate | null>(null);

  useEffect(() => { void ensureTypefacesReady(); }, []);

  /* A related design is a new page: start it at the top, with nothing open. */
  useEffect(() => {
    setEditing(null);
    try { window.scrollTo({ top: 0, left: 0 }); } catch { /* no layout (tests) */ }
  }, [key]);

  const facts = useMemo(() => (template ? templateDetailFacts(template) : null), [template]);
  const related = useMemo(() => (template ? relatedTemplates(template, listed) : []), [template, listed]);

  useEffect(() => {
    if (!template || !facts) {
      /* Uploaded designs land after the first render: only a finished read is "not found". */
      if (!ready) return undefined;
      return applySeo({
        title: 'Design not found | NowOpen Create',
        description: 'This design is not in the NowOpen Create catalogue.',
        path: `/media/templates/${encodeURIComponent(key)}`,
        robots: 'noindex, nofollow',
      });
    }
    const { canvas, subcategory } = facts;
    const size = canvas.mm ? `${pxText(canvas)}, ${mmText(canvas.mm)}` : pxText(canvas);
    return applySeo({
      title: `${cardTitle(template)} | NowOpen Create`,
      description: `${subcategory ? `${subcategory.name} design` : 'Design'} on the ${canvas.label} format (${size}).`,
      path: `/media/templates/${encodeURIComponent(template.key)}`,
      image: '/og-image.png',
      /* A design the gallery holds back is reachable by link, but not offered to search. */
      ...(isListed(template) ? {} : { robots: 'noindex, follow' }),
    });
  }, [template, facts, ready, key]);

  if (!template || !facts) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="site-container py-10">
          {ready && incomplete ? (
            /*
             * The uploaded half could not be read, so an uploaded design's key
             * is unknown for now, not gone. Saying "taken down" here would be
             * a claim the page cannot make.
             */
            <div data-testid="template-unavailable" className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">We could not load this design just now</h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                The uploaded designs could not be loaded. If this is one of them, try again in a moment.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={onRetry}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-green-700 px-5 text-sm font-bold text-white hover:bg-green-800">
                  <RotateCcw size={16} /> Try again
                </button>
                <Link to="/media"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800 dark:border-gray-600 dark:text-gray-200">
                  <ArrowLeft size={16} /> All designs
                </Link>
              </div>
            </div>
          ) : ready ? (
            <div data-testid="template-not-found" className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">We could not find that design</h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                It may have been renamed or taken down.
              </p>
              <Link to="/media"
                className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-green-700 px-5 text-sm font-bold text-white hover:bg-green-800">
                <ArrowLeft size={16} /> Back to all designs
              </Link>
            </div>
          ) : (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">Loading the design…</p>
          )}
        </div>
      </div>
    );
  }

  const blocked = uneditableTextRoles(template);
  const blockedLabels = detailElements(template).filter((e) => blocked.includes(e.role)).map((e) => e.label.toLowerCase());

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="site-container py-6 sm:py-10">
        <Link to="/media"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-green-700 dark:text-gray-300 dark:hover:text-green-300">
          <ArrowLeft size={16} /> All designs
        </Link>

        <header className="mt-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">{cardTitle(template)}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {template.label}
            {facts.subcategory ? ` · ${facts.subcategory.name}` : ''}
            {` · ${facts.canvas.label}`}
          </p>
        </header>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <DetailPreview template={template} pages={facts.pages} />

          <aside className="space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              {facts.previewOnly ? (
                <div data-testid="preview-only">
                  <p className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-white">
                    <Eye size={16} /> Preview only
                  </p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    This design shows a {blockedLabels.join(' and ')} that the customiser cannot change yet, so it cannot be edited here.
                  </p>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(template);
                      track('template_picked', { template: template.key, style: STYLE_KEY, from: 'detail' });
                    }}
                    className="inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-green-700 px-5 text-sm font-bold text-white hover:bg-green-800"
                  >
                    Use this template <ArrowRight size={16} />
                  </button>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Opens the editor. Download a PNG free, no account needed.
                  </p>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <TemplateFacts facts={facts} description={template.desc} photoPreview={Boolean(template.photoLed)} />
            </div>
          </aside>
        </div>

        {/*
          * MOCKUP SLOT (Task 16). `scenes` comes from scenesFor once it exists;
          * today it is always empty, so nothing renders here. When filled, each
          * mockup must be labelled "Mockup: illustration only" (spec §8).
          */}
        {scenes.length > 0 && (
          <section data-testid="mockups" aria-label="Mockups" className="mt-8">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Mockups</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Mockup: illustration only</p>
          </section>
        )}

        {related.length > 0 && (
          <section data-testid="related" aria-label="Related designs" className="mt-10">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              More {facts.subcategory ? facts.subcategory.name.toLowerCase() : ''} designs
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {related.map((t) => (
                <PreviewCard
                  key={t.key}
                  template={t}
                  styleKey={STYLE_KEY}
                  brand={BRAND}
                  onOpen={() => {
                    setEditing(t);
                    track('template_picked', { template: t.key, style: STYLE_KEY, from: 'detail_related' });
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {editing && (
        <TemplateCustomiser
          template={editing}
          initialStyle={STYLE_KEY}
          initialBrand={BRAND}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * The large preview: the chosen side drawn by the real renderer at its true
 * shape, with a side picker and a strip showing every page and side.
 */
function DetailPreview({ template, pages }: {
  template: DesignTemplate;
  pages: { name: string; slots: DesignTemplate['slots'] }[];
}) {
  const [side, setSide] = useState(0);
  /* A new design starts on its front. */
  useEffect(() => { setSide(0); }, [template.key]);
  const styled = useMemo(() => applyStyle(template, styleOf(STYLE_KEY)), [template]);
  const tone = useMemo(() => styleColours(styleOf(STYLE_KEY), BRAND, styled.scheme), [styled.scheme]);

  return (
    <section aria-label="Preview" className="min-w-0">
      <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:p-5">
        <Surface template={styled} slots={pages[side]?.slots ?? styled.slots} tone={tone}
          testId="detail-preview" side={pages[side]?.name ?? 'Front'} />
      </div>

      {pages.length > 1 && (
        <div className="mt-3">
          <div role="group" aria-label="Sides" className="inline-flex rounded-xl border border-gray-300 p-1 dark:border-gray-600">
            {pages.map((p, i) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setSide(i)}
                aria-pressed={side === i}
                className={`min-h-[44px] min-w-[44px] rounded-lg px-4 text-sm font-semibold ${
                  side === i ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Every page and side at once, so nothing about the download is hidden behind a toggle. */}
          <ul aria-label="Every page and side" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pages.map((p, i) => (
              <li key={p.name} data-page={p.name}>
                <button type="button" onClick={() => setSide(i)} aria-label={`Show ${p.name}`}
                  className={`block w-full rounded-xl border bg-white p-2 text-left dark:bg-gray-800 ${
                    side === i ? 'border-green-600 ring-2 ring-green-500' : 'border-gray-200 dark:border-gray-700'
                  }`}>
                  <Surface template={styled} slots={p.slots} tone={tone} side={p.name} />
                  <span className="mt-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** One side, rendered at a 1080 long edge and scaled to the measured width. */
function Surface({ template, slots, tone, testId, side }: {
  template: DesignTemplate;
  slots: DesignTemplate['slots'];
  tone: { accent: string; base: string };
  testId?: string;
  side: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const page = useMemo(() => pageSize(template), [template]);

  useEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    const measure = () => setScale(node.clientWidth / page.w);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [page.w]);

  return (
    <div
      ref={box}
      data-testid={testId}
      data-side={side}
      className="relative w-full overflow-hidden bg-gray-100 shadow-sm dark:bg-gray-900"
      style={{ aspectRatio: `${page.w} / ${page.h}` }}
    >
      {scale > 0 && (
        <div className="absolute left-0 top-0 origin-top-left"
          style={{ width: page.w, height: page.h, transform: `scale(${scale})` }}>
          <TemplateSurface
            template={{ ...template, slots }}
            content={sampleFor(template)}
            width={page.w}
            height={page.h}
            accent={tone.accent}
            base={tone.base}
            mediaUrl={template.photoLed ? previewPhotoFor(template.key) : null}
            mediaKind="image"
            mediaOpacity={100}
            surfaceOpacity={template.photoLed ? defaultMediaScrim(template) : 1}
          />
        </div>
      )}
    </div>
  );
}

/** The design's own proportion, long edge at DESIGN; a square when it has no format. */
function pageSize(template: DesignTemplate): { w: number; h: number } {
  const { w, h } = canvasOf(template);
  const k = DESIGN / Math.max(w, h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
