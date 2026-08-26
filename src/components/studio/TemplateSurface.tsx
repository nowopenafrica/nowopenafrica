import { useRef } from 'react';
import {
  type DesignTemplate, type ShapeSpec, type SlotRole, type SlotSpec,
  slotBox, typePx, motionAt, settleTime, surfaceLayers, inkFor, hexAlpha, unitOf, fontStack,
  isListRole, listRowBoxes, shapeColor, shapeGeometry,
  type PriceRow,
} from '../../lib/designTemplates';

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
}

const TEXT_ROLES: SlotRole[] = ['brand', 'eyebrow', 'headline', 'subline', 'meta', 'cta'];

/**
 * One decorative shape.
 *
 * Geometry comes from shapeGeometry so this and the canvas painter cannot
 * disagree about where a wedge sits. Polygons become clip-path, which survives
 * PNG export because html-to-image rasterises through <foreignObject> and lets
 * the browser's own engine draw the CSS.
 */
function Shape({
  shape, width, height, accent, ink, base,
}: {
  shape: ShapeSpec; width: number; height: number; accent: string; ink: string; base: string;
}) {
  const geom = shapeGeometry(shape, width, height);
  const color = shapeColor(shape.tone, accent, ink, base);
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
 * A repeating slot: a services column, a proof-point strip, a contact bar.
 *
 * Row positions come from listRowBoxes, the same resolver the canvas painter
 * uses. Line height is 1.4 deliberately — that places the DOM text baseline at
 * roughly row.y + size, which is exactly where canvas fillText puts it, so the
 * two renderers land on the same pixel instead of drifting a few px per row.
 */
function ListSlot({
  slot, content, width, height, accent, ink, template,
}: {
  slot: SlotSpec;
  content: TemplateContent;
  width: number;
  height: number;
  accent: string;
  ink: string;
  template: DesignTemplate;
}) {
  const all =
    slot.role === 'services' ? (content.services ?? [])
    : slot.role === 'contact' ? (content.contact ?? [])
    : slot.role === 'price' ? (content.price ?? [])
    : (content.stats ?? []);
  const count = slot.max ? Math.min(all.length, slot.max) : all.length;
  if (count === 0) return null;

  const boxes = listRowBoxes(slot, width, height, count);
  const family = fontStack(slot.font ?? template.font);
  const tone = slot.tone === 'accent' ? accent : slot.tone === 'muted' ? hexAlpha(ink, 0.72) : ink;
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
            }}
          >
            <Bullet slot={slot} size={size} index={i} accent={accent} />
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
}: TemplateSurfaceProps) {
  const ink = inkFor(template);
  const surfaceBase = base ?? (template.scheme === 'dark' ? '#0b1220' : '#f7f7f5');
  const u = unitOf(width, height);
  const at = t ?? settleTime(template);
  const layers = surfaceLayers(template, accent, surfaceBase, surfaceOpacity);

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

  const toneColor = (slot: SlotSpec): string => {
    if (slot.tone === 'accent') return accent;
    if (slot.tone === 'muted') return hexAlpha(ink, 0.72);
    return ink;
  };

  /** Treatment-specific chrome. Kept here so templates stay pure data. */
  const treatmentStyle = (slot: SlotSpec): React.CSSProperties => {
    const pad = u * 0.014;
    switch (slot.treatment) {
      case 'pill':
        return {
          display: 'inline-block',
          padding: `${pad * 0.7}px ${pad * 1.6}px`,
          borderRadius: 999,
          background: slot.tone === 'accent' ? hexAlpha(accent, 0.18) : hexAlpha(ink, 0.12),
          border: `1px solid ${hexAlpha(slot.tone === 'accent' ? accent : ink, 0.35)}`,
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
          border: `${Math.max(1, u * 0.003)}px solid ${hexAlpha(ink, 0.75)}`,
        };
      case 'underline':
        return { borderBottom: `${Math.max(2, u * 0.006)}px solid ${accent}`, paddingBottom: pad * 0.6, display: 'inline-block' };
      case 'bar':
        // A leading accent rule — the editorial device.
        return { borderLeft: `${Math.max(2, u * 0.008)}px solid ${accent}`, paddingLeft: pad };
      case 'disc':
        // Diameter is the slot's own width, matching the canvas painter exactly.
        return {
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: '50%',
          background: slot.tone === 'accent' ? accent : hexAlpha(ink, 0.92),
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
      {/* Media sits beneath the surface layers so the tint keeps text readable. */}
      {mediaUrl && mediaKind === 'image' && (
        <img
          src={mediaUrl}
          alt=""
          crossOrigin="anonymous"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: mediaOpacity / 100 }}
        />
      )}
      {mediaUrl && mediaKind === 'video' && (
        <video
          src={mediaUrl}
          muted
          playsInline
          autoPlay
          loop
          crossOrigin="anonymous"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: mediaOpacity / 100 }}
        />
      )}

      {layers.map((bg, i) => (
        <div key={i} style={{ position: 'absolute', inset: 0, background: bg }} />
      ))}

      {/* Geometry over the surface, under the type — same order as the canvas
          painter, so a wedge never lands on top of a headline in one renderer
          and behind it in the other. */}
      {(template.shapes ?? []).map((shape, i) => (
        <Shape key={i} shape={shape} width={width} height={height} accent={accent} ink={ink} base={surfaceBase} />
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
                accent={accent}
                ink={ink}
                template={template}
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

        const typeStyle: React.CSSProperties = {
          fontSize: typePx(slot.size, width, height),
          fontWeight: slot.weight ?? 600,
          lineHeight: (slot.size ?? 0.05) > 0.07 ? 1.03 : 1.25,
          letterSpacing: `${slot.tracking ?? 0}em`,
          fontFamily: fontStack(slot.font ?? template.font),
          textTransform: slot.upper ? 'uppercase' : undefined,
          // On a filled disc the slot tone IS the disc, so the words take the
          // surface colour under it or they disappear into their own badge.
          color: slot.treatment === 'disc'
            ? (slot.tone === 'accent' ? surfaceBase : accent)
            : toneColor(slot),
          ...treatmentStyle(slot),
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
