/*
  # design_projects.kind — one project envelope, one document type per editor

  Phase A of docs/superpowers/specs/2026-11-18-create-multi-studio-architecture.md.

  Create is growing editors beyond the Design Editor (Video Studio next). Each
  editor owns its own document shape; this table already provides what every
  editor needs and what was hard to get right: owner-only RLS, optimistic
  concurrency (`version` + save_design_project), autosave rules and a
  thumbnail. So the table gains a `kind` saying WHICH editor's document the
  row holds, rather than a second table forking all of that.

  ## Safe for existing rows

  Every existing row is a Design Editor document. The default makes each one
  `kind = 'design'` with no rewrite of `document`, so the Design Editor reads
  exactly what it read before.

  ## Why the kind is fixed after insert

  A document is only readable by the editor that wrote it. Re-labelling a
  design row as 'video' would hand a design document to the video reader
  (which refuses it) and, worse, let the next save write a video document
  over a design. Changing what a project IS means creating a new project,
  so an UPDATE that changes kind is refused.

  ## Allowed values

  Only editors that exist or are being built now. Adding one later is a
  one-line change to the check; listing speculative studios here would let
  rows exist that nothing can open.
*/

alter table public.design_projects
  add column if not exists kind text not null default 'design';

alter table public.design_projects
  drop constraint if exists design_projects_kind_check;
alter table public.design_projects
  add constraint design_projects_kind_check check (kind in ('design', 'video'));

comment on column public.design_projects.kind is
  'Which editor owns `document`: design (lib/studio/designDocument.ts) or video. Fixed after insert.';

/* Project lists filter by kind for one owner, newest first. */
create index if not exists design_projects_owner_kind_idx
  on public.design_projects (user_id, kind, updated_at desc)
  where archived_at is null;

create or replace function public.design_projects_kind_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'A project''s kind cannot change (% -> %). Create a new project instead.', old.kind, new.kind
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists design_projects_kind_fixed on public.design_projects;
create trigger design_projects_kind_fixed
  before update of kind on public.design_projects
  for each row execute function public.design_projects_kind_fixed();
