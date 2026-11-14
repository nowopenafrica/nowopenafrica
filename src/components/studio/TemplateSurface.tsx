import { useId, useMemo, useRef } from 'react';
import {
  type DesignTemplate, type ShapeSpec, type SlotRole, type SlotSpec, type SurfaceLayer,
  slotBox, typePx, fitSlotSize, motionAt, settleTime, surfaceLayers, hexAlpha, unitOf, fontStack,
  isListRole, listRowBoxes, shapeColor, shapeGeometry, frontShapes, photoBoxPx, focalCss,
  type PriceRow,
} from '../../lib/designTemplates';
import { fallbackLayerCss, resolveFallback, type ResolvedFallback } from '../../lib/design/photoFallback';
import { resolveLook, gradientCss, duotoneMatrix, pairingFace, type Look, type ResolvedLook } from '../../lib/design/look';
import { patternZoneBox } from '../../lib/design/patterns';
import { ICON_EM, ICON_GAP_EM, rowGlyph, type Glyph } from '../../lib/design/icons';
import { sampleRow } from '../../lib/create/sampleCopy';
import type { Palette, PaletteRole } from '../../lib/design/palettes';

// Renders a DesignTemplate. One component for stills and for motion frames.
//
// Passing `t` (seconds) draws that instant of the animation; leaving it out
// draws the settled state. Both go through the same slot resolution, so a still
// is by construction the animation's final frame — it cannot drift, which is
// what went wrong when Creative Studio and Motion Studio each had their own
// layout code.
//
// Sizing is absolute pixels against a fixed width/height, then the caller
// scales the whole thing with a CSS transform. That keeps one coordinate space
// for preview, PNG export and video capture: the 1080x1080 the exporter renders
// is the same geometry the owner edited, just not scaled down.

export interface TemplateContent {
  brand?: string;
  eyebrow?: string;
  headline?: string;
  subline?: string;
  meta?: string;
  cta?: string;
  /** Rows for a 'services' slot. */
  services?: string[];
  /** Rows for a 'stats' slot. */
  stats?: { value: string; label: string }[];
  /** Rows for a 'contact' slot. */
  contact?: string[];
  /** Rows for a 'price' slot. */
  price?: PriceRow[];
  logoUrl?: string | null;
  /** data: URL — a remote QR would taint the export canvas. */
  qrUrl?: string | null;
  /**
   * Which platform's mark a handle row shows (platformMarks.ts). Absent keeps
   * the template's own default.
   */
  platform?: string;
}

export interface TemplateSurfaceProps {
  template: DesignTemplate;
  content: TemplateContent;
  width: number;
  height: number;
  accent: string;
  /** Base surface colour. Defaults per scheme. */
  base?: string;
  /** Seconds into the scene. Omit for a settled still. */
  t?: number;
  /** Image or video URL painted under the surface layers. */
  mediaUrl?: string | null;
  mediaKind?: 'image' | 'video';
  /** 0..100 — how much of the media shows through the surface. */
  mediaOpacity?: number;
  /** 0..1 — how opaque the template's own tint is over that media. */
  surfaceOpacity?: number;
  /** When set, text slots become editable in place. */
  onEditText?: (role: SlotRole, value: string) => void;
  /** Overrides parts of the template's look (Remix, a locked palette). Ignored for a template with no look. */
  look?: Partial<Look>;
  /** The owner's brand as a palette. Wins over the look's own palette. */
  brandPalette?: Palette;
}

const TEXT_ROLES: SlotRole[] = ['brand', 'eyebrow', 'headline', 'subline', 'meta', 'cta'];

/** The palette role a slot's tone names, if it names one. 'accent' is primary. */
function toneRole(tone: SlotSpec['tone']): PaletteRole | null {
  if (tone === 'accent' || tone === 'primary') return 'primary';
  if (tone === 'secondary' || tone === 'highlight') return tone;
  return null;
}

/** A slot's text colour from its tone, given the ink that reads on its ground. */
function slotTone(slot: SlotSpec, roles: Record<PaletteRole, string>, ink: string): string {
  const role = toneRole(slot.tone);
  if (role) return roles[role];
  if (slot.tone === 'muted') return hexAlpha(ink, 0.72);
  return ink;
}

