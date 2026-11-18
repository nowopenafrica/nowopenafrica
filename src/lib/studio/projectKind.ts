/**
 * Which editor owns a saved project.
 *
 * `design_projects` is the one envelope for every Create editor (owner-only
 * RLS, version-checked saves, autosave, thumbnail). Its `kind` column says
 * whose document the row holds; each editor owns its own document shape and
 * reader. See docs/superpowers/specs/2026-11-18-create-multi-studio-architecture.md.
 *
 * Keep this list identical to the check constraint in
 * supabase/migrations/20261118040000_design_projects_kind.sql.
 */

export type ProjectKind = 'design' | 'video';

export const PROJECT_KINDS: readonly ProjectKind[] = ['design', 'video'];

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  design: 'Design',
  video: 'Video',
};

/** The editor that can open each kind, and whether it exists in this build yet. */
const EDITORS: Record<ProjectKind, { base: string; available: boolean; name: string }> = {
  design: { base: '/media/studio', available: true, name: 'the Design Editor' },
  video: { base: '/media/video', available: true, name: 'Video Studio' },
};

/**
 * A kind read from the database. An unknown value is refused, never mapped to
 * 'design': handing a document to the wrong reader is how the next save
 * writes one editor's document over another's.
 */
export function readProjectKind(raw: unknown): ProjectKind | null {
  return typeof raw === 'string' && (PROJECT_KINDS as readonly string[]).includes(raw) ? (raw as ProjectKind) : null;
}

export function editorPathFor(kind: ProjectKind, id: string): string {
  return `${EDITORS[kind].base}/${encodeURIComponent(id)}`;
}

export function editorAvailable(kind: ProjectKind): boolean {
  return EDITORS[kind].available;
}

/**
 * What an editor should do with a row it was asked to open.
 *
 * - `open`: the row is this editor's own.
 * - `redirect`: another editor owns it and that editor exists — go there.
 * - `refuse`: nothing in this build can open it; say so plainly instead of
 *   rendering a document this editor cannot read.
 */
export type OpenDecision =
  | { action: 'open' }
  | { action: 'redirect'; path: string }
  | { action: 'refuse'; reason: string };

export function decideOpen(editor: ProjectKind, rawKind: unknown, id: string): OpenDecision {
  const kind = readProjectKind(rawKind);
  if (!kind) return { action: 'refuse', reason: 'This project was made by a newer version of NowOpen Create. Reload the page to update.' };
  if (kind === editor) return { action: 'open' };
  if (editorAvailable(kind)) return { action: 'redirect', path: editorPathFor(kind, id) };
  return { action: 'refuse', reason: `This is a ${PROJECT_KIND_LABELS[kind].toLowerCase()} project. It opens in ${EDITORS[kind].name}, which is not available yet.` };
}
