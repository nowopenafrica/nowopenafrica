/*
  # Where a cover photo or video sits in its frame

  The cover frame is `h-36 sm:h-72 md:h-96` at full width, so its aspect ratio
  changes with the viewport, and the same picture is cropped again as a
  directory card. An owner who uploads a photo of their shopfront currently
  gets whatever the middle of it happens to be -- often a doorway, sometimes
  a face cut in half.

  ## Why two integers and not an object-position string

  This value is composed into a style attribute. Storing CSS as free text
  would put owner-controlled content directly into a stylesheet; storing two
  bounded integers makes that impossible, and the CHECK means a bad row cannot
  exist in the first place rather than being defended against at render time.

  ## Why NULL rather than a default of 50

  NULL means "nobody has positioned this", which is a different fact from
  "somebody chose the centre", and only the first should be re-centred
  automatically if the cover is ever replaced. The renderer treats NULL as
  centre, which is exactly what every existing cover already does -- so this
  migration changes nothing visible until an owner drags something.
*/

alter table public.businesses
  add column if not exists cover_focal_x smallint,
  add column if not exists cover_focal_y smallint;

alter table public.businesses
  drop constraint if exists businesses_cover_focal_range;
alter table public.businesses
  add constraint businesses_cover_focal_range
  check (
    (cover_focal_x is null or cover_focal_x between 0 and 100)
    and (cover_focal_y is null or cover_focal_y between 0 and 100)
  );

comment on column public.businesses.cover_focal_x is
  'Percent across the cover that must stay visible, 0-100. NULL means nobody has positioned it; the renderer centres.';
comment on column public.businesses.cover_focal_y is
  'Percent down the cover that must stay visible, 0-100. NULL means nobody has positioned it; the renderer centres.';