/** Same string format surfaceLayers produces, for the look path's own layers. */
function layerCss(l: SurfaceLayer): string {
  const stops = l.stops.map((st) => `${st.color} ${Math.round(st.at * 100)}%`).join(', ');
  return l.kind === 'linear'
    ? `linear-gradient(${l.angle}deg, ${stops})`
    : `radial-gradient(${Math.round(l.r * 100)}% ${Math.round(l.r * 100)}% at ${Math.round(l.cx * 100)}% ${Math.round(l.cy * 100)}%, ${stops})`;
}

/**
 * One decorative shape.
 *
 * Geometry comes from shapeGeometry so this and the canvas painter cannot
 * disagree about where a wedge sits. Polygons become clip-path, which survives
 * PNG export because html-to-image rasterises through <foreignObject> and lets
 * the browser's own engine draw the CSS.
 */
function Shape({
  shape, width, height, accent, ink, base, roles,
}: {
  shape: ShapeSpec; width: number; height: number; accent: string; ink: string; base: string;
  roles: Record<PaletteRole, string>;
}) {
  const geom = shapeGeometry(shape, width, height);
  // A gradient fill paints from the roles; everything else is one flat tone.
  const fill = (shape.kind === 'rect' || shape.kind === 'circle') ? shape.fill : undefined;
  const color = fill ? gradientCss(fill, roles) : shapeColor(shape.tone, accent, ink, base, roles);
  const opacity = shape.alpha ?? 1;

  if (geom.kind === 'polygon') {
    const points = geom.points.map(([x, y]) => `${x}px ${y}px`).join(', ');
    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: color, opacity,
          clipPath: `polygon(${points})`,
        }}
      />
    );
  }
  if (geom.kind === 'circle') {
    return (
      <div
        style={{
          position: 'absolute',
          left: geom.cx - geom.r, top: geom.cy - geom.r,
          width: geom.r * 2, height: geom.r * 2,
          borderRadius: '50%', background: color, opacity,
        }}
      />
    );
  }
  if (geom.kind === 'ring') {
    return (
      <div
        style={{
          position: 'absolute',
          left: geom.cx - geom.r, top: geom.cy - geom.r,
          width: geom.r * 2, height: geom.r * 2,
          borderRadius: '50%',
          border: `${geom.thickness}px solid ${color}`,
          opacity,
          boxSizing: 'border-box',
        }}
      />
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: geom.x, top: geom.y, width: geom.w, height: geom.h,
        borderRadius: geom.radius || undefined,
        background: color, opacity,
      }}
    />
  );
}

/**
 * The designed no-photo state (design/photoFallback.ts), inside the photo box.
 *
 * One clipped box; the fill layers, the pattern, the geometry, the keyline
 * and the initial inside it, in that order, which is the order drawTemplate
 * paints them in. Pattern and shapes are laid out in canvas coordinates and
 * shifted by the box corner, so they land where the canvas puts them.
 */
