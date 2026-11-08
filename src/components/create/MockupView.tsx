import { useEffect, useId, useMemo, useRef, useState } from 'react';

import TemplateSurface from '../studio/TemplateSurface';
import { defaultMediaScrim, type DesignTemplate } from '../../lib/designTemplates';
import { sampleFor } from '../../lib/create/sampleCopy';
import { canvasOf } from '../../lib/create/templateDetail';
import type { MockupScene } from '../../lib/create/mockup';
import { previewPhotoForTemplate } from '../../lib/design/previewMedia';
import { applyStyle, styleColours, styleOf } from '../../lib/design/styles';
import { clipPathFor, matrix3dFor } from '../../lib/promote/surface';

/** The words every mockup carries (spec §8). Never worded as a verified placement. */
export const MOCKUP_LABEL = 'Mockup: illustration only';

/** Long edge the artwork lays itself out at, as the cards and the detail preview do. */
const DESIGN = 1080;

/**
 * A design placed onto a licensed scene, for the eye only.
 *
 * The artwork is the live TemplateSurface (the same renderer the preview, the
 * editor and the exporter use), laid out at the design's own proportion and
 * mapped onto the scene's surface with a CSS matrix3d (lib/promote/surface.ts,
 * imported and never edited), then clipped to the quad so nothing spills onto
 * the scene around it. The scene is only offered when its ratio matches the
 * format within 1% (scenesFor), so the artwork is never stretched to fit.
 *
 * This component is display-only. The customiser exports its own frame and
 * does not import this file (mockup.export.test.tsx pins that), so a mockup
 * can never end up in a download.
 */
export default function MockupView({ scene, template, styleKey, brand, slots }: {
  scene: MockupScene;
  template: DesignTemplate;
  styleKey: string;
  brand: string;
  /** The side to place; the front when omitted. */
  slots?: DesignTemplate['slots'];
}) {
  const box = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    const measure = () => setScale(node.clientWidth / scene.width);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [scene.width]);

  const styled = useMemo(() => applyStyle(template, styleOf(styleKey)), [template, styleKey]);
  const tone = useMemo(() => styleColours(styleOf(styleKey), brand, styled.scheme), [styleKey, brand, styled.scheme]);

  const page = useMemo(() => {
    const { w, h } = canvasOf(template);
    const k = DESIGN / Math.max(w, h);
    return { w: Math.round(w * k), h: Math.round(h * k) };
  }, [template]);

  const transform = useMemo(
    () => matrix3dFor(page.w, page.h, scene.quad, scene.width, scene.height),
    [page, scene],
  );
  const alt = scene.title?.trim() || 'Mockup scene';

  return (
    <figure data-testid="mockup-view" aria-labelledby={labelId} data-asset={scene.assetId} className="relative m-0 min-w-0">
      <div
        ref={box}
        className="relative w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-900"
        style={{ aspectRatio: `${scene.width} / ${scene.height}` }}
      >
        <img src={scene.url} alt={alt} loading="lazy" draggable={false} className="absolute inset-0 h-full w-full select-none object-cover" />
        {scale > 0 && transform && (
          <div
            data-testid="mockup-stage"
            aria-hidden="true"
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: scene.width, height: scene.height, transform: `scale(${scale})` }}
          >
            <div className="absolute inset-0" style={{ clipPath: clipPathFor(scene.quad) }}>
              <div
                data-testid="mockup-artwork"
                className="absolute left-0 top-0"
                style={{ width: page.w, height: page.h, transformOrigin: '0 0', transform }}
              >
                <TemplateSurface
                  template={slots ? { ...styled, slots } : styled}
                  content={sampleFor(template)}
                  width={page.w}
                  height={page.h}
                  accent={tone.accent}
                  base={tone.base}
                  mediaUrl={template.photoLed ? previewPhotoForTemplate(template) : null}
                  mediaKind="image"
                  mediaOpacity={100}
                  surfaceOpacity={template.photoLed ? defaultMediaScrim(styled) : 1}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      {/* On the picture, so a crop or a screenshot of the mockup still carries it. */}
      <figcaption
        id={labelId}
        data-testid="mockup-label"
        className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white"
      >
        {MOCKUP_LABEL}
        {scene.label ? <span className="sr-only">{`. ${scene.label}`}</span> : null}
      </figcaption>
    </figure>
  );
}
