// The 9:16 image an owner posts to WhatsApp Status or Instagram Stories.
//
// This is the half of "share my live" that a link preview cannot do. Status and
// Stories render media you upload — they are not web views, and no meta tag
// reaches them. So the way a live broadcast appears on a status is as a picture
// that says it is live, with the link travelling alongside it (a link sticker,
// or pasted into the caption).
//
// Which means the URL has to be legible ON the image too. Plenty of people will
// read it and type it rather than find the sticker, and on a re-shared
// screenshot the printed link is the only thing left that still works.

export interface LiveStatusCardOptions {
  badge: string;
  businessName: string;
  title: string;
  /** Printed on the card, so it survives a screenshot. */
  url: string;
  /** Poster frame or cover photo, already loaded. Optional. */
  background?: CanvasImageSource & { width?: number; height?: number };
  backgroundWidth?: number;
  backgroundHeight?: number;
}

export const STATUS_CARD_WIDTH = 1080;
export const STATUS_CARD_HEIGHT = 1920;

/**
 * Break text into lines that fit, using whatever measures text.
 *
 * The measure function is injected so the wrapping — the part with the actual
 * edge cases — is testable without a canvas.
 *
 * A word longer than the line is left to overflow rather than hyphenated: a URL
 * or a hashtag broken mid-string reads as a typo, and the alternative is
 * splitting a word the owner chose.
 */
