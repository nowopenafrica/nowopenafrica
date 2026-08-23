import { useRef } from 'react';
import {
  type DesignTemplate, type SlotRole, type SlotSpec,
  slotBox, typePx, motionAt, settleTime, surfaceLayers, inkFor, hexAlpha, unitOf,
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
  /** When set, text slots become editable in place. */
  onEditText?: (role: SlotRole, value: string) => void;
}

const TEXT_ROLES: SlotRole[] = ['brand', 'eyebrow', 'headline', 'subline', 'meta', 'cta'];

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

export default function TemplateSurface({
  template, content, width, height, accent, base,
  t, mediaUrl, mediaKind = 'image', mediaOpacity = 100, onEditText,
}: TemplateSurfaceProps) {
  const ink = inkFor(template);
  const surfaceBase = base ?? (template.scheme === 'dark' ? '#0b1220' : '#f7f7f5');
  const u = unitOf(width, height);
  const at = t ?? settleTime(template);
  const layers = surfaceLayers(template, accent, surfaceBase);

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
          textTransform: slot.upper ? 'uppercase' : undefined,
          color: toneColor(slot),
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
