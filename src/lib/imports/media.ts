/**
 * Image URLs arriving in an import file.
 *
 * `logo_url` and `cover_image_url` were already mapped, and never checked.
 * That is the wrong way round for a field whose value ends up in an `<img
 * src>` on a public profile:
 *
 *   - a `javascript:` or `data:` URL in a spreadsheet cell is a script the
 *     platform would be publishing on somebody's behalf
 *   - an `http://` image on an `https://` page is blocked as mixed content,
 *     so the profile silently shows a broken picture
 *   - a link to a page (`.../gallery.html`) rather than a file loads nothing
 *
 * None of those fail loudly. They fail as a business whose logo does not
 * appear, which looks like NowOpen being broken rather than the file being
 * wrong — so they are worth catching at the door.
 *
 * `gallery_urls` is new. §10 of the business-network brief lists it, the
 * importer had no notion of it, and a gallery is the single field most likely
 * to arrive as several values in one cell.
 */

/** Only these can appear in an `<img src>` we publish. */
const ALLOWED_PROTOCOL = /^https:\/\//i;

/**
 * Extensions we will accept without argument.
 *
 * Deliberately permissive about EXTENSIONLESS urls — most CDNs and image
 * services (Supabase storage, Cloudinary, imgix) serve images from paths with
 * no extension at all, and rejecting those would reject the majority of real
 * image hosting. What is rejected is a URL that clearly names a NON-image.
 */
const NOT_AN_IMAGE = /\.(html?|php|aspx?|jsp|pdf|docx?|xlsx?|zip|mp4|mov|avi|txt|csv)(\?|#|$)/i;

/** How several images arrive in one cell. */
const SEPARATORS = /[|;\n]+|,(?=\s*https?:)/i;

export type MediaProblem =
  | 'empty'
  | 'not_a_url'
  | 'insecure'
  | 'unsafe_scheme'
  | 'not_an_image';

export interface MediaCheck {
  /** The cleaned URL, or null when it cannot be used. */
  url: string | null;
  problem: MediaProblem | null;
}

/**
 * Check one image URL.
 *
 * Returns the reason rather than a boolean, so the row's issue can say what is
 * actually wrong with the cell. "Not a usable image address" tells an admin
 * nothing about which of five files to fix.
 */
export function checkImageUrl(raw: string | null | undefined): MediaCheck {
  const s = String(raw ?? '').trim();
  if (!s) return { url: null, problem: 'empty' };

  /*
   * Scheme first, and by explicit allowlist rather than by blocking known-bad
   * ones. `javascript:`, `data:`, `vbscript:` and `file:` are the obvious
   * dangers; an allowlist is also right about the ones nobody has thought of.
   */
  if (/^(javascript|data|vbscript|file|blob):/i.test(s)) {
    return { url: null, problem: 'unsafe_scheme' };
  }

  if (/^http:\/\//i.test(s)) {
    /*
     * Upgraded, not rejected. The overwhelming majority of `http://` image
     * links in a directory export are simply old, and the same file is served
     * over https. Publishing it as http would be blocked as mixed content on
     * an https page, so the choice is upgrade or discard — and upgrading is
     * recoverable where discarding is not. Flagged either way.
     */
    const upgraded = 'https://' + s.slice('http://'.length);
    return NOT_AN_IMAGE.test(upgraded)
      ? { url: null, problem: 'not_an_image' }
      : { url: upgraded, problem: 'insecure' };
  }

  if (!ALLOWED_PROTOCOL.test(s)) return { url: null, problem: 'not_a_url' };
  if (NOT_AN_IMAGE.test(s)) return { url: null, problem: 'not_an_image' };

  try {
    // Rejects the malformed cases a regex would let through.
    const u = new URL(s);
    if (!u.hostname.includes('.')) return { url: null, problem: 'not_a_url' };
    return { url: u.toString(), problem: null };
  } catch {
    return { url: null, problem: 'not_a_url' };
  }
}

export interface GalleryCheck {
  urls: string[];
  /** One entry per rejected value, so the message can name it. */
  rejected: { value: string; problem: MediaProblem }[];
}

/**
 * Split and check a gallery cell.
 *
 * Commas are only treated as separators when the next value clearly starts a
 * URL — a query string like `?w=800,h=600` is common and splitting on every
 * comma would quietly break those.
 */
export function checkGalleryUrls(raw: string | null | undefined, limit = 12): GalleryCheck {
  const s = String(raw ?? '').trim();
  if (!s) return { urls: [], rejected: [] };

  const urls: string[] = [];
  const rejected: GalleryCheck['rejected'] = [];
  const seen = new Set<string>();

  for (const part of s.split(SEPARATORS)) {
    const value = part.trim();
    if (!value) continue;
    if (urls.length >= limit) break;

    const { url, problem } = checkImageUrl(value);
    if (!url) {
      rejected.push({ value: value.slice(0, 80), problem: problem ?? 'not_a_url' });
      continue;
    }
    // The same image twice in one cell is a copy-paste artefact, not a gallery.
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  return { urls, rejected };
}

/** Human wording for a row issue. */
export function mediaProblemMessage(field: string, problem: MediaProblem, value: string): string {
  const label = field.replace(/_/g, ' ');
  switch (problem) {
    case 'unsafe_scheme':
      return `${label} is not a web address (“${value.slice(0, 40)}”) and was refused. Only https links are published.`;
    case 'insecure':
      return `${label} was an http link and has been upgraded to https. Check it still loads — an http image is blocked on a secure page.`;
    case 'not_an_image':
      return `${label} points at a page or document rather than an image file; it will be left blank.`;
    case 'not_a_url':
      return `“${value.slice(0, 40)}” is not a usable ${label}; it will be left blank.`;
    default:
      return `${label} could not be used.`;
  }
}
