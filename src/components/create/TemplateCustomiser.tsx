import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Check, Download, ExternalLink, ImagePlus, ImageUp, Loader2, Trash2, Type, X,
} from 'lucide-react';

import TemplateSurface, { type TemplateContent } from '../studio/TemplateSurface';
import { defaultMediaScrim, type DesignTemplate, type SlotRole } from '../../lib/designTemplates';
import { DESIGN_STYLES, applyStyle, styleColours, styleOf } from '../../lib/design/styles';
import { TYPE_PAIRINGS, ensureTypefacesReady, typefaceOf } from '../../lib/design/typefaces';
import { DESIGN_FORMATS } from '../../data/studioPresets';
import { downloadUrl, exportNodeToPng, slugForFile } from '../../lib/studio';
import { track } from '../../lib/telemetry';import SmartImg from '../SmartImg';
/**
 * Edit a design on the PUBLIC Create page.
 *
 * ── WHY THE CARDS APPEARED DEAD ───────────────────────────────────────────
 *
 * They navigated to /studio?module=design, which opens Creative Studio's front
 * door on whatever layout was last selected — NOT the one that was clicked. So
 * picking "Quiet Luxe" and landing on something else read, correctly, as the
 * click having done nothing. A link that technically works and visibly does
 * nothing is a broken link.
 *
 * Two fixes, and this file is the important one: the design opens HERE, and
 * "Open in Studio" now carries the template and the style in the URL so that
 * path lands on the right design too.
 *
 * ── WHY THE EDITOR IS ON THE PUBLIC PAGE AT ALL ───────────────────────────
 *
 * Because the alternative is asking somebody to create an account to find out
 * whether they can change the font. Everything here — text, typefaces, colour,
 * style, size — is a decision a visitor can make and see immediately, and none
 * of it needs to know who they are.
 *
 * ── THE DOWNLOAD IS FREE AND NEEDS NO ACCOUNT ─────────────────────────────
 *
 * Deliberate, and it is a product decision rather than an oversight. These
 * layouts are the catalogue's free tier; the export runs entirely in the
 * browser, so it costs nothing to serve; and "don't make registration the first
 * step" is the whole acquisition strategy. Somebody who downloads a flyer that
 * works is a far better prospect than somebody who bounced off a sign-up wall.
 *
 * What an account is actually for is what Studio does and this cannot: your
 * real logo, your saved brand kit, campaigns, scheduling and print. That is
 * what the account-gated button says, rather than pretending the download is
 * the valuable part.
 *
 * ── DECIDED: NO WATERMARK, AND NO PER-BROWSER CAP ─────────────────────────
 *
 * Both were considered and both are refused, so that neither gets added later
 * without someone reading this.
 *
 * A watermark contradicts the product in the most direct way available. The
 * promise on this page is "Look professional"; a NowOpen mark across a small
 * business's flyer makes it look like a trial, and it would be the only place
 * in the entire product where we deliberately degrade a customer's own asset
 * to make a point about billing.
 *
 * A download cap is friction dressed as strategy. The founder's own brief is
 * "don't make registration the first step" and "your bottleneck is
 * activation"; a limit converts the people who were already going to sign up
 * and loses the ones who were not.
 *
 * The honest lever is the GAP, not scarcity: this exports a design with
 * placeholder copy and no logo, and Studio exports the same design with the
 * real thing plus somewhere to keep it. If that gap does not convert, the
 * answer is to make Studio better, not to spoil this.
 */

const PRESET_FORMATS = ['instagram-post', 'story', 'a4', 'facebook-post'] as const;

const SWATCHES = ['#2563eb', '#e11d48', '#059669', '#f59e0b', '#7c3aed', '#0f172a'];

/** The longest edge we will rasterise. A billboard at 4500px kills a phone. */
const MAX_EXPORT_EDGE = 2400;

