-- Approved suggestions may be published. Generated ones may never publish
-- themselves.
--
-- A CORRECTION TO 20260921010000
--
-- That migration excluded `suggested` from the public read entirely. Re-reading
-- the product rule, that is stricter than intended and it breaks the thing the
-- enrichment engine exists for: an unclaimed profile is allowed to show
-- "verified information, source-derived information, and clearly labelled
-- category suggestions". Blocking the third outright leaves an unclaimed
-- hospital with a name and a phone number, which is the problem being solved.
--
-- The gate belongs on PUBLICATION, not on the status:
--
--   * the engine writes `suggested` + `published = false` — invisible;
--   * an admin reviews and publishes — visible, and labelled as unconfirmed;
--   * the label is driven by the status, which never changes to pretend the
--     business confirmed something it did not.
--
-- So a published suggestion is visible AND still says it is a suggestion. That
-- is different from a published fact, and the page must keep saying so.
--
-- AND THE ENGINE IS NOW STOPPED IN THE DATABASE
--
-- "The engine never publishes" was a convention living in one TypeScript
-- function. Conventions survive until the first bug at 3am. The trigger below
-- refuses any INSERT of template-generated content that arrives already
-- published, whatever wrote it.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. PUBLICATION IS THE GATE
-- ═══════════════════════════════════════════════════════════════════════

/*
 * `pending_review`, `rejected` and `outdated` stay excluded whatever the
 * publish flag says — those are states where the content is known to be
 * unshowable, not merely unreviewed.
 */
drop policy if exists "Public can view business services" on public.business_services;
create policy "Public can view business services" on public.business_services
  for select to anon, authenticated
  using (published and content_status not in ('rejected', 'pending_review', 'outdated'));

drop policy if exists "Public can view business products" on public.business_products;
create policy "Public can view business products" on public.business_products
  for select to anon, authenticated
  using (published and content_status not in ('rejected', 'pending_review', 'outdated'));

drop policy if exists "Public can view due gallery items" on public.business_gallery;
create policy "Public can view due gallery items" on public.business_gallery
  for select to anon, authenticated
  using (
    (scheduled_for is null or scheduled_for <= now())
    and published
    and content_status not in ('rejected', 'pending_review', 'outdated')
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 2. GENERATED CONTENT CANNOT ARRIVE PUBLISHED
-- ═══════════════════════════════════════════════════════════════════════

/**
 * Refuse template-generated content that is already published.
 *
 * The engine writes `source_type = 'category_template'`. Nothing carrying that
 * marker may be inserted with `published = true`: a human has to make that a
 * separate, deliberate act afterwards. Enforced here rather than trusted to the
 * caller, because the caller is code and this is the rule that keeps invented
 * offerings off a real business's page.
 *
 * UPDATE is deliberately NOT blocked — publishing after review is exactly the
 * update this is protecting.
 */
create or replace function public.guard_generated_not_published()
returns trigger
language plpgsql
as $fn$
begin
  if NEW.source_type = 'category_template' and coalesce(NEW.published, false) then
    raise exception
      'Generated content cannot be created already published. Insert it unpublished and publish it after review.'
      using errcode = '42501';
  end if;

  -- A template suggestion is a suggestion. It may not claim the business said so.
  if NEW.source_type = 'category_template' and NEW.content_status = 'owner_confirmed' then
    raise exception
      'Template-generated content cannot claim to be owner-confirmed.'
      using errcode = '42501';
  end if;

  return NEW;
end;
$fn$;

drop trigger if exists business_services_generated_guard on public.business_services;
create trigger business_services_generated_guard
  before insert on public.business_services
  for each row execute function public.guard_generated_not_published();

drop trigger if exists business_products_generated_guard on public.business_products;
create trigger business_products_generated_guard
  before insert on public.business_products
  for each row execute function public.guard_generated_not_published();

drop trigger if exists business_gallery_generated_guard on public.business_gallery;
create trigger business_gallery_generated_guard
  before insert on public.business_gallery
  for each row execute function public.guard_generated_not_published();

-- ═══════════════════════════════════════════════════════════════════════
-- 3. REVIEW ACTIONS
-- ═══════════════════════════════════════════════════════════════════════

/**
 * Publish a reviewed suggestion.
 *
 * Records WHO and WHEN. The status is left alone on purpose: approving a
 * category suggestion means "worth showing", not "the business confirmed it",
 * and the public label is driven by that status. Changing it to
 * `owner_confirmed` here would be the platform putting words in the owner's
 * mouth on an admin's click.
 */
create or replace function public.publish_suggested_content(
  p_table text,
  p_ids   uuid[]
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_n integer;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if p_table not in ('business_services', 'business_products', 'business_gallery') then
    raise exception 'Unknown content table: %', p_table;
  end if;

  execute format($q$
    update public.%I
       set published = true,
           reviewed_at = now(),
           reviewed_by = auth.uid()
     where id = any($1)
       and content_status = 'suggested'
       and published = false
  $q$, p_table) using p_ids;

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

/**
 * Reject a suggestion.
 *
 * Marked, never deleted. "This was proposed and a human said no" is the record
 * that stops the next run proposing it again and calling it new.
 */
create or replace function public.reject_suggested_content(
  p_table text,
  p_ids   uuid[]
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_n integer;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if p_table not in ('business_services', 'business_products', 'business_gallery') then
    raise exception 'Unknown content table: %', p_table;
  end if;

  execute format($q$
    update public.%I
       set content_status = 'rejected',
           published = false,
           reviewed_at = now(),
           reviewed_by = auth.uid()
     where id = any($1)
       and content_status = 'suggested'
  $q$, p_table) using p_ids;

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

revoke all on function public.publish_suggested_content(text, uuid[]) from public;
grant execute on function public.publish_suggested_content(text, uuid[]) to authenticated;
revoke all on function public.reject_suggested_content(text, uuid[]) from public;
grant execute on function public.reject_suggested_content(text, uuid[]) to authenticated;

comment on function public.publish_suggested_content is
  'Publish reviewed suggestions. Leaves content_status as "suggested" on purpose — the public label depends on it, and an admin approving a template suggestion is not the business confirming it.';
