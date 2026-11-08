/**
 * Photographs for the design gallery's previews.
 *
 * ── WHY THE GALLERY NEEDED THIS ───────────────────────────────────────────
 *
 * Every design in the library rendered as type on a coloured ground, and the
 * flyers African businesses actually pay for are photo-led: a plate of food, a
 * finished haircut, the person whose service is being sold. A template named
 * "Half photo" that previews with no photograph is not showing a customer what
 * they would get — it is showing them the half without the photo.
 *
 * TemplateSurface has carried a `mediaUrl` prop the whole time and the gallery
 * never passed one. This supplies it.
 *
 * ── WHERE THESE COME FROM, AND WHY NOT SOMEWHERE ELSE ─────────────────────
 *
 * Every URL below already appears in this repository, in the sample-content
 * files, and every one is Pexels. The Pexels licence permits commercial use and
 * modification without attribution, which is what makes it safe for work a
 * business then prints and sells.
 *
 * Nothing here was lifted from Canva, Freepik or another design tool's library,
 * and nothing was invented: these are addresses already shipped and already
 * served through a CSP that allows images.pexels.com.
 *
 * ── WHAT THESE ARE NOT ────────────────────────────────────────────────────
 *
 * They are PREVIEW furniture, shown behind placeholder copy that reads "Your
 * headline here". They never attach to a real business, and no profile in the
 * directory renders one — a stock photograph presented as a real shop is the
 * misleading-gallery-image failure this platform has ruled out repeatedly.
 * A business supplies its own picture in the editor, and that picture replaces
 * this one.
 */

/** What a preview photograph shows. */
export type PreviewSubject = 'food' | 'beauty' | 'retail' | 'work' | 'craft';

export interface PreviewPhoto {
  url: string;
  /** What it shows, so a template can ask for something that suits it. */
  subject: PreviewSubject;
  licence: 'Pexels';
}

export const PREVIEW_PHOTOS: PreviewPhoto[] = [
  { url: 'https://images.pexels.com/photos/1181271/pexels-photo-1181271.jpeg?auto=compress&cs=tinysrgb&w=800', subject: 'work', licence: 'Pexels' },
  { url: 'https://images.pexels.com/photos/3182765/pexels-photo-3182765.jpeg?auto=compress&cs=tinysrgb&w=800', subject: 'work', licence: 'Pexels' },
  { url: 'https://images.pexels.com/photos/3807386/pexels-photo-3807386.jpeg?auto=compress&cs=tinysrgb&w=800', subject: 'beauty', licence: 'Pexels' },
  { url: 'https://images.pexels.com/photos/4239146/pexels-photo-4239146.jpeg?auto=compress&cs=tinysrgb&w=800', subject: 'craft', licence: 'Pexels' },
  { url: 'https://images.pexels.com/photos/4386370/pexels-photo-4386370.jpeg?auto=compress&cs=tinysrgb&w=800', subject: 'retail', licence: 'Pexels' },
  { url: 'https://images.pexels.com/photos/4792733/pexels-photo-4792733.jpeg?auto=compress&cs=tinysrgb&w=800', subject: 'craft', licence: 'Pexels' },
  { url: 'https://images.pexels.com/photos/5668473/pexels-photo-5668473.jpeg?auto=compress&cs=tinysrgb&w=800', subject: 'food', licence: 'Pexels' },
  { url: 'https://images.pexels.com/photos/5921788/pexels-photo-5921788.jpeg?auto=compress&cs=tinysrgb&w=800', subject: 'food', licence: 'Pexels' },
];

/**
 * A stable photograph for a template.
 *
 * Keyed off the template so a card shows the same picture on every render —
 * a gallery that reshuffles its imagery on each paint looks broken, and the
 * export would not match the preview a moment earlier.
 */
export function previewPhotoFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PREVIEW_PHOTOS[hash % PREVIEW_PHOTOS.length].url;
}

/**
 * A stable photograph OF A PARTICULAR SUBJECT.
 *
 * `previewPhotoFor` hashes any key across the whole pool, which is right for
 * a template — the picture is furniture behind placeholder copy. It is wrong
 * for a category card, where the photograph is the only thing saying what the
 * category IS: a food plate under "Merchandise & T-shirts" is an unrelated
 * image used to fill a layout, which the creative brief rules out by name.
 *
 * Falls back to the whole pool when no photo of that subject exists, so a new
 * subject never returns nothing.
 */
export function previewPhotoOf(subject: PreviewSubject, key: string): string {
  const matching = PREVIEW_PHOTOS.filter((p) => p.subject === subject);
  const pool = matching.length ? matching : PREVIEW_PHOTOS;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return pool[hash % pool.length].url;
}

/**
 * The preview photograph for a template: of its `photoSubject` when it names
 * one, else the key-hashed pick it has always had. Every gallery, detail and
 * mockup render path calls this, so a template that names no subject keeps
 * exactly the photograph it showed before.
 */
export function previewPhotoForTemplate(tpl: { key: string; photoSubject?: PreviewSubject }): string {
  return tpl.photoSubject ? previewPhotoOf(tpl.photoSubject, tpl.key) : previewPhotoFor(tpl.key);
}
