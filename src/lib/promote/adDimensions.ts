/**
 * Reading what `advertisements.dimensions` actually says.
 *
 * ── MEASURED, NOT ASSUMED ────────────────────────────────────────────────
 *
 * The column is free text and 97 rows use it for five different things.
 * Taken verbatim from production:
 *
 *   "12m x 6m"              a real physical size
 *   "1.2m x 1.8m each"      a size, repeated across several faces
 *   "2 towers, 6m x 3m"     a count AND a size
 *   "300x250 & 728x90"      pixels, not metres — IAB display units
 *   "30 seconds" / "30s spot, one a day"   a duration, not a size at all
 *   "10 lightboxes" / "16 screens"         a count, with no size
 *   "Both flanks" / "Full exterior"        a described coverage
 *
 * A preview that treats "Both flanks" as a width would draw nonsense, and
 * one that treats "30 seconds" as a size would be worse. So this returns a
 * TAGGED answer and the caller decides what it can honestly show.
 *
 * ── WHY IT NEVER GUESSES ─────────────────────────────────────────────────
 *
 * An advertising surface is manufactured from these numbers. Inventing a
 * width to make a mockup look complete would put a business in front of a
 * printer with the wrong artwork. Anything unparsed comes back `unknown`,
 * and the interface says "Dimensions pending confirmation" — which is the
 * truth and is also what the brief asks for.
 */

export type AdDimensions =
  /** A physical or pixel size that a surface can be built from. */
  | {
      kind: 'size';
      width: number;
      height: number;
      unit: 'm' | 'px';
      /** Aspect ratio, width ÷ height. */
      ratio: number;
      /** The size is per face, and there are several. */
      each: boolean;
      /** How many faces, when the text says. */
      count?: number;
      /** Further sizes in the same field, e.g. "300x250 & 728x90". */
      alternates?: { width: number; height: number; unit: 'px' }[];
    }
  /** Airtime, not area: a broadcast or digital-screen slot. */
  | { kind: 'duration'; seconds: number; note?: string }
  /** A number of faces with no size given. */
  | { kind: 'count'; count: number; of: string; note?: string }
  /** A described extent — "Both flanks", "Full exterior". */
  | { kind: 'coverage'; described: string }
  /** Nothing readable. The interface must say so rather than invent one. */
  | { kind: 'unknown' };

/** "12m x 6m", "9m x 4.5m", "4m x 8m" — the dominant form. */
const METRES = /(\d+(?:\.\d+)?)\s*m\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*m/i;

/** "300x250", "728x90" — bare numbers are pixels, an IAB display unit. */
const PIXELS = /(\d{2,4})\s*(?:x|×)\s*(\d{2,4})(?!\s*m)/gi;

const SECONDS = /(\d+)\s*(?:s\b|sec|seconds)/i;

/**
 * "10 lightboxes", "16 screens", "2 faces", "25 backlit panels".
 *
 * Anchored at both ends and NOT lazy. A lazy match stopped at the first
 * word boundary, so "25 backlit panels" came back as "backlit"; and letting
 * `s?` do the singularising turned "lightboxes" into "lightboxe".
 */
const COUNT_OF = /^(\d+)\s+([a-z][a-z\s-]*)$/i;

/** English plurals, far enough for a noun naming an advertising face. */
function singular(word: string): string {
  const parts = word.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  /* boxes → box, dishes → dish; but glass stays glass. */
  if (/(?:x|s|z|ch|sh)es$/i.test(last)) parts[parts.length - 1] = last.slice(0, -2);
  else if (/[^s]s$/i.test(last)) parts[parts.length - 1] = last.slice(0, -1);
  return parts.join(' ');
}

/** "2 towers, 6m x 3m" — a count sitting in front of a size. */
const LEADING_COUNT = /^(\d+)\s+[a-z]/i;

const EACH = /\beach\b|\bper\b/i;

/**
 * Read one `dimensions` value.
 *
 * Order matters: a duration is checked before a count, because
 * "30s spot, one a day" contains both a number and a word.
 */
