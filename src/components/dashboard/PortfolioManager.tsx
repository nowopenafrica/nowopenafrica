import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowDown, ArrowUp, Copy, Eye, EyeOff, Loader2, Pencil, Plus, Star, Trash2,
} from 'lucide-react';

import ConfirmDialog from '../ConfirmDialog';
import SmartImg from '../SmartImg';
import ProjectEditor from './portfolio/ProjectEditor';
import { supabase } from '../../lib/supabase';
import {
  fetchOwnProjects, projectMeta,
  sortProjects, type BusinessProject,
} from '../../lib/businessProjects';
import { newId, projectCover, projectHref, projectSlug } from '../../lib/projectStory';

type Filter = 'all' | 'published' | 'draft' | 'featured';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
  { id: 'featured', label: 'Featured' },
];

/**
 * The owner's side of the Portfolio / Projects tab.
 *
 * ── WHY ITS OWN COMPONENT ────────────────────────────────────────────────
 *
 * `BusinessContentManager` is 1,400+ lines with one `fetchAll` covering six
 * tables. Adding a seventh table, a story editor and a delete flow inline would
 * make the biggest file in the dashboard bigger and this feature harder to
 * test. It loads its own rows and owns its own writes.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────
 *
 * There is no invented view counter and no rating. Project-view telemetry does
 * not exist, and a number that is not recorded is a number that would have to
 * be made up. Results an owner enters are shown on the public page labelled as
 * reported by them.
 */
