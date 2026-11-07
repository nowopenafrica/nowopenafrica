import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Mail, MessageCircle, Play, X,
} from 'lucide-react';

import SmartImg from '../SmartImg';
import ProjectCard from './ProjectCard';
import type { BusinessProject } from '../../lib/businessProjects';
import { projectMeta } from '../../lib/businessProjects';
import {
  isDirectVideo, videoPlatform,
  type LabelledItem, type ProjectMedia, type ProjectSection,
} from '../../lib/projectStory';

/**
 * The public shape of a project story.
 *
 * Used by /work/:slug and by the editor's preview, so draft and published
 * cannot drift apart: there is one renderer, not a "real" page and a mock-up
 * of it. Everything here is content-first — no badges that cannot be backed, no
 * invented metrics, no overlay covering the artwork.
 */
export interface ProjectStoryViewProps {
  project: BusinessProject;
  businessName: string;
  /** The business's public profile, when it is known. */
  businessHref?: string | null;
  related?: BusinessProject[];
  onEnquire?: () => void;
  /** WhatsApp is real only when the business supplied a usable phone number. */
  whatsappHref?: string | null;
  preview?: boolean;
}

export default function ProjectStoryView({
  project, businessName, businessHref, related = [], onEnquire, whatsappHref, preview = false,
}: ProjectStoryViewProps) {
  const [lightbox, setLightbox] = useState<{ images: ProjectMedia[]; index: number } | null>(null);
  const cover = project.cover_url || project.images[0]?.url || null;
  const meta = projectMeta(project);
  const coverAlt = project.images.find((m) => m.url === cover)?.alt || project.title;

  return (
    <article className="bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="site-container pt-6 sm:pt-10">
        {businessHref && (
          <Link to={businessHref} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
            <ArrowLeft size={13} aria-hidden /> {businessName}
          </Link>
        )}
        <div className="mt-5 max-w-4xl">
          {project.category && (
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {project.category}
            </p>
          )}
          <h1 className="mt-2 text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
            {project.title}
          </h1>
          {project.summary && (
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-600 dark:text-gray-300 sm:text-lg">
              {project.summary}
            </p>
          )}
          {meta && <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{meta}</p>}
        </div>
      </header>

      {/* ── Cover ──────────────────────────────────────────────────────── */}
      <div className="site-container mt-8 sm:mt-10">
        {project.cover_video_url ? (
          <CoverVideo url={project.cover_video_url} poster={cover} title={project.title} />
        ) : cover ? (
          <div className="overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800">
            <SmartImg
              src={cover}
              alt={coverAlt}
              className="max-h-[78vh] w-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
          </div>
        ) : null}
      </div>

      {/* ── Story ──────────────────────────────────────────────────────── */}
      <div className="site-container py-10 sm:py-14">
        {project.sections.length > 0 && (
          <div className="space-y-12 sm:space-y-16">
            {project.sections.map((section) => (
              <StorySection key={section.id} section={section} onOpenImage={(images, index) => setLightbox({ images, index })} />
            ))}
          </div>
        )}

        <ProjectFacts project={project} />
        <ReportedResults project={project} />
      </div>

      {/* ── More work ──────────────────────────────────────────────────── */}
      {related.length > 0 && (
        <section className="border-t border-gray-200 py-10 dark:border-gray-800 sm:py-14" aria-labelledby="more-work">
          <div className="site-container">
            <div className="flex items-end justify-between gap-4">
              <h2 id="more-work" className="text-xl font-extrabold sm:text-2xl">More work from {businessName}</h2>
              {businessHref && (
                <Link to={businessHref} className="shrink-0 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                  See all
                </Link>
              )}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.slice(0, 3).map((item) => (
                <ProjectCard key={item.id} project={item} compact />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Enquiry ────────────────────────────────────────────────────── */}
      {(onEnquire || businessHref) && (
        <section className="border-t border-gray-200 bg-gray-50 py-10 dark:border-gray-800 dark:bg-gray-900 sm:py-14" aria-labelledby="project-cta">
          <div className="site-container flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 id="project-cta" className="text-xl font-extrabold sm:text-2xl">Have a project in mind?</h2>
              <p className="mt-1.5 max-w-xl text-sm text-gray-600 dark:text-gray-300">
                Tell {businessName} what you are planning. You will be talking to the people who made the work above.
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              {onEnquire && (
                <button
                  type="button"
                  onClick={onEnquire}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 sm:flex-none"
                >
                  <Mail size={15} aria-hidden /> Send enquiry
                </button>
              )}
              {whatsappHref && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 px-5 text-sm font-semibold text-gray-800 hover:bg-white dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800 sm:flex-none"
                >
                  <MessageCircle size={15} aria-hidden /> WhatsApp
                </a>
              )}
              {businessHref && (
                <Link
                  to={businessHref}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 px-5 text-sm font-semibold text-gray-800 hover:bg-white dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800 sm:flex-none"
                >
                  View business profile
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {preview && (
        <p className="site-container pb-8 pt-2 text-center text-[11px] text-gray-400">
          Preview — this is how the project will look once published.
        </p>
      )}

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndex={(index) => setLightbox((current) => current ? { ...current, index } : current)}
          onClose={() => setLightbox(null)}
        />
      )}
    </article>
  );
}

/* ── Cover video ────────────────────────────────────────────────────────── */

function CoverVideo({ url, poster, title }: { url: string; poster: string | null; title: string }) {
  if (isDirectVideo(url)) {
    return (
      <video
        controls
        preload="metadata"
        poster={poster ?? undefined}
        className="max-h-[78vh] w-full rounded-2xl bg-black"
        aria-label={`${title} — video`}
      >
        <source src={url} />
        Your browser cannot play this video. <a href={url}>Open it instead</a>.
      </video>
    );
  }
  const platform = videoPlatform(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-6 text-center dark:border-gray-700 dark:bg-gray-900"
    >
      <Play size={28} aria-hidden />
      <span className="text-sm font-semibold">{platform ? `Watch the video on ${platform}` : 'Watch the video'}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">Opens in a new tab</span>
    </a>
  );
}

/* ── Section renderer ───────────────────────────────────────────────────── */

function StorySection({
  section, onOpenImage,
}: {
  section: ProjectSection;
  onOpenImage: (images: ProjectMedia[], index: number) => void;
}) {
  switch (section.type) {
    case 'text':
      return (
        <section className="mx-auto max-w-3xl">
          {section.heading && <h2 className="text-2xl font-extrabold sm:text-3xl">{section.heading}</h2>}
          {section.body && (
            <p className={`whitespace-pre-wrap text-base leading-[1.8] text-gray-700 dark:text-gray-300 ${section.heading ? 'mt-4' : ''}`}>
              {section.body}
            </p>
          )}
        </section>
      );

    case 'image':
      return (
        <figure className="mx-auto max-w-5xl">
          <button
            type="button"
            onClick={() => onOpenImage([section.media], 0)}
            className="block w-full cursor-zoom-in overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800"
            aria-label={`Enlarge image${section.media.caption ? `: ${section.media.caption}` : ''}`}
          >
            <SmartImg
              src={section.media.url}
              alt={section.media.alt || section.media.caption || ''}
              className="max-h-[85vh] w-full object-contain"
              loading="lazy"
            />
          </button>
          <MediaCaption media={section.media} />
        </figure>
      );

    case 'gallery':
      return (
        <section className="mx-auto max-w-6xl">
          {section.heading && <h2 className="mb-5 text-2xl font-extrabold sm:text-3xl">{section.heading}</h2>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.images.map((media, index) => (
              <figure key={`${media.url}-${index}`} className="group">
                <button
                  type="button"
                  onClick={() => onOpenImage(section.images, index)}
                  className="block w-full cursor-zoom-in overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800"
                  aria-label={`Enlarge image ${index + 1} of ${section.images.length}`}
                >
                  <SmartImg
                    src={media.url}
                    alt={media.alt || media.caption || ''}
                    className="aspect-[4/3] w-full object-cover transition duration-500 motion-reduce:transition-none group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                </button>
                <MediaCaption media={media} compact />
              </figure>
            ))}
          </div>
        </section>
      );

    case 'split':
      return (
        <section className="mx-auto grid max-w-6xl items-center gap-6 sm:gap-10 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onOpenImage([section.media], 0)}
            className={`block w-full cursor-zoom-in overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800 ${section.mediaSide === 'left' ? 'md:order-1' : 'md:order-2'}`}
            aria-label="Enlarge image"
          >
            <SmartImg
              src={section.media.url}
              alt={section.media.alt || section.media.caption || ''}
              className="aspect-[4/3] w-full object-cover"
              loading="lazy"
            />
          </button>
          <div className={section.mediaSide === 'left' ? 'md:order-2' : 'md:order-1'}>
            {section.heading && <h2 className="text-2xl font-extrabold sm:text-3xl">{section.heading}</h2>}
            {section.body && (
              <p className={`whitespace-pre-wrap text-base leading-[1.8] text-gray-700 dark:text-gray-300 ${section.heading ? 'mt-3' : ''}`}>
                {section.body}
              </p>
            )}
            <MediaCaption media={section.media} compact />
          </div>
        </section>
      );

    case 'video':
      return (
        <section className="mx-auto max-w-4xl">
          {isDirectVideo(section.url) ? (
            <video controls preload="metadata" poster={section.poster ?? undefined} className="w-full rounded-2xl bg-black">
              <source src={section.url} />
              Your browser cannot play this video. <a href={section.url}>Open it instead</a>.
            </video>
          ) : (
            <a
              href={section.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-6 text-center dark:border-gray-700 dark:bg-gray-900"
            >
              <Play size={26} aria-hidden />
              <span className="text-sm font-semibold">
                {videoPlatform(section.url) ? `Watch on ${videoPlatform(section.url)}` : 'Watch the video'}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">Opens in a new tab</span>
            </a>
          )}
          {section.caption && (
            <figcaption className="mt-2 text-xs text-gray-500 dark:text-gray-400">{section.caption}</figcaption>
          )}
        </section>
      );

    case 'quote':
      return (
        <section className="mx-auto max-w-3xl border-l-4 border-gray-900 pl-5 dark:border-white sm:pl-8">
          <blockquote className="text-xl font-semibold leading-relaxed sm:text-2xl">
            “{section.quote}”
          </blockquote>
          {section.attribution && (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">— {section.attribution}</p>
          )}
        </section>
      );

    case 'timeline':
      return (
        <section className="mx-auto max-w-3xl">
          {section.heading && <h2 className="text-2xl font-extrabold sm:text-3xl">{section.heading}</h2>}
          <ol className="mt-5 space-y-5">
            {section.items.map((item, index) => (
              <li key={`${item.label}-${index}`} className="relative border-l border-gray-200 pl-6 dark:border-gray-700">
                <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-gray-900 dark:bg-white" aria-hidden />
                <p className="text-sm font-bold">{item.label || `Step ${index + 1}`}</p>
                {item.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-600 dark:text-gray-300">{item.body}</p>}
              </li>
            ))}
          </ol>
        </section>
      );

    case 'beforeAfter':
      return (
        <section className="mx-auto max-w-6xl">
          {section.heading && <h2 className="mb-4 text-2xl font-extrabold sm:text-3xl">{section.heading}</h2>}
          <div className="grid gap-4 sm:grid-cols-2">
            {([['Before', section.before], ['After', section.after]] as const).map(([label, media]) => (
              <figure key={label}>
                <button
                  type="button"
                  onClick={() => onOpenImage([section.before, section.after], label === 'Before' ? 0 : 1)}
                  className="block w-full cursor-zoom-in overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800"
                  aria-label={`Enlarge the ${label.toLowerCase()} image`}
                >
                  <SmartImg src={media.url} alt={media.alt || `${label}: ${section.heading || 'the work'}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                </button>
                <figcaption className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</figcaption>
                <MediaCaption media={media} compact />
              </figure>
            ))}
          </div>
        </section>
      );

    case 'results':
      return (
        <section className="mx-auto max-w-5xl">
          {section.heading && <h2 className="text-2xl font-extrabold sm:text-3xl">{section.heading}</h2>}
          <ItemsGrid items={section.items} large />
          <p className="mt-3 text-[11px] text-gray-400">Reported by the business.</p>
        </section>
      );

    case 'specs':
      return (
        <section className="mx-auto max-w-3xl">
          {section.heading && <h2 className="text-2xl font-extrabold sm:text-3xl">{section.heading}</h2>}
          <ItemsList items={section.items} />
        </section>
      );

    case 'link':
      return (
        <section className="mx-auto max-w-3xl">
          {section.heading && <h2 className="text-2xl font-extrabold sm:text-3xl">{section.heading}</h2>}
          {section.body && <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-gray-700 dark:text-gray-300">{section.body}</p>}
          <a
            href={section.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-300 px-4 text-sm font-semibold hover:border-gray-500 dark:border-gray-600 dark:hover:border-gray-400"
          >
            {section.label} <ExternalLink size={14} aria-hidden />
          </a>
        </section>
      );

    default:
      return null;
  }
}

function MediaCaption({ media, compact = false }: { media: ProjectMedia; compact?: boolean }) {
  if (!media.caption && !media.credit) return null;
  return (
    <figcaption className={`mt-2 text-gray-500 dark:text-gray-400 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      {media.caption}
      {media.caption && media.credit ? ' · ' : ''}
      {media.credit && <span>Credit: {media.credit}</span>}
    </figcaption>
  );
}

function ItemsGrid({ items, large = false }: { items: LabelledItem[]; large?: boolean }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`}>
          <dd className={`font-extrabold ${large ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{item.value}</dd>
          <dt className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function ItemsList({ items }: { items: LabelledItem[] }) {
  return (
    <dl className="mt-4 divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-6">
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{item.label}</dt>
          <dd className="text-sm text-gray-800 dark:text-gray-200">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Project facts and results ──────────────────────────────────────────── */

function ProjectFacts({ project }: { project: BusinessProject }) {
  const facts: LabelledItem[] = [];
  if (project.client) facts.push({ label: 'Client', value: project.client });
  if (project.details.industry) facts.push({ label: 'Industry', value: project.details.industry });
  if (project.details.services) facts.push({ label: 'Services', value: project.details.services });
  if (project.location) facts.push({ label: 'Location', value: project.location });
  if (project.completed_on) facts.push({ label: 'Year', value: project.completed_on.slice(0, 4) });
  if (project.details.duration) facts.push({ label: 'Duration', value: project.details.duration });
  if (project.details.team) facts.push({ label: 'Team', value: project.details.team });
  if (project.details.tools) facts.push({ label: 'Tools', value: project.details.tools });
  if (project.tags.length) facts.push({ label: 'Tags', value: project.tags.join(', ') });

  if (!facts.length && !project.link_url && !project.details.projectUrl) return null;

  return (
    <section className="mx-auto mt-14 max-w-3xl border-t border-gray-200 pt-8 dark:border-gray-800 sm:mt-20" aria-labelledby="project-facts">
      <h2 id="project-facts" className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        Project details
      </h2>
      {facts.length > 0 && <ItemsList items={facts} />}
      {(project.details.projectUrl || project.link_url) && (
        <a
          href={project.details.projectUrl || project.link_url || '#'}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-300 px-4 text-sm font-semibold hover:border-gray-500 dark:border-gray-600 dark:hover:border-gray-400"
        >
          See the live project <ExternalLink size={14} aria-hidden />
        </a>
      )}
    </section>
  );
}

function ReportedResults({ project }: { project: BusinessProject }) {
  if (!project.results.length) return null;
  return (
    <section className="mx-auto mt-12 max-w-5xl" aria-labelledby="project-results">
      <h2 id="project-results" className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        Outcomes
      </h2>
      <ItemsGrid items={project.results} large />
      {/*
        Stated plainly, because it is true: these numbers were supplied by the
        business. NowOpen has not audited them, and a page that implies it has
        would be trading on trust it did not earn.
      */}
      <p className="mt-3 text-[11px] text-gray-400">Reported by the business. Not independently verified by NowOpen Africa.</p>
    </section>
  );
}

/* ── Lightbox ───────────────────────────────────────────────────────────── */

function ImageLightbox({
  images, index, onIndex, onClose,
}: {
  images: ProjectMedia[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const media = images[index];
  const count = images.length;

  const next = useCallback(() => onIndex((index + 1) % count), [count, index, onIndex]);
  const prev = useCallback(() => onIndex((index - 1 + count) % count), [count, index, onIndex]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && count > 1) next();
      if (e.key === 'ArrowLeft' && count > 1) prev();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [count, next, prev, onClose]);

  if (!media) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      className="fixed inset-0 z-[70] flex flex-col bg-black/95 p-3 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex items-center justify-between text-white">
        <p className="text-xs text-white/70">{index + 1} / {count}</p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close image viewer"
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10"
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {count > 1 && (
          <button type="button" onClick={prev} aria-label="Previous image" className="absolute left-0 z-10 grid h-12 w-12 place-items-center rounded-full text-white hover:bg-white/10">
            <ChevronLeft size={28} />
          </button>
        )}
        <SmartImg src={media.url} alt={media.alt || media.caption || ''} className="max-h-full max-w-full object-contain" loading="eager" />
        {count > 1 && (
          <button type="button" onClick={next} aria-label="Next image" className="absolute right-0 z-10 grid h-12 w-12 place-items-center rounded-full text-white hover:bg-white/10">
            <ChevronRight size={28} />
          </button>
        )}
      </div>

      {(media.caption || media.credit) && (
        <div className="mx-auto max-w-2xl pb-2 text-center text-xs text-white/70">
          {media.caption}
          {media.caption && media.credit ? ' · ' : ''}
          {media.credit && `Credit: ${media.credit}`}
        </div>
      )}
    </div>
  );
}
