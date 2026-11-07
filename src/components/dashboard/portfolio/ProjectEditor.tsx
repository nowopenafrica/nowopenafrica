import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowDown, ArrowUp, Check, Copy, Eye, Image as ImageIcon, Loader2, Monitor, Plus,
  Smartphone, Trash2, Upload, X,
} from 'lucide-react';

import ConfirmDialog from '../../ConfirmDialog';
import SmartImg from '../../SmartImg';
import ProjectStoryView from '../../business/ProjectStoryView';
import SectionEditor, { LabelledRows } from './SectionEditor';
import { MediaListField } from './MediaField';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import {
  EMPTY_DETAILS, SECTION_TYPES, emptySection, newId, normalizeDetails, normalizeMediaList,
  normalizeResults, normalizeSections, projectSlug, safeUrl, slugify, type ProjectDetails,
  type ProjectMedia, type ProjectResult, type ProjectSection, type ProjectSectionType,
} from '../../../lib/projectStory';
import {
  toProject, type BusinessProject,
} from '../../../lib/businessProjects';
import { uploadProjectMedia } from '../../../lib/projectMediaUpload';

const fieldClass =
  'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white';
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
const cardClass = 'rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900';

interface ProjectDraft {
  title: string;
  summary: string;
  category: string;
  client: string;
  location: string;
  completedOn: string;
  coverUrl: string;
  coverVideoUrl: string;
  linkUrl: string;
  tags: string;
  featured: boolean;
  published: boolean;
  images: ProjectMedia[];
  sections: ProjectSection[];
  details: ProjectDetails;
  results: ProjectResult[];
  seoTitle: string;
  seoDescription: string;
  slug: string;
}

const draftFrom = (project: BusinessProject | null): ProjectDraft => ({
  title: project?.title ?? '',
  summary: project?.summary ?? '',
  category: project?.category ?? '',
  client: project?.client ?? '',
  location: project?.location ?? '',
  completedOn: project?.completed_on ?? '',
  coverUrl: project?.cover_url ?? '',
  coverVideoUrl: project?.cover_video_url ?? '',
  linkUrl: project?.link_url ?? '',
  tags: (project?.tags ?? []).join(', '),
  featured: project?.featured ?? false,
  published: project?.published ?? false,
  images: project?.images ?? [],
  sections: project?.sections ?? [],
  details: project?.details ?? EMPTY_DETAILS,
  results: project?.results ?? [],
  seoTitle: project?.seo_title ?? '',
  seoDescription: project?.seo_description ?? '',
  slug: project?.slug ?? '',
});

const tagsOf = (value: string): string[] =>
  value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8);

