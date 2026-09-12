/**
 * "I have the artwork" — the route that was offered and did nothing.
 *
 * Of the four artwork routes, this one belongs to the customer closest to
 * paying: they have already decided what they want and had it designed. Asking
 * them to place an order and then email the file separately is where that
 * customer is lost, so the file goes with the order.
 *
 * WHERE IT GOES. A private bucket, never a public one. Print-ready artwork is
 * somebody's unreleased campaign, price list or menu; the business-images
 * bucket is world-readable and would publish it. Staff read it through a
 * short-lived signed URL, the same way verification documents work.
 *
 * WHAT THE PATH IS FOR. The path is `<reference>/<file>` and it is decided
 * BEFORE the upload, because the order row declares it and the storage policy
 * only permits an upload that a recent order already asked for. Without that,
 * an anonymous-writable bucket is a free file host for anyone who finds it.
 *
 * WHAT IS REFUSED, AND WHY IT IS REFUSED HERE AND AGAIN AT THE BUCKET. These
 * checks are the explanation the customer gets; the bucket's own limits are the
 * enforcement. A check that only exists in the browser is not a limit.
 */

/**
 * SVG is missing on purpose. The bucket is private, but a signed URL opened by
 * a member of staff renders in a browser, and an SVG is a script that runs on
 * the storage origin. Nobody sends print-ready artwork as SVG anyway.
 */
export const ARTWORK_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export const ARTWORK_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp'] as const;

/** 25 MB. A print-ready A4 PDF is a few MB; 25 covers a generous poster. */
export const ARTWORK_MAX_BYTES = 25 * 1024 * 1024;

export const ARTWORK_BUCKET = 'create-artwork';

export type ArtworkCheck = { ok: true } | { ok: false; reason: string };

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export function checkArtwork(file: { name: string; size: number; type: string }): ArtworkCheck {
  if (file.size === 0) return { ok: false, reason: 'That file is empty.' };
  if (file.size > ARTWORK_MAX_BYTES) {
    return { ok: false, reason: `That file is ${Math.round(file.size / 1024 / 1024)}MB. The limit is 25MB — send a PDF if it is a big image.` };
  }
  const ext = extensionOf(file.name);
  // Trust the extension over the browser's MIME guess: Windows reports nothing
  // for some PDFs, and refusing a valid PDF is worse than the bucket refusing
  // an invalid one a second later.
  const typeOk = (ARTWORK_TYPES as readonly string[]).includes(file.type);
  const extOk = (ARTWORK_EXTENSIONS as readonly string[]).includes(ext);
  if (!typeOk && !extOk) {
    return { ok: false, reason: 'Send a PDF, PNG, JPG or WEBP. Anything else we cannot print from.' };
  }
  return { ok: true };
}

/**
 * A storage-safe filename that a person still recognises in the admin queue.
 *
 * Keeping the original stem matters: "ankara-sale-flyer.pdf" tells whoever
 * prints it what they are looking at, and a uuid does not.
 */
export function safeArtworkName(original: string): string {
  const ext = extensionOf(original);
  const stem = (ext ? original.slice(0, original.length - ext.length - 1) : original)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase();
  const safeExt = (ARTWORK_EXTENSIONS as readonly string[]).includes(ext) ? ext : 'dat';
  return `${stem || 'artwork'}.${safeExt}`;
}

/** Decided before the upload, because the order row has to declare it. */
export const artworkPath = (reference: string, original: string): string =>
  `${reference}/${safeArtworkName(original)}`;
