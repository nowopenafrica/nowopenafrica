/*
  # The canvas an uploaded template opens on

  `design_templates` classified a row by category, styles, industries and
  tags — everything the gallery filters on — and said nothing about SIZE.

  That gap is not cosmetic. The code templates carry a `format` on their
  deliverable (`src/lib/design/deliverables.ts`), and `TemplateCustomiser`
  reads it to decide the canvas, falling back to `instagram-post`. So an
  uploaded business card would have opened on a 1080x1080 square: a card in
  name only, and every export of it the wrong shape.

  One nullable column. Null keeps the existing fallback, which is the right
  answer for a template whose uploader did not say — a square is a guess,
  but a square that the product already makes everywhere.

  Not an enum and not a foreign key: the format list lives in
  `src/data/studioPresets.ts` and is validated there. A second copy in
  Postgres would be a second list to drift, which this schema has already
  been bitten by.

  Re-runnable.
*/

ALTER TABLE public.design_templates
  ADD COLUMN IF NOT EXISTS format text;

COMMENT ON COLUMN public.design_templates.format IS
  'A DESIGN_FORMATS key (src/data/studioPresets.ts) naming the canvas this template belongs on. Null falls back to instagram-post, as the code templates without one do.';
