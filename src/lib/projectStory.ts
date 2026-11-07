/**
 * The shape of a project story, and the rules for reading one back.
 *
 * A project is no longer a cover and a sentence: it is an ordered narrative
 * made of text, images, video, quotes, process, results and specifications.
 * That flexibility is the point — a photographer, an architect and a restaurant
 * should not be forced into the same template — but it also means every field
 * arrives from a JSON column the owner controls.
 *
 * So nothing here trusts its input. Sections are normalised on the way out of
 * the database and again on the way in from the editor. Anything that is not a
 * known section type is dropped; every string is length-capped; every URL must
 * be http(s) or app-relative. There is no HTML anywhere in the model, which is
 * deliberate: rich text is plain text with line breaks, so there is nothing for
 * a sanitizer to miss.
 */

/* ── Media ──────────────────────────────────────────────────────────────── */

export interface ProjectMedia {
  url: string;
  caption: string | null;
  /** What the image shows, for screen readers. Falls back to the caption. */
  alt: string | null;
  /** Photographer or studio, when the business wants to name them. */
  credit: string | null;
}

/* ── Sections ───────────────────────────────────────────────────────────── */

export type ProjectSectionType =
  | 'text'
  | 'image'
  | 'gallery'
  | 'split'
  | 'video'
  | 'quote'
  | 'timeline'
  | 'beforeAfter'
  | 'results'
  | 'specs'
  | 'link';

interface SectionBase {
  id: string;
  type: ProjectSectionType;
}

export interface TextSection extends SectionBase {
  type: 'text';
  heading: string | null;
  body: string;
}

export interface ImageSection extends SectionBase {
  type: 'image';
  media: ProjectMedia;
}

export interface GallerySection extends SectionBase {
  type: 'gallery';
  heading: string | null;
  images: ProjectMedia[];
}

export interface SplitSection extends SectionBase {
  type: 'split';
  heading: string | null;
  body: string;
  media: ProjectMedia;
  mediaSide: 'left' | 'right';
}

export interface VideoSection extends SectionBase {
  type: 'video';
  url: string;
  poster: string | null;
  caption: string | null;
}

export interface QuoteSection extends SectionBase {
  type: 'quote';
  quote: string;
  attribution: string | null;
}

export interface TimelineItem {
  label: string;
  body: string;
}

export interface TimelineSection extends SectionBase {
  type: 'timeline';
  heading: string | null;
  items: TimelineItem[];
}

export interface BeforeAfterSection extends SectionBase {
  type: 'beforeAfter';
  heading: string | null;
  before: ProjectMedia;
  after: ProjectMedia;
}

export interface LabelledItem {
  label: string;
  value: string;
}

export interface ResultsSection extends SectionBase {
  type: 'results';
  heading: string | null;
  items: LabelledItem[];
}

export interface SpecsSection extends SectionBase {
  type: 'specs';
  heading: string | null;
  items: LabelledItem[];
}

export interface LinkSection extends SectionBase {
  type: 'link';
  heading: string | null;
  body: string;
  url: string;
  label: string;
}

export type ProjectSection =
  | TextSection
  | ImageSection
  | GallerySection
  | SplitSection
  | VideoSection
  | QuoteSection
  | TimelineSection
  | BeforeAfterSection
  | ResultsSection
  | SpecsSection
  | LinkSection;

/** What the editor offers, and the sentence that explains each one. */
export const SECTION_TYPES: {
  type: ProjectSectionType;
  label: string;
  hint: string;
}[] = [
  { type: 'text', label: 'Text', hint: 'The challenge, the approach, the story in your own words.' },
  { type: 'image', label: 'Full-width image', hint: 'One strong image with an optional caption.' },
  { type: 'gallery', label: 'Image gallery', hint: 'Several images shown together, with captions.' },
  { type: 'split', label: 'Image and text', hint: 'An image beside a paragraph — good for details and process.' },
  { type: 'video', label: 'Video', hint: 'A direct video file, or a YouTube/Vimeo link.' },
  { type: 'quote', label: 'Quote', hint: 'A client testimonial or a line worth setting large.' },
  { type: 'timeline', label: 'Process', hint: 'The steps in order, from brief to delivery.' },
  { type: 'beforeAfter', label: 'Before and after', hint: 'Two images side by side, clearly labelled.' },
  { type: 'results', label: 'Results', hint: 'Outcomes you can state: reach, sales, delivery.' },
  { type: 'specs', label: 'Specifications', hint: 'Materials, dimensions, tools, team — the detail.' },
  { type: 'link', label: 'Link', hint: 'A safe outbound link to the finished thing.' },
];