export default function ProjectEditor({
  project,
  businessId,
  businessName,
  label,
  nextPosition,
  onClose,
  onSaved,
  startInPreview = false,
}: {
  project: BusinessProject | null;
  businessId: string;
  businessName: string;
  label: string;
  nextPosition: number;
  onClose: () => void;
  onSaved: (project: BusinessProject, message: string) => void;
  startInPreview?: boolean;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<ProjectDraft>(() => draftFrom(project));
  const [baseline, setBaseline] = useState(() => JSON.stringify(draftFrom(project)));
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [preview, setPreview] = useState<'desktop' | 'mobile' | null>(startInPreview ? 'desktop' : null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [sectionToAdd, setSectionToAdd] = useState<ProjectSectionType>('text');
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const coverVideoInput = useRef<HTMLInputElement>(null);

  const dirty = useMemo(() => JSON.stringify(form) !== baseline, [form, baseline]);

  const set = <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const close = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const uploadCover = async (file: File | undefined, video = false) => {
    if (!file || !user) return;
    setUploadingCover(true);
    try {
      const uploaded = await uploadProjectMedia(file, user.id);
      if (video) set('coverVideoUrl', uploaded.url);
      else set('coverUrl', uploaded.url);
      toast.success(video ? 'Cover video uploaded.' : 'Cover image uploaded.');
    } catch (error) {
      toast.error((error as Error).message || 'Upload failed.');
    } finally {
      setUploadingCover(false);
      if (coverInput.current) coverInput.current.value = '';
      if (coverVideoInput.current) coverVideoInput.current.value = '';
    }
  };

  /**
   * The row that will be written.
   *
   * Every value goes through the same normalisers the public renderer uses, so
   * the editor cannot save something the page would then quietly drop.
   */
  const buildRow = (published: boolean) => {
    const id = project?.id ?? newId();
    const requestedSlug = slugify(form.slug);
    const slug = project?.slug || requestedSlug || projectSlug(form.title, id);
    const images = normalizeMediaList(form.images);
    const cover = safeUrl(form.coverUrl);

    const row: Record<string, unknown> = {
      id,
      business_id: businessId,
      title: form.title.trim().slice(0, 120),
      summary: form.summary.trim().slice(0, 1000) || null,
      client: form.client.trim().slice(0, 120) || null,
      location: form.location.trim().slice(0, 120) || null,
      completed_on: form.completedOn || null,
      cover_url: cover || images[0]?.url || null,
      cover_video_url: safeUrl(form.coverVideoUrl),
      category: form.category.trim().slice(0, 60) || null,
      images,
      link_url: safeUrl(form.linkUrl),
      tags: tagsOf(form.tags),
      position: project?.position ?? nextPosition,
      published,
      featured: form.featured,
      sections: normalizeSections(form.sections),
      details: normalizeDetails(form.details),
      results: normalizeResults(form.results),
      seo_title: form.seoTitle.trim().slice(0, 120) || null,
      seo_description: form.seoDescription.trim().slice(0, 300) || null,
      slug,
      updated_at: new Date().toISOString(),
    };

    return { row, slug };
  };

  const persist = async (published: boolean) => {
    if (!form.title.trim()) {
      toast.error('Give the project a title first.');
      return;
    }

    setSaving(published ? 'publish' : 'draft');
    const { row, slug } = buildRow(published);

    const { error } = project
      ? await supabase.from('business_projects').update(row).eq('id', project.id)
      : await supabase.from('business_projects').insert([row]);

    setSaving(null);

    if (error) {
      if (error.code === '23505') {
        toast.error('That public link is already in use. Try a different one.');
      } else if (error.code === '42703' || error.code === 'PGRST204') {
        toast.error('Project stories need a database update first. The rest of your work is safe.');
      } else {
        toast.error(`Could not save: ${error.message}`);
      }
      return;
    }

    const nextForm = { ...form, slug, published };
    setForm(nextForm);
    setBaseline(JSON.stringify(nextForm));
    setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    onSaved(toProject(row), published ? 'Project published.' : 'Draft saved.');
  };

  /*
   * Built on demand inside the preview overlay rather than memoised above it.
   * The overlay is the only consumer, so the normalisation only runs while
   * somebody is actually looking at it — and it cannot go stale against the
   * form because it is derived on the same render that draws it.
   */
  const previewProject = preview ? toProject(buildRow(form.published).row) : null;

  const moveSection = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= form.sections.length) return;
    const next = [...form.sections];
    [next[index], next[target]] = [next[target], next[index]];
    set('sections', next);
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] overflow-y-auto bg-gray-100 dark:bg-gray-950">
        {/* ── Editor header ───────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
                {project ? 'Edit project' : `New ${label.toLowerCase().replace(/s$/, '')}`}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                {form.published ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <Check size={11} /> Published
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                    <Eye size={11} /> Draft — only you can see it
                  </span>
                )}
                {dirty && <span className="text-gray-400">· Unsaved changes</span>}
                {!dirty && savedAt && <span className="text-gray-400">· Saved {savedAt}</span>}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPreview('desktop')}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Monitor size={13} /> Preview
              </button>
              <button
                type="button"
                onClick={() => void persist(false)}
                disabled={saving !== null}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {saving === 'draft' ? <Loader2 size={13} className="animate-spin" /> : null}
                Save draft
              </button>
              <button
                type="button"
                onClick={() => void persist(true)}
                disabled={saving !== null}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-[11px] font-bold text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                {saving === 'publish' ? <Loader2 size={13} className="animate-spin" /> : null}
                {form.published ? 'Update' : 'Publish'}
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Close editor"
                className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-6xl gap-4 px-3 py-4 sm:px-5 lg:grid-cols-[1fr_320px]">
          {/* ── Main column ──────────────────────────────────────────── */}
          <div className="space-y-4">
            <section className={cardClass}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                Basic information
              </h2>
              <div className="space-y-2.5">
                <div>
                  <label className={labelClass} htmlFor="project-title">Project title</label>
                  <input
                    id="project-title"
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    placeholder="e.g. Kalahari Spring Campaign"
                    className={fieldClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="project-summary">Short description</label>
                  <textarea
                    id="project-summary"
                    value={form.summary}
                    onChange={(e) => set('summary', e.target.value)}
                    placeholder="One or two sentences a customer reads under the title."
                    rows={2}
                    className={fieldClass}
                  />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="project-category">Category</label>
                    <input
                      id="project-category"
                      value={form.category}
                      onChange={(e) => set('category', e.target.value)}
                      placeholder="e.g. Branding, Interior, Wedding"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="project-client">Client or brand</label>
                    <input
                      id="project-client"
                      value={form.client}
                      onChange={(e) => set('client', e.target.value)}
                      placeholder="Optional"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="project-location">Location</label>
                    <input
                      id="project-location"
                      value={form.location}
                      onChange={(e) => set('location', e.target.value)}
                      placeholder="e.g. Lagos, Nigeria"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="project-year">Year completed</label>
                    <input
                      id="project-year"
                      type="date"
                      value={form.completedOn}
                      onChange={(e) => set('completedOn', e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass} htmlFor="project-tags">Tags</label>
                  <input
                    id="project-tags"
                    value={form.tags}
                    onChange={(e) => set('tags', e.target.value)}
                    placeholder="Comma separated, e.g. photography, editorial, Lagos"
                    className={fieldClass}
                  />
                </div>
              </div>
            </section>

            {/* ── Cover ──────────────────────────────────────────────── */}
            <section className={cardClass}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                Cover
              </h2>

              {form.coverUrl ? (
                <div className="mb-2 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
                  <SmartImg
                    src={form.coverUrl}
                    alt="Cover preview"
                    className="max-h-56 w-full object-cover"
                  />
                </div>
              ) : (
                <div className="mb-2 grid h-32 place-items-center rounded-xl border border-dashed border-gray-300 text-gray-400 dark:border-gray-700">
                  <ImageIcon size={24} aria-hidden />
                </div>
              )}

              <div className="space-y-2">
                <div className="flex gap-1.5">
                  <input
                    value={form.coverUrl}
                    onChange={(e) => set('coverUrl', e.target.value)}
                    placeholder="Cover image URL, or upload below"
                    aria-label="Cover image URL"
                    className={fieldClass}
                  />
                  <input
                    ref={coverInput}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void uploadCover(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => coverInput.current?.click()}
                    disabled={uploadingCover}
                    aria-label="Upload cover image"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {uploadingCover ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  </button>
                </div>

                <div>
                  <label className={labelClass} htmlFor="cover-video">Cover video (optional)</label>
                  <div className="flex gap-1.5">
                    <input
                      id="cover-video"
                      value={form.coverVideoUrl}
                      onChange={(e) => set('coverVideoUrl', e.target.value)}
                      placeholder="A direct .mp4/.webm URL, or upload"
                      className={fieldClass}
                    />
                    <input
                      ref={coverVideoInput}
                      type="file"
                      accept="video/*"
                      className="sr-only"
                      onChange={(e) => void uploadCover(e.target.files?.[0], true)}
                    />
                    <button
                      type="button"
                      onClick={() => coverVideoInput.current?.click()}
                      disabled={uploadingCover}
                      aria-label="Upload cover video"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      <Upload size={14} />
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">
                    A video cover plays on the project page. The image above becomes its poster.
                  </p>
                </div>

                {form.images.some((media) => media.url) && (
                  <div>
                    <p className={labelClass}>Or choose from your images</p>
                    <div className="flex flex-wrap gap-1.5">
                      {form.images.filter((media) => media.url).map((media, index) => (
                        <button
                          key={`${media.url}-${index}`}
                          type="button"
                          onClick={() => set('coverUrl', media.url)}
                          aria-label={`Use image ${index + 1} as the cover`}
                          className={`h-14 w-16 overflow-hidden rounded-lg border-2 ${form.coverUrl === media.url ? 'border-gray-900 dark:border-white' : 'border-transparent'}`}
                        >
                          <SmartImg src={media.url} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── Media ──────────────────────────────────────────────── */}
            <section className={cardClass}>
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                Project images
              </h2>
              <p className="mb-3 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                Upload the photographs, renders or screenshots that show the work. The first one
                is used as the cover if you have not chosen one.
              </p>
              <MediaBank images={form.images} onChange={(images) => set('images', images)} />
            </section>

            {/* ── Story ──────────────────────────────────────────────── */}
            <section className={cardClass}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                    The story
                  </h2>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    Add blocks in any order. There is no required template — tell it the way this
                    project actually happened.
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2.5">
                {form.sections.map((section, index) => (
                  <div key={section.id} className="rounded-xl border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-700 dark:bg-gray-950">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                        {SECTION_TYPES.find((type) => type.type === section.type)?.label ?? section.type}
                      </p>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveSection(index, -1)}
                          disabled={index === 0}
                          aria-label="Move section up"
                          className="grid h-7 w-7 place-items-center rounded-md text-gray-500 hover:bg-gray-200 disabled:opacity-30 dark:hover:bg-gray-800"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(index, 1)}
                          disabled={index === form.sections.length - 1}
                          aria-label="Move section down"
                          className="grid h-7 w-7 place-items-center rounded-md text-gray-500 hover:bg-gray-200 disabled:opacity-30 dark:hover:bg-gray-800"
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => set('sections', form.sections.filter((_, i) => i !== index))}
                          aria-label="Remove section"
                          className="grid h-7 w-7 place-items-center rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <SectionEditor
                      section={section}
                      onChange={(next) => set('sections', form.sections.map((item, i) => (i === index ? next : item)))}
                    />
                  </div>
                ))}

                {form.sections.length === 0 && (
                  <p className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-[11px] text-gray-500 dark:border-gray-700">
                    No story blocks yet. Start with a paragraph, an image, or the results.
                  </p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <label className={labelClass} htmlFor="section-type">Add a section</label>
                  <select
                    id="section-type"
                    value={sectionToAdd}
                    onChange={(e) => setSectionToAdd(e.target.value as ProjectSectionType)}
                    className={fieldClass}
                  >
                    {SECTION_TYPES.map((type) => (
                      <option key={type.type} value={type.type}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => set('sections', [...form.sections, emptySection(sectionToAdd)])}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-xs font-bold text-white dark:bg-white dark:text-gray-900"
                >
                  <Plus size={13} /> Add
                </button>
              </div>
            </section>
          </div>

          {/* ── Side column ──────────────────────────────────────────── */}
          <div className="space-y-4">
            <section className={cardClass}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                Publishing
              </h2>
              <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => set('featured', e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Feature this project
                  <span className="block text-[11px] text-gray-400">Shown first, full width, on your profile.</span>
                </span>
              </label>

              <div className="mt-3 space-y-1.5">
                <button
                  type="button"
                  onClick={() => void persist(false)}
                  disabled={saving !== null}
                  className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
                >
                  {saving === 'draft' && <Loader2 size={13} className="animate-spin" />}
                  Save as draft
                </button>
                <button
                  type="button"
                  onClick={() => void persist(true)}
                  disabled={saving !== null}
                  className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
                >
                  {saving === 'publish' && <Loader2 size={13} className="animate-spin" />}
                  {form.published ? 'Update published project' : 'Publish project'}
                </button>
                {form.published && (
                  <button
                    type="button"
                    onClick={() => void persist(false)}
                    disabled={saving !== null}
                    className="min-h-[32px] w-full rounded-lg text-[11px] font-semibold text-amber-700 hover:underline disabled:opacity-50 dark:text-amber-400"
                  >
                    Unpublish (save as draft)
                  </button>
                )}
              </div>

              {form.slug && (
                <p className="mt-3 break-all text-[11px] text-gray-400">
                  Public link: <span className="text-gray-600 dark:text-gray-300">/work/{form.slug}</span>
                </p>
              )}
            </section>

            <section className={cardClass}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                Search and sharing
              </h2>
              <div className="space-y-2">
                <div>
                  <label className={labelClass} htmlFor="project-slug">Public link</label>
                  <div className="flex items-center rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
                    <span className="pl-2.5 text-xs text-gray-400">/work/</span>
                    <input
                      id="project-slug"
                      value={form.slug}
                      onChange={(e) => set('slug', e.target.value)}
                      placeholder={form.title ? projectSlug(form.title, project?.id ?? 'abcdef') : 'project-link'}
                      className="min-w-0 flex-1 rounded-r-lg bg-transparent px-1 py-2 text-xs text-gray-900 focus:outline-none dark:text-white"
                    />
                    {project?.slug && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(`${window.location.origin}/work/${project.slug}`);
                          toast.success('Project link copied.');
                        }}
                        aria-label="Copy public link"
                        className="grid h-8 w-8 shrink-0 place-items-center text-gray-400 hover:text-gray-700"
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                  {!project?.slug && (
                    <p className="mt-1 text-[11px] text-gray-400">
                      Left blank, a link is made from the title and stays stable once saved.
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass} htmlFor="project-seo-title">Meta title</label>
                  <input
                    id="project-seo-title"
                    value={form.seoTitle}
                    onChange={(e) => set('seoTitle', e.target.value)}
                    placeholder={form.title || 'Defaults to the project title'}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="project-seo-description">Meta description</label>
                  <textarea
                    id="project-seo-description"
                    value={form.seoDescription}
                    onChange={(e) => set('seoDescription', e.target.value)}
                    placeholder="Defaults to the short description"
                    rows={2}
                    className={fieldClass}
                  />
                  <p className="mt-1 text-right text-[10px] text-gray-400">{form.seoDescription.length}/300</p>
                </div>
              </div>
            </section>

            <section className={cardClass}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                Project details
              </h2>
              <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
                Only the fields you fill in are shown.
              </p>
              <div className="space-y-2">
                <DetailField label="Industry" value={form.details.industry} onChange={(industry) => set('details', { ...form.details, industry })} />
                <DetailField label="Services provided" value={form.details.services} onChange={(services) => set('details', { ...form.details, services })} />
                <DetailField label="Duration" value={form.details.duration} onChange={(duration) => set('details', { ...form.details, duration })} />
                <DetailField label="Team or collaborators" value={form.details.team} onChange={(team) => set('details', { ...form.details, team })} />
                <DetailField label="Tools or technologies" value={form.details.tools} onChange={(tools) => set('details', { ...form.details, tools })} />
                <DetailField label="Project URL" value={form.details.projectUrl} onChange={(projectUrl) => set('details', { ...form.details, projectUrl })} placeholder="https://…" />
                <div>
                  <label className={labelClass} htmlFor="project-link">Link to see it</label>
                  <input
                    id="project-link"
                    value={form.linkUrl}
                    onChange={(e) => set('linkUrl', e.target.value)}
                    placeholder="https://…"
                    className={fieldClass}
                  />
                </div>
              </div>
            </section>

            <section className={cardClass}>
              <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                Results
              </h2>
              <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
                Outcomes you can state — reach, sales, delivery. NowOpen shows them labelled as
                reported by you.
              </p>
              <LabelledRows
                items={form.results}
                valueLabel="Outcome"
                onChange={(results) => set('results', results)}
              />
            </section>
          </div>
        </div>
      </div>

      {/* ── Live preview ─────────────────────────────────────────────── */}
      {preview && previewProject && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-gray-900/95">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-white">
            <p className="text-xs font-semibold">Preview — {form.published ? 'published' : 'draft'}</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPreview('desktop')}
                aria-pressed={preview === 'desktop'}
                className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold ${preview === 'desktop' ? 'bg-white text-gray-900' : 'text-white/80 hover:bg-white/10'}`}
              >
                <Monitor size={13} /> Desktop
              </button>
              <button
                type="button"
                onClick={() => setPreview('mobile')}
                aria-pressed={preview === 'mobile'}
                className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold ${preview === 'mobile' ? 'bg-white text-gray-900' : 'text-white/80 hover:bg-white/10'}`}
              >
                <Smartphone size={13} /> Mobile
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Close preview"
                className="grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
            <div className={`mx-auto overflow-hidden bg-white shadow-2xl ${preview === 'mobile' ? 'w-full max-w-[390px] rounded-[22px]' : 'w-full max-w-5xl rounded-xl'}`}>
              <ProjectStoryView
                project={previewProject}
                businessName={businessName}
                related={[]}
                onEnquire={() => toast('This button opens the real enquiry form once the project is published.')}
                preview
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved changes?"
        message="You have changes that have not been saved. Closing now will lose them."
        confirmLabel="Discard"
        tone="danger"
        onConfirm={() => { setConfirmDiscard(false); onClose(); }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}

/* ── Small fields ───────────────────────────────────────────────────────── */

function DetailField({
  label, value, onChange, placeholder = 'Optional',
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
}) {
  const id = `detail-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div>
      <label className={labelClass} htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={placeholder}
        className={fieldClass}
      />
    </div>
  );
}

function MediaBank({
  images, onChange,
}: {
  images: ProjectMedia[];
  onChange: (images: ProjectMedia[]) => void;
}) {
  return (
    <MediaListField
      images={images}
      onChange={onChange}
      addLabel="Upload images"
      emptyLabel="No images yet. Add a few and the first becomes the cover."
    />
  );
}
