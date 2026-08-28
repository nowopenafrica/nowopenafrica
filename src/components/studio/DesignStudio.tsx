import { useState, useEffect, useRef, useMemo, createContext, useContext } from 'react';
import toast from 'react-hot-toast';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { Download, FileText, Video as VideoIcon, Loader2, Phone, Globe, MapPin, Upload, X, RotateCcw, Pencil, Wand2, CheckCircle2, Target, Rocket, LayoutTemplate, Type, Palette, Radio, Link2, Gauge, Move, Camera, ListChecks } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { backgroundSourceIssue } from '../../lib/videoEmbeds';
import { extractBackgroundClip, BACKGROUND_CLIP_SECONDS } from '../../lib/backgroundClip';
import { isVideoUrl } from '../../lib/galleryMedia';
import OpenReelCapture from '../dashboard/OpenReelCapture';
import { Business } from '../../types';
import { profileUrl, generateQr, downloadUrl, downloadBlob, slugForFile, shareLinks, exportNodeToPng } from '../../lib/studio';
import { StudioTemplate, StudioFormat, STUDIO_LAYOUTS, darken } from '../../data/studioPresets';
import { useBrandIdentity } from '../../hooks/useBrandIdentity';
import { useCardSettings } from '../../hooks/useCardSettings';
import { generateCopyVariants, smartCta, CopyVariant, CtaSuggestion } from '../../lib/aiCopy';
import { designCoachReport, channelReadiness } from '../../lib/designCoach';
import DesignCoachPanel from './DesignCoachPanel';
import PreviewFrame from './PreviewFrame';
import { PreviewFrameKind, PREVIEW_FRAME_OPTIONS } from '../../lib/previewFrames';
import NowOpenMark from '../NowOpenMark';
import { useLiveCanvas } from '../../hooks/useLiveCanvas';
import { CanvasLayers, CanvasPanel } from './FreeCanvas';
import InspirationUpload from './InspirationUpload';
import GeneratePanel from './GeneratePanel';
import { track } from '../../lib/telemetry';
import TemplateSurface from './TemplateSurface';
import { DESIGN_TEMPLATES, templateByKey, templateListRoles, defaultMediaScrim, type SlotRole } from '../../lib/designTemplates';
import FlyerContentEditor, { type FlyerContent } from '../admin/FlyerContentEditor';
import { currencyInfo, detectRegionCurrency, formatUsdAmount } from '../../lib/currency';
import type { InspirationPlan } from '../../lib/designInspiration';
import { docFromRenderedLayout } from '../../lib/layoutImport';
import { pickRecorderMime } from '../../lib/renderVideo';
import {
  docFromSlots, initHistory, pushHistory, undo as undoDoc, redo as redoDoc,
  canUndo as histCanUndo, canRedo as histCanRedo, type CanvasDoc, type History,
} from '../../lib/canvasDoc';
import { liveTokenGroups, insertToken, liveCanvasSummary, hasLiveTokens } from '../../lib/liveCanvas';

// Live Business Canvas: every text slot resolves its {{tokens}} through this
// context. Providing it once around the design means all 20 layouts — and any
// added later — bind to live profile data without touching a single call site.
const LiveResolveContext = createContext<(text: string) => string>((text) => text);

// A Quick Create selection passed down from the hub. The hub bumps `token` on
// every pick (and switches the template group) so the studio remounts with the
// right template + format preloaded.
export interface DesignStudioSeed {
  token: number;
  templateKey: string;
  formatKey: string;
  runCampaign: boolean;
}

const EDITOR_TABS = [
  { key: 'design' as const, label: 'Design', icon: LayoutTemplate },
  { key: 'content' as const, label: 'Content', icon: Type },
  { key: 'style' as const, label: 'Style', icon: Palette },
];