export function readAdDimensions(raw: string | null | undefined): AdDimensions {
  const text = (raw ?? '').trim();
  if (!text) return { kind: 'unknown' };

  /* Airtime first: "30 seconds", "30s spot, one a day", "60 seconds". */
  const seconds = SECONDS.exec(text);
  if (seconds && !METRES.test(text)) {
    const note = text.replace(seconds[0], '').replace(/^[,\s]+|[,\s]+$/g, '');
    return { kind: 'duration', seconds: Number(seconds[1]), ...(note ? { note } : {}) };
  }

  const metres = METRES.exec(text);
  if (metres) {
    const width = Number(metres[1]);
    const height = Number(metres[2]);
    if (width > 0 && height > 0) {
      const lead = LEADING_COUNT.exec(text);
      return {
        kind: 'size',
        width,
        height,
        unit: 'm',
        ratio: width / height,
        each: EACH.test(text),
        ...(lead ? { count: Number(lead[1]) } : {}),
      };
    }
  }

  /* Pixels: one or more IAB units in a single field. */
  const px = [...text.matchAll(PIXELS)]
    .map((m) => ({ width: Number(m[1]), height: Number(m[2]), unit: 'px' as const }))
    .filter((d) => d.width > 0 && d.height > 0);
  if (px.length) {
    const [first, ...rest] = px;
    return {
      kind: 'size',
      width: first.width,
      height: first.height,
      unit: 'px',
      ratio: first.width / first.height,
      each: false,
      ...(rest.length ? { alternates: rest } : {}),
    };
  }

  const countOf = COUNT_OF.exec(text);
  if (countOf) {
    return { kind: 'count', count: Number(countOf[1]), of: singular(countOf[2].toLowerCase()) };
  }

  /*
   * A descriptor carrying a count — which is most of what the rest of the
   * inventory says. Taken from production: "Unipole, 3 faces",
   * "Wall panel, 2 faces", "LED, 2 sided", "LED portrait, double faced",
   * "Network of 8". Each gives a real number of advertising faces, and the
   * words before it are worth keeping rather than discarding.
   */
  const faces = /(\d+)\s*(face|faces|sided|sides|side)\b/i.exec(text);
  if (faces) {
    const note = text.replace(faces[0], '').replace(/[,\s]+$|^[,\s]+/g, '').trim();
    return {
      kind: 'count',
      count: Number(faces[1]),
      of: /side/i.test(faces[2]) ? 'side' : 'face',
      ...(note ? { note } : {}),
    };
  }

  const doubled = /\bdouble[\s-]*(faced|sided)\b/i.exec(text);
  if (doubled) {
    const note = text.replace(doubled[0], '').replace(/[,\s]+$|^[,\s]+/g, '').trim();
    return { kind: 'count', count: 2, of: /sided/i.test(doubled[1]) ? 'side' : 'face', ...(note ? { note } : {}) };
  }

  const network = /\bnetwork of\s+(\d+)/i.exec(text);
  if (network) return { kind: 'count', count: Number(network[1]), of: 'site' };

  /*
   * A described extent. Only when it reads like one — a stray word is not a
   * coverage, and calling it one would put prose where a measurement goes.
   */
  if (/\b(full|both|flank|exterior|vehicle|page|side|face|wrap|rear)\b/i.test(text)) {
    return { kind: 'coverage', described: text };
  }

  return { kind: 'unknown' };
}

/** What to print beside a placement. Never a number that was not given. */
export function describeDimensions(d: AdDimensions): string {
  switch (d.kind) {
    case 'size': {
      const size = `${d.width}${d.unit} × ${d.height}${d.unit}`;
      if (d.count) return `${d.count} faces, ${size} each`;
      return d.each ? `${size} each` : size;
    }
    case 'duration':
      return d.seconds >= 60 ? `${d.seconds / 60} minute slot` : `${d.seconds} second slot`;
    case 'count': {
      const faces = `${d.count} ${d.of}${d.count === 1 ? '' : 's'}`;
      return d.note ? `${d.note} · ${faces}` : faces;
    }
    case 'coverage':
      return d.described;
    default:
      return 'Dimensions pending confirmation';
  }
}

/**
 * Can a mockup be built from this, and at what shape?
 *
 * A preview needs a ratio. A duration and a bare count do not have one, and
 * a coverage ("Both flanks") describes an extent rather than a rectangle —
 * so those get the medium's own default surface and are labelled as
 * illustrative rather than measured.
 */
export const ratioOf = (d: AdDimensions): number | null =>
  (d.kind === 'size' ? d.ratio : null);

/**
 * The pixels an artwork needs to print at this size.
 *
 * Large-format print is specified at a far lower DPI than paper because it
 * is read from across a road: the industry works around 10–15 pixels per
 * inch at full size for a billboard. Returning null rather than a guess
 * where the real size is unknown.
 */
export function requiredPixels(d: AdDimensions, pixelsPerMetre = 400): { width: number; height: number } | null {
  if (d.kind !== 'size') return null;
  if (d.unit === 'px') return { width: d.width, height: d.height };
  return {
    width: Math.round(d.width * pixelsPerMetre),
    height: Math.round(d.height * pixelsPerMetre),
  };
}
