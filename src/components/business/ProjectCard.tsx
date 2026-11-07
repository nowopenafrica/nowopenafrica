import { Link } from 'react-router-dom';
import { ArrowUpRight, FolderOpen, Play } from 'lucide-react';

import SmartImg from '../SmartImg';
import { projectCover, projectHref } from '../../lib/projectStory';
import { projectMeta } from '../../lib/businessProjects';
import type { BusinessProject } from '../../lib/businessProjects';

/**
 * A project, as a card.
 *
 * Three shapes, one component: the featured project on a portfolio overview,
 * the ordinary grid card, and the compact card in "More work". They share a
 * cover, a title and a single line of metadata because that is all a visitor
 * needs to decide whether to open it.
 */
export default function ProjectCard({
  project,
  featured = false,
  compact = false,
}: {
  project: BusinessProject;
  featured?: boolean;
  compact?: boolean;
}) {
  const cover = projectCover(project);
  const meta = projectMeta(project);
  const href = projectHref(project);
  const coverAlt = project.images.find((media) => media.url === cover)?.alt || project.title;
  const hasVideo = !!project.cover_video_url;

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:border-gray-300 hover:shadow-[0_12px_40px_-20px_rgba(0,0,0,0.35)] dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 ${
        featured ? 'sm:col-span-2' : ''
      }`}
    >
      <Link to={href} className="absolute inset-0 z-10" aria-label={`Open ${project.title}`}>
        <span className="sr-only">{project.title}</span>
      </Link>

      {cover ? (
        <div className={featured ? 'relative aspect-[16/10] w-full overflow-hidden' : 'relative aspect-[4/3] w-full overflow-hidden'}>
          <SmartImg
            src={cover}
            alt={coverAlt}
            className="h-full w-full object-cover transition duration-500 motion-reduce:transition-none group-hover:scale-[1.02]"
            loading={featured ? 'eager' : 'lazy'}
          />
          {hasVideo && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
              <Play size={11} fill="currentColor" aria-hidden /> Video
            </span>
          )}
        </div>
      ) : (
        <div className={`relative grid w-full place-items-center bg-gray-50 dark:bg-gray-800/60 ${featured ? 'aspect-[16/10]' : 'aspect-[4/3]'}`}>
          <FolderOpen size={28} className="text-gray-300 dark:text-gray-600" aria-hidden />
        </div>
      )}

      <div className={`flex flex-1 flex-col ${compact ? 'p-4' : 'p-4 sm:p-5'}`}>
        {project.category && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
            {project.category}
          </p>
        )}
        <h3 className={`mt-1 font-bold text-gray-900 dark:text-white ${featured ? 'text-xl sm:text-2xl' : compact ? 'text-sm' : 'text-base sm:text-lg'}`}>
          {project.title}
        </h3>
        {meta && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{meta}</p>}
        {project.summary && !compact && (
          <p className={`mt-2 text-sm text-gray-600 dark:text-gray-300 ${featured ? 'line-clamp-3' : 'line-clamp-2'}`}>
            {project.summary}
          </p>
        )}
        {project.tags.length > 0 && (featured || !compact) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.tags.slice(0, featured ? 5 : 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-gray-900 dark:text-white">
          View project
          <ArrowUpRight size={13} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" aria-hidden />
        </span>
      </div>
    </article>
  );
}