const ACCENT_PRESETS = ['#7c3aed', '#2563eb', '#16a34a', '#dc2626', '#ea580c', '#f59e0b', '#db2777', '#0891b2'];
// Background palette — the neutral defaults each layout ships with, plus a few
// popular brand colours. The picker below lets the user override any of them.
const BG_PRESETS = ['#0f172a', '#ffffff', '#f7ecd6', '#1e0b4b', '#08305c', '#17301f', '#7c3aed', '#0f766e', '#b91c1c', '#f59e0b'];

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => res(img); img.onerror = rej; img.src = src;
});
const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
function coverDraw(ctx: CanvasRenderingContext2D, media: CanvasImageSource, mw: number, mh: number, w: number, h: number) {
  if (!mw || !mh) return;
  const scale = Math.max(w / mw, h / mh);
  const dw = mw * scale, dh = mh * scale;
  ctx.drawImage(media, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

// A slow centre zoom on a still design, so a static layout exports as a living
// video clip instead of a frozen frame.
function drawKenBurns(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cw: number, ch: number, t01: number) {
  const base = Math.max(cw / (img.naturalWidth || 1), ch / (img.naturalHeight || 1));
  const zoom = 1 + 0.12 * t01;
  const dw = (img.naturalWidth || cw) * base * zoom;
  const dh = (img.naturalHeight || ch) * base * zoom;
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
}

// MP4 video export renders at the design's own aspect ratio but caps the
// longest side at 1080p-class resolution (1920px) so encoding stays fast and
// files stay reasonable. H.264 needs even dimensions.
function videoCanvasSize(w: number, h: number) {
  const k = Math.min(1, 1920 / Math.max(w, h));
  return { cw: Math.max(2, Math.round(w * k) & ~1), ch: Math.max(2, Math.round(h * k) & ~1) };
}

const VIDEO_SECONDS = [5, 10, 15, 30, 60];

// The sizes a "full campaign" produces — story, social post, web share, X,
// print flyer and email header. Matches the Quick Create → Full Campaign card.
const CAMPAIGN_FORMATS = ['story', 'instagram-post', 'facebook-post', 'x-post', 'a4', 'email-header'];

// Grouped control card for the studio sidebar — mirrors the Brand OS section
// style so every panel in the app reads the same way.
function StudioSection({ icon: Icon, title, children }: { icon: React.ComponentType<{ size?: number | string; className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
      <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-gray-700 dark:text-gray-200">
        <Icon size={15} className="text-purple-600 dark:text-purple-400" />
        {title}
      </h3>
      {children}
    </section>
  );
}

// Click-to-edit text. Writes back to state on blur (or Enter) so the sidebar
// inputs and the exported image always reflect the latest value.
function EditableText({
  value, onEdit, style,
}: {
  value: string;
  onEdit: (next: string) => void;
  style?: React.CSSProperties;
}) {
  const resolve = useContext(LiveResolveContext);
  const ref = useRef<HTMLDivElement>(null);
  // What a viewer sees: tokens swapped for live profile data.
  const shown = resolve(value);

  // React doesn't manage contentEditable children after mount, so keep the DOM
  // text in step with props by hand — but never while the user is typing in it.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== shown) {
      el.textContent = shown;
    }
  }, [shown]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onFocus={(e) => {
        // Reveal the authored source on focus. Without this, clicking a live
        // field to edit it would replace "{{business.status}}" with the literal
        // words "Open Now" and silently break the binding.
        if (shown !== value) e.currentTarget.textContent = value;
      }}
      onBlur={(e) => {
        const next = e.currentTarget.textContent || '';
        if (next.trim() && next.trim() !== value) onEdit(next.trim());
        // Always fall back to the resolved text once editing ends.
        e.currentTarget.textContent = resolve(next.trim() || value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
      }}
      style={{ outline: 'none', cursor: 'text', ...style }}
    >
      {shown}
    </div>
  );
}

/**
 * "Link live data" control under a text field: a picker that splices a
 * {{token}} into the field, plus a preview of what it currently resolves to so
 * the owner can see the real words before exporting.
 */
function LiveFieldRow({
  field, value, onChange, resolve,
}: {
  field: string;
  value: string;
  onChange: (next: string) => void;
  resolve: (text: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const linked = hasLiveTokens(value);
  const preview = linked ? resolve(value) : '';

  return (
    <div className="mt-1.5">
      {/* Both controls carry a 44px touch target via min-h + a matching negative
          margin, so the hit area meets the minimum without the row growing into
          the sidebar. px not rem — index.css shrinks the root font to 14px on
          phones, which would leave a rem-based minimum ~12% short. */}
      <div className="flex items-center gap-3 -my-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`inline-flex items-center gap-1 min-h-[44px] text-[11px] font-semibold transition rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
            linked
              ? 'text-green-700 dark:text-green-400'
              : 'text-purple-600 dark:text-purple-400 hover:text-purple-700'
          }`}
        >
          <Link2 size={11} /> {linked ? 'Linked to profile' : 'Link live data'}
        </button>
        {linked && (
          <button
            type="button"
            onClick={() => onChange(resolve(value))}
            title={`Replace the tokens in ${field} with their current text`}
            className="inline-flex items-center min-h-[44px] text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            Unlink
          </button>
        )}
      </div>

      {linked && (
        <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 truncate" title={preview}>
          Now reads: <span className="font-medium text-gray-700 dark:text-gray-200">{preview}</span>
        </p>
      )}

      {open && (
        <div className="mt-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 max-h-56 overflow-y-auto">
          {liveTokenGroups().map(({ group, tokens }) => (
            <div key={group} className="mb-2 last:mb-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">{group}</p>
              <div className="flex flex-wrap gap-1">
                {tokens.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    title={t.desc}
                    onClick={() => { onChange(insertToken(value, t.key)); setOpen(false); }}
                    // min-h in px, not rem: index.css scales the root font-size to
                    // 14px on phones, so a rem-based minimum lands ~12% short of
                    // the 44px touch target.
                    className="inline-flex items-center min-h-[44px] px-2.5 rounded-md text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900/40 hover:text-purple-700 dark:hover:text-purple-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 transition"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Brand row (logo + name) shared by every layout.
function BrandHeader({ logo, name, size, dark, centered, nameColor }: { logo?: string; name: string; size: number; dark?: boolean; centered?: boolean; nameColor?: string }) {
  const c = nameColor ?? (dark ? '#0f172a' : '#ffffff');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.18, justifyContent: centered ? 'center' : 'flex-start' }}>
      <div style={{
        width: size, height: size, borderRadius: size * 0.24, overflow: 'hidden', flexShrink: 0,
        background: dark ? '#ffffff' : 'rgba(255,255,255,0.14)',
        border: dark ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {logo
          ? <img src={logo} crossOrigin="anonymous" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: size * 0.55, fontWeight: 800, color: dark ? '#94a3b8' : '#e2e8f0' }}>{name.slice(0, 1)}</span>}
      </div>
      <span style={{ fontSize: size * 0.3, fontWeight: 700, color: c }}>{name}</span>
    </div>
  );
}

// Phone / web / location lines shared by every layout. `unit` is the content
// base unit (min(w,h)) so the body size stays proportional on every format.
function ContactLines({ business, brandUrl, unit, dark, inline }: { business: Business; brandUrl: string; unit: number; dark?: boolean; inline?: boolean }) {
  const c = dark ? '#334155' : 'rgba(255,255,255,0.92)';
  const font = unit * 0.024;
  const icon = unit * 0.026;
  const row: React.ReactNode[] = [];
  if (business.phone) row.push(<span key="p" style={{ display: 'inline-flex', alignItems: 'center', gap: font * 0.5 }}><Phone size={icon} /> {business.phone}</span>);
  row.push(<span key="w" style={{ display: 'inline-flex', alignItems: 'center', gap: font * 0.5, fontWeight: 700 }}><Globe size={icon} /> {brandUrl}</span>);
  if (business.location) row.push(<span key="l" style={{ display: 'inline-flex', alignItems: 'center', gap: font * 0.5 }}><MapPin size={icon} /> {business.location}</span>);

  return (
    <div style={{
      fontSize: font, color: c, lineHeight: 1.75, letterSpacing: 0.2,
      display: 'flex', gap: inline ? unit * 0.05 : font * 0.35,
      flexDirection: inline ? 'row' : 'column',
      flexWrap: inline ? 'wrap' : 'nowrap',
      justifyContent: inline ? 'center' : 'flex-start',
    }}>
      {row}
    </div>
  );
}

// QR + brand mark, used at the bottom-right of the dark layouts.
function QrBox({ qr, unit }: { qr: string; unit: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: unit * 0.03 }}>
      {qr && <img src={qr} alt="QR" style={{ width: unit * 0.16, height: unit * 0.16, borderRadius: unit * 0.012, background: '#fff', padding: unit * 0.008 }} />}
      <NowOpenMark size={unit * 0.05} />
    </div>
  );
}

export default function DesignStudio({
  business,
  templates,
  formats,
  hint,
  templateLabel = 'Occasion / Style',
  initialTemplateKey,
  seed,
}: {
  business: Business;
  templates: StudioTemplate[];
  formats: StudioFormat[];
  hint?: string;
  templateLabel?: string;
  initialTemplateKey?: string;
  seed?: DesignStudioSeed | null;
}) {
  const startTemplate = templates.find((t) => t.key === (seed?.templateKey ?? initialTemplateKey)) || templates[0];
  const [templateKey, setTemplateKey] = useState(startTemplate.key);
  const [layoutKey, setLayoutKey] = useState(STUDIO_LAYOUTS[0].key);
  const [formatKey, setFormatKey] = useState(seed && formats.some((f) => f.key === seed.formatKey) ? seed.formatKey : formats[0].key);
  const [headline, setHeadline] = useState(startTemplate.headline);
  const [subline, setSubline] = useState(startTemplate.subline);
  const [badge, setBadge] = useState(startTemplate.badge);

  // The repeating parts of the newer templates — services, proof points, price
  // rows. Held here rather than derived, because they are the parts the owner
  // edits; the contact strip below is derived, because it is already on record.
  //
  // Seeded, because an empty services column or price panel renders as a blank
  // area that reads as a broken template rather than an unfilled one.
  //
  // The amounts go through the currency layer instead of a hardcoded symbol: a
  // studio that seeds ₦ for a business billing in cedis is telling them, at a
  // glance, that the tool was not built for them.
  //
  // The pure helpers rather than useCurrency(), deliberately. This is
  // placeholder text the owner immediately overwrites, and it is not worth
  // making a 2,000-line editor refuse to mount without a CurrencyProvider —
  // which is exactly what the admin smoke test does not have. Bundled fallback
  // rates are fine for a number nobody is meant to keep.
  const [flyer, setFlyer] = useState<FlyerContent>(() => {
    const code = detectRegionCurrency();
    const rate = currencyInfo(code).fallbackRate;
    const money = (usd: number) => formatUsdAmount(usd, code, rate);
    return {
      services: [
        'Brand & identity design',
        'Social media management',
        'Web design & development',
        'Paid ads & SEO',
      ],
      stats: [
        { value: '10+', label: 'Years' },
        { value: '250+', label: 'Projects' },
        { value: '30+', label: 'Markets' },
      ],
      price: [
        { label: 'Consultation', price: money(25) },
        { label: 'Standard package', price: money(120) },
        { label: 'Premium package', price: money(300) },
      ],
    };
  });
  const [accent, setAccent] = useState(startTemplate.accent);
  const { user } = useAuth();
  const [bgColor, setBgColor] = useState<string | null>(null);
  const [bgOpacity, setBgOpacity] = useState(100);
  const [qr, setQr] = useState('');
  const [bg, setBg] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  // Background from a pasted link or the OpenReel camera, alongside the upload.
  const [bgLink, setBgLink] = useState('');
  const [bgLinkIssue, setBgLinkIssue] = useState<string | null>(null);
  const [showBgCamera, setShowBgCamera] = useState(false);
  // 0-100 while a pasted video is being trimmed to 60s, else null.
  const [bgClipProgress, setBgClipProgress] = useState<number | null>(null);
  const [captureOverlay, setCaptureOverlay] = useState(false);
  const [busy, setBusy] = useState<null | 'png' | 'pdf' | 'video' | 'all'>(null);
  const [exportMode, setExportMode] = useState<'image' | 'video'>('image');
  const [videoSeconds, setVideoSeconds] = useState(15);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [copyIdeas, setCopyIdeas] = useState<CopyVariant[] | null>(null);
  const [cta, setCta] = useState<CtaSuggestion | null>(null);
  const [frame, setFrame] = useState<PreviewFrameKind>('none');
  // The coach is on demand: it used to sit open in the right column and crowd
  // the editor. Closed means not rendered at all — just a button.
  const [coachOpen, setCoachOpen] = useState(false);
  // Smart layout is the default and stays the fixed-layout path. Free canvas
  // is opt-in and renders from a layer document instead. The two never share
  // state, so toggling can't damage a working design.
  const [freeCanvas, setFreeCanvas] = useState(false);
  const [docHistory, setDocHistory] = useState<History<CanvasDoc> | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  // Which editor pane is showing. Stacking all three made the column
  // ~3,400px tall, so changing a headline meant scrolling past every
  // template and layout card.
  const [editorTab, setEditorTab] = useState<'design' | 'content' | 'style'>('content');
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const flyerRef = useRef<HTMLDivElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const template = templates.find((t) => t.key === templateKey)!;
  const format = formats.find((f) => f.key === formatKey)!;
  const layout = STUDIO_LAYOUTS.find((l) => l.key === layoutKey) ?? STUDIO_LAYOUTS[0];
  // A modern (data-driven) template is selected by a "t:" prefixed key. The 30
  // legacy hardcoded layouts keep working untouched, so nothing regresses while
  // the new system takes over surface by surface.
  const modernKey = layoutKey.startsWith('t:') ? layoutKey.slice(2) : null;
  const modernTpl = modernKey ? templateByKey(modernKey) : null;
  const { w, h } = format;
  const url = profileUrl(business);
  const brandUrl = url.replace(/^https?:\/\//, '');

  // Built from the business record rather than typed again. These are details
  // the owner has already given us, and a contact strip that disagrees with the
  // profile is worse than no contact strip.
  const derivedContact = [business.phone, business.email, brandUrl]
    .map((v) => (v ?? '').trim())
    .filter(Boolean);
  const scale = 460 / Math.max(w, h);
  const u = Math.min(w, h);
  const hasVideo = bg?.type === 'video';
  // Effective background: uploaded media wins, else the profile cover image.
  const bgImageSrc = bg?.type === 'image' ? bg.url : (!bg && business.image_url) ? business.image_url : null;

  // Brand layer — the owner's Brand OS identity (voice, tagline) and the saved
  // card accent (their "brand colour"), so the coach and copy ideas stay on-brand.
  const { identity } = useBrandIdentity(business.id);
  const { settings } = useCardSettings(business.id);
  const brandAccent = settings.accentColor || '';

  // Live Business Canvas — resolves {{tokens}} against the live profile.
  const { resolve, resolveSlots } = useLiveCanvas(business);

  // The resolved slots are what a viewer actually reads, so the coach must score
  // those, not the authored source. "{{business.name}} is {{business.status}}"
  // is 40 raw characters but often ~30 real ones — grading the raw text would
  // flag a headline that is genuinely fine.
  const live = useMemo(
    () => resolveSlots({ headline, subline, badge }),
    [resolveSlots, headline, subline, badge],
  );
  const liveSummary = useMemo(() => liveCanvasSummary(live), [live]);

  // Rule-based, so cheap to keep current even while the panel is closed.
  const coachReport = useMemo(
    () => designCoachReport({
      headline: live.values.headline,
      subline: live.values.subline,
      badge: live.values.badge,
      accent, bgColor, qr,
      hasLogo: !!business.logo_url,
      hasBackground: !!(bgImageSrc || hasVideo),
      brandAccent,
    }),
    [live, accent, bgColor, qr, bgImageSrc, hasVideo, brandAccent, business.logo_url],
  );

  // Per-surface readiness, scored from the resolved text and the format's real
  // pixel size so it reflects what a viewer actually gets.
  const channels = useMemo(
    () => channelReadiness({
      width: w, height: h,
      headline: live.values.headline,
      subline: live.values.subline,
      badge: live.values.badge,
      accent, bgColor,
    }),
    [w, h, live, accent, bgColor],
  );

  useEffect(() => {
    const t = templates.find((x) => x.key === templateKey)!;
    setHeadline(t.headline); setSubline(t.subline); setBadge(t.badge); setAccent(t.accent);
  }, [templateKey, templates]);
  useEffect(() => { generateQr(url, { dark: '#0f172a' }).then(setQr).catch(() => setQr('')); }, [url]);
  useEffect(() => () => { if (bg && bg.url.startsWith('blob:')) URL.revokeObjectURL(bg.url); }, [bg]);
  useEffect(() => () => { audioCtxRef.current?.close().catch(() => {}); }, []);
  // A Quick Create "Full Campaign" pick exports every campaign size on mount,
  // once the new template + format have rendered.
  useEffect(() => {
    if (seed?.runCampaign) void exportCampaign();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetText = () => { setHeadline(template.headline); setSubline(template.subline); setBadge(template.badge); };

  // Accept any size of image or video. The file is kept in memory as a local
  // object URL (used only as the design background to generate the download
  // materials) — it is never uploaded to storage.
  /**
   * Use a pasted link as the background. Rejects a platform embed, since the
   * export draws the background into a canvas and an iframe cannot be drawn.
   */
  const applyBgLink = async () => {
    const url = bgLink.trim();
    if (!url) { setBgLinkIssue(null); return; }
    const issue = backgroundSourceIssue(url);
    if (issue) { setBgLinkIssue(issue); return; }
    setBgLinkIssue(null);

    if (!isVideoUrl(url)) {
      setBg({ url, type: 'image' });
      toast.success('Background image set from link');
      return;
    }

    // Trim and compress the first minute locally, so the design renders from a
    // small clip instead of streaming a whole film on every preview frame. The
    // result stays in memory — nothing is uploaded.
    setBgClipProgress(0);
    try {
      const clip = await extractBackgroundClip(url, BACKGROUND_CLIP_SECONDS, (fraction) => {
        setBgClipProgress(Math.round(fraction * 100));
      });
      setBg({ url: clip.url, type: 'video' });
      toast.success(`Background clip ready — ${Math.round(clip.seconds)}s, ${Math.round(clip.blob.size / 1024)} KB`);
    } catch (err: any) {
      // Fall back to using the link directly: it may still render, and saying
      // nothing would be worse than a working-but-untrimmed background.
      setBg({ url, type: 'video' });
      setBgLinkIssue(`${err?.message || 'Could not trim that video.'} Using the full link instead.`);
    } finally {
      setBgClipProgress(null);
    }
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) { toast.error('Please upload an image or a video.'); return; }
    const objUrl = URL.createObjectURL(file);
    if (isVideo) {
      const ok = await new Promise<boolean>((res) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => res(true);
        v.onerror = () => res(false);
        v.src = objUrl;
      });
      if (!ok) { URL.revokeObjectURL(objUrl); toast.error('That video could not be read — try another file.'); return; }
      setBg({ url: objUrl, type: 'video' });
    } else {
      setBg({ url: objUrl, type: 'image' });
    }
  };

  // Capture the overlay (everything except the background media) as a
  // transparent PNG, for compositing over a video/image frame on canvas. Uses
  // the same robust capture as the PNG export — CORS-safe remote images (the
  // logo), a warm-up pass and a font wait — so cross-origin media never taints
  // the canvas (which used to throw a SecurityError and kill video export).
  const getOverlayDataUrl = async (fmt: { w: number; h: number } = format): Promise<string> => {
    setCaptureOverlay(true);
    await nextPaint();
    try {
      return await exportNodeToPng(flyerRef.current!, { pixelRatio: 1, canvasWidth: fmt.w, canvasHeight: fmt.h });
    } finally {
      setCaptureOverlay(false);
    }
  };

  // A still PNG of the current design (handles both image and video backgrounds).
  const stillPng = async (fmt = format): Promise<string> => {
    if (!hasVideo) {
      return exportNodeToPng(flyerRef.current!, { pixelRatio: 1, canvasWidth: fmt.w, canvasHeight: fmt.h });
    }
    const overlay = await loadImage(await getOverlayDataUrl(fmt));
    const canvas = document.createElement('canvas'); canvas.width = fmt.w; canvas.height = fmt.h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, fmt.w, fmt.h);
    const v = bgVideoRef.current;
    if (v) coverDraw(ctx, v, v.videoWidth, v.videoHeight, fmt.w, fmt.h);
    ctx.drawImage(overlay, 0, 0, fmt.w, fmt.h);
    return canvas.toDataURL('image/png');
  };

  const exportPng = async () => {
    setBusy('png');
    // Whether the flagship actually produces anything is the one product
    // question no amount of code reading can answer.
    track('studio_export', { kind: 'png', format: format.key, layout: layoutKey }, business.id);
    try { downloadUrl(await stillPng(), `${slugForFile(business.name)}-${format.key}.png`); toast.success('PNG downloaded'); }
    catch { toast.error('Could not export the image — try again.'); }
    finally { setBusy(null); }
  };

  const exportPdf = async () => {
    setBusy('pdf');
    try {
      const png = await stillPng();
      // Imported here, not at the top of the file: jsPDF is ~900 kB and this
      // is the only thing in the module that needs it. See studio.ts.
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'px', format: [w, h] });
      pdf.addImage(png, 'PNG', 0, 0, w, h);
      pdf.save(`${slugForFile(business.name)}-${format.key}.pdf`);
      toast.success('PDF downloaded');
    } catch { toast.error('Could not export the PDF — try again.'); }
    finally { setBusy(null); }
  };

  // One tap saves every format in this studio as a PNG. Each size is selected
  // first so the node re-renders at the right dimensions before capture.
  const exportAllFormats = async () => {
    if (busy) return;
    const previous = formatKey;
    setBusy('all');
    try {
      const base = slugForFile(business.name);
      for (let i = 0; i < formats.length; i++) {
        const f = formats[i];
        setFormatKey(f.key);
        setExportProgress(`${i + 1} of ${formats.length}`);
        await nextPaint();
        downloadUrl(await stillPng(f), `${base}-${f.key}.png`);
      }
      toast.success('All formats downloaded');
    } catch { toast.error('Could not export all formats — try again.'); }
    finally { setFormatKey(previous); setExportProgress(null); setBusy(null); }
  };

  // The Quick Create "Full Campaign" path: story, social, web, X, flyer and
  // email header in one run — the whole campaign, ready to publish.
  const exportCampaign = async () => {
    if (busy) return;
    const previous = formatKey;
    setBusy('all');
    try {
      const base = slugForFile(business.name);
      for (let i = 0; i < CAMPAIGN_FORMATS.length; i++) {
        const f = formats.find((x) => x.key === CAMPAIGN_FORMATS[i]);
        if (!f) continue;
        setFormatKey(f.key);
        setExportProgress(`${i + 1} of ${CAMPAIGN_FORMATS.length}`);
        await nextPaint();
        downloadUrl(await stillPng(f), `${base}-${f.key}.png`);
      }
      toast.success('Full campaign downloaded — every size is ready to publish');
    } catch { toast.error('Could not export the campaign — try again.'); }
    finally { setFormatKey(previous); setExportProgress(null); setBusy(null); }
  };

  // AI copy ideas + smart CTA, personalised from the Brand OS identity.
  const generateIdeas = () => {
    setCopyIdeas(generateCopyVariants({ name: business.name, category: business.category }, identity, template));
    setCta(smartCta(business, template));
  };
  const applyVariant = (v: CopyVariant) => {
    setHeadline(v.headline); setSubline(v.subline); setBadge(v.badge);
    toast.success(`"${v.label}" copy applied`);
  };
  const applyCta = () => {
    if (!cta) return;
    setBadge(cta.badge); setSubline(cta.subline);
    setCta(null);
    toast.success('CTA applied');
  };
  const doc = docHistory?.present ?? null;
  const commitDoc = (next: CanvasDoc) =>
    setDocHistory((h) => (h ? pushHistory(h, next) : initHistory(next)));

  // Seeding happens on the way IN to canvas mode only, so returning to smart
  // layout and coming back doesn't silently discard the merchant's edits.
  // Measure the layout the merchant actually picked. docFromSlots is only a
  // fallback for when there's nothing painted to measure (jsdom, or a layout
  // that hasn't laid out yet).
  const buildDocFromLayout = (): CanvasDoc => {
    const measured = flyerRef.current
      ? docFromRenderedLayout({ node: flyerRef.current, width: w, height: h, scale })
      : null;
    return measured ?? docFromSlots({
      width: w, height: h,
      headline: live.values.headline,
      subline: live.values.subline,
      badge: live.values.badge,
      accent,
      logoUrl: business.logo_url ?? null,
      qrDataUrl: qr || null,
    });
  };

  const enterFreeCanvas = () => {
    if (!docHistory) setDocHistory(initHistory(buildDocFromLayout()));
    setFreeCanvas(true);
  };

  // Pull the current Smart layout in again — after switching layout or format,
  // or to start over. Pushes onto history so it's undoable.
  const importCurrentLayout = () => {
    const next = buildDocFromLayout();
    setDocHistory((hst) => (hst ? pushHistory(hst, next) : initHistory(next)));
    setSelectedLayer(null);
    toast.success(`Imported the ${layout.label} layout — every element is editable.`);
  };

  const resetFreeCanvas = () => {
    setDocHistory(initHistory(buildDocFromLayout()));
    setSelectedLayer(null);
  };

  // AI Design Inspiration: the plan only ever sets layout, accent and
  // background — the merchant's own copy, logo and QR are untouched. Jumps to
  // Content afterwards, since the words are what they'll want next.
  const applyInspiration = (plan: InspirationPlan) => {
    setLayoutKey(plan.layoutKey);
    setAccent(plan.accent);
    setBgColor(plan.bgColor);
    setEditorTab('content');
  };

  const applyBrandAccent = () => {
    if (!brandAccent) return;
    setAccent(brandAccent);
    toast.success('Brand colour applied');
  };

  // Shared canvas + compositor for video export. With an uploaded clip we keep
  // the background video animating underneath; with a static design (uploaded
  // image, cover photo or plain colour) we Ken Burns the finished still.
  const prepareExportRender = async (cw: number, ch: number) => {
    const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d')!;
    const v = bgVideoRef.current;
    let overlay: HTMLImageElement | null = null;
    let still: HTMLImageElement | null = null;
    if (hasVideo) {
      overlay = await loadImage(await getOverlayDataUrl({ w: cw, h: ch }));
    } else {
      still = await loadImage(await exportNodeToPng(flyerRef.current!, { pixelRatio: 1, canvasWidth: cw, canvasHeight: ch }));
    }
    const drawFrame = (t01: number) => {
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, cw, ch);
      if (hasVideo && v) coverDraw(ctx, v, v.videoWidth, v.videoHeight, cw, ch);
      else if (still) drawKenBurns(ctx, still, cw, ch, t01);
      if (overlay) ctx.drawImage(overlay, 0, 0, cw, ch);
    };
    return { canvas, ctx, drawFrame, v };
  };

  // Pick an H.264 (AVC) codec string the browser actually supports at this
  // resolution. Baseline level 3.1 (avc1.42001f) is capped at 720p — exporting
  // 1080p-class flyers with it makes the encoder error out, so we request a
  // higher level when needed and verify each candidate with the encoder API.
  const pickAvcCodec = async (cw: number, ch: number): Promise<string | null> => {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
    const candidates = Math.max(cw, ch) > 720
      ? ['avc1.420028', 'avc1.4d0028', 'avc1.640028', 'avc1.42001f', 'avc1.42E01E']
      : ['avc1.42001f', 'avc1.42E01E', 'avc1.4d001f', 'avc1.420028'];
    for (const codec of candidates) {
      try {
        const { supported } = await VideoEncoder.isConfigSupported({
          codec, width: cw, height: ch, bitrate: 8_000_000, framerate: 30,
        });
        if (supported) return codec;
      } catch { /* try the next candidate */ }
    }
    return null;
  };

  // Real MP4 (H.264) via WebCodecs + mp4-muxer — hardware accelerated, 30fps.
  const exportVideoMp4 = async (durationSec: number, cw: number, ch: number, codec: string) => {
    const FPS = 30;
    const totalFrames = Math.round(durationSec * FPS);
    const { canvas, drawFrame, v } = await prepareExportRender(cw, ch);
    if (hasVideo && v) { v.muted = true; v.currentTime = 0; await v.play().catch(() => {}); }

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: cw, height: ch, frameRate: FPS },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let encodeError: unknown = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encodeError = e; },
    });
    // Chrome rejects encode() while too many frames are in flight (QuotaExceededError),
    // so pace the loop against the encoder's own dequeue events instead of rAF.
    let inFlight = 0;
    encoder.addEventListener('dequeue', () => { inFlight = Math.max(0, inFlight - 1); });
    const MAX_IN_FLIGHT = 4;
    encoder.configure({ codec, width: cw, height: ch, bitrate: 8_000_000, framerate: FPS });

    let frameIdx = 0;
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (encodeError) { resolve(); return; }
        if (inFlight >= MAX_IN_FLIGHT) { requestAnimationFrame(tick); return; }
        drawFrame(frameIdx / Math.max(totalFrames - 1, 1));
        const frame = new VideoFrame(canvas, { timestamp: Math.round((frameIdx * 1e6) / FPS) });
        encoder.encode(frame, { keyFrame: frameIdx % (FPS * 2) === 0 });
        frame.close();
        inFlight += 1;
        frameIdx += 1;
        if (frameIdx < totalFrames) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });

    await encoder.flush();
    muxer.finalize();
    if (encodeError) throw encodeError;
    const buffer = muxer.target.buffer;
    downloadBlob(new Blob([buffer], { type: 'video/mp4' }), `${slugForFile(business.name)}-${format.key}-${durationSec}s.mp4`);
    toast.success('MP4 downloaded');
  };

  // Fallback for browsers without WebCodecs H.264: stream the composited
  // canvas to MediaRecorder — MP4 where the browser can record it, WebM
  // otherwise. Also the path used when the user wants the uploaded clip's
  // sound in the download (WebCodecs + mp4-muxer has no audio track).
  const exportVideoRecorder = async (durationSec: number, cw: number, ch: number, withAudio: boolean) => {
    if (typeof MediaRecorder === 'undefined') throw new Error('no recorder');
    const { canvas, drawFrame, v } = await prepareExportRender(cw, ch);
    if (hasVideo && v) { v.muted = !withAudio; v.currentTime = 0; await v.play().catch(() => {}); }

    const stream = canvas.captureStream(30);

    // Pipe the uploaded clip's audio into the recording so the MP4/WebM has
    // sound. The AudioContext is created lazily and re-used (an element can
    // only be connected to a MediaElementSource once), and the video stays
    // visually muted while recording since we never link it to ctx.destination.
    if (withAudio && hasVideo && v) {
      try {
        if (!audioCtxRef.current) {
          const ctx = new AudioContext();
          audioCtxRef.current = ctx;
          audioSourceRef.current = ctx.createMediaElementSource(v);
          audioDestRef.current = ctx.createMediaStreamDestination();
          audioSourceRef.current.connect(audioDestRef.current);
        }
        // Optional chain, not a bare deref: the refs above are only assigned
        // when audioCtxRef is empty, so if createMediaStreamDestination() ever
        // threw after the context was stored, a later export would find
        // audioCtxRef set but audioDestRef still null. Degrade to no audio.
        const audioTrack = audioDestRef.current?.stream.getAudioTracks()[0];
        if (audioTrack) stream.addTrack(audioTrack);
      } catch (e) {
        console.error('Audio capture failed — exporting without sound.', e);
      }
    }

    // Ask the STREAM whether audio actually made it in — `withAudio` is only an
    // intent, and the capture above degrades to silent on failure. A codecs=
    // parameter declares every track in the file, so picking a video-only type
    // for a stream that carries audio makes start() throw even though
    // isTypeSupported() said yes.
    const streamHasAudio = stream.getAudioTracks().length > 0;
    const mime = pickRecorderMime(streamHasAudio);

    // isTypeSupported lying is precisely the bug this replaced, so don't trust
    // the chosen type either: if the recorder still refuses, drop the mimeType
    // and let the browser pick a combination it can honour.
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      console.warn('Recorder rejected', mime, '— falling back to the browser default.', e);
      rec = new MediaRecorder(stream);
    }
    const chunks: BlobPart[] = [];
    const wire = (r: MediaRecorder) => {
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    };
    wire(rec);
    let stopped = new Promise<void>((res) => { rec.onstop = () => res(); });

    const dur = hasVideo && v && v.duration ? Math.min(durationSec, v.duration) : durationSec;
    // start() is where a mismatched mimeType actually surfaces — the constructor
    // accepts it and only start() reports "an audio track cannot be recorded".
    // One retry on the browser default turns a failed export into a silent-but-
    // successful one, which beats losing the whole video.
    try {
      rec.start();
    } catch (e) {
      console.warn('Recorder refused to start with', mime, '— retrying on the browser default.', e);
      rec = new MediaRecorder(stream);
      wire(rec);
      stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
      rec.start();
    }
    const start = performance.now();
    await new Promise<void>((res) => {
      const tick = () => {
        drawFrame((performance.now() - start) / (dur * 1000));
        if ((performance.now() - start) / 1000 < dur) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
    rec.stop();
    await stopped;

    if (hasVideo && v) v.muted = true;

    const isMp4 = !mime || mime.startsWith('video/mp4');
    downloadBlob(new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' }), `${slugForFile(business.name)}-${format.key}-${durationSec}s.${isMp4 ? 'mp4' : 'webm'}`);
    toast.success(isMp4 ? 'MP4 downloaded' : 'Video downloaded (WebM — your browser can not record MP4, but it plays everywhere).');
  };

  const exportVideo = async (durationSec: number) => {
    setBusy('video');
    try {
      const { cw, ch } = videoCanvasSize(w, h);
      // With sound we use the recorder path (WebCodecs + mp4-muxer is video
      // only) so the download contains the uploaded clip's audio.
      if (includeAudio && hasVideo) {
        await exportVideoRecorder(durationSec, cw, ch, true);
        return;
      }
      const codec = await pickAvcCodec(cw, ch);
      if (codec) {
        try {
          await exportVideoMp4(durationSec, cw, ch, codec);
          return;
        } catch (e) {
          console.error('WebCodecs MP4 export failed — falling back to recorder.', e);
        }
      }
      await exportVideoRecorder(durationSec, cw, ch, false);
    } catch (e) {
      console.error('Video export failed.', e);
      toast.error(`Could not export the video — ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(null); }
  };

  // Default solid background each layout ships with. A user-picked bgColor
  // overrides it so the same layout can be re-skinned to any colour while the
  // layout's own gradient/tint overlays still render on top.
  const defaultBg = layoutKey === 'minimal' || layoutKey === 'vintage'
    ? '#f7ecd6'
    : layoutKey === 'editorial' || layoutKey === 'brutalist'
      ? '#ffffff'
      : layoutKey === 'newspaper' ? '#f7f3e8'
        : layoutKey === 'offset' ? '#fbfbfa'
          : layoutKey === 'punch' ? accent
            : layoutKey === 'chalkboard' ? '#17301f'
              : layoutKey === 'synthwave' ? '#1e0b4b'
                : layoutKey === 'blueprint' ? '#08305c'
                  : '#0f172a';
  const nodeBg = bgColor ?? defaultBg;
  // Background colour opacity (0-100). Scales the alpha of every nodeBg-derived
  // stop, so lowering it lets the uploaded media (or the canvas underneath)
  // show through the background colour instead of tinting it.
  const bgAlpha = bgOpacity / 100;
  const bgA = (a: number) => hexA(nodeBg, a * bgAlpha);
  const darkBgA = (f: number, a: number) => hexA(darken(nodeBg, f), a * bgAlpha);

  // The full layout layer (tint + content). Media is a separate layer under it.
  // Sizing tokens are all relative to u = min(w,h) so hierarchy stays correct
  // on every format — square post, tall story, A4, billboard.
  const renderLayout = () => {
    if (modernTpl) {
      return (
        <TemplateSurface
          template={modernTpl}
          width={w}
          height={h}
          accent={accent}
          base={bgColor ?? undefined}
          // The Style tab's background upload did nothing on a modern template
          // — it was never passed down. The tint is thinned so the picture can
          // actually be seen, by the same scheme-aware rule Motion Studio uses.
          mediaUrl={bg?.url ?? null}
          mediaKind={bg?.type === 'video' ? 'video' : 'image'}
          surfaceOpacity={bg ? defaultMediaScrim(modernTpl) : bgAlpha}
          content={{
            brand: business.name,
            eyebrow: badge,
            headline,
            subline,
            meta: brandUrl,
            cta: 'Book now',
            services: flyer.services ?? [],
            stats: flyer.stats ?? [],
            price: flyer.price ?? [],
            contact: derivedContact,
            logoUrl: business.logo_url,
            qrUrl: qr || null,
          }}
          onEditText={(role: SlotRole, value: string) => {
            if (role === 'headline') setHeadline(value);
            else if (role === 'subline') setSubline(value);
            else if (role === 'eyebrow') setBadge(value);
          }}
        />
      );
    }
    const S = {
      logo: u * 0.1,     // brand mark box
      pad: u * 0.07,     // outer padding
      badge: u * 0.022,  // badge text (uppercase, tracked)
      h1: u * 0.1,       // headline (standard)
      h1Big: u * 0.15,   // headline (statement layouts)
      sub: u * 0.038,    // subline
      body: u * 0.024,   // contact lines
      qr: u * 0.16,      // QR box
    };
    const badgePill = {
      display: 'inline-block' as const,
      background: accent,
      color: '#fff',
      fontSize: S.badge,
      fontWeight: 800,
      letterSpacing: 1.5,
      padding: `${S.badge * 0.5}px ${S.badge * 2.2}px`,
      borderRadius: 999,
    };
    const shadow = '0 2px 14px rgba(0,0,0,.38)';

    if (layoutKey === 'classic') {
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${bgA(0.35)} 0%, ${hexA(accent, 0.5)} 55%, ${bgA(0.9)} 100%)` }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad, display: 'flex', flexDirection: 'column', color: '#fff' }}>
            <BrandHeader logo={business.logo_url} name={business.name} size={S.logo} />
            <div style={{ marginTop: S.pad * 0.5 }}>
              <EditableText value={badge} onEdit={setBadge} style={badgePill} />
            </div>
            <div style={{ flex: 1 }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: S.h1, fontWeight: 800, lineHeight: 1.04, textShadow: shadow }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub, marginTop: u * 0.02, opacity: 0.95 }} />
            <div style={{ marginTop: S.pad * 0.7, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'bold-center') {
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${hexA(accent, 0.5)} 0%, ${bgA(0.9)} 100%)` }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', color: '#fff' }}>
            <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.9} centered />
            <div style={{ flex: 1 }} />
            <EditableText value={badge} onEdit={setBadge} style={badgePill} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: S.h1Big, fontWeight: 900, lineHeight: 1.0, marginTop: u * 0.04, textShadow: '0 4px 24px rgba(0,0,0,.32)' }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub * 1.05, marginTop: u * 0.024, opacity: 0.92 }} />
            <div style={{ flex: 1 }} />
            <ContactLines business={business} brandUrl={brandUrl} unit={u} inline />
            <div style={{ marginTop: u * 0.045 }}><QrBox qr={qr} unit={u} /></div>
          </div>
        </>
      );
    }

    if (layoutKey === 'split') {
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${bgA(0.5)} 0%, ${bgA(0.2)} 50%, ${hexA(accent, 0.94)} 56%, ${hexA(darken(accent, 0.3), 0.98)} 100%)` }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', color: '#fff' }}>
            <div style={{ flex: 1 }} />
            <div style={{ width: '46%', maxWidth: u * 1.05, display: 'flex', flexDirection: 'column', padding: S.pad, background: 'transparent' }}>
              <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.9} />
              <div style={{ flex: 1 }} />
              <EditableText value={badge} onEdit={setBadge} style={{ ...badgePill, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.45)', alignSelf: 'flex-start' }} />
              <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.11, fontWeight: 900, lineHeight: 1.02, marginTop: u * 0.035, textShadow: shadow }} />
              <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub, marginTop: u * 0.018, opacity: 0.92 }} />
              <div style={{ marginTop: u * 0.045 }}><ContactLines business={business} brandUrl={brandUrl} unit={u} /></div>
              <div style={{ marginTop: u * 0.04, display: 'flex', justifyContent: 'flex-end' }}><QrBox qr={qr} unit={u} /></div>
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'minimal') {
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${bgA(0.95)} 0%, ${bgA(0.86)} 100%)` }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad * 1.3, display: 'flex', flexDirection: 'column', color: '#0f172a' }}>
            <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.9} dark />
            <div style={{ flex: 1 }} />
            <EditableText value={badge} onEdit={setBadge} style={{ fontSize: S.badge, fontWeight: 800, letterSpacing: 3, color: accent, textTransform: 'uppercase' }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: S.h1, fontWeight: 800, lineHeight: 1.04, marginTop: u * 0.02, color: '#0f172a' }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub, marginTop: u * 0.016, color: '#475569' }} />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} dark />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'punch') {
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${bgA(0.92)} 0%, ${darkBgA(0.6, 0.97)} 100%)` }} />
          <div style={{ position: 'absolute', width: u * 0.9, height: u * 0.9, borderRadius: '50%', top: -u * 0.3, right: -u * 0.2, background: 'radial-gradient(circle, rgba(255,255,255,0.22), transparent 65%)' }} />
          <div style={{ position: 'absolute', width: u * 1.1, height: u * 1.1, borderRadius: '50%', bottom: -u * 0.45, left: -u * 0.35, background: 'radial-gradient(circle, rgba(0,0,0,0.28), transparent 65%)' }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad, display: 'flex', flexDirection: 'column', color: '#fff' }}>
            <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.9} />
            <div style={{ flex: 1 }} />
            <EditableText value={badge} onEdit={setBadge} style={{ ...badgePill, background: 'rgba(255,255,255,0.2)', alignSelf: 'flex-start' }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: S.h1Big * 0.97, fontWeight: 900, lineHeight: 0.98, marginTop: u * 0.035, letterSpacing: -0.5, textShadow: '0 3px 18px rgba(0,0,0,.25)' }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub * 1.05, marginTop: u * 0.022, opacity: 0.94 }} />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'framed') {
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${bgA(0.55)} 0%, ${bgA(0.3)} 100%)` }} />
          <div style={{ position: 'absolute', inset: u * 0.05, border: `${Math.max(3, u * 0.012)}px solid rgba(255,255,255,0.92)`, borderRadius: u * 0.02, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad * 1.7, display: 'flex', flexDirection: 'column', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.03 }}>
              <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.8} />
              <EditableText value={badge} onEdit={setBadge} style={{ ...badgePill, padding: `${S.badge * 0.4}px ${S.badge * 1.6}px`, letterSpacing: 1 }} />
            </div>
            <div style={{ flex: 1 }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.11, fontWeight: 900, lineHeight: 1.0, textShadow: shadow }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub, marginTop: u * 0.02, opacity: 0.94 }} />
            <div style={{ marginTop: u * 0.045, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'vintage') {
      const ink = '#3a2c1e';
      const tan = '#6b5a44';
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${bgA(0.98)} 0%, ${darkBgA(0.06, 0.98)} 100%)` }} />
          <div style={{ position: 'absolute', inset: u * 0.045, border: `${Math.max(2, u * 0.008)}px solid ${hexA(ink, 0.55)}`, borderRadius: u * 0.008, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: u * 0.06, border: `${Math.max(1, u * 0.004)}px solid ${hexA(ink, 0.35)}`, borderRadius: u * 0.008, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad * 1.5, display: 'flex', flexDirection: 'column', color: ink }}>
            <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.85} dark centered />
            <div style={{ marginTop: u * 0.028, borderTop: `${Math.max(2, u * 0.006)}px solid ${ink}`, height: 0, width: '100%' }} />
            <div style={{ flex: 1 }} />
            <EditableText value={badge} onEdit={setBadge} style={{ fontSize: S.badge, fontWeight: 800, letterSpacing: 3, color: darken(accent, 0.25), textTransform: 'uppercase', textAlign: 'center', fontFamily: "Georgia, 'Times New Roman', serif" }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.11, fontWeight: 700, lineHeight: 1.05, marginTop: u * 0.02, textAlign: 'center', fontFamily: "Georgia, 'Times New Roman', serif" }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub, marginTop: u * 0.016, color: tan, fontStyle: 'italic', textAlign: 'center' }} />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} dark />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'glass') {
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${bgA(0.55)} 0%, ${bgA(0.28)} 100%)` }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad, display: 'flex' }}>
            <div style={{ margin: 'auto', width: '100%', maxWidth: u * 1.35, borderRadius: u * 0.05, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: `0 ${u * 0.03}px ${u * 0.08}px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.35)`, padding: S.pad * 1.3, display: 'flex', flexDirection: 'column', color: '#fff' }}>
              <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.9} centered />
              <div style={{ flex: 1 }} />
              <EditableText value={badge} onEdit={setBadge} style={badgePill} />
              <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.12, fontWeight: 900, lineHeight: 1.0, marginTop: u * 0.035, textShadow: shadow, textAlign: 'center' }} />
              <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub, marginTop: u * 0.02, opacity: 0.94, textAlign: 'center' }} />
              <div style={{ flex: 1 }} />
              <ContactLines business={business} brandUrl={brandUrl} unit={u} inline />
              <div style={{ marginTop: u * 0.04, display: 'flex', justifyContent: 'center' }}><QrBox qr={qr} unit={u} /></div>
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'editorial') {
      const ink = '#0f172a';
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${bgA(0.98)} 0%, ${darkBgA(0.04, 0.98)} 100%)` }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad * 1.2, display: 'flex', flexDirection: 'column', color: ink }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.03, borderBottom: `${Math.max(3, u * 0.007)}px solid ${ink}`, paddingBottom: u * 0.02 }}>
              <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.7} dark />
              <span style={{ fontSize: u * 0.022, fontWeight: 700, letterSpacing: 2, color: '#475569' }}>{brandUrl}</span>
            </div>
            <div style={{ borderBottom: `${Math.max(1, u * 0.003)}px solid ${ink}`, height: u * 0.012 }} />
            <div style={{ flex: 1 }} />
            <EditableText value={badge} onEdit={setBadge} style={{ fontSize: S.badge, fontWeight: 800, letterSpacing: 4, color: accent, textTransform: 'uppercase', textAlign: 'center', fontFamily: "Georgia, 'Times New Roman', serif" }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.12, fontWeight: 700, lineHeight: 1.03, marginTop: u * 0.02, textAlign: 'center', fontFamily: "Georgia, 'Times New Roman', serif" }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub, marginTop: u * 0.018, color: '#475569', fontStyle: 'italic', textAlign: 'center' }} />
            <div style={{ marginTop: u * 0.03, borderTop: `${Math.max(2, u * 0.005)}px solid ${accent}`, height: 0, width: '100%' }} />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} dark />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'neon') {
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${darkBgA(0.2, 1)} 0%, ${darkBgA(0.1, 1)} 55%, ${bgA(1)} 100%)` }} />
          <div style={{ position: 'absolute', inset: u * 0.04, border: `${Math.max(2, u * 0.006)}px solid ${hexA(accent, 0.8)}`, borderRadius: u * 0.02, boxShadow: `inset 0 0 ${u * 0.05}px ${hexA(accent, 0.35)}, 0 0 ${u * 0.04}px ${hexA(accent, 0.4)}`, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad * 1.3, display: 'flex', flexDirection: 'column', color: '#eef2ff' }}>
            <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.9} />
            <div style={{ flex: 1 }} />
            <EditableText value={badge} onEdit={setBadge} style={{ display: 'inline-block', alignSelf: 'center', background: 'transparent', border: `1px solid ${hexA(accent, 0.9)}`, color: accent, fontSize: S.badge, fontWeight: 800, letterSpacing: 3, padding: `${S.badge * 0.5}px ${S.badge * 2.4}px`, borderRadius: 999, boxShadow: `0 0 ${u * 0.02}px ${hexA(accent, 0.5)}` }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.13, fontWeight: 900, lineHeight: 1.0, marginTop: u * 0.04, textAlign: 'center', color: '#f0f2ff', textShadow: `0 0 ${u * 0.012}px ${accent}, 0 0 ${u * 0.03}px ${accent}, 0 0 ${u * 0.06}px ${hexA(accent, 0.6)}` }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub * 1.05, marginTop: u * 0.024, textAlign: 'center', opacity: 0.9 }} />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'card') {
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${hexA(darken(accent, 0.7), 0.92)} 0%, ${bgA(0.95)} 100%)` }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad * 1.2, display: 'flex' }}>
            <div style={{ margin: 'auto', width: '100%', maxWidth: u * 1.3, background: '#ffffff', borderRadius: u * 0.04, boxShadow: `0 ${u * 0.04}px ${u * 0.1}px rgba(0,0,0,0.45)`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: u * 0.02, background: `linear-gradient(90deg, ${accent} 0%, ${darken(accent, 0.3)} 100%)` }} />
              <div style={{ padding: S.pad * 1.3, display: 'flex', flexDirection: 'column', flex: 1, color: '#0f172a' }}>
                <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.9} dark />
                <div style={{ flex: 1 }} />
                <EditableText value={badge} onEdit={setBadge} style={{ ...badgePill, alignSelf: 'flex-start' }} />
                <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.115, fontWeight: 900, lineHeight: 1.02, marginTop: u * 0.03 }} />
                <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub, marginTop: u * 0.018, color: '#475569' }} />
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
                  <ContactLines business={business} brandUrl={brandUrl} unit={u} dark />
                  <QrBox qr={qr} unit={u} />
                </div>
              </div>
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'diagonal') {
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${bgA(0.6)} 0%, ${bgA(0.25)} 100%)` }} />
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, transparent 0%, transparent 55%, ${hexA(accent, 0.92)} 56%, ${hexA(darken(accent, 0.5), 0.97)} 100%)` }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad, display: 'flex', flexDirection: 'column', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.03 }}>
              <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.9} />
              <EditableText value={badge} onEdit={setBadge} style={{ ...badgePill, background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.35)' }} />
            </div>
            <div style={{ flex: 1 }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.125, fontWeight: 900, lineHeight: 1.0, textShadow: shadow }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub * 1.05, marginTop: u * 0.022, opacity: 0.92 }} />
            <div style={{ marginTop: u * 0.05, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'brutalist') {
      const ink = '#0f172a';
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: bgA(1) }} />
          <div style={{ position: 'absolute', inset: u * 0.035, border: `${Math.max(4, u * 0.012)}px solid ${ink}`, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad * 1.5, display: 'flex', flexDirection: 'column', color: ink }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: u * 0.03 }}>
              <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.9} dark />
              <EditableText value={badge} onEdit={setBadge} style={{ display: 'inline-block', background: accent, color: '#fff', fontSize: S.badge * 1.1, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', padding: `${S.badge * 0.5}px ${S.badge * 2}px`, border: `${Math.max(2, u * 0.005)}px solid ${ink}`, boxShadow: `${u * 0.012}px ${u * 0.012}px 0 ${ink}`, transform: 'rotate(-3deg)', borderRadius: 0 }} />
            </div>
            <div style={{ flex: 1 }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.13, fontWeight: 900, lineHeight: 0.95, textTransform: 'uppercase', letterSpacing: -1 }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub * 0.95, marginTop: u * 0.02, color: '#334155', fontFamily: "ui-monospace, 'Courier New', monospace" }} />
            <div style={{ marginTop: u * 0.03, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} dark />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'ribbons') {
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${bgA(0.55)} 0%, ${bgA(0.3)} 100%)` }} />
          <div style={{ position: 'absolute', top: -u * 0.2, left: -u * 0.1, width: u * 1.6, height: u * 0.42, background: `linear-gradient(90deg, ${hexA(accent, 0.96)} 0%, ${hexA(darken(accent, 0.4), 0.96)} 100%)`, transform: 'rotate(-18deg)', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }} />
          <div style={{ position: 'absolute', top: u * 0.12, left: u * 0.42, width: u * 0.9, height: u * 0.16, background: hexA('#ffffff', 0.1), transform: 'rotate(-14deg)' }} />
          <div style={{ position: 'absolute', bottom: -u * 0.24, right: -u * 0.14, width: u * 1.7, height: u * 0.5, background: `linear-gradient(90deg, ${hexA(darken(accent, 0.5), 0.96)} 0%, ${hexA(accent, 0.96)} 100%)`, transform: 'rotate(-14deg)', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad, display: 'flex', flexDirection: 'column', color: '#fff' }}>
            <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.9} />
            <div style={{ flex: 1 }} />
            <EditableText value={badge} onEdit={setBadge} style={{ ...badgePill, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.45)', alignSelf: 'flex-start' }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.12, fontWeight: 900, lineHeight: 1.0, marginTop: u * 0.03, textShadow: shadow }} />
            <div style={{ marginTop: u * 0.03, width: u * 0.34, height: Math.max(4, u * 0.024), background: `linear-gradient(90deg, ${accent} 0%, ${darken(accent, 0.35)} 100%)`, borderRadius: 999 }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub * 1.05, marginTop: u * 0.024, opacity: 0.94 }} />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'synthwave') {
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${bgA(1)} 0%, #4c1d95 35%, #be185d 68%, #f97316 100%)` }} />
          <div style={{ position: 'absolute', left: '50%', top: '30%', width: u * 0.55, height: u * 0.55, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'linear-gradient(180deg, #fde047 0%, #fb923c 100%)', boxShadow: '0 0 60px rgba(253,224,71,0.5)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: u * 0.5, background: 'linear-gradient(180deg, transparent 0%, rgba(15,23,42,0.88) 100%)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: u * 0.42, overflow: 'hidden' }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={`v${i}`} style={{ position: 'absolute', bottom: 0, height: '100%', width: 2, background: 'linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.75))', left: `${i * 12.5}%` }} />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.6)', bottom: Math.pow(i / 5, 2) * u * 0.42 }} />
            ))}
          </div>
          <div style={{ position: 'absolute', inset: 0, padding: S.pad, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', color: '#fff' }}>
            <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.9} centered />
            <div style={{ flex: 1 }} />
            <EditableText value={badge} onEdit={setBadge} style={{ ...badgePill, background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.5)' }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.13, fontWeight: 900, lineHeight: 1.0, marginTop: u * 0.04, color: '#fefce8', textShadow: `0 0 20px ${hexA('#f97316', 0.6)}, 0 4px 24px rgba(0,0,0,0.4)` }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub * 1.05, marginTop: u * 0.024, opacity: 0.95 }} />
            <div style={{ flex: 1 }} />
            <ContactLines business={business} brandUrl={brandUrl} unit={u} inline />
            <div style={{ marginTop: u * 0.04 }}><QrBox qr={qr} unit={u} /></div>
          </div>
        </>
      );
    }

    if (layoutKey === 'chalkboard') {
      const chalk = '#f5f3e8';
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${bgA(1)} 0%, ${darkBgA(0.1, 1)} 100%)` }} />
          <div style={{ position: 'absolute', inset: u * 0.05, border: `${Math.max(3, u * 0.012)}px dashed ${hexA(chalk, 0.55)}`, borderRadius: u * 0.02, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad * 1.5, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', color: chalk }}>
            <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.85} centered nameColor={chalk} />
            <div style={{ marginTop: u * 0.03, width: u * 0.3, height: Math.max(2, u * 0.005), background: hexA(chalk, 0.4), borderRadius: 999 }} />
            <div style={{ flex: 1 }} />
            <EditableText value={badge} onEdit={setBadge} style={{ display: 'inline-block', background: 'rgba(255,255,255,0.06)', border: `${Math.max(2, u * 0.006)}px dashed ${hexA(chalk, 0.6)}`, color: chalk, fontSize: S.badge, fontWeight: 700, letterSpacing: 3, padding: `${S.badge * 0.5}px ${S.badge * 2.4}px`, borderRadius: 999 }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.12, fontWeight: 700, lineHeight: 1.0, marginTop: u * 0.04, color: chalk, fontFamily: "'Chalkboard SE', 'Comic Sans MS', 'Marker Felt', cursive", textShadow: '0 0 3px rgba(245,243,232,0.45)' }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub, marginTop: u * 0.02, color: hexA(chalk, 0.85), fontStyle: 'italic', fontFamily: "'Chalkboard SE', 'Comic Sans MS', 'Marker Felt', cursive" }} />
            <div style={{ flex: 1 }} />
            <ContactLines business={business} brandUrl={brandUrl} unit={u} inline />
            <div style={{ marginTop: u * 0.04 }}><QrBox qr={qr} unit={u} /></div>
          </div>
        </>
      );
    }

    if (layoutKey === 'newspaper') {
      const ink = '#1c1917';
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${bgA(0.98)} 0%, ${darkBgA(0.05, 0.98)} 100%)` }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad * 1.2, display: 'flex', flexDirection: 'column', color: ink, fontFamily: "Georgia, 'Times New Roman', serif" }}>
            <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.8} dark centered />
            <div style={{ marginTop: u * 0.02, borderTop: `${Math.max(3, u * 0.008)}px solid ${ink}`, height: 0, width: '100%' }} />
            <div style={{ borderTop: `${Math.max(1, u * 0.003)}px solid ${ink}`, height: u * 0.008, width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: u * 0.03, fontSize: u * 0.02, color: '#57534e', marginTop: u * 0.008, textTransform: 'uppercase', letterSpacing: 1, fontFamily: "ui-sans-serif, system-ui, Arial, sans-serif" }}>
              <span>{badge}</span>
              <span>{brandUrl}</span>
            </div>
            <div style={{ flex: 1 }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.1, fontWeight: 800, lineHeight: 1.05, letterSpacing: -0.5, fontFamily: "Georgia, 'Times New Roman', serif" }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub, marginTop: u * 0.02, color: '#57534e', fontStyle: 'italic' }} />
            <div style={{ marginTop: u * 0.028, borderTop: `${Math.max(2, u * 0.006)}px solid ${accent}`, height: 0, width: u * 0.3 }} />
            <div style={{ flex: 1 }} />
            <div style={{ borderTop: `${Math.max(1, u * 0.003)}px solid ${ink}`, height: 0, width: '100%', marginBottom: u * 0.014 }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} dark />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'blueprint') {
      const grid = 'rgba(255,255,255,0.14)';
      const mark = `${Math.max(3, u * 0.008)}px solid #fff`;
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${bgA(0.9)} 0%, ${darkBgA(0.1, 0.95)} 100%)` }} />
          <div style={{ position: 'absolute', inset: 0, opacity: 0.5, backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`, backgroundSize: `${u * 0.04}px ${u * 0.04}px` }} />
          <div style={{ position: 'absolute', top: u * 0.04, left: u * 0.04, width: u * 0.05, height: u * 0.05, borderTop: mark, borderLeft: mark }} />
          <div style={{ position: 'absolute', top: u * 0.04, right: u * 0.04, width: u * 0.05, height: u * 0.05, borderTop: mark, borderRight: mark }} />
          <div style={{ position: 'absolute', bottom: u * 0.04, left: u * 0.04, width: u * 0.05, height: u * 0.05, borderBottom: mark, borderLeft: mark }} />
          <div style={{ position: 'absolute', bottom: u * 0.04, right: u * 0.04, width: u * 0.05, height: u * 0.05, borderBottom: mark, borderRight: mark }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad * 1.3, display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: "ui-monospace, 'Courier New', monospace" }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.03 }}>
              <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.8} />
              <EditableText value={badge} onEdit={setBadge} style={{ display: 'inline-block', background: 'transparent', border: `${Math.max(2, u * 0.006)}px solid #fff`, color: '#fff', fontSize: S.badge, fontWeight: 700, letterSpacing: 2, padding: `${S.badge * 0.4}px ${S.badge * 1.8}px` }} />
            </div>
            <div style={{ flex: 1 }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.115, fontWeight: 900, lineHeight: 1.0, letterSpacing: 0.5 }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub, marginTop: u * 0.02, opacity: 0.9 }} />
            <div style={{ marginTop: u * 0.03, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    if (layoutKey === 'offset') {
      const ink = '#0f172a';
      return (
        <>
          <div style={{ position: 'absolute', inset: 0, background: bgA(1) }} />
          <div style={{ position: 'absolute', top: -u * 0.15, right: -u * 0.12, width: u * 0.7, height: u * 0.7, borderRadius: '50%', background: hexA(accent, 0.1) }} />
          <div style={{ position: 'absolute', bottom: -u * 0.18, left: -u * 0.15, width: u * 0.8, height: u * 0.8, borderRadius: '50%', background: 'rgba(125,211,252,0.14)' }} />
          <div style={{ position: 'absolute', inset: 0, padding: S.pad * 1.3, display: 'flex', flexDirection: 'column', color: ink }}>
            <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.85} dark />
            <div style={{ flex: 1 }} />
            <EditableText value={badge} onEdit={setBadge} style={{ display: 'inline-block', alignSelf: 'flex-start', background: accent, color: '#fff', fontSize: S.badge, fontWeight: 900, letterSpacing: 2, padding: `${S.badge * 0.5}px ${S.badge * 2}px`, borderRadius: 0, boxShadow: `${u * 0.008}px ${u * 0.008}px 0 ${ink}` }} />
            <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.13, fontWeight: 900, lineHeight: 0.98, marginTop: u * 0.035, letterSpacing: -1, textTransform: 'uppercase', color: ink, textShadow: `${-u * 0.012}px ${-u * 0.012}px 0 #7dd3fc, ${u * 0.012}px ${u * 0.012}px 0 ${accent}` }} />
            <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub * 1.05, marginTop: u * 0.02, color: '#475569' }} />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: u * 0.03 }}>
              <ContactLines business={business} brandUrl={brandUrl} unit={u} dark />
              <QrBox qr={qr} unit={u} />
            </div>
          </div>
        </>
      );
    }

    // spotlight (default)
    return (
      <>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${bgA(0.55)} 0%, ${bgA(0.3)} 100%)` }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 36%, rgba(255,255,255,0.2), transparent 58%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 36%, ${hexA(accent, 0.22)}, transparent 62%)` }} />
        <div style={{ position: 'absolute', inset: 0, padding: S.pad, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', color: '#fff' }}>
          <BrandHeader logo={business.logo_url} name={business.name} size={S.logo * 0.9} centered />
          <div style={{ flex: 1 }} />
          <EditableText value={badge} onEdit={setBadge} style={badgePill} />
          <EditableText value={headline} onEdit={setHeadline} style={{ fontSize: u * 0.12, fontWeight: 900, lineHeight: 1.0, marginTop: u * 0.035, textShadow: shadow }} />
          <EditableText value={subline} onEdit={setSubline} style={{ fontSize: S.sub * 1.05, marginTop: u * 0.02, opacity: 0.94 }} />
          <div style={{ marginTop: u * 0.03, width: u * 0.16, height: Math.max(3, u * 0.008), background: accent, borderRadius: 999 }} />
          <div style={{ flex: 1 }} />
          <ContactLines business={business} brandUrl={brandUrl} unit={u} inline />
          <div style={{ marginTop: u * 0.04 }}><QrBox qr={qr} unit={u} /></div>
        </div>
      </>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Left — structure, words, AI, style */}
      <div className="lg:col-span-2 space-y-4">
        {/* Mode: fixed layouts (default) or a free canvas. */}
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
          <button
            type="button"
            onClick={() => setFreeCanvas(false)}
            aria-pressed={!freeCanvas}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
              !freeCanvas ? 'bg-gray-900 dark:bg-gray-700 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <LayoutTemplate size={13} /> Smart layout
          </button>
          <button
            type="button"
            onClick={enterFreeCanvas}
            aria-pressed={freeCanvas}
            title="Move and resize elements freely"
            className={`flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
              freeCanvas ? 'bg-purple-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Move size={13} /> Free canvas
          </button>
        </div>

        {freeCanvas && doc && (
          <StudioSection icon={Move} title="Canvas">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Drag on the design to move a layer. Arrow keys nudge, Shift+arrows move further,
              Delete removes. Your Smart layout design is kept — switch back any time.
            </p>
            <CanvasPanel
              doc={doc}
              selectedId={selectedLayer}
              onSelect={setSelectedLayer}
              onChange={commitDoc}
              onUndo={() => setDocHistory((hst) => (hst ? undoDoc(hst) : hst))}
              onRedo={() => setDocHistory((hst) => (hst ? redoDoc(hst) : hst))}
              canUndo={!!docHistory && histCanUndo(docHistory)}
              canRedo={!!docHistory && histCanRedo(docHistory)}
            />
            <button
              type="button"
              onClick={importCurrentLayout}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              <LayoutTemplate size={13} /> Import “{layout.label}” layout
            </button>
            <button
              type="button"
              onClick={resetFreeCanvas}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <RotateCcw size={13} /> Reset from Smart layout
            </button>
          </StudioSection>
        )}

        {/* Editor panes. One at a time — see editorTab above. */}
        <div
          role="tablist"
          aria-label="Editor sections"
          className="flex gap-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1"
        >
          {EDITOR_TABS.map((t) => {
            const active = editorTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setEditorTab(t.key)}
                // px min-height: index.css scales the root font to 14px on
                // phones, so a rem minimum lands under the 44px touch target.
                className={`flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                  active
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <t.icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>

        {editorTab === 'design' && (
        <>
        <InspirationUpload brandAccent={brandAccent} onApply={applyInspiration} />
        <StudioSection icon={LayoutTemplate} title="Design">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{templateLabel}</label>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((t) => (
                <button key={t.key} onClick={() => setTemplateKey(t.key)}
                  className={`inline-flex items-center text-left px-3 rounded-lg text-xs font-medium border transition ${templateKey === t.key ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'} min-h-[44px]`}
                  style={templateKey === t.key ? { background: t.accent } : undefined}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Modern templates</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {DESIGN_TEMPLATES.map((t) => {
                const key = `t:${t.key}`;
                const on = layoutKey === key;
                return (
                  <button key={key} onClick={() => setLayoutKey(key)}
                    className={`inline-flex items-center text-left px-3 rounded-lg text-xs border transition ${on ? 'border-transparent text-white bg-purple-600' : 'border-purple-200 dark:border-purple-800/60 text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20'} min-h-[44px]`}>
                    <span className="block font-bold">{t.label}</span>
                    <span className={`block mt-0.5 text-[10px] ${on ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>{t.desc}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400 mb-4">
              One definition, rendered at any size — and the same definition animates in Motion Studio.
            </p>

            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Classic layouts</label>
            <div className="grid grid-cols-2 gap-2">
              {STUDIO_LAYOUTS.map((l) => (
                <button key={l.key} onClick={() => setLayoutKey(l.key)}
                  className={`inline-flex items-center text-left px-3 rounded-lg text-xs border transition ${layoutKey === l.key ? 'border-transparent text-white bg-gray-900 dark:bg-gray-700' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'} min-h-[44px]`}>
                  <span className="block font-bold">{l.label}</span>
                  <span className={`block mt-0.5 text-[10px] ${layoutKey === l.key ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>{l.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Format / size</label>
            <select value={formatKey} onChange={(e) => setFormatKey(e.target.value)}
              className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]">
              {formats.map((f) => <option key={f.key} value={f.key}>{f.label} · {f.w}×{f.h}</option>)}
            </select>
          </div>
        </StudioSection>
        </>
        )}

        {editorTab === 'content' && (
        <>
        {/* Only for the data-driven templates, and only the sections the chosen
            one actually draws. The hand-written layouts have no list slots, so
            this renders nothing for them. */}
        {modernTpl && templateListRoles(modernTpl).length > 0 && (
          <StudioSection icon={ListChecks} title="Template content">
            <FlyerContentEditor
              value={flyer}
              onChange={(partial) => setFlyer((prev) => ({ ...prev, ...partial }))}
              roles={templateListRoles(modernTpl)}
            />
          </StudioSection>
        )}
        <StudioSection icon={Type} title="Content">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Headline</label>
              <button onClick={resetText} className="inline-flex items-center gap-1 min-h-[44px] px-2 rounded-lg text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">
                <RotateCcw size={11} /> Reset
              </button>
            </div>
            {/* maxLength budgets are generous enough to hold a {{token}} (~17
                chars) alongside real words. The coach still grades the resolved
                text, so genuine over-long headlines are caught there. */}
            <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={90}
              className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
            <LiveFieldRow field="headline" value={headline} onChange={setHeadline} resolve={resolve} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Subtext</label>
            <input value={subline} onChange={(e) => setSubline(e.target.value)} maxLength={120}
              className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
            <LiveFieldRow field="subtext" value={subline} onChange={setSubline} resolve={resolve} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Badge text</label>
            <input value={badge} onChange={(e) => setBadge(e.target.value)} maxLength={60}
              className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
            <LiveFieldRow field="badge" value={badge} onChange={setBadge} resolve={resolve} />
          </div>

          {/* Live Business Canvas status */}
          <div className={`rounded-lg border p-2.5 ${
            liveSummary.level === 'error'
              ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
              : liveSummary.level === 'partial'
                ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
                : liveSummary.level === 'live'
                  ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
          }`}>
            <p className={`text-[11px] font-semibold flex items-center gap-1.5 ${
              liveSummary.level === 'error' ? 'text-red-700 dark:text-red-300'
                : liveSummary.level === 'partial' ? 'text-amber-800 dark:text-amber-200'
                : liveSummary.level === 'live' ? 'text-green-700 dark:text-green-300'
                : 'text-gray-500 dark:text-gray-400'
            }`}>
              <Radio size={12} className={liveSummary.level === 'live' ? 'animate-pulse' : ''} />
              {liveSummary.label}
            </p>
            {liveSummary.level === 'partial' && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                Missing data shows a stand-in phrase instead — {live.stale.join(', ')}.
              </p>
            )}
            {liveSummary.level === 'none' && (
              <p className="text-[10px] text-gray-400 mt-1">
                Link a field to your profile and this design stays accurate as your
                hours, offers and prices change.
              </p>
            )}
          </div>
        </StudioSection>

        {/* AI copy ideas + smart CTA */}
        <div className="rounded-2xl border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300">
              <Wand2 size={13} /> AI Copy Assistant
            </span>
            <button onClick={generateIdeas}
              className="inline-flex items-center gap-1 px-2.5 rounded-md text-[11px] font-bold text-white bg-purple-600 hover:bg-purple-700 transition min-h-[44px]">
              Generate ideas
            </button>
          </div>

          {copyIdeas && copyIdeas.length > 0 ? (
            <div className="space-y-1.5">
              {copyIdeas.map((v) => (
                <button key={v.label} onClick={() => applyVariant(v)}
                  className="flex items-center group w-full text-left px-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-800 hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-sm transition min-h-[44px]">
                  <span className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-300">{v.label}</span>
                    <CheckCircle2 size={13} className="text-gray-300 dark:text-gray-600 group-hover:text-purple-500" />
                  </span>
                  <span className="block mt-0.5 text-xs font-bold text-gray-800 dark:text-gray-100">{v.headline}</span>
                  <span className="block text-[11px] text-gray-500 dark:text-gray-400">{v.subline}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">5 headline + subtext ideas written for your brand voice and this occasion — one tap to apply.</p>
          )}

          <div className="mt-3 pt-3 border-t border-purple-200/70 dark:border-purple-800/70">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Target size={13} className="text-purple-600 dark:text-purple-300" />
              <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300">Smart CTA</span>
            </div>
            {cta ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[11px] text-gray-600 dark:text-gray-300">
                  <span className="font-bold text-gray-800 dark:text-gray-100">{cta.badge}</span> — {cta.subline}
                </span>
                <button onClick={applyCta}
                  className="inline-flex items-center px-2.5 rounded-md text-[11px] font-bold text-white bg-purple-600 hover:bg-purple-700 transition min-h-[44px]">
                  Apply
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Based on your category, we suggest the call-to-action that converts.</p>
            )}
          </div>
        </div>

        </>
        )}

        {editorTab === 'style' && (
        <StudioSection icon={Palette} title="Style">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Accent colour</label>
            <div className="flex items-center gap-2">
              <div className="flex flex-wrap gap-1.5">
                {ACCENT_PRESETS.map((c) => (
                  <button key={c} onClick={() => setAccent(c)} title={c}
                    className={`w-6 h-6 rounded-full border-2 transition ${accent === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
              <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)}
                className="w-[44px] h-[44px] rounded cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent" />
            </div>
            {/* Moved here from the Design Coach: it's an accent control, and it
                shouldn't disappear just because the coach did. */}
            {brandAccent && brandAccent.toLowerCase() !== accent.toLowerCase() && (
              <button
                onClick={applyBrandAccent}
                className="mt-2 inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                <Palette size={13} /> Use my brand colour
                <span className="w-3 h-3 rounded-full border border-white/50" style={{ background: brandAccent }} />
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Background colour</label>
            <div className="flex items-center gap-2">
              <div className="flex flex-wrap gap-1.5">
                {BG_PRESETS.map((c) => (
                  <button key={c} onClick={() => setBgColor(c)} title={c}
                    className={`w-6 h-6 rounded-full border-2 transition ${(bgColor ?? defaultBg) === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
              <input type="color" value={bgColor ?? defaultBg} onChange={(e) => setBgColor(e.target.value)}
                className="w-[44px] h-[44px] rounded cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <label className="flex-1 flex items-center gap-2">
                <span className="text-[11px] text-gray-400 w-11 shrink-0">Opacity</span>
                <input type="range" min={0} max={100} value={bgOpacity} onChange={(e) => setBgOpacity(Number(e.target.value))}
                  className="w-full accent-purple-600" />
              </label>
              <span className="text-xs text-gray-600 dark:text-gray-300 w-9 text-right">{bgOpacity}%</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">Replaces this layout's default background. Lower opacity lets an uploaded image or video show through.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Background image or video</label>
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden"
              onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="flex items-center gap-2">
              <button onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[44px]">
                <Upload size={15} /> Upload
              </button>
              {bg && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  {bg.type === 'video' ? 'Video' : 'Image'} added
                  <button onClick={() => setBg(null)} className="text-red-500 hover:text-red-600"><X size={14} /></button>
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">Any size image or video — used only to make your downloadable materials. Leave empty to use your profile cover.</p>

            {/* Record a backdrop, or paste one from a link. A platform embed is
                refused here: the export composites the background into a canvas
                and an iframe cannot be drawn into one. */}
            <div className="mt-2 flex flex-col sm:flex-row gap-2">
              {user && (
                <button
                  type="button"
                  onClick={() => setShowBgCamera(true)}
                  className="inline-flex items-center justify-center gap-2 px-3 rounded-lg text-sm font-medium bg-black text-white hover:bg-gray-800 flex-shrink-0 min-h-[44px]"
                >
                  <Camera size={15} /> OpenReel Camera
                </button>
              )}
              <input
                type="text"
                value={bgLink}
                onChange={(e) => setBgLink(e.target.value)}
                onBlur={() => applyBgLink()}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyBgLink(); } }}
                placeholder="…or paste a direct image/video URL"
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]"
              />
            </div>
            {bgClipProgress !== null && (
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                Trimming the first {BACKGROUND_CLIP_SECONDS}s… {bgClipProgress}%
                <span className="block text-gray-400">
                  This runs in real time and stays on your device — nothing is uploaded.
                </span>
              </p>
            )}
            {bgLinkIssue && (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{bgLinkIssue}</p>
            )}

            {/* Generated media lands in exactly the same place as an upload, so
                everything downstream (preview, export, opacity) is unchanged. */}
            <div className="mt-3">
              <GeneratePanel
                width={1024}
                height={1024}
                defaultPrompt={`${business.category || 'business'} in ${business.location || 'Africa'}, photographed for ${business.name}`}
                onGenerated={(url, kind) => {
                  setBg({ url, type: kind === 'video' ? 'video' : 'image' });
                  toast.success(kind === 'video' ? 'Generated clip added' : 'Generated image added');
                }}
              />
            </div>
          </div>
        </StudioSection>
        )}
      </div>

      {/* Right — live preview (sticky), coach, export */}
      <div className="lg:col-span-3 flex flex-col gap-4">
        {/* Live preview canvas */}
        <div className="lg:sticky lg:top-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-extrabold uppercase tracking-wide text-gray-600 dark:text-gray-300">Live preview</label>
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 p-0.5">
              {PREVIEW_FRAME_OPTIONS.map((o) => (
                <button key={o.key} onClick={() => setFrame(o.key)} title={o.label}
                  className={`inline-flex items-center px-2 rounded-md text-[10px] font-bold uppercase tracking-wide transition ${frame === o.key ? 'bg-purple-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'} min-h-[44px]`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-100/70 dark:bg-gray-800/50 p-2 flex flex-col items-center justify-center"
            style={{ minHeight: '26rem', backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.22) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
            <PreviewFrame kind={frame} w={w} h={h} scale={scale} label={`${format.label} · ${w}×${h}`}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <div ref={flyerRef} style={{ width: w, height: h, position: 'relative', overflow: 'hidden', background: captureOverlay ? 'transparent' : bgA(1), fontFamily: "'Coolvetica', system-ui, Arial, sans-serif" }}>
                  {/* Background media — faded out while capturing the overlay (so it
                      isn't duplicated into the transparent layer) but kept mounted so
                      the video ref stays valid for the still-frame composite. */}
                  <div style={{ position: 'absolute', inset: 0, opacity: captureOverlay ? 0 : 1 }}>
                    {hasVideo
                      ? <video ref={bgVideoRef} src={bg!.url} autoPlay loop muted playsInline
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (bgImageSrc && (
                          <img src={bgImageSrc} crossOrigin="anonymous" alt=""
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        ))}
                  </div>
                  {/* Live Business Canvas: one provider resolves {{tokens}} for
                      every text slot in whichever layout renders below. */}
                  {/* The smart layout stays mounted while free canvas is on, but
                      hidden. visibility:hidden keeps real geometry for
                      "Import layout" to measure, while painting nothing — so it
                      never reaches an export. */}
                  <div
                    aria-hidden={freeCanvas || undefined}
                    style={freeCanvas
                      ? { visibility: 'hidden', position: 'absolute', inset: 0, pointerEvents: 'none' }
                      : undefined}
                  >
                    <LiveResolveContext.Provider value={resolve}>
                      {renderLayout()}
                    </LiveResolveContext.Provider>
                  </div>
                  {freeCanvas && doc && (
                    <CanvasLayers
                      doc={doc}
                      selectedId={selectedLayer}
                      interactive={!captureOverlay}
                      scale={scale}
                      onSelect={setSelectedLayer}
                      onChange={commitDoc}
                    />
                  )}
                </div>
              </div>
            </PreviewFrame>
          </div>
          <p className="text-[11px] text-gray-400 flex items-center gap-1">
            <Pencil size={12} /> Click any text on the design to edit it in place — or use the fields on the left.
          </p>
        </div>

        {/* AI Design Coach — on demand. Hidden behind a button so it never
            crowds the editor; opening it swaps the button for the full panel. */}
        {coachOpen ? (
          <DesignCoachPanel
            report={coachReport}
            channels={channels}
            onApplyBrandAccent={applyBrandAccent}
            open
            onToggle={() => setCoachOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCoachOpen(true)}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 text-xs font-bold text-gray-600 dark:text-gray-300 hover:border-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <Gauge size={14} /> Check this design
          </button>
        )}

        {/* Export & share */}
        <StudioSection icon={Download} title="Export & Share">
          <div className="flex gap-1 rounded-lg border border-gray-200 dark:border-gray-700 p-0.5">
            {(['image', 'video'] as const).map((m) => (
              <button key={m} onClick={() => setExportMode(m)}
                className={`flex-1 px-3 rounded-md text-xs font-bold uppercase tracking-wide transition ${exportMode === m ? 'bg-purple-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'} min-h-[44px] items-center`}>
                {m === 'image' ? 'Image' : 'Video'}
              </button>
            ))}
          </div>

          {exportMode === 'image' ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={exportAllFormats} disabled={!!busy}
                className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 min-h-[44px]">
                {busy === 'all' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {busy === 'all' && exportProgress ? `Downloading ${exportProgress}…` : 'Download all formats'}
              </button>
              <button onClick={exportCampaign} disabled={!!busy}
                className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90 disabled:opacity-50 min-h-[44px]"
                title="Story, Instagram, Facebook, X, A4 flyer and email header">
                {busy === 'all' ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />} Campaign pack
              </button>
              <button onClick={exportPng} disabled={!!busy}
                className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 min-h-[44px]">
                {busy === 'png' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} PNG
              </button>
              <button onClick={exportPdf} disabled={!!busy}
                className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 min-h-[44px]">
                {busy === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} PDF
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Duration</label>
                <div className="flex flex-wrap gap-1.5">
                  {VIDEO_SECONDS.map((s) => (
                    <button key={s} onClick={() => setVideoSeconds(s)}
                      className={`inline-flex items-center px-3 rounded-lg text-xs font-bold border transition ${videoSeconds === s ? 'border-transparent text-white bg-gray-900 dark:bg-gray-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'} min-h-[44px]`}>
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
              {hasVideo && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={includeAudio} onChange={(e) => setIncludeAudio(e.target.checked)} className="accent-purple-600" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">Include the clip's sound</span>
                </label>
              )}
              <button onClick={() => exportVideo(videoSeconds)} disabled={!!busy}
                className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 min-h-[44px]">
                {busy === 'video' ? <Loader2 size={15} className="animate-spin" /> : <VideoIcon size={15} />} Download MP4 · {videoSeconds}s
              </button>
              <p className="text-[11px] text-gray-400">
                MP4 (H.264) with gentle motion, up to 1920px. Video backgrounds are capped at your clip length.
              </p>
            </div>
          )}

          {hint && <p className="text-[11px] text-gray-400">{hint}</p>}

          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100 dark:border-gray-700">
            {shareLinks(url, headline).map((s) => (
              <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center px-2.5 rounded-md text-[11px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[44px]">
                {s.label}
              </a>
            ))}
          </div>
        </StudioSection>
      </div>

      {/* Record a backdrop with the OpenReel camera. It uploads to storage and
          hands back a public URL, which composites like any other background. */}
      {showBgCamera && user && (
        <OpenReelCapture
          userId={user.id}
          maxSeconds={60}
          onCaptured={(url, kind) => {
            setBg({ url, type: kind === 'video' ? 'video' : 'image' });
            setBgLink(url);
            setBgLinkIssue(null);
            setShowBgCamera(false);
            toast.success(kind === 'video' ? 'Recorded clip set as background' : 'Photo set as background');
          }}
          onClose={() => setShowBgCamera(false)}
        />
      )}
    </div>
  );
}