/* ── Details and results ────────────────────────────────────────────────── */

export interface ProjectDetails {
  industry: string | null;
  services: string | null;
  duration: string | null;
  team: string | null;
  tools: string | null;
  projectUrl: string | null;
}

export const EMPTY_DETAILS: ProjectDetails = {
  industry: null,
  services: null,
  duration: null,
  team: null,
  tools: null,
  projectUrl: null,
};

export interface ProjectResult {
  label: string;
  value: string;
}

/* ── Limits ─────────────────────────────────────────────────────────────── */

const MAX_SECTIONS = 40;
const MAX_GALLERY = 24;
const MAX_ITEMS = 24;
const MAX_MEDIA = 40;
const MAX_TEXT = 8000;
const MAX_SHORT = 240;

/* ── Primitive readers ──────────────────────────────────────────────────── */

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Trim and cap. Everything textual goes through this. */
export function text(value: unknown, max = MAX_SHORT): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim().slice(0, max);
}

const nullableText = (value: unknown, max = MAX_SHORT): string | null => {
  const s = text(value, max);
  return s || null;
};

/**
 * A URL that is safe to put in `src`/`href`.
 *
 * Root-relative paths are allowed for images served from our own domain;
 * everything else must be http(s). `javascript:`, `data:` and protocol-relative
 * `//host` are refused, which is the whole point of the function.
 */
export function safeUrl(value: unknown): string | null {
  const raw = text(value, 2000);
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** For an outbound link, accept a bare domain and give it https. */
export function externalUrl(value: unknown): string | null {
  const raw = text(value, 2000);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return safeUrl(raw);
  if (raw.includes(' ') || raw.startsWith('/')) return null;
  return safeUrl(`https://${raw}`);
}

export function normalizeMedia(value: unknown): ProjectMedia | null {
  const row = asRecord(value);
  // Legacy rows stored a bare URL string in `images`.
  const rawUrl = typeof value === 'string' ? value : row.url;
  const url = safeUrl(rawUrl);
  if (!url) return null;
  return {
    url,
    caption: nullableText(row.caption, MAX_SHORT),
    alt: nullableText(row.alt, MAX_SHORT),
    credit: nullableText(row.credit, MAX_SHORT),
  };
}

export function normalizeMediaList(value: unknown, max = MAX_MEDIA): ProjectMedia[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeMedia)
    .filter((m): m is ProjectMedia => m !== null)
    .slice(0, max);
}

function normalizeItems(value: unknown, max = MAX_ITEMS): LabelledItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      const label = text(row.label);
      const itemValue = text(row.value ?? row.body);
      return label || itemValue ? { label, value: itemValue } : null;
    })
    .filter((item): item is LabelledItem => item !== null)
    .slice(0, max);
}

function normalizeTimeline(value: unknown): TimelineItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      const label = text(row.label);
      const body = text(row.body, 1200);
      return label || body ? { label, body } : null;
    })
    .filter((item): item is TimelineItem => item !== null)
    .slice(0, MAX_ITEMS);
}

/* ── Section normalisation ──────────────────────────────────────────────── */

function normalizeSection(value: unknown, index: number): ProjectSection | null {
  const row = asRecord(value);
  const type = row.type;
  if (!SECTION_TYPES.some((s) => s.type === type)) return null;
  const id = text(row.id, 64) || `section-${index}`;

  switch (type) {
    case 'text': {
      const body = text(row.body, MAX_TEXT);
      const heading = nullableText(row.heading);
      return body || heading ? { id, type, heading, body } : null;
    }
    case 'image': {
      const media = normalizeMedia(row.media);
      return media ? { id, type, media } : null;
    }
    case 'gallery': {
      const images = normalizeMediaList(row.images, MAX_GALLERY);
      return images.length ? { id, type, heading: nullableText(row.heading), images } : null;
    }
    case 'split': {
      const media = normalizeMedia(row.media);
      const body = text(row.body, MAX_TEXT);
      if (!media || (!body && !row.heading)) return null;
      return {
        id, type, media, body,
        heading: nullableText(row.heading),
        mediaSide: row.mediaSide === 'left' ? 'left' : 'right',
      };
    }
    case 'video': {
      const url = safeUrl(row.url);
      if (!url) return null;
      return {
        id, type, url,
        poster: safeUrl(row.poster),
        caption: nullableText(row.caption),
      };
    }
    case 'quote': {
      const quote = text(row.quote, 2000);
      if (!quote) return null;
      return { id, type, quote, attribution: nullableText(row.attribution) };
    }
    case 'timeline': {
      const items = normalizeTimeline(row.items);
      return items.length ? { id, type, heading: nullableText(row.heading), items } : null;
    }
    case 'beforeAfter': {
      const before = normalizeMedia(row.before);
      const after = normalizeMedia(row.after);
      if (!before || !after) return null;
      return { id, type, before, after, heading: nullableText(row.heading) };
    }
    case 'results': {
      const items = normalizeItems(row.items);
      return items.length ? { id, type, heading: nullableText(row.heading), items } : null;
    }
    case 'specs': {
      const items = normalizeItems(row.items);
      return items.length ? { id, type, heading: nullableText(row.heading), items } : null;
    }
    case 'link': {
      const url = externalUrl(row.url);
      if (!url) return null;
      return {
        id, type, url,
        heading: nullableText(row.heading),
        body: text(row.body, MAX_TEXT),
        label: nullableText(row.label) ?? 'View the work',
      };
    }
    default:
      return null;
  }
}