function PhotoFallbackLayer({
  fb, width, height, accent, ink, base, roles,
}: {
  fb: ResolvedFallback; width: number; height: number; accent: string; ink: string; base: string;
  roles: Record<PaletteRole, string>;
}) {
  const { box } = fb;
  /* What counts as drawn (S1b): the preview gate looks for at least one of these. */
  const strong = (on: boolean) => (on ? { 'data-fallback-strong': '' } : {});
  const canvasSized: React.CSSProperties = { position: 'absolute', left: -box.x, top: -box.y, width, height };
  return (
    <div
      data-photo-fallback=""
      aria-hidden="true"
      style={{
        position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h,
        overflow: 'hidden', borderRadius: box.radius || undefined, pointerEvents: 'none',
      }}
    >
      {fb.layers.map((l, i) => (
        <div key={i} data-fallback-layer={l.kind} {...strong(l.strong)} style={{ position: 'absolute', inset: 0, background: fallbackLayerCss(l) }} />
      ))}
      {fb.pattern && (
        <div
          data-fallback-pattern=""
          {...strong(fb.pattern.strong)}
          style={{
            ...canvasSized,
            backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(fb.pattern.svg)}")`,
            backgroundSize: `${width}px ${height}px`,
            backgroundRepeat: 'no-repeat',
            opacity: fb.pattern.opacity,
          }}
        />
      )}
      {fb.shapes.length > 0 && (
        <div data-fallback-shapes="" {...strong(fb.shapesStrong)} style={canvasSized}>
          {fb.shapes.map((shape, i) => (
            <Shape key={i} shape={shape} width={width} height={height} accent={accent} ink={ink} base={base} roles={roles} />
          ))}
        </div>
      )}
      {fb.keylines.map((k, i) => (
        <div
          key={`k${i}`}
          data-fallback-keyline=""
          {...strong(k.strong)}
          style={{
            position: 'absolute',
            left: k.x - box.x, top: k.y - box.y, width: k.w, height: k.h,
            border: `${k.width}px solid ${k.color}`, boxSizing: 'border-box',
          }}
        />
      ))}
      {fb.monogram && (
        <div
          data-fallback-monogram=""
          {...strong(fb.monogram.strong)}
          style={{
            position: 'absolute',
            left: fb.monogram.cx - box.x, top: fb.monogram.cy - box.y,
            transform: 'translate(-50%, -50%)',
            fontFamily: fb.monogram.family, fontWeight: fb.monogram.weight, fontSize: fb.monogram.sizePx,
            lineHeight: 1, color: fb.monogram.color, whiteSpace: 'nowrap',
          }}
        >
          {fb.monogram.char}
        </div>
      )}
    </div>
  );
}

/** Edit in place without a modal. Commits on blur so a stray keypress is cheap. */
function EditableSlot({
  value, onCommit, style,
}: { value: string; onCommit: (v: string) => void; style: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={() => onCommit(ref.current?.innerText ?? '')}
      onKeyDown={(e) => {
        // Enter commits rather than inserting a newline: these are headlines,
        // and an accidental line break silently reflows the whole layout.
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); }
        if (e.key === 'Escape') { if (ref.current) ref.current.innerText = value; (e.target as HTMLElement).blur(); }
      }}
      style={{ ...style, outline: 'none', cursor: 'text' }}
    >
      {value}
    </div>
  );
}

/**
 * Marker before a services / contact row.
 *
 * The tick is drawn as an SVG rather than a ✓ character for the same reason the
 * canvas painter draws it with strokes: the glyph is missing from enough system
 * fonts to ship a tofu box into somebody's flyer.
 */
