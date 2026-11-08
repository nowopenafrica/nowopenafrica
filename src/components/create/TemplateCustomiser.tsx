import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Check, Download, ExternalLink, ImagePlus, ImageUp, Loader2, Lock, RotateCcw, Shuffle, Trash2, Type, Unlock, X,
} from 'lucide-react';

import TemplateSurface, { type TemplateContent } from '../studio/TemplateSurface';
import { defaultMediaScrim, type DesignTemplate, type SlotRole } from '../../lib/designTemplates';
import { DESIGN_STYLES, applyStyle, contrastRatio, styleColours, styleOf } from '../../lib/design/styles';
import { TYPE_PAIRINGS, ensureTypefacesReady, typefaceOf } from '../../lib/design/typefaces';
import { DESIGN_FORMATS } from '../../data/studioPresets';
import { exportPixelRatio, printNoteFor, specFor } from '../../lib/design/printSpec';
import { formatForTemplate } from '../../lib/design/deliverables';
import { sampleFor } from '../../lib/create/sampleCopy';
import { CUSTOMISER_PLATFORM_FIELD, handlePlatformOf } from '../../lib/create/customiserFields';
import { PLATFORM_MARKS } from '../../lib/design/platformMarks';
import { downloadUrl, exportNodeToPng, slugForFile } from '../../lib/studio';
import { track } from '../../lib/telemetry';
import { PALETTES, type Palette, type PaletteFamily, type PaletteRole } from '../../lib/design/palettes';
import type { Look, LookPart } from '../../lib/design/look';
import { needsMet, remixLook, textNeeds, type Harmony } from '../../lib/design/remix';
import {
  baseScheme, brandPaletteFor, encodeLookParam, isHexColour, lookFromParam, type BrandInput,
} from '../../lib/design/lookParam';
import SmartImg from '../SmartImg';
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

/*
 * The rasterising cap now lives in lib/design/printSpec.ts, beside the code
 * that explains what it does to the resolution a customer receives. Two
 * copies of this number would mean the size picker could promise one thing
 * and the download produce another.
 */

/** Shown verbatim when a brand colour cannot be read. */
const BRAND_COLOUR_ERROR = 'That isn’t a colour we can read — try a hex like #0f766e';

const FAMILIES: { key: PaletteFamily; label: string }[] = [
  { key: 'warm', label: 'Warm' }, { key: 'cool', label: 'Cool' }, { key: 'earth', label: 'Earth' },
  { key: 'bold', label: 'Bold' }, { key: 'pastel', label: 'Pastel' }, { key: 'mono', label: 'Mono' },
];

const LOCKS: { part: LookPart; label: string }[] = [
  { part: 'palette', label: 'Palette' }, { part: 'gradient', label: 'Background' },
  { part: 'pattern', label: 'Pattern' }, { part: 'type', label: 'Fonts' },
];

