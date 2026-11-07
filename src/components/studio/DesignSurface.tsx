import { forwardRef, useId } from 'react';

import type { DesignObject, DesignPage, ImageObject, TextObject } from '../../lib/studio/designDocument';
import { inPaintOrder } from '../../lib/studio/designDocument';
import { assetUrl, STUDIO_BUCKET } from '../../lib/studio/designAssets';
import { fontStack, nearestWeight } from '../../lib/design/typefaces';
import { clampDim, mediaStyle } from '../../lib/studio/pageBackground';
import { patternZoneBox } from '../../lib/design/patterns';
import { duotoneMatrix } from '../../lib/design/look';
import { supabase } from '../../lib/supabase';

/**
 * A design page, drawn. Nothing else.
 *
 * ── WHY THE EDITOR AND THE EXPORT SHARE THIS ─────────────────────────────
 *
 * The export is a rasterised DOM node, so the only way to guarantee that the
 * file matches the screen is for both to be THE SAME COMPONENT. A second
 * renderer written for export is a promise that two pieces of code will stay
 * in step; this is a guarantee that they cannot drift.
 *
 * Editing chrome — selection box, handles, snap guides — is passed in as
 * children by the editor and simply not passed by the exporter, so the
 * downloaded file cannot contain a stray blue handle.
 *
 * ── WHY THIS ELEMENT IS THE CONTAINER ────────────────────────────────────
 *
 * Text sizes are `cqw`: a fraction of the page's own width, so a document
 * holds together as a thumbnail and as an A3 poster. That resolves against
 * the nearest container ancestor — which was a wrapper in the editor, with
 * the right width today purely by coincidence. One day's padding on that
 * wrapper would have rescaled every word on the page, on screen and in every
 * file customers downloaded, with nothing to see in the code that did it.
 * Declaring it here makes `cqw` mean "of this page" by construction.
 */

interface Props {
  page: DesignPage;
  accent: string;
  /** The id currently selected, so the object can mark itself. Export passes none. */
  selectedId?: string | null;
  className?: string;
  /** Editing chrome. Absent in an export. */
  children?: React.ReactNode;
}

const DesignSurface = forwardRef<HTMLDivElement, Props & React.HTMLAttributes<HTMLDivElement>>(
  function DesignSurface({ page, accent, selectedId = null, className = '', children, ...rest }, ref) {
    /*
     * The look's duotone, as TemplateSurface draws it: one inline SVG filter
     * on the background media. Inline rather than a CSS filter function so
     * html-to-image clones it into the same foreignObject as the photo and the
     * exported file is toned too. url(#...) needs a plain id; useId's colons
     * would end the reference early.
     */
    const filterId = `duo-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
    const duotone = page.backgroundMedia?.assetId && page.duotone ? page.duotone : null;
    const mediaFilter = duotone ? `url(#${filterId})` : undefined;
    return (
      <div
        ref={ref}
        className={`relative w-full overflow-hidden ${className}`}
        style={{
          aspectRatio: `${page.width} / ${page.height}`,
          background: page.background ?? '#ffffff',
          containerType: 'inline-size',
        }}
        {...rest}
      >
        {/*
          * The background layer, drawn before anything else and unclickable.
          *
          * A video is rendered muted, looping and inline because a background
          * that asks for sound or opens a player is not a background. It also
          * cannot be exported — the editor says so before you try.
          */}
        {duotone && (
          <svg width={0} height={0} aria-hidden="true" style={{ position: 'absolute' }}>
            <filter id={filterId} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={duotoneMatrix(duotone[0], duotone[1])} />
            </filter>
          </svg>
        )}
        {page.backgroundMedia?.assetId && (
          page.backgroundMedia.kind === 'video' ? (
            <video
              key={page.backgroundMedia.assetId}
              src={assetUrl(page.backgroundMedia.assetId, publicUrlFor)}
              style={{ ...mediaStyle(page.backgroundMedia), filter: mediaFilter }}
              autoPlay
              muted
              loop
              playsInline
              aria-hidden
            />
          ) : (
            <img
              src={assetUrl(page.backgroundMedia.assetId, publicUrlFor)}
              style={{ ...mediaStyle(page.backgroundMedia), filter: mediaFilter }}
              alt=""
              crossOrigin="anonymous"
              draggable={false}
            />
          )
        )}
        {page.backgroundMedia?.assetId && (page.backgroundMedia.dim ?? 0) > 0 && (
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: `rgba(0,0,0,${clampDim(page.backgroundMedia.dim ?? 0)})`,
            }}
          />
        )}

        {page.pattern && <PatternLayer page={page} pattern={page.pattern} />}

        {inPaintOrder(page).filter((o) => o.visible).map((o) => (
          <ObjectView key={o.id} object={o} accent={accent} selected={o.id === selectedId} />
        ))}
        {children}
      </div>
    );
  },
);

export default DesignSurface;

/** A stored path becomes a URL only at render time — see designAssets.ts. */
const publicUrlFor = (path: string) =>
  supabase.storage.from(STUDIO_BUCKET).getPublicUrl(path).data.publicUrl;

/**
 * The look's pattern: over the ground (and any background media), under every
 * object. The same technique as TemplateSurface — an encodeURIComponent SVG
 * data URL on a div sized to the pattern's zone, opacity on the div — so the
 * PNG/PDF export, which rasterises this very node, carries it too.
 *
 * TemplateSurface works in pixels; this page is fluid (w-full plus an aspect
 * ratio), so the zone and the image are placed in percentages of the page.
 * The SVG was drawn at page.width x page.height, and background-size makes it
 * exactly the page again, positioned so the zone's slice lines up.
 */