export function normalizeSections(value: unknown): ProjectSection[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((item, index) => {
      const section = normalizeSection(item, index);
      if (!section) return null;
      // Two sections saved with the same id would make React reuse the wrong
      // editor state, so a duplicate gets a suffix rather than being dropped.
      if (seen.has(section.id)) section.id = `${section.id}-${index}`;
      seen.add(section.id);
      return section;
    })
    .filter((s): s is ProjectSection => s !== null)
    .slice(0, MAX_SECTIONS);
}

export function normalizeDetails(value: unknown): ProjectDetails {
  const row = asRecord(value);
  return {
    industry: nullableText(row.industry),
    services: nullableText(row.services),
    duration: nullableText(row.duration),
    team: nullableText(row.team),
    tools: nullableText(row.tools),
    projectUrl: externalUrl(row.projectUrl),
  };
}

export function normalizeResults(value: unknown): ProjectResult[] {
  return normalizeItems(value).filter((item) => item.label && item.value);
}

/* ── A blank section, for the editor ────────────────────────────────────── */

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const emptyMedia = (): ProjectMedia => ({ url: '', caption: null, alt: null, credit: null });

export function emptySection(type: ProjectSectionType): ProjectSection {
  const id = newId();
  switch (type) {
    case 'text': return { id, type, heading: null, body: '' };
    case 'image': return { id, type, media: emptyMedia() };
    case 'gallery': return { id, type, heading: null, images: [] };
    case 'split': return { id, type, heading: null, body: '', media: emptyMedia(), mediaSide: 'right' };
    case 'video': return { id, type, url: '', poster: null, caption: null };
    case 'quote': return { id, type, quote: '', attribution: null };
    case 'timeline': return { id, type, heading: null, items: [{ label: '', body: '' }] };
    case 'beforeAfter': return { id, type, heading: null, before: emptyMedia(), after: emptyMedia() };
    case 'results': return { id, type, heading: null, items: [{ label: '', value: '' }] };
    case 'specs': return { id, type, heading: null, items: [{ label: '', value: '' }] };
    case 'link': return { id, type, heading: null, body: '', url: '', label: 'View the work' };
  }
}

/* ── Identity ───────────────────────────────────────────────────────────── */

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * A stable public slug.
 *
 * The id fragment is not decoration. Two tailors can both have a project
 * called "Wedding suit", and a unique index would reject the second without
 * telling the owner anything useful. Six characters of the row id make the
 * slug unique without making it unreadable.
 */
export function projectSlug(title: string, id: string): string {
  const base = slugify(title) || 'project';
  const suffix = id.replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase();
  return suffix ? `${base}-${suffix}` : base;
}

/** The URL people share. Legacy rows without a slug fall back to their id. */
export function projectHref(project: { slug?: string | null; id: string }): string {
  return `/work/${encodeURIComponent(project.slug || project.id)}`;
}

export function projectCover(project: {
  cover_url?: string | null;
  images?: ProjectMedia[];
}): string | null {
  return project.cover_url || project.images?.[0]?.url || null;
}

/** Any video URL that a <video> element can actually play. */
export function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i.test(url);
}

/** For a platform video link, a readable destination. */
export function videoPlatform(url: string): string | null {
  if (/youtu\.be|youtube\.com/i.test(url)) return 'YouTube';
  if (/vimeo\.com/i.test(url)) return 'Vimeo';
  return null;
}

export { MAX_GALLERY, MAX_ITEMS, MAX_MEDIA, MAX_SECTIONS, MAX_TEXT };
