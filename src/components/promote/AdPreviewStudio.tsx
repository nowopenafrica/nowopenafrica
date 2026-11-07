import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Crop, Image as ImageIcon, Link2, Maximize2, Upload, X } from 'lucide-react';

import { MOCKUP_SCENES } from '../../lib/promote/mockupScenes';
import {
  checkResolution, clipPathFor, fitArtwork, matrix3dFor, type Fit,
} from '../../lib/promote/surface';
import {
  describeDimensions, readAdDimensions, requiredPixels, ratioOf,
} from '../../lib/promote/adDimensions';
import { fetchSurface, isStale, type AdSurface } from '../../lib/promote/adSurfaces';
import { classifyArtworkFile, classifyArtworkUrl, type ArtworkKind } from '../../lib/promote/artworkSource';
import { isStockPlaceholder } from '../../lib/stockImage';

/** The advert being previewed: an uploaded file (an object URL) or a pasted link. */
interface Artwork {
  url: string;
  width: number;
  height: number;
  name: string;
  kind: ArtworkKind;
  /** Only object URLs this page created are revoked; a pasted link is not ours to revoke. */
  objectUrl: boolean;
}

/**
 * Measure an image or video without fetching it.
 *
 * Loaded through an element, never through fetch(): fetch() of a blob: URL
 * is refused by the site's CSP in production, and an element load needs no
 * CORS for a link on another host.
 */
function measure(url: string, kind: ArtworkKind): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (kind === 'video') {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = () => (v.videoWidth > 0 ? resolve({ width: v.videoWidth, height: v.videoHeight }) : reject(new Error('no size')));
      v.onerror = () => reject(new Error('video'));
      v.src = url;
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('image'));
    img.src = url;
  });
}

/**
 * Seeing an advertisement where it will actually run.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────
 *
 * A business looking at a billboard listing knows the price and the road.
 * What they cannot picture is their own artwork on it — whether the words
 * survive at that shape, whether the logo is still readable, how much the
 * bus windows eat. This answers that before they commit to a quote.
 *
 * ── HOW THE ARTWORK IS PLACED ────────────────────────────────────────────
 *
 * A projective transform onto four corners of the scene, applied as a CSS
 * `matrix3d`, with the surface as a `clip-path`. No canvas and no 3D engine:
 * the artwork stays a live `<img>`, which is what keeps re-fitting instant
 * and keeps the whole thing a few kilobytes.
 *
 * ── WHAT IT REFUSES TO CLAIM ─────────────────────────────────────────────
 *
 * The scenes are drawn, not photographed, and say so on every preview. A
 * resolution warning is only shown when the placement's real size is known
 * — a warning computed from a size nobody confirmed is a warning about
 * nothing, and a reassurance would be worse.
 */