export function wrapLines(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
  maxLines = 3,
): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  // Anything that did not fit is signalled, not silently dropped — a headline
  // that stops mid-sentence looks like a bug in the card.
  const used = lines.join(' ').split(/\s+/).length;
  if (used < words.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}…`;
  }
  return lines;
}

/**
 * How a source image fills the 9:16 card.
 *
 * Same reasoning as the capture crop in openReel: a 16:9 broadcast frame in a
 * 9:16 card either fills it and loses the sides, or fits it and leaves bars.
 * Filling is right here — the card is decoration behind text, and bars read as
 * a broken upload.
 */
export function coverRect(
  srcW: number, srcH: number, dstW: number, dstH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (!srcW || !srcH) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  let sw = srcW;
  let sh = srcH;
  if (srcAspect > dstAspect) sw = srcH * dstAspect;
  else sh = srcW / dstAspect;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

export const NAME_LINE = 62;
export const TITLE_LINE = 104;
export const NAME_GAP = 24;
/** Breathing room between the last line of the title and the CTA button. */
export const BLOCK_GAP = 56;

/**
 * Where the name-and-title block sits above the CTA.
 *
 * Bottom-anchored on purpose. Laying it out downwards from a fixed top meant a
 * two-line business name pushed the last line of the title under the button —
 * the one line the whole card exists to show.
 */
export function statusCardBlock(
  nameLines: number, titleLines: number, ctaTop: number,
): { top: number; bottom: number; height: number } {
  const height = nameLines * NAME_LINE + (nameLines ? NAME_GAP : 0) + titleLines * TITLE_LINE;
  const bottom = ctaTop - BLOCK_GAP;
  return { top: bottom - height, bottom, height };
}

/**
 * Paint the card.
 *
 * Kept separate from the blob/loading plumbing so a caller can draw into a
 * canvas it already owns, and so the layout can be exercised directly.
 *
 * jsdom's canvas stub implements almost nothing, so every optional call is
 * feature-detected the same way drawTemplate.ts does it — a test that renders
 * this must not explode on a missing method.
 */
export function drawLiveStatusCard(
  ctx: CanvasRenderingContext2D,
  o: LiveStatusCardOptions,
): void {
  const W = STATUS_CARD_WIDTH;
  const H = STATUS_CARD_HEIGHT;
  const canGradient = typeof ctx.createLinearGradient === 'function';
  const canRound = typeof (ctx as unknown as { roundRect?: unknown }).roundRect === 'function';

  // Every y below is a line's CENTRE, not its baseline — the layout is built
  // from stacked boxes, and centres are what that arithmetic produces.
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);

  if (o.background && o.backgroundWidth && o.backgroundHeight) {
    const c = coverRect(o.backgroundWidth, o.backgroundHeight, W, H);
    if (c.sw > 0) ctx.drawImage(o.background, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H);
  }

  // Text over a photograph is only readable if the photograph is pushed down
  // where the text sits. A flat overlay would dull the whole frame instead.
  if (canGradient) {
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(15,23,42,0.72)');
    shade.addColorStop(0.34, 'rgba(15,23,42,0.18)');
    shade.addColorStop(0.62, 'rgba(15,23,42,0.60)');
    shade.addColorStop(1, 'rgba(15,23,42,0.95)');
    ctx.fillStyle = shade;
  } else {
    ctx.fillStyle = 'rgba(15,23,42,0.55)';
  }
  ctx.fillRect(0, 0, W, H);

  const pill = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    if (canRound) {
      ctx.beginPath();
      (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void })
        .roundRect(x, y, w, h, h / 2);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, w, h);
    }
  };

  // The badge, top-left where a status viewer's eye starts.
  const badge = (o.badge || 'LIVE NOW').toUpperCase();
  ctx.font = '700 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const badgeW = ctx.measureText(badge).width + 130;
  pill(80, 120, badgeW, 96, '#dc2626');
  ctx.fillStyle = '#ffffff';
  if (typeof ctx.arc === 'function') {
    ctx.beginPath();
    ctx.arc(140, 168, 18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillText(badge, 180, 170);

  // Business name, then the stream's own title. Name first: on a status the
  // viewer decides whether to care about WHO before WHAT.
  ctx.font = '600 46px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  const nameLines = wrapLines(o.businessName, W - 160, (s) => ctx.measureText(s).width, 2);

  ctx.font = '800 86px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const titleLines = wrapLines(o.title, W - 160, (s) => ctx.measureText(s).width, 3);

  // Laid out from the bottom up, so a short title sits low and near the CTA
  // rather than floating in the middle of the frame — and so a long business
  // name pushes the block UP instead of driving the last line of the title
  // underneath the button.
  const ctaTop = H - 430;
  const block = statusCardBlock(nameLines.length, titleLines.length, ctaTop);
  let y = block.top;

  ctx.font = '600 46px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  for (const line of nameLines) {
    ctx.fillText(line, 80, y + NAME_LINE / 2);
    y += NAME_LINE;
  }

  y += nameLines.length ? NAME_GAP : 0;
  ctx.font = '800 86px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillStyle = '#ffffff';
  for (const line of titleLines) {
    ctx.fillText(line, 80, y + TITLE_LINE / 2);
    y += TITLE_LINE;
  }

  // The call to action, and the link in plain text beneath it.
  pill(80, ctaTop, W - 160, 140, '#ffffff');
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 54px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const cta = 'Tap the link to watch';
  ctx.fillText(cta, (W - ctx.measureText(cta).width) / 2, ctaTop + 70);

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '600 40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const url = o.url || '';
  ctx.fillText(url, (W - ctx.measureText(url).width) / 2, ctaTop + 210);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const mark = 'NowOpen Africa';
  ctx.fillText(mark, (W - ctx.measureText(mark).width) / 2, H - 110);
}

/** Load an image for the card, or give up quietly. */
export function loadCardImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src || typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    // The poster lives on Supabase storage; without this the canvas is tainted
    // and toBlob throws, losing the card rather than just its background.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Render the card to a PNG blob, background and all. */
export async function renderLiveStatusCard(
  o: Omit<LiveStatusCardOptions, 'background' | 'backgroundWidth' | 'backgroundHeight'> & { backgroundUrl?: string | null },
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = STATUS_CARD_WIDTH;
  canvas.height = STATUS_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = o.backgroundUrl ? await loadCardImage(o.backgroundUrl) : null;
  drawLiveStatusCard(ctx, {
    ...o,
    background: img ?? undefined,
    backgroundWidth: img?.naturalWidth,
    backgroundHeight: img?.naturalHeight,
  });

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