function PatternLayer({ page, pattern }: { page: DesignPage; pattern: NonNullable<DesignPage['pattern']> }) {
  const W = page.width;
  const H = page.height;
  const z = patternZoneBox(pattern.zone, W, H);
  if (z.w <= 0 || z.h <= 0) return null;
  /* A percentage position p puts p% of the image on p% of the box: solve for the zone's offset. */
  const pos = (offset: number, box: number, full: number) => (full > box ? (offset / (full - box)) * 100 : 0);
  return (
    <div
      aria-hidden
      data-look-pattern=""
      style={{
        position: 'absolute',
        left: `${(z.x / W) * 100}%`,
        top: `${(z.y / H) * 100}%`,
        width: `${(z.w / W) * 100}%`,
        height: `${(z.h / H) * 100}%`,
        backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(pattern.svg)}")`,
        backgroundSize: `${(W / z.w) * 100}% ${(H / z.h) * 100}%`,
        backgroundPosition: `${pos(z.x, z.w, W)}% ${pos(z.y, z.h, H)}%`,
        backgroundRepeat: 'no-repeat',
        opacity: pattern.opacity,
        pointerEvents: 'none',
      }}
    />
  );
}

/**
 * One object.
 *
 * Sizes are a fraction of the page, exactly as the template slots are, so the
 * same document renders correctly at any output size.
 */
function ObjectView({ object, accent, selected }: { object: DesignObject; accent: string; selected: boolean }) {
  const common: React.CSSProperties = {
    position: 'absolute',
    left: `${object.x * 100}%`,
    top: `${object.y * 100}%`,
    width: `${object.w * 100}%`,
    height: `${object.h * 100}%`,
    opacity: object.opacity,
    transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
    pointerEvents: 'none',
  };

  if (object.type === 'text') {
    const t = object as TextObject;
    return (
      <div
        style={{
          ...common,
          color: t.colour ?? '#111827',
          fontSize: `${(t.size ?? 0.05) * 100}cqw`,
          /*
           * The weight the chosen face really ships. Asking for one it does
           * not have gets a synthesised fake: smeared on screen, and different
           * again once html-to-image rasterises it.
           */
          fontWeight: nearestWeight(t.font, t.weight ?? 600),
          letterSpacing: t.tracking ? `${t.tracking}em` : undefined,
          lineHeight: t.lineHeight ?? 1.1,
          textAlign: t.align ?? 'left',
          textTransform: t.upper ? 'uppercase' : undefined,
          /*
           * The real face, not a web-safe guess.
           *
           * This read `Georgia` for 'serif' and `ui-monospace` for 'mono',
           * with 'condensed' falling through to the browser default. The
           * product has shipped Playfair Display, Space Mono and Bebas Neue
           * as self-hosted faces for some time, so the editor was showing a
           * different design from the one the catalogue renders — and
           * exporting that difference.
           */
          fontFamily: fontStack(t.font),
          /*
           * Line breaks the user typed are line breaks.
           *
           * The properties panel has always offered a <textarea>, so a break
           * could always be entered — and the canvas collapsed it, because
           * HTML treats a newline as a space. An address or a two-line
           * headline came out as one run, and the export matched the canvas,
           * so the only clue was that it looked wrong. `pre-wrap` keeps the
           * breaks and still wraps the long lines.
           */
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
        }}
        data-object-id={object.id}
        data-selected={selected || undefined}
      >
        {t.text}
      </div>
    );
  }

  if (object.type === 'shape') {
    const s = object as Extract<DesignObject, { type: 'shape' }>;
    return (
      <div
        data-object-id={object.id}
        style={{
          ...common,
          background: s.fill ?? accent,
          borderRadius: s.shape === 'ellipse' ? '50%' : `${(s.radius ?? 0) * 100}%`,
          border: s.stroke ? `${(s.strokeWidth ?? 0.002) * 100}cqw solid ${s.stroke}` : undefined,
          /*
            A polygon is a filled box with its corners cut away. Percentages
            are of the object's own box, which is why the converter stores the
            points that way — the shape then survives being moved or resized
            like any other object.
          */
          clipPath: s.shape === 'polygon' && s.points?.length
            ? `polygon(${s.points.map(([px, py]) => `${px * 100}% ${py * 100}%`).join(', ')})`
            : undefined,
        }}
      />
    );
  }

  if (object.type === 'image') {
    const i = object as ImageObject;
    return (
      <img
        data-object-id={object.id}
        src={assetUrl(i.assetId, publicUrlFor)}
        /*
         * The object's name, so a screen reader and a search engine get
         * something. Keeping designs out of canvas was justified by exactly
         * this; drawing a picture with no description would give it back.
         */
        alt={object.name || ''}
        /*
         * Required for export. html-to-image re-fetches every image to inline
         * it, and without the CORS request the capture comes back with the
         * picture missing — the one export failure that looks like a design
         * problem rather than a code one.
         */
        crossOrigin="anonymous"
        draggable={false}
        style={{
          ...common,
          display: 'block',
          objectFit: i.fit ?? 'cover',
          borderRadius: `${(i.radius ?? 0) * 100}%`,
        }}
      />
    );
  }

  /*
   * A group draws nothing. Its members draw themselves, and the group only
   * remembers which they are — so painting its bounds would put a grey slab
   * across the design and into every exported file.
   */
  if (object.type === 'group') return null;

  /*
   * Every object type in the schema is drawn above, and the compiler enforces
   * it: `object` is `never` here, so adding a type to the union without
   * teaching this component to draw it fails the build rather than shipping
   * an object that silently renders as nothing.
   *
   * A document from a NEWER schema cannot reach this point either —
   * readDocument refuses it outright rather than half-rendering it.
   */
  const unreachable: never = object;
  void unreachable;
  return null;
}
