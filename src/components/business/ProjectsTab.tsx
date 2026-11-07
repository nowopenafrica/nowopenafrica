import { Link } from 'react-router-dom';
import { ArrowRight, FolderOpen, Plus } from 'lucide-react';

import ProjectCard from './ProjectCard';
import type { ProjectsRead } from '../../lib/businessProjects';

/**
 * Finished work, on a business profile.
 *
 * Called "Portfolio" for a photographer and "Projects" for a builder — the
 * word arrives as `label` from `portfolioLabel`, because the tab, the
 * heading and the empty state all have to agree and only one of them should
 * decide.
 *
 * ── THE THREE STATES, AND WHY THERE ARE THREE ────────────────────────────
 *
 * Rows, none, and "we could not ask". The third exists because this is a
 * PUBLIC page: if the read fails, saying "no work yet" on the profile of a
 * builder with thirty finished estates is a claim about their business that
 * we have no basis for. It is the same mistake as a tab bar reading
 * "Gallery 0" after a failed load, which this product has already made once.
 */
export default function ProjectsTab({
  read,
  label,
  isOwner,
  businessId,
}: {
  read: ProjectsRead;
  /** "Portfolio" or "Projects", decided by trade. */
  label: string;
  /** Owners get told where to add work; visitors do not need to know. */
  isOwner: boolean;
  /** Needed only to send the owner to the right editor. */
  businessId?: string;
}) {
  const manageHref = businessId
    ? `/dashboard?open=content&business=${encodeURIComponent(businessId)}&panel=portfolio`
    : '/dashboard';

  if (read.state === 'unavailable') {
    return (
      <div className="rounded-2xl border border-gray-200 p-6 text-center dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-300">{read.reason}</p>
        {/* Deliberately NOT "no projects yet" — we do not know that. */}
      </div>
    );
  }

  if (!read.projects.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
        <FolderOpen size={28} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" aria-hidden />
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          No {label.toLowerCase()} shown yet
        </p>
        {isOwner ? (
          <>
            <p className="mx-auto mt-1.5 max-w-sm text-xs text-gray-500">
              Work you have already finished is what a customer compares you on.
              Add a project and it appears here as soon as you publish it.
            </p>
            <Link
              to={manageHref}
              className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-gray-900 px-4 text-xs font-bold text-white dark:bg-white dark:text-gray-900"
            >
              <Plus size={14} aria-hidden /> Add your first project
            </Link>
          </>
        ) : (
          <p className="mx-auto mt-1.5 max-w-sm text-xs text-gray-500">
            This business has not shared any work here yet.
          </p>
        )}
      </div>
    );
  }

  /*
   * One featured project gets the full width; the rest keep the owner's order.
   * If nothing is marked featured the grid simply starts, rather than the
   * first row being promoted on the owner's behalf.
   */
  const featured = read.projects.find((project) => project.featured) ?? null;
  const rest = featured ? read.projects.filter((project) => project.id !== featured.id) : read.projects;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-600 dark:text-gray-300">
          Explore some of our work, projects and collaborations.
        </p>
        {isOwner && (
          <Link
            to={manageHref}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Manage {label.toLowerCase()} <ArrowRight size={13} aria-hidden />
          </Link>
        )}
      </div>

      {featured && (
        <div className="mb-4">
          <ProjectCard project={featured} featured />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