export default function PortfolioManager({
  businessId,
  businessName,
  label,
}: {
  businessId: string;
  businessName: string;
  /** "Portfolio" or "Projects", decided by trade. */
  label: string;
}) {
  const [rows, setRows] = useState<BusinessProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ project: BusinessProject | null; preview: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BusinessProject | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const read = await fetchOwnProjects(businessId);
    if (read.state === 'unavailable') {
      setLoadError(read.reason);
      setRows([]);
    } else {
      setLoadError(null);
      setRows(read.projects);
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const ordered = useMemo(() => sortProjects(rows), [rows]);

  const counts = useMemo(() => ({
    all: ordered.length,
    published: ordered.filter((project) => project.published).length,
    draft: ordered.filter((project) => !project.published).length,
    featured: ordered.filter((project) => project.featured).length,
  }), [ordered]);

  const visible = useMemo(() => ordered.filter((project) => {
    if (filter === 'published') return project.published;
    if (filter === 'draft') return !project.published;
    if (filter === 'featured') return project.featured;
    return true;
  }), [ordered, filter]);

  const nextPosition = ordered.length
    ? Math.max(...ordered.map((project) => project.position)) + 1
    : 0;

  const onSaved = (saved: BusinessProject, message: string) => {
    setRows((current) => sortProjects(
      current.some((project) => project.id === saved.id)
        ? current.map((project) => (project.id === saved.id ? saved : project))
        : [...current, saved],
    ));
    toast.success(message);
  };

  const togglePublished = async (project: BusinessProject) => {
    setBusyId(project.id);
    const { error } = await supabase
      .from('business_projects')
      .update({ published: !project.published, updated_at: new Date().toISOString() })
      .eq('id', project.id)
      .eq('business_id', businessId);
    setBusyId(null);
    if (error) {
      toast.error(`Could not change that: ${error.message}`);
      return;
    }
    toast.success(project.published ? 'Moved to drafts — it is no longer public.' : 'Published.');
    void load();
  };

  const toggleFeatured = async (project: BusinessProject) => {
    setBusyId(project.id);
    const { error } = await supabase
      .from('business_projects')
      .update({ featured: !project.featured, updated_at: new Date().toISOString() })
      .eq('id', project.id)
      .eq('business_id', businessId);
    setBusyId(null);
    if (error) {
      toast.error(`Could not change that: ${error.message}`);
      return;
    }
    void load();
  };

  const move = async (project: BusinessProject, delta: number) => {
    const index = ordered.findIndex((item) => item.id === project.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;

    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];

    // Only rows whose position actually changed are written. A swapped pair is
    // two updates; a list full of tied positions normalises in one pass.
    const updates = next
      .map((item, position) => ({ id: item.id, position, previous: item.position }))
      .filter((item) => item.position !== item.previous);

    setReordering(true);
    const results = await Promise.all(updates.map((item) => supabase
      .from('business_projects')
      .update({ position: item.position })
      .eq('id', item.id)
      .eq('business_id', businessId)));
    setReordering(false);

    const failed = results.find((result) => result.error);
    if (failed?.error) {
      toast.error(`Could not reorder: ${failed.error.message}`);
      void load();
      return;
    }
    setRows(next);
  };

  const duplicate = async (project: BusinessProject) => {
    setBusyId(project.id);
    const id = newId();
    const title = `${project.title} (copy)`.slice(0, 120);
    const row = {
      id,
      business_id: businessId,
      title,
      summary: project.summary,
      client: project.client,
      location: project.location,
      completed_on: project.completed_on,
      cover_url: project.cover_url,
      cover_video_url: project.cover_video_url,
      category: project.category,
      images: project.images,
      link_url: project.link_url,
      tags: project.tags,
      position: nextPosition,
      published: false,
      featured: false,
      sections: project.sections,
      details: project.details,
      results: project.results,
      seo_title: project.seo_title,
      seo_description: project.seo_description,
      slug: projectSlug(title, id),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('business_projects').insert([row]);
    setBusyId(null);
    if (error) {
      toast.error(`Could not duplicate that: ${error.message}`);
      return;
    }
    toast.success('Copied as a draft. Change the title and publish when it is ready.');
    void load();
  };

  const remove = async (project: BusinessProject) => {
    setBusyId(project.id);
    const { error } = await supabase
      .from('business_projects')
      .delete()
      .eq('id', project.id)
      .eq('business_id', businessId);
    setBusyId(null);
    setConfirmDelete(null);
    if (error) {
      toast.error(`Could not remove that: ${error.message}`);
      return;
    }
    toast.success('Removed.');
    void load();
  };

  const copyLink = async (project: BusinessProject) => {
    const link = `${window.location.origin}${projectHref(project)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(project.published
        ? 'Project link copied.'
        : 'Draft link copied — it works once the project is published.');
    } catch {
      toast.error('Could not copy the link. You can select it in the editor instead.');
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        <Loader2 className="mx-auto animate-spin" size={18} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-gray-200 p-6 text-center dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-300">{loadError}</p>
        {!loadError.toLowerCase().includes('switched on') && (
          <button onClick={() => void load()} className="mt-2 text-xs font-semibold text-blue-700 hover:underline">
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Work you have finished. Each project gets its own page you can share.
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {counts.published} published · {counts.draft} draft{counts.draft === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ project: null, preview: false })}
          className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-bold text-white dark:bg-white dark:text-gray-900"
        >
          <Plus size={14} /> New project
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter projects">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`inline-flex min-h-[32px] items-center gap-1 rounded-full px-3 text-[11px] font-semibold ${
              filter === item.id
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'border border-gray-300 text-gray-600 hover:bg-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            {item.label}
            <span className={filter === item.id ? 'text-white/70 dark:text-gray-500' : 'text-gray-400'}>
              {counts[item.id]}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500 dark:border-gray-700">
          {ordered.length === 0
            ? `Nothing here yet. Add your first project and it appears on your profile under ${label}.`
            : `No ${filter === 'all' ? '' : `${filter} `}projects.`}
        </p>
      )}

      <ul className="space-y-2">
        {visible.map((project) => {
          const cover = projectCover(project);
          const isBusy = busyId === project.id;
          const orderIndex = ordered.findIndex((item) => item.id === project.id);

          return (
            <li
              key={project.id}
              className="rounded-xl border border-gray-200 p-2.5 dark:border-gray-700"
            >
              <div className="flex items-start gap-2.5">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                  {cover ? (
                    <SmartImg src={cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[10px] text-gray-400">No cover</div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{project.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-gray-500">
                    {[project.category, projectMeta(project)].filter(Boolean).join(' · ') || 'No details yet'}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {project.published ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        Published
                      </span>
                    ) : (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        Draft
                      </span>
                    )}
                    {project.featured && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        <Star size={9} fill="currentColor" /> Featured
                      </span>
                    )}
                    {project.sections.length > 0 && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {project.sections.length} story block{project.sections.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>

                {isBusy && <Loader2 size={14} className="mt-1 shrink-0 animate-spin text-gray-400" />}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-0.5 border-t border-gray-100 pt-1.5 dark:border-gray-800">
                <IconButton label="Move up" onClick={() => void move(project, -1)} disabled={reordering || orderIndex <= 0}>
                  <ArrowUp size={14} />
                </IconButton>
                <IconButton label="Move down" onClick={() => void move(project, 1)} disabled={reordering || orderIndex >= ordered.length - 1}>
                  <ArrowDown size={14} />
                </IconButton>
                <IconButton label="Edit" onClick={() => setEditing({ project, preview: false })}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton label="Preview" onClick={() => setEditing({ project, preview: true })}>
                  <Eye size={14} />
                </IconButton>
                <IconButton label="Copy public link" onClick={() => void copyLink(project)}>
                  <Copy size={14} />
                </IconButton>
                <IconButton
                  label={project.featured ? 'Remove from featured' : 'Feature this project'}
                  onClick={() => void toggleFeatured(project)}
                  active={project.featured}
                >
                  <Star size={14} fill={project.featured ? 'currentColor' : 'none'} />
                </IconButton>
                <IconButton
                  label={project.published ? 'Unpublish' : 'Publish'}
                  onClick={() => void togglePublished(project)}
                >
                  {project.published ? <EyeOff size={14} /> : <Eye size={14} />}
                </IconButton>
                <IconButton label="Duplicate" onClick={() => void duplicate(project)}>
                  <Copy size={14} className="rotate-90" />
                </IconButton>
                <IconButton label="Delete" danger onClick={() => setConfirmDelete(project)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>

      {editing && (
        <ProjectEditor
          key={editing.project?.id ?? 'new'}
          project={editing.project}
          businessId={businessId}
          businessName={businessName}
          label={label}
          nextPosition={nextPosition}
          startInPreview={editing.preview}
          onSaved={onSaved}
          onClose={() => setEditing(null)}
        />
      )}

      {/* The product's own rule: a confirm dialog, never window.confirm. */}
      {confirmDelete && (
        <ConfirmDialog
          open
          title={`Remove “${confirmDelete.title}”?`}
          message="Its page and story will be removed. This cannot be undone."
          confirmLabel="Remove"
          tone="danger"
          onConfirm={() => void remove(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function IconButton({
  label, onClick, disabled = false, danger = false, active = false, children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`grid h-8 w-8 place-items-center rounded-lg disabled:opacity-30 ${
        danger
          ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950'
          : active
            ? 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40'
            : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  );
}
