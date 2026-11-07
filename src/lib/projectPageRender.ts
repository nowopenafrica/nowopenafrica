// The crawlable project story, at /work/:slug.
//
// Same problem as the business profile: the app is a client-rendered SPA, so
// anything without JavaScript gets one sentence, while the URL is exactly what
// a business shares on WhatsApp and what a search engine should index. The
// project page is the one a studio sends to a prospective client, so a generic
// preview card is worse here than anywhere else.
//
// This module is pure: it takes rows the API fetched and returns HTML. That
// keeps it unit-testable without a network and keeps the API route thin.
//
// Nothing here trusts the row. The story is normalised through projectStory.ts
// first — unknown section types are dropped, text is capped, and every URL must
// be http(s) or app-relative — then escaped again on its way into HTML.

import { escapeHtml } from './shareRender.js';
import {
  normalizeDetails,
  normalizeMediaList,
  normalizeResults,
  normalizeSections,
  safeUrl,
  externalUrl,
  videoPlatform,
  isDirectVideo,
  type LabelledItem,
  type ProjectMedia,
  type ProjectSection,
} from './projectStory.js';

export interface ProjectPageProject {
  id: string;
  business_id?: string | null;
  slug?: string | null;
  title: string;
  summary?: string | null;
  client?: string | null;
  location?: string | null;
  completed_on?: string | null;
  cover_url?: string | null;
  cover_video_url?: string | null;
  category?: string | null;
  images?: unknown;
  link_url?: string | null;
  tags?: string[] | null;
  sections?: unknown;
  details?: unknown;
  results?: unknown;
  seo_title?: string | null;
  seo_description?: string | null;
  updated_at?: string | null;
}

export interface ProjectPageBusiness {
  id: string;
  username?: string | null;
  name: string;
  category?: string | null;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  image_url?: string | null;
  logo_url?: string | null;
}

export interface ProjectPage {
  project: ProjectPageProject;
  business: ProjectPageBusiness;
  related?: ProjectPageProject[];
  siteUrl: string;
}

/** Where the story lives. Legacy rows predate slugs and use their id. */
export function projectPath(project: Pick<ProjectPageProject, 'id' | 'slug'>): string {
  return `/work/${encodeURIComponent(project.slug || project.id)}`;
}

/** The business's public profile, in the form people share. */
export function projectBusinessPath(business: Pick<ProjectPageBusiness, 'id' | 'username'>): string {
  return business.username ? `/${business.username}` : `/businesses/${business.id}`;
}

const coverOf = (project: ProjectPageProject): string | null => {
  const images = normalizeMediaList(project.images);
  return safeUrl(project.cover_url) || images[0]?.url || null;
};

function plainTitle(project: ProjectPageProject): string {
  return (project.seo_title || project.title || 'Project').trim().slice(0, 120);
}

function descriptionOf(p: ProjectPage): string {
  return (p.project.seo_description || p.project.summary || '')
    .trim()
    .slice(0, 300) || `${plainTitle(p.project)} — a project by ${p.business.name} on NowOpen Africa.`;
}

function imageOf(p: ProjectPage): string {
  const own = coverOf(p.project);
  const absolute = own?.startsWith('http') ? own : own ? `${p.siteUrl}${own}` : null;
  const fallback = p.business.image_url || p.business.logo_url;
  return absolute || fallback || `${p.siteUrl}/og-image.png`;
}

/* ── Structured data ────────────────────────────────────────────────────── */

