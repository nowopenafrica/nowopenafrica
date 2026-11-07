/*
  # Saved design projects

  AUDITED 2026-10-14, before choosing anything:

  - 47 templates x 11 styles already exist as STRUCTURED slot documents —
    each slot carries a role, normalised x/y/w, size, weight, tracking and
    motion. They are not flattened pictures.
  - `TemplateSurface` renders them as absolutely positioned DOM. Not canvas,
    not SVG. 532 lines, and no canvas library anywhere in package.json.
  - `TemplateCustomiser` edits content, style, format, media, logo and
    overlay, and exports through html-to-image / jsPDF.
  - It persists NOTHING. There is no design, project, studio or template
    table in the database. Close the tab and the work is gone.

  So the editable document model largely exists and the thing missing under
  it is storage. This table is that floor.

  ## Why the document is JSONB and versioned

  The editor will grow object types (groups, vectors, multiple pages) and a
  rigid column-per-property schema would need a migration for each. The
  document is therefore one JSONB blob with an explicit `schema_version`, so
  a reader can upgrade an older document instead of failing on it.

  ## Why `version` exists separately

  Autosave plus a second tab is how work disappears. `version` is an
  optimistic-concurrency counter: a write that carries a stale version is
  rejected rather than silently overwriting the newer document.

  ## What is NOT stored here

  Image binaries. The document holds asset REFERENCES; the bytes live in
  storage. A project that embeds base64 images grows without limit, breaks
  autosave and makes version history unaffordable.
*/

create table if not exists public.design_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  /* Optional: a project can belong to one of the owner's businesses. */
  business_id uuid references public.businesses(id) on delete set null,

  title text not null default 'Untitled design',
  /* The template this began from, when it began from one. Provenance, not a link. */
  source_template_key text,

  /*
   * The editable document. Shape is owned by src/lib/studio/designDocument.ts
   * and validated there before any write.
   */
  document jsonb not null,
  schema_version integer not null default 1,

  /* Optimistic concurrency. Bumped by the writer; a stale write is refused. */
  version integer not null default 1,

  /* A small PNG for the project list, so opening the list does not render 50 documents. */
  thumbnail_path text,

  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists design_projects_owner_idx
  on public.design_projects (user_id, updated_at desc)
  where archived_at is null;

create index if not exists design_projects_business_idx
  on public.design_projects (business_id)
  where business_id is not null;

/*
  A document must be an object. A JSON array or a bare string here would pass
  `jsonb` and fail every reader.
*/
alter table public.design_projects
  drop constraint if exists design_projects_document_is_object;
alter table public.design_projects
  add constraint design_projects_document_is_object
  check (jsonb_typeof(document) = 'object');

alter table public.design_projects enable row level security;

/*
  Owner-only, on every operation.

  A design in progress is private work: an unpublished campaign, a price list
  that is not live yet, a logo nobody has seen. There is no public read here
  and no "shared with me" — collaboration is not built, so the data model
  stays closed rather than pretending.
*/
drop policy if exists "Owners read their design projects" on public.design_projects;
create policy "Owners read their design projects" on public.design_projects
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Owners create their design projects" on public.design_projects;
create policy "Owners create their design projects" on public.design_projects
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Owners update their design projects" on public.design_projects;
create policy "Owners update their design projects" on public.design_projects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Owners delete their design projects" on public.design_projects;
create policy "Owners delete their design projects" on public.design_projects
  for delete to authenticated using (user_id = (select auth.uid()));

comment on table public.design_projects is
  'Saved Creative Studio documents. Owner-only; the document is structured objects, never a flattened image.';

/*
  Save with a version check, in one statement.

  A read-then-write from the client cannot be made safe: two autosaves race
  and the slower one wins with older content. This refuses a stale write and
  tells the caller, so the editor can reload rather than lose the other tab's
  work.

  Returns the new version, or NULL when the write was refused.
*/
create or replace function public.save_design_project(
  p_id uuid,
  p_document jsonb,
  p_expected_version integer,
  p_title text default null,
  p_thumbnail_path text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare v_new integer;
begin
  if jsonb_typeof(p_document) <> 'object' then
    raise exception 'document must be a JSON object';
  end if;

  update public.design_projects
     set document = p_document,
         title = coalesce(nullif(btrim(p_title), ''), title),
         thumbnail_path = coalesce(p_thumbnail_path, thumbnail_path),
         version = version + 1,
         updated_at = now()
   where id = p_id
     /* RLS already restricts this to the owner; the predicate is the
        concurrency check, not the authorisation. */
     and version = p_expected_version
  returning version into v_new;

  return v_new;
end;
$$;

comment on function public.save_design_project is
  'Saves a design document only if the caller holds the current version. Returns the new version, or NULL when a newer save already landed.';

revoke all on function public.save_design_project(uuid, jsonb, integer, text, text) from public, anon;
grant execute on function public.save_design_project(uuid, jsonb, integer, text, text) to authenticated;