export default function TemplateCustomiser({
  template, initialStyle, initialBrand, onClose,
}: {
  template: DesignTemplate;
  initialStyle: string;
  initialBrand: string;
  onClose: () => void;
}) {
  const [styleKey, setStyleKey] = useState(initialStyle);
  const [pairingKey, setPairingKey] = useState<string>('');
  const [brand, setBrand] = useState(initialBrand);
  const [formatKey, setFormatKey] = useState<string>('instagram-post');
  const [busy, setBusy] = useState(false);

  /*
   * A background picture or video.
   *
   * IMAGES BECOME DATA URLS, NEVER blob: URLs. An object URL renders fine in
   * the preview and then fails at export on production only — the CSP's
   * connect-src does not allow blob:, so the rasteriser cannot read it, and
   * the bug is invisible in development. A data URL is inert and works in both.
   *
   * A VIDEO plays in the preview from an object URL (media-src does allow
   * blob:) and exports through `poster`: a frame lifted at upload time. A PNG
   * is a still, so something has to decide which instant it is, and doing that
   * up front means the export cannot silently come out blank — which is what
   * happens when a rasteriser meets a <video>.
   */
  const [media, setMedia] = useState<{
    url: string; kind: 'image' | 'video'; name: string; poster: string | null;
  } | null>(null);
  /** 0..1 — how opaque the template's own colour is OVER the picture. */
  const [overlay, setOverlay] = useState(0.55);
  /** Swapped in for the instant of capture, so a video exports a real frame. */
  const [flattening, setFlattening] = useState(false);
  const mediaInput = useRef<HTMLInputElement>(null);

  /*
   * The logo. A data URL for the same reason the background is one: an object
   * URL renders in the preview and then fails the export on production only.
   *
   * It renders in the brand slot beside the name (see TemplateSurface), so
   * every layout that shows the business name shows the logo too — there was
   * no per-template work to do, only a way to supply the file.
   */
  const [logo, setLogo] = useState<{ url: string; name: string } | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  const [headline, setHeadline] = useState('Your headline here');
  const [subline, setSubline] = useState('One line about the offer, the event or the thing you are announcing.');
  const [eyebrow, setEyebrow] = useState('This weekend');
  const [brandName, setBrandName] = useState('Your business');
  const [cta, setCta] = useState('Book now');

  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => { void ensureTypefacesReady(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const format = DESIGN_FORMATS.find((f) => f.key === formatKey) ?? DESIGN_FORMATS[1];

  /*
   * The style, then the font override on top of it.
   *
   * A style already chooses a pairing — that is most of what a style IS. The
   * font control exists because "can I change the font?" is the first question
   * anybody asks of a design tool, and answering "pick a different style" is
   * not an answer. So the pairing is applied as an override AFTER the style,
   * and an empty override means "whatever the style chose".
   */
  const styled = useMemo(() => {
    const base = applyStyle(template, styleOf(styleKey));
    if (!pairingKey) return base;
    const forced = styleOf(styleKey);
    return applyStyle(template, { ...forced, pairing: pairingKey });
  }, [template, styleKey, pairingKey]);

  const tone = useMemo(
    () => styleColours(styleOf(styleKey), brand, styled.scheme),
    [styleKey, brand, styled.scheme],
  );

  // The preview is laid out at the format's real pixel size and scaled to fit,
  // so what is on screen is geometrically the file that downloads.
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const measure = () => {
      const pad = 24;
      const w = Math.max(0, node.clientWidth - pad);
      const h = Math.max(0, node.clientHeight - pad);
      setScale(Math.min(w / format.w, h / format.h));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [format.w, format.h]);

  const content: TemplateContent = {
    brand: brandName,
    eyebrow,
    headline,
    subline,
    meta: 'yourbusiness.nowopenafrica.com',
    cta,
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
    logoUrl: logo?.url ?? null,
    qrUrl: null,
  };

  const MAX_MEDIA_BYTES = 12 * 1024 * 1024;

  /** The first frame worth showing. Not 0 — that is often black. */
  const posterFromVideo = (url: string): Promise<string | null> =>
    new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      const give = (value: string | null) => { video.removeAttribute('src'); resolve(value); };
      video.onerror = () => give(null);
      video.onloadeddata = () => {
        video.currentTime = Math.min(0.6, (video.duration || 1) / 2);
      };
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx || !canvas.width) return give(null);
          ctx.drawImage(video, 0, 0);
          give(canvas.toDataURL('image/jpeg', 0.86));
        } catch {
          give(null);
        }
      };
      video.src = url;
    });

  const pickMedia = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_MEDIA_BYTES) {
      toast.error(`That file is ${Math.round(file.size / 1024 / 1024)}MB. The limit is 12MB.`);
      return;
    }
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      toast.error('Pick a picture or a video.');
      return;
    }

    setBusy(true);
    try {
      if (isImage) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('unreadable'));
          reader.readAsDataURL(file);
        });
        setMedia({ url: dataUrl, kind: 'image', name: file.name, poster: dataUrl });
      } else {
        const objectUrl = URL.createObjectURL(file);
        const poster = await posterFromVideo(objectUrl);
        setMedia({ url: objectUrl, kind: 'video', name: file.name, poster });
        if (!poster) {
          toast.error('The video will play here, but we could not lift a frame for the PNG.');
        }
      }
      // Start where the template itself would put the scrim, so the picture is
      // visible immediately rather than buried under a full-strength tint.
      setOverlay(defaultMediaScrim(styled));
    } catch {
      toast.error('Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const pickLogo = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('A PNG or JPG logo.'); return; }
    // 4MB: a logo is a mark, not a photograph, and a data URL of a 10MB
    // original bloats every render it appears in.
    if (file.size > 4 * 1024 * 1024) { toast.error('That logo is over 4MB. A PNG under 1MB is plenty.'); return; }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('unreadable'));
        reader.readAsDataURL(file);
      });
      setLogo({ url: dataUrl, name: file.name });
    } catch {
      toast.error('Could not read that logo.');
    }
  };

  const clearLogo = () => {
    setLogo(null);
    if (logoInput.current) logoInput.current.value = '';
  };

  const clearMedia = () => {
    if (media?.kind === 'video') URL.revokeObjectURL(media.url);
    setMedia(null);
    if (mediaInput.current) mediaInput.current.value = '';
  };

  // Revoke on unmount too, or every video tried in a session stays in memory.
  useEffect(() => () => {
    if (media?.kind === 'video') URL.revokeObjectURL(media.url);
  }, [media]);

  const download = async () => {
    const node = frame.current;
    if (!node) return;
    setBusy(true);
    /*
     * A rasteriser cannot read a <video>; it produces a hole where the
     * background should be. So for the single frame of the capture the preview
     * renders the poster instead, and two animation frames are allowed to pass
     * so React has actually committed it before html-to-image looks.
     */
    const needsFlatten = media?.kind === 'video' && Boolean(media.poster);
    if (needsFlatten) {
      setFlattening(true);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    try {
      /*
       * Capped, and the cap matters: a billboard is 4500px wide and at
       * pixelRatio 2 that is a 9000px canvas, which a mid-range Android cannot
       * allocate — the tab dies with no error anybody can act on. The design is
       * fractional, so a smaller raster is the same design, just smaller.
       */
      const ratio = Math.min(2, MAX_EXPORT_EDGE / Math.max(format.w, format.h));
      const url = await exportNodeToPng(node, {
        designWidth: format.w,
        pixelRatio: Math.max(1, ratio),
        backgroundColor: tone.base,
      });
      downloadUrl(url, `${slugForFile(`${template.label}-${format.key}`)}.png`);
      track('studio_export', { template: template.key, style: styleKey, format: format.key, from: 'create_page' });
      toast.success('Downloaded. No account needed.');
    } catch {
      toast.error('That did not export. Try a smaller size.');
    } finally {
      setFlattening(false);
      setBusy(false);
    }
  };

  const studioHref =
    `/studio?module=design&template=${encodeURIComponent(template.key)}&style=${encodeURIComponent(styleKey)}`;

  const field = 'w-full min-h-[40px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${template.label}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-5xl max-h-full sm:max-h-[94vh] flex flex-col rounded-none sm:rounded-2xl bg-white dark:bg-gray-800 shadow-2xl overflow-hidden"
      >
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-700 px-5 py-3">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">{template.label}</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {template.desc} · click any words on the design to change them
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2 text-gray-500 hover:text-gray-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 min-h-0 grid lg:grid-cols-[1fr_20rem]">
          {/* The design. */}
          <div ref={stage} className="relative min-h-[16rem] bg-gray-100 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
            {scale > 0 && (
              <div style={{ width: format.w * scale, height: format.h * scale }}>
                <div
                  ref={frame}
                  data-export-width={format.w}
                  className="origin-top-left"
                  style={{ width: format.w, height: format.h, transform: `scale(${scale})` }}
                >
                  <TemplateSurface
                    template={styled}
                    content={content}
                    width={format.w}
                    height={format.h}
                    accent={tone.accent}
                    base={tone.base}
                    mediaUrl={flattening ? media?.poster ?? null : media?.url ?? null}
                    mediaKind={flattening ? 'image' : media?.kind ?? 'image'}
                    surfaceOpacity={media ? overlay : 1}
                    /*
                     * Click the words on the design to change them.
                     *
                     * The side panel is for somebody working through the
                     * fields; this is for somebody who has spotted the wrong
                     * headline and wants to fix THAT. Nobody hunts for a text
                     * input when the text is right there in front of them.
                     */
                    onEditText={(role: SlotRole, value: string) => {
                      if (role === 'headline') setHeadline(value);
                      else if (role === 'subline') setSubline(value);
                      else if (role === 'eyebrow') setEyebrow(value);
                      else if (role === 'brand') setBrandName(value);
                      else if (role === 'cta') setCta(value);
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* The controls. */}
          <div className="border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700 overflow-y-auto p-4 space-y-4">
            <Group label="Words">
              <div className="flex items-center gap-2">
                <input
                  ref={logoInput}
                  id="customiser-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => void pickLogo(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                <label
                  htmlFor="customiser-logo"
                  title={logo ? logo.name : 'Add your logo'}
                  className="shrink-0 h-10 w-10 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer overflow-hidden hover:border-pink-400"
                >
                  {logo
                    ? <SmartImg src={logo.url} alt="" className="h-full w-full object-cover" />
                    : <ImageUp size={16} className="text-gray-400" />}
                </label>
                <input value={brandName} onChange={(e) => setBrandName(e.target.value)} maxLength={60} aria-label="Business name" placeholder="Business name" className={field} />
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                {logo
                  ? <>Logo added. <button onClick={clearLogo} className="font-semibold underline hover:text-red-600">Remove</button></>
                  : 'Tap the square to add your logo — it sits beside your name on every layout.'}
              </p>
              <input value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} maxLength={60} aria-label="Small line above" placeholder="Small line above" className={`${field} mt-2`} />
              <textarea value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} rows={2} aria-label="Headline" placeholder="Headline" className={`${field} mt-2 py-2`} />
              <textarea value={subline} onChange={(e) => setSubline(e.target.value)} maxLength={200} rows={2} aria-label="Supporting line" placeholder="Supporting line" className={`${field} mt-2 py-2`} />
              <input value={cta} onChange={(e) => setCta(e.target.value)} maxLength={40} aria-label="Button or badge text" placeholder="Book now" className={`${field} mt-2`} />
            </Group>

            <Group label="Colour">
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((hex) => (
                  <button key={hex} onClick={() => setBrand(hex)} aria-label={`Use ${hex}`}
                    className={`h-8 w-8 rounded-full border-2 ${brand === hex ? 'border-gray-900 dark:border-white' : 'border-transparent'}`}
                    style={{ background: hex }} />
                ))}
                <label className="relative h-8 w-8 rounded-full border-2 border-dashed border-gray-400 overflow-hidden cursor-pointer" title="Any colour">
                  <input type="color" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Pick any colour" className="absolute -inset-2 h-14 w-14 cursor-pointer" />
                </label>
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500">
                The palette is derived from this, and the text is kept readable on whatever you pick.
              </p>
            </Group>

            <Group label="Background">
              <input
                ref={mediaInput}
                id="customiser-media"
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
                onChange={(e) => void pickMedia(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
              <label
                htmlFor="customiser-media"
                className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:border-pink-400"
              >
                <ImagePlus size={15} className="text-pink-600 shrink-0" />
                {media ? media.name.slice(0, 28) : 'Add a picture or video'}
              </label>

              {media ? (
                <>
                  <div className="mt-2">
                    <label htmlFor="customiser-overlay" className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-400">
                      <span>Colour over the picture</span>
                      <span className="tabular-nums">{Math.round(overlay * 100)}%</span>
                    </label>
                    <input
                      id="customiser-overlay"
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(overlay * 100)}
                      onChange={(e) => setOverlay(Number(e.target.value) / 100)}
                      className="w-full mt-1 accent-pink-600"
                    />
                    <p className="text-[11px] text-gray-500">
                      0% is the bare picture. Turn it up until the text is readable — that is the
                      only thing this slider is for.
                    </p>
                  </div>
                  <button
                    onClick={clearMedia}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-red-600"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                  {media.kind === 'video' && (
                    <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                      Plays here. A PNG is a still, so the download uses a frame from it — the
                      video itself animates in Motion Studio.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1.5 text-[11px] text-gray-500">
                  PNG, JPG, WEBP or MP4, up to 12MB. It stays in your browser — nothing is
                  uploaded anywhere.
                </p>
              )}
            </Group>

            <Group label="Fonts">
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => setPairingKey('')}
                  className={`text-left px-2.5 py-2 rounded-lg border text-[11px] ${pairingKey === '' ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                  <span className="flex items-center gap-1 font-bold text-gray-900 dark:text-white">
                    {pairingKey === '' && <Check size={11} />} Style default
                  </span>
                  <span className="block text-gray-500">Whatever this style chose</span>
                </button>
                {TYPE_PAIRINGS.map((p) => (
                  <button key={p.key} onClick={() => setPairingKey(p.key)} title={p.suits}
                    className={`text-left px-2.5 py-2 rounded-lg border text-[11px] ${pairingKey === p.key ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                    <span className="block font-bold text-gray-900 dark:text-white"
                      style={{ fontFamily: typefaceOf(p.display).stack }}>
                      {p.label}
                    </span>
                    <span className="block text-gray-500">
                      {typefaceOf(p.display).label} + {typefaceOf(p.text).label}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500 inline-flex items-start gap-1">
                <Type size={11} className="mt-0.5 shrink-0" />
                All open-licence, free to use commercially — including on work you sell.
              </p>
            </Group>

            <Group label="Style">
              <div className="flex flex-wrap gap-1.5">
                {DESIGN_STYLES.map((st) => {
                  const sw = styleColours(st, brand, st.scheme === 'keep' ? template.scheme : st.scheme);
                  return (
                    <button key={st.key} onClick={() => setStyleKey(st.key)} title={st.blurb}
                      className={`inline-flex items-center gap-1.5 min-h-[32px] px-2 rounded-full border text-[11px] font-semibold ${styleKey === st.key ? 'border-transparent ring-2 ring-pink-500' : 'border-gray-300 dark:border-gray-600'}`}
                      style={styleKey === st.key ? { background: sw.base, color: sw.ink } : undefined}>
                      <span className="inline-flex rounded-full overflow-hidden border border-black/10" style={{ width: 18, height: 9 }}>
                        <span style={{ background: sw.base, width: 9 }} />
                        <span style={{ background: sw.accent, width: 9 }} />
                      </span>
                      {st.label}
                    </button>
                  );
                })}
              </div>
            </Group>

            <Group label="Size">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESET_FORMATS.map((key) => {
                  const f = DESIGN_FORMATS.find((x) => x.key === key);
                  if (!f) return null;
                  return (
                    <button key={key} onClick={() => setFormatKey(key)}
                      className={`min-h-[32px] px-2.5 rounded-full border text-[11px] font-semibold ${formatKey === key ? 'bg-gray-900 text-white border-transparent dark:bg-white dark:text-gray-900' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                      {f.label.split(' / ')[0]}
                    </button>
                  );
                })}
              </div>
              <select value={formatKey} onChange={(e) => setFormatKey(e.target.value)} aria-label="Size" className={field}>
                {DESIGN_FORMATS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label} · {f.w}×{f.h}</option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-gray-500">
                The layout is re-laid out at every size, not stretched.
              </p>
            </Group>
          </div>
        </div>

        <footer className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 flex flex-wrap items-center gap-2">
          <button onClick={() => void download()} disabled={busy}
            className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-xl bg-pink-600 text-white font-bold hover:bg-pink-700 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Download PNG
          </button>
          {/* Says what the account is FOR, rather than pretending the download
              is the valuable part. */}
          <Link to={studioHref}
            onClick={() => track('template_picked', { template: template.key, style: styleKey, from: 'customiser' })}
            className="inline-flex items-center gap-2 min-h-[46px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200">
            <ExternalLink size={15} /> Open in Studio
          </Link>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 flex-1 min-w-[12rem]">
            Free, no account. Studio adds your real logo, your saved brand kit, campaigns and print.
          </p>
        </footer>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">{label}</h3>
      {children}
    </section>
  );
}