function Bullet({ slot, size, index, accent }: { slot: SlotSpec; size: number; index: number; accent: string }) {
  switch (slot.bullet) {
    case 'dot':
      return <span style={{ width: size * 0.38, height: size * 0.38, borderRadius: '50%', background: accent, flexShrink: 0 }} />;
    case 'bar':
      return <span style={{ width: size * 0.16, height: size * 0.64, background: accent, flexShrink: 0 }} />;
    case 'check':
      return (
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
          <path d="M4 13l5 5L20 6" stroke={accent} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'number':
      return (
        <span style={{ color: accent, fontWeight: 700, fontSize: size * 0.86, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
      );
    default:
      return null;
  }
}

/**
 * A row's leading icon (design/icons.ts), as inline SVG.
 *
 * The same path data drawTemplate hands to Path2D, in the same square box (1
 * em of the row's type), in the row's own text colour through currentColor:
 * one colour, never stretched (the viewBox is square and so is the box).
 */
function IconGlyph({ glyph, size, color }: { glyph: Glyph; size: number; color: string }) {
  const px = size * ICON_EM;
  const stroke = glyph.paint === 'stroke';
  return (
    <svg
      width={px}
      height={px}
      viewBox={glyph.viewBox}
      aria-hidden="true"
      data-icon={`${glyph.set}:${glyph.name}`}
      fill={stroke ? 'none' : 'currentColor'}
      stroke={stroke ? 'currentColor' : 'none'}
      strokeWidth={stroke ? glyph.strokeWidth : undefined}
      strokeLinecap={stroke ? 'round' : undefined}
      strokeLinejoin={stroke ? 'round' : undefined}
      style={{ color, flexShrink: 0, display: 'block' }}
    >
      {glyph.paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/**
 * A repeating slot: a services column, a proof-point strip, a contact bar.
 *
 * Row positions come from listRowBoxes, the same resolver the canvas painter
 * uses. Line height is 1.4 deliberately — that places the DOM text baseline at
 * roughly row.y + size, which is exactly where canvas fillText puts it, so the
 * two renderers land on the same pixel instead of drifting a few px per row.
 */
function ListSlot({
  slot, content, width, height, accent, ink, template, roles, family: familyOverride,
}: {
  slot: SlotSpec;
  content: TemplateContent;
  width: number;
  height: number;
  accent: string;
  ink: string;
  template: DesignTemplate;
  roles: Record<PaletteRole, string>;
  /** The look's text face. Absent for a template without a look. */
  family?: string;
}) {
  const all =
    slot.role === 'services' ? (content.services ?? [])
    : slot.role === 'contact' ? (content.contact ?? [])
    : slot.role === 'price' ? (content.price ?? [])
    : (content.stats ?? []);
  const count = slot.max ? Math.min(all.length, slot.max) : all.length;
  if (count === 0) return null;

  const boxes = listRowBoxes(slot, width, height, count);
  const family = familyOverride ?? fontStack(slot.font ?? template.font);
  const tone = slotTone(slot, roles, ink);
  const align = slot.align ?? 'left';

  return (
    <>
      {boxes.map((row, i) => {
        const size = row.size;
        const common: React.CSSProperties = {
          position: 'absolute',
          left: row.x,
          top: row.y,
          width: row.w,
          fontFamily: family,
        };

        if (slot.role === 'price') {
          const item = (content.price ?? [])[i];
          return (
            <div
              key={i}
              style={{
                ...common,
                display: 'flex',
                alignItems: 'baseline',
                gap: size * 0.35,
                fontSize: size,
                lineHeight: 1.4,
                color: tone,
                fontVariantNumeric: slot.tabular ? 'tabular-nums' : undefined,
              }}
            >
              <span style={{ fontWeight: slot.weight ?? 600, whiteSpace: 'nowrap', textTransform: slot.upper ? 'uppercase' : undefined }}>
                {item?.label ?? ''}
              </span>
              {/* The leader rule: it is what makes two columns read as one menu
                  line. flex:1 fills whatever the label and price leave behind. */}
              <span style={{ flex: 1, height: Math.max(1, size * 0.045), background: tone, opacity: 0.35 }} />
              {item?.was && (
                <span style={{ color: hexAlpha(ink, 0.55), textDecoration: 'line-through', whiteSpace: 'nowrap' }}>
                  {item.was}
                </span>
              )}
              <span style={{ fontWeight: 800, color: accent, whiteSpace: 'nowrap' }}>{item?.price ?? ''}</span>
            </div>
          );
        }

        if (slot.role === 'stats') {
          const stat = (content.stats ?? [])[i];
          return (
            <div key={i} style={{ ...common, textAlign: align }}>
              <div style={{ fontSize: size * 1.55, fontWeight: 800, lineHeight: 1.4, color: slot.tone === 'muted' ? tone : accent }}>
                {stat?.value ?? ''}
              </div>
              <div style={{ fontSize: size * 0.62, fontWeight: 600, lineHeight: 1.4, color: hexAlpha(ink, 0.7), textTransform: 'uppercase' }}>
                {stat?.label ?? ''}
              </div>
            </div>
          );
        }

        const text = String((all as (string | unknown)[])[i] ?? '');
        if (!text) return null;
        // A row's icon takes the bullet's place, in the words' colour.
        const glyph = rowGlyph(slot, i, text, { platform: content.platform, sample: sampleRow(template, slot.role, i) });
        return (
          <div
            key={i}
            style={{
              ...common,
              display: 'flex',
              alignItems: 'center',
              gap: size * 0.42,
              fontSize: size,
              fontWeight: slot.weight ?? 600,
              lineHeight: 1.4,
              color: tone,
              textTransform: slot.upper ? 'uppercase' : undefined,
              // S8: a row list honours its alignment, icon and all.
              justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : undefined,
              fontVariantNumeric: slot.tabular ? 'tabular-nums' : undefined,
            }}
          >
            {glyph
              ? <IconGlyph glyph={glyph} size={size} color={tone} />
              : <Bullet slot={slot} size={size} index={i} accent={accent} />}
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
          </div>
        );
      })}
    </>
  );
}

export default function TemplateSurface({
  template, content, width, height, accent, base,
  t, mediaUrl, mediaKind = 'image', mediaOpacity = 100, surfaceOpacity = 1, onEditText,
  look, brandPalette,
}: TemplateSurfaceProps) {
  /*
   * Every colour below comes from the resolved look. For a template with no
   * look the resolver's fallback hands back exactly what this component used
   * to compute itself (roles.primary is the accent, roles.ground the base,
   * inkOn.ground the scheme ink), so those templates render byte-identically.
   * A snapshot in TemplateSurface.look.test.tsx pins that.
   */
  const resolved: ResolvedLook = useMemo(
    () => resolveLook(template, { override: look, brandPalette, accent, base, width, height }),
    [template, look, brandPalette, accent, base, width, height],
  );
  const hasLook = resolved.source === 'look';
  const { roles, inkOn } = resolved;
  const ink = inkOn.ground;
  const primary = roles.primary;
  const surfaceBase = roles.ground;
  const u = unitOf(width, height);
  const at = t ?? settleTime(template);
  /*
   * The fallback keeps calling surfaceLayers, because the resolver's
   * groundLayers carry no alphaScale and the background-strength slider thins
   * the tint through it. A look's ground is flat or a designed gradient, so it
   * is thinned with plain opacity instead.
   */
  const layers = hasLook
    ? resolved.groundLayers.map(layerCss)
    : surfaceLayers(template, accent, surfaceBase, surfaceOpacity);
  const layerOpacity = hasLook && surfaceOpacity < 1 ? Math.max(0, surfaceOpacity) : undefined;

  // url(#...) needs a plain id; useId's colons would end the reference early.
  const filterId = `duo-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const duotone = mediaUrl ? resolved.duotone : null;
  const mediaFilter = duotone ? `url(#${filterId})` : undefined;

  /*
   * The photo box (S2): with one, the photograph is drawn clipped to it and
   * positioned by its focal point; without one it fills the canvas as it
   * always has. With no photograph, a photo-led design draws its designed
   * no-photo state there instead (S1).
   */
  const photoBox = template.photo ? photoBoxPx(template, width, height) : null;
  const fallback = !mediaUrl
    ? resolveFallback(template, roles, width, height, content.brand)
    : null;
  const mediaStyle: React.CSSProperties = photoBox
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: focalCss(template.photo?.focal), opacity: mediaOpacity / 100, filter: mediaFilter }
    : { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: mediaOpacity / 100, filter: mediaFilter };
  const inPhotoBox = (node: React.ReactNode) => (photoBox
    ? (
      <div
        data-photo-box=""
        style={{
          position: 'absolute', left: photoBox.x, top: photoBox.y, width: photoBox.w, height: photoBox.h,
          overflow: 'hidden', borderRadius: photoBox.radius || undefined,
        }}
      >
        {node}
      </div>
    )
    : node);

  /** The ink that reads on whatever this slot sits on. */
  const inkOf = (slot: SlotSpec): string => inkOn[slot.on ?? 'ground'];

  /**
   * Type comes from the look's pairing only when the template has a look;
   * otherwise the template and its style keep owning type, as before.
   * Display-size slots take the display face, the eyebrow the accent face.
   */
  const lookFamily = (slot: SlotSpec): string | undefined =>
    hasLook ? fontStack(pairingFace(slot, resolved.pairing)) : undefined;

  const textFor = (role: SlotRole): string => {
    switch (role) {
      case 'brand': return content.brand ?? '';
      case 'eyebrow': return content.eyebrow ?? '';
      case 'headline': return content.headline ?? '';
      case 'subline': return content.subline ?? '';
      case 'meta': return content.meta ?? '';
      case 'cta': return content.cta ?? '';
      default: return '';
    }
  };

  const toneColor = (slot: SlotSpec): string => slotTone(slot, roles, inkOf(slot));

  /*
   * On a filled disc the slot tone IS the disc. Without a look the words take
   * the surface colour (today's rule); with one they take the ink measured for
   * that role, which is the readable choice by construction.
   */
  const discText = (slot: SlotSpec): string => {
    const role = toneRole(slot.tone);
    if (!role) return primary;
    return hasLook ? inkOn[role] : surfaceBase;
  };

  /** Words on a solid pill: the ink measured for the pill role (S7). */
  const solidPillText = (slot: SlotSpec): string => {
    const role = toneRole(slot.tone);
    return role ? inkOn[role] : surfaceBase;
  };

  /*
   * Gradient type. The transparent text fill overrides `color`, so if the clip
   * were dropped the words would vanish into a gradient box. The fill is
   * therefore applied only where the browser says it supports clipping a
   * background to text; anywhere else the headline keeps its flat ink.
   *
   * That check covers the live preview, not the PNG/PDF export: html-to-image
   * re-renders the clone inside an SVG foreignObject, and the gradient only
   * survives there if the computed background-clip / -webkit-background-clip
   * is carried across. Chromium does; it has not been verified everywhere.
   * Skipped for treatments that paint their own background, which the clip
   * would eat.
   */
  const headlineFill = (slot: SlotSpec): React.CSSProperties => {
    if (!resolved.headlineGradient || slot.role !== 'headline') return {};
    if (slot.treatment === 'pill' || slot.treatment === 'panel' || slot.treatment === 'disc') return {};
    const canClip = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
      && (CSS.supports('background-clip', 'text') || CSS.supports('-webkit-background-clip', 'text'));
    if (!canClip) return {};
    return {
      backgroundImage: resolved.headlineGradient,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    };
  };

  /** Treatment-specific chrome. Kept here so templates stay pure data. */
  const treatmentStyle = (slot: SlotSpec): React.CSSProperties => {
    const pad = u * 0.014;
    const role = toneRole(slot.tone);
    const slotInk = inkOf(slot);
    switch (slot.treatment) {
      case 'pill':
        // Solid (S7): the tone at full strength, words in the ink that reads on it.
        if (slot.pillStyle === 'solid') {
          const fill = role ? roles[role] : slotInk;
          return {
            display: 'inline-block',
            padding: `${pad * 0.7}px ${pad * 1.6}px`,
            borderRadius: 999,
            background: fill,
            border: `1px solid ${fill}`,
          };
        }
        return {
          display: 'inline-block',
          padding: `${pad * 0.7}px ${pad * 1.6}px`,
          borderRadius: 999,
          background: role ? hexAlpha(roles[role], 0.18) : hexAlpha(slotInk, 0.12),
          border: `1px solid ${hexAlpha(role ? roles[role] : slotInk, 0.35)}`,
        };
      case 'panel':
        return {
          display: 'inline-block',
          padding: `${pad}px ${pad * 1.4}px`,
          borderRadius: u * 0.02,
          background: hexAlpha(surfaceBase, 0.55),
          backdropFilter: 'blur(6px)',
        };
      case 'outline':
        return {
          display: 'inline-block',
          padding: `${pad * 0.6}px ${pad * 1.2}px`,
          border: `${Math.max(1, u * 0.003)}px solid ${hexAlpha(slotInk, 0.75)}`,
        };
      case 'underline':
        return { borderBottom: `${Math.max(2, u * 0.006)}px solid ${primary}`, paddingBottom: pad * 0.6, display: 'inline-block' };
      case 'bar':
        // A leading accent rule — the editorial device.
        return { borderLeft: `${Math.max(2, u * 0.008)}px solid ${primary}`, paddingLeft: pad };
      case 'disc':
        // Diameter is the slot's own width, matching the canvas painter exactly.
        return {
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: '50%',
          background: role ? roles[role] : hexAlpha(slotInk, 0.92),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: pad,
          boxSizing: 'border-box',
        };
      default:
        return {};
    }
  };

  return (
    <div style={{ position: 'relative', width, height, overflow: 'hidden', background: surfaceBase }}>
      {/* An inline filter rather than a CSS one: html-to-image clones this SVG
          into the same foreignObject as the photo, so url(#id) still resolves
          when the card is rasterised for PNG/PDF. */}
      {duotone && (
        <svg width={0} height={0} aria-hidden="true" style={{ position: 'absolute' }}>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={duotoneMatrix(duotone[0], duotone[1])} />
          </filter>
        </svg>
      )}
      {/* Media sits beneath the surface layers so the tint keeps text readable. */}
      {mediaUrl && mediaKind === 'image' && inPhotoBox(
        <img
          src={mediaUrl}
          alt=""
          crossOrigin="anonymous"
          style={mediaStyle}
        />,
      )}
      {mediaUrl && mediaKind === 'video' && inPhotoBox(
        <video
          src={mediaUrl}
          muted
          playsInline
          autoPlay
          loop
          crossOrigin="anonymous"
          style={mediaStyle}
        />,
      )}

      {layers.map((bg, i) => (
        <div key={i} style={{ position: 'absolute', inset: 0, background: bg, opacity: layerOpacity }} />
      ))}

      {/* Pattern: over the ground, under shapes and type. The SVG is opaque and
          already clipped to its zone; opacity is applied here, and the div is
          sized to the zone so nothing outside it is painted either way. Order
          is ground, pattern, shapes, frame, slots; the canvas painter must
          match it. */}
      {resolved.pattern && (() => {
        const z = patternZoneBox(resolved.pattern.zone, width, height);
        return (
          <div
            data-look-pattern=""
            style={{
              position: 'absolute', left: z.x, top: z.y, width: z.w, height: z.h,
              backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(resolved.pattern.svg)}")`,
              backgroundSize: `${width}px ${height}px`,
              backgroundPosition: `${-z.x}px ${-z.y}px`,
              backgroundRepeat: 'no-repeat',
              opacity: resolved.pattern.opacity,
              pointerEvents: 'none',
            }}
          />
        );
      })()}

      {/* Geometry over the surface, under the type — same order as the canvas
          painter, so a wedge never lands on top of a headline in one renderer
          and behind it in the other. */}
      {/* No photograph: the designed no-photo state, over the ground and its
          pattern, under the shapes (the canvas painter's order). */}
      {fallback && (
        <PhotoFallbackLayer fb={fallback} width={width} height={height} accent={primary} ink={roles.ink} base={surfaceBase} roles={roles} />
      )}

      {/* A template as written is its front: back-only shapes (S3) are drawn
          on the side pageTemplate() builds. */}
      {frontShapes(template).map((shape, i) => (
        <Shape key={i} shape={shape} width={width} height={height} accent={primary} ink={roles.ink} base={surfaceBase} roles={roles} />
      ))}

      {template.surface.kind === 'frame' && (
        <div
          style={{
            position: 'absolute',
            inset: (template.surface.frame ?? 0.035) * u,
            border: `${Math.max(2, u * 0.006)}px solid ${hexAlpha(ink, 0.9)}`,
          }}
        />
      )}

      {template.slots.map((slot) => {
        const box = slotBox(slot, width, height);
        const m = motionAt(slot, at, width, height);
        if (m.opacity === 0 && !m.clip) return null;

        const common: React.CSSProperties = {
          position: 'absolute',
          left: box.left,
          width: box.width,
          textAlign: box.textAlign,
          opacity: m.opacity,
          transform: `translate(${m.dx}px, ${m.dy}px) scale(${m.scale})`,
          transformOrigin: box.textAlign === 'center' ? 'center' : 'left center',
          filter: m.blurPx ? `blur(${m.blurPx}px)` : undefined,
          clipPath: m.clip ? `inset(${m.clip[0]}% ${m.clip[1]}% ${m.clip[2]}% ${m.clip[3]}%)` : undefined,
          ...(slot.fromBottom ? { bottom: height - box.top } : { top: box.top }),
        };

        if (isListRole(slot.role)) {
          return (
            <div key={slot.role} style={{ ...common, left: 0, width, top: 0, bottom: undefined, textAlign: 'left' }}>
              <ListSlot
                slot={slot}
                content={content}
                width={width}
                height={height}
                // Bullets, prices and stat values follow the slot's role tone on
                // a look; without one they stay the accent, exactly as before.
                accent={hasLook ? roles[toneRole(slot.tone) ?? 'primary'] : primary}
                ink={inkOf(slot)}
                template={template}
                roles={roles}
                family={lookFamily(slot)}
              />
            </div>
          );
        }

        if (slot.role === 'qr') {
          if (!content.qrUrl) return null;
          const size = slot.w * width;
          return (
            <div key={slot.role} style={common}>
              <img
                src={content.qrUrl}
                alt=""
                style={{ width: size, height: size, borderRadius: u * 0.012, background: '#fff', padding: u * 0.008 }}
              />
            </div>
          );
        }

        const value = textFor(slot.role);
        if (!value && slot.role !== 'brand') return null;

        const solidPill = slot.treatment === 'pill' && slot.pillStyle === 'solid';
        const plainFlow = !slot.treatment || slot.treatment === 'plain';
        const typeStyle: React.CSSProperties = {
          /*
           * Fitted, not fixed. A slot carries one size and one y, so a headline
           * that needs three lines where the layout budgeted two grew downward
           * and printed over the subline — measured on the live gallery, five
           * of the first twelve Megaphone designs collided with their own body
           * copy. The same call is made by drawTemplate, so the PNG matches.
           */
          fontSize: fitSlotSize(slot, template.slots, value, width, height),
          fontWeight: slot.weight ?? 600,
          lineHeight: (slot.size ?? 0.05) > 0.07 ? 1.03 : 1.25,
          letterSpacing: `${slot.tracking ?? 0}em`,
          fontFamily: lookFamily(slot) ?? fontStack(slot.font ?? template.font),
          textTransform: slot.upper ? 'uppercase' : undefined,
          // On a filled disc the slot tone IS the disc, so the words take the
          // colour that reads on it or they disappear into their own badge.
          color: slot.treatment === 'disc' ? discText(slot) : solidPill ? solidPillText(slot) : toneColor(slot),
          ...treatmentStyle(slot),
          ...headlineFill(slot),
          // S4: balanced lines, and a hard line limit the fitter has already sized for.
          ...(slot.balance ? ({ textWrap: 'balance' } as React.CSSProperties) : {}),
          ...(slot.maxLines && plainFlow
            ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: slot.maxLines, overflow: 'hidden' }
            : {}),
        };

        // The brand slot pairs a logo with the name.
        if (slot.role === 'brand') {
          const logoSize = typePx(slot.size, width, height) * 1.5;
          return (
            <div key={slot.role} style={{ ...common, display: 'flex', alignItems: 'center', gap: u * 0.014, justifyContent: box.textAlign === 'center' ? 'center' : 'flex-start' }}>
              {content.logoUrl && (
                <img
                  src={content.logoUrl}
                  alt=""
                  crossOrigin="anonymous"
                  style={{ width: logoSize, height: logoSize, borderRadius: logoSize * 0.22, objectFit: 'cover', flexShrink: 0 }}
                />
              )}
              <span style={{ ...typeStyle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
            </div>
          );
        }

        /*
         * A one-line slot led by an icon (a handle beside its platform's mark).
         * The words and the icon share one flex line inside the slot's own
         * treatment, so a pill wraps both; the words cut off with an ellipsis
         * rather than wrap, as the canvas painter's one-line fit does.
         */
        const glyph = rowGlyph(slot, 0, value, { platform: content.platform, sample: sampleRow(template, slot.role, 0) });
        if (glyph) {
          const iconSize = typeStyle.fontSize as number;
          const words: React.CSSProperties = { minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
          return (
            <div key={slot.role} style={common}>
              <div
                style={{
                  ...typeStyle,
                  display: typeStyle.display === 'inline-block' ? 'inline-flex' : 'flex',
                  alignItems: 'center',
                  gap: iconSize * ICON_GAP_EM,
                  justifyContent: box.textAlign === 'center' ? 'center' : box.textAlign === 'right' ? 'flex-end' : 'flex-start',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <IconGlyph glyph={glyph} size={iconSize} color={typeStyle.color as string} />
                {onEditText && TEXT_ROLES.includes(slot.role)
                  ? <EditableSlot value={value} onCommit={(v) => onEditText(slot.role, v)} style={words} />
                  : <span style={words}>{value}</span>}
              </div>
            </div>
          );
        }

        if (onEditText && TEXT_ROLES.includes(slot.role)) {
          return (
            <div key={slot.role} style={common}>
              <EditableSlot value={value} onCommit={(v) => onEditText(slot.role, v)} style={typeStyle} />
            </div>
          );
        }

        return (
          <div key={slot.role} style={common}>
            <div style={typeStyle}>{value}</div>
          </div>
        );
      })}
    </div>
  );
}