export default function AdPreviewStudio({
  placement,
  initialScene,
  initialArtwork,
}: {
  /** The real inventory row, when the preview was opened from one. */
  placement?: {
    id?: string;
    title: string;
    type: string;
    location?: string | null;
    dimensions?: string | null;
    imageUrl?: string | null;
  } | null;
  initialScene?: string;
  /** Artwork to load on mount, e.g. a plan line's own artwork (a signed link). */
  initialArtwork?: { url: string; name: string };
}) {
  const [sceneId, setSceneId] = useState<string>(
    initialScene ?? MOCKUP_SCENES[0].id,
  );
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [linkText, setLinkText] = useState('');
  const [loading, setLoading] = useState(false);
  const [fit, setFit] = useState<Fit>('contain');
  const [scale, setScale] = useState(1);
  const [problem, setProblem] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scene = useMemo(
    () => MOCKUP_SCENES.find((s) => s.id === sceneId) ?? MOCKUP_SCENES[0],
    [sceneId],
  );

  /*
   * The placement's own photograph, when somebody has marked where the
   * board is inside it. That is the one fact a drawn scene cannot supply,
   * and it is what lets the caveat come off: this is no longer an
   * illustration of a billboard, it is this billboard.
   */
  const [site, setSite] = useState<AdSurface | null>(null);
  const [useSite, setUseSite] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setSite(null);
    if (!placement?.id) return undefined;
    void fetchSurface(placement.id).then((read) => {
      if (cancelled || read.state !== 'ready' || !read.surface) return;
      /* Corners drawn on a photograph that has since been replaced
         describe a board that is not there. */
      if (isStale(read.surface, placement.imageUrl)) return;
      /* A stock photograph is not this site, however carefully its corners
         were marked; showing it as "this placement's own photograph" would be
         the exact claim the caption exists to prevent. */
      if (isStockPlaceholder(placement.imageUrl) || isStockPlaceholder(read.surface.imageUrl)) return;
      setSite(read.surface);
    });
    return () => { cancelled = true; };
  }, [placement?.id, placement?.imageUrl]);

  /** Whether the preview is standing on a real photo or a drawn scene. */
  const onSite = Boolean(site) && useSite;

  /* Artwork handed in by the caller is measured through the same element path as a pasted link. */
  useEffect(() => {
    if (!initialArtwork) return undefined;
    let cancelled = false;
    setProblem(null);
    setLoading(true);
    measure(initialArtwork.url, 'image')
      .then((size) => {
        if (!cancelled) setArtwork({ url: initialArtwork.url, ...size, name: initialArtwork.name, kind: 'image', objectUrl: false });
      })
      .catch(() => {
        if (!cancelled) setProblem('That artwork could not be opened. Try attaching it again.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialArtwork?.url]);

  /* The object URL is revoked when it is replaced, not left to the tab. */
  useEffect(() => () => { if (artwork?.objectUrl) URL.revokeObjectURL(artwork.url); }, [artwork]);

  const dims = useMemo(
    () => readAdDimensions(placement?.dimensions),
    [placement?.dimensions],
  );

  /*
   * The surface's own shape: the placement's real ratio when it has one,
   * otherwise the medium's usual shape. Never a guess dressed as a fact —
   * which of the two was used is said under the preview.
   */
  const realRatio = ratioOf(dims);
  const ratio = realRatio ?? scene.defaultRatio;

  const SURFACE_W = 1000;
  const SURFACE_H = Math.max(1, Math.round(SURFACE_W / ratio));

  /*
   * One coordinate space for either backdrop. A drawn scene has its own
   * width and height; a photograph is rendered square and its corners are
   * already fractions, so 1000 x 1000 is as good a space as any — the
   * transform is solved against whichever is in use, and the renderer below
   * does not care which it got.
   */
  const surfaceQuad = onSite && site ? site.quad : scene.surface;
  const spaceW = onSite ? 1000 : scene.width;
  const spaceH = onSite ? 1000 : scene.height;

  /*
   * The transform is solved in the SAME units the element is laid out in.
   *
   * MEASURED, and the reason this is not a percentage: the matrix's
   * translation is in whatever space it was solved in. Solving against a
   * notional 1000-unit canvas while the element is sized in CSS pixels of a
   * 670px box put the artwork 128px below the board — the right size, the
   * wrong place, which looks like a design decision rather than a bug.
   *
   * So the frame is measured, the surface rect is expressed in its pixels,
   * and the two cannot disagree.
   */
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(0);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setFrameW(entry.contentRect.width));
    observer.observe(el);
    setFrameW(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const frameH = frameW * (spaceH / spaceW);
  /** The surface rect, in the frame's own pixels. */
  const boxW = frameW * (SURFACE_W / spaceW);
  const boxH = frameH * (SURFACE_H / spaceH);

  const transform = useMemo(
    () => (frameW > 0 ? matrix3dFor(boxW, boxH, surfaceQuad, frameW, frameH) : null),
    [surfaceQuad, frameW, frameH, boxW, boxH],
  );

  const placed = artwork
    ? fitArtwork(artwork, { width: SURFACE_W, height: SURFACE_H }, fit, scale)
    : null;

  const resolution = checkResolution(artwork, requiredPixels(dims));

  const onPick = (file: File) => {
    setProblem(null);
    const verdict = classifyArtworkFile(file);
    if (!verdict.ok) { setProblem(verdict.problem); return; }
    const url = URL.createObjectURL(file);
    setLoading(true);
    measure(url, verdict.kind)
      .then((size) => setArtwork({ url, ...size, name: file.name, kind: verdict.kind, objectUrl: true }))
      .catch(() => {
        URL.revokeObjectURL(url);
        setProblem(verdict.kind === 'video'
          ? 'That video could not be played in this browser. MP4 (H.264) plays everywhere.'
          : 'That image could not be opened. Try exporting it again as PNG or JPG.');
      })
      .finally(() => setLoading(false));
  };

  /*
   * A pasted link. When the address does not say what it is, it is tried as an
   * image first and then as a video, so a CDN link with no extension still works.
   */
  const onLink = () => {
    setProblem(null);
    const verdict = classifyArtworkUrl(linkText);
    if (!verdict.ok) { setProblem(verdict.problem); return; }
    const tries: ArtworkKind[] = verdict.kind === 'unknown' ? ['image', 'video'] : [verdict.kind];
    setLoading(true);
    const attempt = (i: number): Promise<void> =>
      measure(verdict.url, tries[i])
        .then((size) => {
          setArtwork({ url: verdict.url, ...size, name: verdict.name, kind: tries[i], objectUrl: false });
          setLinkText('');
        })
        .catch(() => (i + 1 < tries.length ? attempt(i + 1) : Promise.reject(new Error('unreadable'))));
    attempt(0)
      .catch(() => setProblem('That link did not open as an image or video. Check it opens on its own in a new tab, or download the file and upload it.'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr,320px]">
      {/* ── the preview ───────────────────────────────────────────── */}
      <div>
        <div
          ref={frameRef}
          className="relative w-full overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-gray-200 dark:ring-gray-700"
          style={{ aspectRatio: onSite ? '1 / 1' : `${scene.width} / ${scene.height}` }}
        >
          {onSite ? (
            <img
              src={placement?.imageUrl ?? site?.imageUrl}
              alt={`${placement?.title ?? 'This placement'}, photographed on site`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <svg
              viewBox={`0 0 ${scene.width} ${scene.height}`}
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: scene.background }}
            />
          )}

          {/*
            The artwork. Positioned in the scene's own coordinate space and
            projected onto the surface, then clipped to it so a cropped
            artwork cannot paint over the scene around the board.
          */}
          {artwork && placed && transform && (
            <div
              className="absolute inset-0"
              style={{ clipPath: clipPathFor(surfaceQuad) }}
            >
              <div
                className="absolute left-0 top-0"
                style={{
                  width: `${boxW}px`,
                  height: `${boxH}px`,
                  transform,
                  transformOrigin: '0 0',
                  overflow: 'hidden',
                }}
              >
                {(() => {
                  const style = {
                    width: `${(placed.width / SURFACE_W) * 100}%`,
                    height: `${(placed.height / SURFACE_H) * 100}%`,
                    left: `${(placed.left / SURFACE_W) * 100}%`,
                    top: `${(placed.top / SURFACE_H) * 100}%`,
                    objectFit: 'fill' as const,
                  };
                  const label = `${artwork.name} previewed on a ${scene.name.toLowerCase()}`;
                  return artwork.kind === 'video' ? (
                    <video
                      src={artwork.url}
                      aria-label={label}
                      className="absolute"
                      style={style}
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                  ) : (
                    <img src={artwork.url} alt={label} className="absolute" style={style} />
                  );
                })()}
              </div>
            </div>
          )}

          {!artwork && (
            <div className="absolute inset-0 grid place-items-center">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-xl bg-gray-900/80 px-4 py-3 text-xs font-bold text-white backdrop-blur hover:bg-gray-900"
              >
                <Upload size={14} className="mr-1.5 inline" /> Upload an image or video of your advert
              </button>
            </div>
          )}

          {/* Painted in front: windows, wheels, device chrome. */}
          {!onSite && scene.foreground && (
            <svg
              viewBox={`0 0 ${scene.width} ${scene.height}`}
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: scene.foreground }}
            />
          )}
        </div>

        {/* Said on every preview, never omitted. */}
        {/*
          The caption changes with the backdrop, because the claim does. A
          drawn scene is an illustration and says so; the placement's own
          photograph with its surface marked by a person is this board, and
          captioning that as illustrative would be underselling the truth.
        */}
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-gray-500">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {onSite
            ? `This placement’s own photograph, with the advertising surface marked by our team.${site?.note ? ` ${site.note}.` : ''} Final artwork is approved with the media owner.`
            : scene.caption}
        </p>

        {site && (
          <button
            type="button"
            onClick={() => setUseSite((v) => !v)}
            className="mt-1.5 text-[11px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
          >
            {onSite ? 'Show a generic scene instead' : 'Show this placement’s own photograph'}
          </button>
        )}
      </div>

      {/* ── the controls ──────────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Medium</p>
          <div className="grid grid-cols-2 gap-1.5">
            {MOCKUP_SCENES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSceneId(s.id)}
                aria-pressed={s.id === scene.id}
                className={`rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold transition ${
                  s.id === scene.id
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-gray-500">{scene.blurb}</p>
        </div>

        <div>
          <label className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700">
            <ImageIcon size={14} /> {loading ? 'Opening…' : artwork ? 'Replace advert' : 'Upload image or video'}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/avif,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.jfif,.png,.webp,.svg,.gif,.avif,.mp4,.m4v,.webm,.mov"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onPick(file);
              }}
            />
          </label>
          <form
            className="mt-2 flex gap-1.5"
            onSubmit={(e) => { e.preventDefault(); onLink(); }}
          >
            <label className="sr-only" htmlFor="advert-link">Link to your advert image or video</label>
            <input
              id="advert-link"
              type="url"
              inputMode="url"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="…or paste a link to an image or video"
              className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={loading || !linkText.trim()}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg bg-gray-900 px-3 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
            >
              <Link2 size={13} /> Use link
            </button>
          </form>
          {artwork && (
            <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-gray-500">
              <span className="truncate">{artwork.name}</span>
              <span className="shrink-0">· {artwork.kind === 'video' ? 'video, ' : ''}{artwork.width}×{artwork.height}px</span>
              <button
                type="button"
                onClick={() => setArtwork(null)}
                aria-label="Remove the uploaded advert"
                className="ml-auto shrink-0 text-gray-400 hover:text-gray-700"
              >
                <X size={12} />
              </button>
            </p>
          )}
          {problem && (
            <p className="mt-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">{problem}</p>
          )}
        </div>

        {artwork && (
          <>
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">How it sits</p>
              <div className="grid grid-cols-3 gap-1">
                {([
                  ['contain', 'Fit', Maximize2],
                  ['cover', 'Fill', Crop],
                  ['stretch', 'Stretch', Crop],
                ] as const).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFit(key)}
                    aria-pressed={fit === key}
                    className={`inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg text-[11px] font-semibold ${
                      fit === key ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    <Icon size={11} /> {label}
                  </button>
                ))}
              </div>
              {/*
                Said plainly rather than left to be discovered at the
                printer. Distorting a logo to fill a board is the commonest
                way a preview lies about what will be produced.
              */}
              {fit === 'stretch' && (
                <p className="mt-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  Stretching changes the proportions of your artwork. It will print distorted.
                </p>
              )}
              {fit === 'cover' && placed?.cropped && (
                <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  Filling the surface crops your artwork. Check nothing important is cut off.
                </p>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Scale · {Math.round(scale * 100)}%
              </span>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.01}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="w-full"
              />
            </label>
          </>
        )}

        {/* ── what is actually known about this placement ─────────── */}
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Specification</p>
          {placement ? (
            <dl className="space-y-1 text-[11px]">
              <Row label="Placement" value={placement.title} />
              <Row label="Medium" value={placement.type} />
              {placement.location && <Row label="Location" value={placement.location} />}
              <Row label="Size" value={describeDimensions(dims)} />
              {realRatio && <Row label="Shape" value={`${realRatio.toFixed(2)} : 1`} />}
              {requiredPixels(dims) && (
                <Row
                  label="Artwork"
                  value={`${requiredPixels(dims)!.width} × ${requiredPixels(dims)!.height}px`}
                />
              )}
            </dl>
          ) : (
            <p className="text-[11px] text-gray-500">
              Open this from a placement to see its confirmed size and artwork requirements.
            </p>
          )}

          {/*
            Which shape the surface is actually using. Without this the
            preview silently implies the placement's own proportions when
            it is really showing the medium's usual ones.
          */}
          <p className="mt-2 border-t border-gray-200 pt-2 text-[11px] text-gray-500 dark:border-gray-700">
            {realRatio
              ? 'Previewed at this placement’s own proportions.'
              : `Previewed at the usual shape for this medium — this placement’s exact size is not confirmed yet.`}
          </p>

          {artwork && (
            <p className={`mt-1.5 text-[11px] ${
              resolution.verdict === 'short' ? 'font-semibold text-red-600 dark:text-red-400'
                : resolution.verdict === 'tight' ? 'text-amber-700 dark:text-amber-400'
                  : 'text-gray-500'
            }`}
            >
              {resolution.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  );
}
