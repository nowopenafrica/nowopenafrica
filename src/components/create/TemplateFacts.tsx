import { CATEGORIES } from '../../lib/create/catalogueTaxonomy';
import {
  EXPORT_FORMATS, mmText, pxText, type ElementStatus, type TemplateDetailFacts,
} from '../../lib/create/templateDetail';

/**
 * The facts block on the template detail page: size, pages, exports, what can
 * be changed, fonts and assets with their licences, and what it is for.
 *
 * Plain statements read from the registries (see lib/create/templateDetail.ts).
 * No badge, rating or claim that the data does not hold: a licence is shown
 * only where one is recorded, and an empty manifest says so.
 */

const STATUS_TEXT: Record<ElementStatus, string> = {
  editable: 'You can change it',
  fixed: 'Set for you; no field yet',
  sample: 'Sample rows from the design',
};

const MEDIUM_TEXT = {
  screen: 'For screens',
  office: 'Prints on an office or copy-shop printer',
  press: 'For a print shop',
  'large-format': 'Large-format print or screen',
} as const;

export default function TemplateFacts({
  facts, description, photoPreview = false,
}: {
  facts: TemplateDetailFacts;
  /** The template's own one-line description. */
  description: string;
  /** True when the preview shows a stock photo behind the design. */
  photoPreview?: boolean;
}) {
  const { canvas, subcategory, direction, pages, elements, fonts, assets } = facts;
  const category = subcategory ? CATEGORIES.find((c) => c.key === subcategory.category) : undefined;

  return (
    <div className="space-y-5 text-sm text-gray-700 dark:text-gray-300">
      <Fact title="Intended use" testId="facts-use">
        <p className="font-semibold text-gray-900 dark:text-white">
          {subcategory ? subcategory.name : 'Design'}
          {category ? <span className="font-normal text-gray-500 dark:text-gray-400"> · {category.name}</span> : null}
        </p>
        {description ? <p className="mt-1">{description}</p> : null}
        {direction ? (
          <p className="mt-1"><span className="font-semibold">{direction.name}:</span> {direction.intent}</p>
        ) : null}
      </Fact>

      <Fact title="Size" testId="facts-size">
        <p className="font-semibold text-gray-900 dark:text-white">{canvas.label}</p>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="text-gray-500 dark:text-gray-400">Canvas</dt>
          <dd data-testid="facts-px">{pxText(canvas)}</dd>
          {canvas.mm ? (
            <>
              <dt className="text-gray-500 dark:text-gray-400">Printed</dt>
              <dd data-testid="facts-mm">{mmText(canvas.mm)}</dd>
            </>
          ) : null}
        </dl>
        {canvas.format ? <p className="mt-1 text-gray-500 dark:text-gray-400">{MEDIUM_TEXT[canvas.format.medium]}</p> : null}
      </Fact>

      <Fact title={pages.length > 1 ? `${pages.length} sides` : 'Pages'} testId="facts-pages">
        <p>{pages.map((p) => p.name).join(', ')}</p>
      </Fact>

      <Fact title="Export formats" testId="facts-exports">
        <ul className="space-y-1">
          {EXPORT_FORMATS.map((f) => (
            <li key={f.key} data-export={f.key}>
              <span className="font-semibold text-gray-900 dark:text-white">{f.label}</span>
              <span className="text-gray-500 dark:text-gray-400">: {f.where}</span>
            </li>
          ))}
        </ul>
      </Fact>

      <Fact title="What you can change" testId="facts-elements">
        <ul className="space-y-1">
          {elements.map((el) => (
            <li key={el.role} data-role={el.role} data-status={el.status}>
              <span className="font-semibold text-gray-900 dark:text-white">{el.label}</span>
              <span className="text-gray-500 dark:text-gray-400">
                {' · '}{STATUS_TEXT[el.status]}
                {pages.length > 1 ? ` · ${el.pages.join(', ')}` : ''}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-gray-500 dark:text-gray-400">Colours and the background can be changed on every design.</p>
      </Fact>

      <Fact title="Fonts" testId="facts-fonts">
        <ul className="space-y-1">
          {fonts.map((f) => (
            <li key={f.key} data-font={f.key}>
              <span className="font-semibold text-gray-900 dark:text-white">{f.family}</span>
              <span className="text-gray-500 dark:text-gray-400"> · {f.licence} · </span>
              <a href={f.source} target="_blank" rel="noopener noreferrer"
                className="underline decoration-gray-300 underline-offset-2 hover:text-green-700 dark:hover:text-green-300">
                Source
              </a>
            </li>
          ))}
        </ul>
      </Fact>

      <Fact title="Images and assets" testId="facts-assets">
        {assets.length === 0 ? (
          <p>No library images. The design is type, colour and shapes.</p>
        ) : (
          <ul className="space-y-1">
            {assets.map(({ id, asset }) => (
              <li key={id} data-asset={id}>
                {asset ? (
                  <>
                    <span className="font-semibold text-gray-900 dark:text-white">{asset.kind}</span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {' · '}{asset.licence}{asset.attribution ? ` · ${asset.attribution}` : ''}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">An image with no licence on record</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {photoPreview ? (
          <p className="mt-1.5 text-gray-500 dark:text-gray-400">
            The photo in the preview is a Pexels stock image, shown for illustration. It is not part of the download: you add your own.
          </p>
        ) : null}
      </Fact>
    </div>
  );
}

function Fact({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <section data-testid={testId}>
      <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h2>
      {children}
    </section>
  );
}