export function projectJsonLd(p: ProjectPage): unknown {
  const project = p.project;
  const url = `${p.siteUrl}${projectPath(project)}`;
  const businessUrl = `${p.siteUrl}${projectBusinessPath(p.business)}`;
  const cover = coverOf(project);
  const coverAbs = cover?.startsWith('http') ? cover : cover ? `${p.siteUrl}${cover}` : null;
  const tags = Array.isArray(project.tags)
    ? project.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 12)
    : [];

  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    '@id': url,
    name: project.title,
    url,
    description: descriptionOf(p),
    ...(coverAbs ? { image: [coverAbs] } : {}),
    ...(project.category ? { genre: project.category } : {}),
    ...(project.completed_on ? { dateCreated: project.completed_on } : {}),
    ...(project.updated_at ? { dateModified: project.updated_at } : {}),
    ...(tags.length ? { keywords: tags.join(', ') } : {}),
    creator: {
      '@type': 'Organization',
      name: p.business.name,
      url: businessUrl,
    },
    ...(project.location
      ? { locationCreated: { '@type': 'Place', name: project.location } }
      : {}),
  };
}

export function projectBreadcrumbJsonLd(p: ProjectPage): unknown {
  const url = `${p.siteUrl}${projectPath(p.project)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'NowOpen Africa', item: p.siteUrl },
      {
        '@type': 'ListItem',
        position: 2,
        name: p.business.name,
        item: `${p.siteUrl}${projectBusinessPath(p.business)}`,
      },
      { '@type': 'ListItem', position: 3, name: p.project.title, item: url },
    ],
  };
}

/** JSON that cannot close its own <script> element. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/* ── Body helpers ───────────────────────────────────────────────────────── */

function paragraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function figure(media: ProjectMedia, label?: string): string {
  const url = safeUrl(media.url);
  if (!url) return '';
  const alt = media.alt || media.caption || label || '';
  const caption = [media.caption, media.credit ? `Credit: ${media.credit}` : '']
    .filter(Boolean).join(' · ');
  return `<figure>
    <img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy">
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
  </figure>`;
}

function labelledList(items: LabelledItem[], className = ''): string {
  if (!items.length) return '';
  return `<dl class="facts${className ? ` ${className}` : ''}">${items.map((item) => `
    <div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`).join('')}
  </dl>`;
}

/*
 * The disclosure for anything an owner states about their own outcomes. It is
 * the same sentence everywhere it appears: a result block inside the story and
 * the project-level results list must not make different claims about their
 * own verification.
 */
const REPORTED_RESULTS = 'Reported by the business. Not independently verified by NowOpen Africa.';

function renderSection(section: ProjectSection): string {
  switch (section.type) {
    case 'text':
      return `<section>
        ${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''}
        ${paragraphs(section.body)}
      </section>`;

    case 'image':
      return `<section>${figure(section.media)}</section>`;

    case 'gallery':
      return `<section>
        ${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''}
        <div class="gallery">${section.images.map((media) => figure(media)).join('')}</div>
      </section>`;

    case 'split':
      return `<section class="split">
        <div>
          ${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''}
          ${paragraphs(section.body)}
        </div>
        ${figure(section.media)}
      </section>`;

    case 'video': {
      const url = safeUrl(section.url);
      if (!url) return '';
      if (isDirectVideo(url)) {
        return `<section>
          <video controls preload="metadata" ${section.poster ? `poster="${escapeHtml(safeUrl(section.poster) || '')}"` : ''}>
            <source src="${escapeHtml(url)}">
            <a href="${escapeHtml(url)}">Open the video</a>
          </video>
          ${section.caption ? `<figcaption>${escapeHtml(section.caption)}</figcaption>` : ''}
        </section>`;
      }
      const platform = videoPlatform(url);
      return `<section>
        <p><a class="button" href="${escapeHtml(url)}" rel="nofollow noopener">
          ${platform ? `Watch the video on ${escapeHtml(platform)}` : 'Watch the video'}
        </a></p>
        ${section.caption ? `<figcaption>${escapeHtml(section.caption)}</figcaption>` : ''}
      </section>`;
    }

    case 'quote':
      return `<section>
        <blockquote>${escapeHtml(section.quote)}</blockquote>
        ${section.attribution ? `<cite>${escapeHtml(section.attribution)}</cite>` : ''}
      </section>`;

    case 'timeline':
      return `<section>
        ${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''}
        <ol class="timeline">${section.items.map((item) => `
          <li><strong>${escapeHtml(item.label)}</strong>${item.body ? `<p>${escapeHtml(item.body)}</p>` : ''}</li>`).join('')}
        </ol>
      </section>`;

    case 'beforeAfter':
      return `<section>
        ${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''}
        <div class="gallery">
          <div><p class="label">Before</p>${figure(section.before, 'Before')}</div>
          <div><p class="label">After</p>${figure(section.after, 'After')}</div>
        </div>
      </section>`;

    case 'results':
      return `<section>
        ${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''}
        ${labelledList(section.items)}
        <p class="note">${escapeHtml(REPORTED_RESULTS)}</p>
      </section>`;

    case 'specs':
      return `<section>
        ${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''}
        ${labelledList(section.items)}
      </section>`;

    case 'link': {
      const url = externalUrl(section.url);
      if (!url) return '';
      return `<section>
        ${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''}
        ${section.body ? paragraphs(section.body) : ''}
        <p><a class="button" href="${escapeHtml(url)}" rel="nofollow noopener">${escapeHtml(section.label)}</a></p>
      </section>`;
    }

    default:
      return '';
  }
}

function factsOf(p: ProjectPage): LabelledItem[] {
  const project = p.project;
  const details = normalizeDetails(project.details);
  const tags = Array.isArray(project.tags)
    ? project.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 12)
    : [];
  const facts: LabelledItem[] = [];
  if (project.client) facts.push({ label: 'Client', value: project.client });
  if (details.industry) facts.push({ label: 'Industry', value: details.industry });
  if (details.services) facts.push({ label: 'Services', value: details.services });
  if (project.location) facts.push({ label: 'Location', value: project.location });
  if (project.completed_on) facts.push({ label: 'Year', value: project.completed_on.slice(0, 4) });
  if (details.duration) facts.push({ label: 'Duration', value: details.duration });
  if (details.team) facts.push({ label: 'Team', value: details.team });
  if (details.tools) facts.push({ label: 'Tools', value: details.tools });
  if (tags.length) facts.push({ label: 'Tags', value: tags.join(', ') });
  return facts;
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export function renderProjectPage(p: ProjectPage): string {
  const project = p.project;
  const business = p.business;
  const url = `${p.siteUrl}${projectPath(project)}`;
  const businessUrl = `${p.siteUrl}${projectBusinessPath(business)}`;
  const title = `${plainTitle(project)} — ${business.name} | NowOpen Africa`;
  const description = descriptionOf(p);
  const image = imageOf(p);
  const cover = coverOf(project);
  const coverAlt = normalizeMediaList(project.images).find((media) => media.url === cover)?.alt
    || project.title;
  const meta = [project.client, project.location, project.completed_on?.slice(0, 4)]
    .filter(Boolean).map((value) => escapeHtml(String(value))).join(' · ');
  const sections = normalizeSections(project.sections);
  const results = normalizeResults(project.results);
  const storyUrl = safeUrl(project.link_url) || normalizeDetails(project.details).projectUrl;
  const related = (p.related ?? []).slice(0, 3);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:site_name" content="NowOpen Africa">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(plainTitle(project))}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(plainTitle(project))}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<script type="application/ld+json">${embedJson(projectJsonLd(p))}</script>
<script type="application/ld+json">${embedJson(projectBreadcrumbJsonLd(p))}</script>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; background:#f8fafc; color:#0f172a;
         font:16px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  main { max-width:840px; margin:0 auto; padding:24px 16px 64px; }
  .cover { width:100%; max-height:70vh; object-fit:cover; border-radius:16px; background:#e2e8f0; }
  h1 { font-size:34px; line-height:1.15; margin:20px 0 6px; letter-spacing:-0.02em; }
  h2 { font-size:21px; margin:0 0 10px; }
  .kicker { text-transform:uppercase; letter-spacing:.14em; font-size:11px; font-weight:700; color:#64748b; }
  .meta { color:#475569; margin:0 0 12px; }
  .lede { font-size:18px; color:#475569; }
  section { margin-top:34px; }
  figure { margin:0; }
  img { max-width:100%; height:auto; border-radius:12px; display:block; }
  figcaption { color:#64748b; font-size:13px; margin-top:6px; }
  .gallery { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
  .split { display:grid; gap:20px; }
  @media (min-width:720px) { .split { grid-template-columns:1fr 1fr; align-items:center; } }
  blockquote { margin:0; padding:16px 20px; border-left:4px solid #0f172a;
               font-size:20px; font-weight:600; background:#fff; border-radius:0 12px 12px 0; }
  cite { display:block; color:#64748b; font-style:normal; margin-top:8px; }
  .timeline { margin:0; padding-left:20px; }
  .timeline li { margin-bottom:14px; }
  .timeline p { margin:4px 0 0; color:#475569; }
  .facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
           gap:12px; background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; }
  .facts dt { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#64748b; }
  .facts dd { margin:2px 0 0; font-weight:600; }
  .note { color:#94a3b8; font-size:12px; margin-top:8px; }
  .label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#64748b; }
  .button { display:inline-block; padding:12px 18px; border-radius:12px; background:#0f172a;
            color:#fff; text-decoration:none; font-weight:700; }
  .cta { margin-top:40px; padding:22px; border-radius:16px; background:#fff; border:1px solid #e2e8f0; }
  .cta p { margin:0 0 12px; color:#475569; }
  .related { list-style:none; margin:10px 0 0; padding:0; }
  .related li { margin-bottom:8px; }
  footer { margin-top:40px; color:#64748b; font-size:13px; }
  a { color:#4338ca; }
</style>
</head>
<body>
<main>
  ${cover ? `<img class="cover" src="${escapeHtml(cover)}" alt="${escapeHtml(coverAlt)}">` : ''}
  ${project.category ? `<p class="kicker">${escapeHtml(project.category)}</p>` : ''}
  <h1>${escapeHtml(project.title)}</h1>
  ${meta ? `<p class="meta">${meta}</p>` : ''}
  ${project.summary ? `<p class="lede">${escapeHtml(project.summary)}</p>` : ''}

  ${sections.map(renderSection).join('')}

  ${(() => {
    const facts = factsOf(p);
    return facts.length ? `<section>
      <h2>Project details</h2>
      ${labelledList(facts)}
      ${storyUrl ? `<p><a class="button" href="${escapeHtml(storyUrl)}" rel="nofollow noopener">See the live project</a></p>` : ''}
    </section>` : storyUrl
      ? `<section><p><a class="button" href="${escapeHtml(storyUrl)}" rel="nofollow noopener">See the live project</a></p></section>`
      : '';
  })()}

  ${results.length ? `<section>
    <h2>Outcomes</h2>
    ${labelledList(results)}
    <p class="note">${escapeHtml(REPORTED_RESULTS)}</p>
  </section>` : ''}

  ${related.length ? `<section>
    <h2>More work from ${escapeHtml(business.name)}</h2>
    <ul class="related">${related.map((item) => `
      <li><a href="${escapeHtml(`${p.siteUrl}${projectPath(item)}`)}">${escapeHtml(item.title)}</a></li>`).join('')}
    </ul>
  </section>` : ''}

  <section class="cta">
    <h2>Have a project in mind?</h2>
    <p>Tell ${escapeHtml(business.name)} what you are planning. You will be talking to the people who made the work above.</p>
    <a class="button" href="${escapeHtml(businessUrl)}">View ${escapeHtml(business.name)} on NowOpen Africa</a>
  </section>

  <footer>
    <p><a href="${escapeHtml(p.siteUrl)}/businesses">Browse more businesses on NowOpen Africa</a></p>
  </footer>
</main>
</body>
</html>`;
}