export default function TemplateCustomiser({
  template, initialStyle, initialBrand, initialLook, onClose,
}: {
  template: DesignTemplate;
  initialStyle: string;
  initialBrand: string;
  /** A `?look=` value from a shared link: a bare seed (open remixed) or a full look. */
  initialLook?: string | null;
  onClose: () => void;
}) {
  const [styleKey, setStyleKey] = useState(initialStyle);
  const [pairingKey, setPairingKey] = useState<string>('');
  /*
   * The look: what the customer changed on top of the template's own.
   *
   * Only templates WITH a look have any of this. Without one the surface
   * ignores every palette role, so the single colour picker below stays the
   * only colour control and the fallback path is untouched.
   */
  const hasLook = Boolean(template.look);
  const needs = useMemo(() => textNeeds(template), [template]);
  const [initial] = useState(() => lookFromParam(template, initialLook));
  const [override, setOverride] = useState<Partial<Look>>(initial.look ?? {});
  const [brandLook, setBrandLook] = useState<BrandInput | null>(initial.brand ?? null);
  const [seed, setSeed] = useState<number | null>(initial.seed ?? null);
  /** Bumped when the brand look is dropped by another control, so its typed fields clear. */
  const [brandFieldsKey, setBrandFieldsKey] = useState(0);
  const [locks, setLocks] = useState<Set<LookPart>>(() => new Set());
  const effectiveLook = useMemo<Look | null>(
    () => (template.look ? { ...template.look, ...override } : null),
    [template.look, override],
  );
  const brandPal = useMemo<Palette | null>(
    () => (brandLook ? brandPaletteFor(template, brandLook, effectiveLook?.gradient) : null),
    [template, brandLook, effectiveLook?.gradient],
  );
  const [brand, setBrand] = useState(initialBrand);
  /*
   * The canvas the deliverable belongs on, not a social default.
   *
   * MEASURED: every design opened at 1080x1080, so a business card was a
   * square — the label said card and the document did not. A deliverable
   * that knows its size now brings it.
   */
  const [formatKey, setFormatKey] = useState<string>(
    () => formatForTemplate(template) ?? 'instagram-post',
  );
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
  /*
   * Which side is on screen.
   *
   * A card has a back, a menu has a second page — and a preview that can only
   * show the front is telling you half of what you are about to download.
   * The sides come from the template itself (see `extraPages`), so there is
   * nothing to configure per design.
   */
  const [side, setSide] = useState(0);

  const [logo, setLogo] = useState<{ url: string; name: string } | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  /*
    ── THE SAME WORDS THE CARD SHOWED ─────────────────────────────────────

    These were hardcoded to the generic set, so a card reading "Your
    promotion / Now on" opened a panel reading "Your headline here / This
    weekend" — and the Studio link built from this state carried the generic
    text onward. The shopper picked one thing and got another.

    sampleFor() is the same function the gallery card renders with, so the
    panel opens showing exactly what was clicked.
  */
  const sample = useMemo(() => sampleFor(template), [template]);

  const [headline, setHeadline] = useState(sample.headline ?? '');
  const [subline, setSubline] = useState(sample.subline ?? '');
  const [eyebrow, setEyebrow] = useState(sample.eyebrow ?? '');
  const [brandName, setBrandName] = useState(sample.brand ?? 'Your business');
  const [cta, setCta] = useState(sample.cta ?? 'Book now');
  /*
   * The small print (the `meta` role): an address, a web address, terms.
   * It used to be fixed to one web address with no field, so every design
   * that showed it carried words the visitor could not change (C7).
   */
  const [meta, setMeta] = useState(sample.meta ?? '');
  /*
   * Which platform a handle row's mark shows. Starts at the design's own
   * default (Instagram on the pilots); null for a design with no handle row,
   * which shows no select.
   */
  const handleDefault = useMemo(() => handlePlatformOf(template), [template]);
  const [platform, setPlatform] = useState<string | null>(handleDefault);

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

  /** Fonts: a looked template's face is the look's `type`; others use the style override. */
  const fontKey = hasLook ? override.type ?? '' : pairingKey;
  const chooseFont = (key: string) => {
    if (!hasLook) { setPairingKey(key); return; }
    setOverride((o) => {
      const next = { ...o };
      if (key) next.type = key; else delete next.type;
      return next;
    });
    setSeed(null);
  };

  const pickPalette = (key: string) => {
    setOverride((o) => ({ ...o, palette: key }));
    setBrandLook(null);
    setBrandFieldsKey((n) => n + 1);
    setSeed(null);
  };

  const toggleLock = (part: LookPart) =>
    setLocks((prev) => {
      const next = new Set(prev);
      if (next.has(part)) next.delete(part); else next.add(part);
      return next;
    });

  /*
   * Remix draws a fresh seed and reshuffles every part that is not locked, from
   * the current look. The needs go in so a remix can never produce unreadable
   * text. With brand colours applied and the palette locked, the ground
   * gradient is held too: it was checked against the brand palette, and the
   * remixer can only measure a gradient against a curated one.
   */
  const remix = () => {
    if (!effectiveLook) return;
    const next = Math.floor(Math.random() * 0x100000000);
    const held = new Set(locks);
    if (brandPal && held.has('palette')) held.add('gradient');
    const result = remixLook(effectiveLook, next, held, baseScheme(template), needs);
    if (!held.has('palette')) { setBrandLook(null); setBrandFieldsKey((n) => n + 1); }
    setOverride(result);
    setSeed(next);
  };

  const resetLook = () => {
    setOverride({});
    setBrandLook(null);
    setSeed(null);
    setLocks(new Set());
  };
  const lookChanged = Object.keys(override).length > 0 || brandLook !== null || seed !== null;

  const content: TemplateContent = {
    brand: brandName,
    eyebrow,
    headline,
    subline,
    meta,
    cta,
    /* The template's OWN sample lists (its tiers, prices, services), as the card shows them. */
    services: sample.services,
    stats: sample.stats,
    price: sample.price,
    contact: sample.contact,
    logoUrl: logo?.url ?? null,
    qrUrl: null,
    platform: platform ?? undefined,
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
      const url = await exportNodeToPng(node, {
        designWidth: format.w,
        pixelRatio: exportPixelRatio(Math.max(format.w, format.h)),
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

  /*
   * The CURRENT Studio, carrying this design.
   *
   * This pointed at /studio?module=design — the brand-kit module, which is a
   * different and older editor. Somebody pressing "Open in Studio" from a
   * design they had just customised arrived somewhere that knew nothing about
   * it: not the layout, not the size, not the words they had typed.
   *
   * /media/studio is the editor with layers, rotation, opacity, typography,
   * pages and export, and it takes all three as parameters.
   */
  const studioHref = (() => {
    const params = new URLSearchParams({
      template: template.key,
      style: styleKey,
      accent: brand,
      w: String(format.w),
      h: String(format.h),
    });
    if (content.headline) params.set('text', content.headline);
    // The editor opens the design in the look the customer made, not the card's.
    if (hasLook) params.set('look', encodeLookParam({ override, seed, brand: brandLook }));
    return `/media/studio?${params.toString()}`;
  })();

  const field = 'w-full min-h-[40px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${template.label}`}
        onClick={(e) => e.stopPropagation()}
        /*
         * Full width, like the Studio.
         *
         * It was capped at 5xl — about 1024px — so on a 1665px screen the
         * design sat in a letterbox with empty desk either side, while the
         * editor at /media/studio had already been given the whole window.
         * The same work should not get a smaller surface because it opened
         * in a panel.
         */
        className="w-full sm:w-[98vw] sm:max-w-[1800px] max-h-full sm:max-h-[96vh] flex flex-col rounded-none sm:rounded-2xl bg-white dark:bg-gray-800 shadow-2xl overflow-hidden"
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

        <div className="flex-1 min-h-0 grid lg:grid-cols-[1fr_22rem]">
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
                    /*
                      * The chosen side's slots. Side 0 is the template as
                      * written; the rest come from `extraPages`.
                      */
                    template={side === 0
                      ? styled
                      : { ...styled, slots: styled.extraPages?.[side - 1]?.slots ?? styled.slots }}
                    content={content}
                    width={format.w}
                    height={format.h}
                    accent={tone.accent}
                    base={tone.base}
                    look={hasLook ? override : undefined}
                    brandPalette={brandPal ?? undefined}
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
                      else if (role === 'meta') setMeta(value);
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
                  className="shrink-0 h-10 w-10 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer overflow-hidden hover:border-green-400"
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
              <input value={meta} onChange={(e) => setMeta(e.target.value)} maxLength={120} aria-label="Small print" placeholder="Small print" className={`${field} mt-2`} />
              {handleDefault && (
                <select
                  value={platform ?? handleDefault}
                  onChange={(e) => setPlatform(e.target.value)}
                  aria-label={CUSTOMISER_PLATFORM_FIELD}
                  className={`${field} mt-2`}
                >
                  {PLATFORM_MARKS.map((mk) => <option key={mk.key} value={mk.key}>{mk.name}</option>)}
                </select>
              )}
            </Group>

            {effectiveLook && (
              <LookPanel
                template={template}
                look={effectiveLook}
                needs={needs}
                brandPal={brandPal}
                brandLook={brandLook}
                locks={locks}
                changed={lookChanged}
                resetKey={brandFieldsKey}
                onPalette={pickPalette}
                onBrand={(b) => { setBrandLook(b); setSeed(null); }}
                onLock={toggleLock}
                onRemix={remix}
                onReset={resetLook}
              />
            )}

            {!hasLook && (
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
            )}

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
                className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:border-green-400"
              >
                <ImagePlus size={15} className="text-green-600 shrink-0" />
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
                      className="w-full mt-1 accent-green-600"
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
                <button onClick={() => chooseFont('')}
                  className={`text-left px-2.5 py-2 rounded-lg border text-[11px] ${fontKey === '' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                  <span className="flex items-center gap-1 font-bold text-gray-900 dark:text-white">
                    {fontKey === '' && <Check size={11} />} Style default
                  </span>
                  <span className="block text-gray-500">Whatever this style chose</span>
                </button>
                {TYPE_PAIRINGS.map((p) => (
                  <button key={p.key} onClick={() => chooseFont(p.key)} title={p.suits}
                    className={`text-left px-2.5 py-2 rounded-lg border text-[11px] ${fontKey === p.key ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
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
                      className={`inline-flex items-center gap-1.5 min-h-[32px] px-2 rounded-full border text-[11px] font-semibold ${styleKey === st.key ? 'border-transparent ring-2 ring-green-500' : 'border-gray-300 dark:border-gray-600'}`}
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
              {(template.extraPages?.length ?? 0) > 0 && (
                <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 p-0.5">
                  {['Front', ...(template.extraPages ?? []).map((p) => p.name)].map((name, i) => (
                    <button
                      key={name}
                      onClick={() => setSide(i)}
                      aria-pressed={side === i}
                      className={`px-2.5 min-h-[32px] rounded-md text-[11px] font-bold transition ${
                        side === i ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              <select value={formatKey} onChange={(e) => setFormatKey(e.target.value)} aria-label="Size" className={field}>
                {DESIGN_FORMATS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label} · {f.w}×{f.h}</option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-gray-500">
                The layout is re-laid out at every size, not stretched.
              </p>
              {/*
                What this size is actually worth at a printer.

                A customer picking "A3 Poster" has no way to know it is 121dpi
                and that a press will refuse it or print it soft. The figure
                exists, it is computable from the canvas and the paper size,
                and withholding it only moves the discovery to after they have
                paid somebody to print it. See lib/design/printSpec.ts.
              */}
              {(() => {
                const note = printNoteFor(formatKey);
                if (!note) return null;
                const { readiness } = specFor(formatKey);
                const tone = readiness === 'below-print'
                  ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                  : readiness === 'office'
                    ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
                    : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';
                return (
                  <p className={`mt-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug ${tone}`}>
                    {note}
                  </p>
                );
              })()}
            </Group>
          </div>
        </div>

        <footer className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 flex flex-wrap items-center gap-2">
          <button onClick={() => void download()} disabled={busy}
            className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-xl bg-green-700 text-white font-bold hover:bg-green-800 disabled:opacity-50">
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

/**
 * The Look panel: palette, brand colours, Remix with locks, Reset.
 *
 * Palettes offered are the ones that keep THIS design's text readable (its
 * needs, and its ground gradient's stops carrying the palette's ink). A chip
 * that would put pale type on a pale ground is not shown rather than shown and
 * broken; the design's own palette is always offered.
 */
function LookPanel({
  template, look, needs, brandPal, brandLook, locks, changed,
  resetKey, onPalette, onBrand, onLock, onRemix, onReset,
}: {
  template: DesignTemplate;
  look: Look;
  needs: ReturnType<typeof textNeeds>;
  brandPal: Palette | null;
  brandLook: BrandInput | null;
  locks: ReadonlySet<LookPart>;
  changed: boolean;
  resetKey: number;
  onPalette: (key: string) => void;
  onBrand: (b: BrandInput) => void;
  onLock: (part: LookPart) => void;
  onRemix: () => void;
  onReset: () => void;
}) {
  const [primary, setPrimary] = useState(brandLook?.primary ?? '');
  const [secondary, setSecondary] = useState(brandLook?.secondary ?? '');
  const [harmony, setHarmony] = useState<Harmony>(brandLook?.harmony ?? 'analogous');
  const [error, setError] = useState<string | null>(null);

  // Reset empties the brand; the typed fields follow it.
  useEffect(() => {
    if (!brandLook && !changed) { setPrimary(''); setSecondary(''); setHarmony('analogous'); setError(null); }
  }, [brandLook, changed]);
  // Another control (a palette chip, an unlocked Remix) dropped the brand: the fields follow.
  useEffect(() => {
    if (resetKey > 0) { setPrimary(''); setSecondary(''); setHarmony('analogous'); setError(null); }
  }, [resetKey]);

  const stopKey = (look.gradient?.stops ?? []).join(',');
  const original = template.look?.palette;
  const offered = useMemo(() => {
    const stops = stopKey ? (stopKey.split(',') as PaletteRole[]) : [];
    return PALETTES.filter((p) =>
      p.key === original || p.key === look.palette
      || (needsMet(p.colours, needs, stops)
        && stops.every((r) => contrastRatio(p.colours.ink, p.colours[r]) >= 4.5)));
  }, [original, look.palette, needs, stopKey]);

  const current = brandPal ?? PALETTES.find((p) => p.key === look.palette) ?? null;

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const p = primary.trim();
    const s = secondary.trim();
    const next: BrandInput = { primary: p, ...(s ? { secondary: s } : {}), harmony };
    // A second colour that cannot be read is refused too: brandPalette would
    // quietly ignore it, and "applied" would then be a lie.
    if (!isHexColour(p) || (s && !isHexColour(s)) || !brandPaletteFor(template, next, look.gradient)) {
      setError(BRAND_COLOUR_ERROR);
      return;
    }
    setError(null);
    onBrand(next);
  };

  const input = 'min-h-[44px] px-3 rounded-lg border bg-white dark:bg-gray-900 text-sm';
  const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-1';
  const chipRing = 'ring-2 ring-green-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-800';

  return (
    <Group label="Look">
      <div className="space-y-3">
        <div>
          <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-1.5">
            Palette: <span className="font-semibold text-gray-900 dark:text-white">{current?.name ?? 'Custom'}</span>
            {!brandPal && look.palette === original && ' (the original)'}
          </p>
          <div className="max-h-56 overflow-y-auto space-y-2 pr-1" role="group" aria-label="Palettes">
            {FAMILIES.map((f) => {
              const inFamily = offered.filter((p) => p.family === f.key);
              if (inFamily.length === 0) return null;
              return (
                <div key={f.key}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{f.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {inFamily.map((p) => {
                      const active = !brandPal && look.palette === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => onPalette(p.key)}
                          aria-pressed={active}
                          aria-label={`${p.name} palette`}
                          title={p.name}
                          className={`flex h-[44px] w-[72px] overflow-hidden rounded-lg border border-black/10 dark:border-white/20 ${active ? chipRing : ''}`}
                        >
                          {(['ground', 'primary', 'secondary', 'highlight', 'ink'] as const).map((role) => (
                            <span key={role} className="h-full flex-1" style={{ background: p.colours[role] }} />
                          ))}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={apply} noValidate className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 space-y-2">
          <p className="text-[11px] font-bold text-gray-900 dark:text-white">Use my brand colours</p>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick brand colour"
              value={/^#[0-9a-f]{6}$/i.test(primary) ? primary : '#0f766e'}
              onChange={(e) => setPrimary(e.target.value)}
              className={`h-[44px] w-[44px] shrink-0 cursor-pointer rounded-lg ${focusRing} border border-gray-300 dark:border-gray-600 bg-transparent p-0.5`}
            />
            <input
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              aria-label="Brand colour"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'look-brand-error' : undefined}
              placeholder="#0f766e"
              maxLength={7}
              autoComplete="off"
              spellCheck={false}
              className={`${input} min-w-0 flex-1 ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            />
          </div>
          <input
            value={secondary}
            onChange={(e) => setSecondary(e.target.value)}
            aria-label="Second brand colour (optional)"
            placeholder="Second colour (optional)"
            maxLength={7}
            autoComplete="off"
            spellCheck={false}
            className={`${input} w-full border-gray-300 dark:border-gray-600`}
          />
          <select
            value={harmony}
            onChange={(e) => setHarmony(e.target.value as Harmony)}
            aria-label="How the other colours relate"
            className={`${input} w-full border-gray-300 dark:border-gray-600`}
          >
            <option value="analogous">Neighbouring colours</option>
            <option value="complementary">Contrasting colours</option>
            <option value="split">Balanced contrast</option>
          </select>
          {error && (
            <p id="look-brand-error" role="alert" className="text-[11px] font-semibold text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="min-h-[44px] w-full rounded-lg bg-gray-900 px-3 text-sm font-semibold text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          >
            Apply brand colours
          </button>
        </form>

        <div>
          <button
            type="button"
            onClick={onRemix}
            className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-green-700 px-3 text-sm font-bold text-white hover:bg-green-800 ${focusRing}`}
          >
            <Shuffle size={15} /> Remix
          </button>
          <p className="mt-1.5 mb-1 text-[11px] text-gray-500 dark:text-gray-400">
            Lock what you like; Remix reshuffles the rest.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {LOCKS.map(({ part, label }) => {
              const on = locks.has(part);
              return (
                <button
                  key={part}
                  type="button"
                  onClick={() => onLock(part)}
                  aria-pressed={on}
                  aria-label={`Lock ${label.toLowerCase()}`}
                  className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border px-2 text-[12px] font-semibold ${
                    on
                      ? 'border-green-500 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200'
                      : 'border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300'
                  }`}
                >
                  {on ? <Lock size={13} /> : <Unlock size={13} />} {label}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onReset}
          disabled={!changed}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800 hover:border-green-400 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
        >
          <RotateCcw size={14} /> Reset to original
        </button>
      </div>
    </Group>
  );
}
