/*
  # Create Media templates, uploaded rather than written

  All 66 design layouts live in `src/lib/designTemplates.ts` — a 2,717-line
  TypeScript file imported directly by the gallery, the editor, the motion
  studio and the deliverable taxonomy. Adding one today means a code change
  and a deploy. This table is the other half: a template a creative manager
  uploads, which appears in the catalogue without one.

  ## Why ONE table and not fourteen

  The brief this came from lists template_categories, subcategories, styles,
  industries, concepts, trends, assets, versions, collections,
  collection_items, import_jobs, publication_events, usage_analytics and
  licenses. Most of those are premature:

    - categories, styles and industries ALREADY EXIST in code
      (DELIVERABLE_CATEGORIES, DESIGN_STYLES, data/categories.ts) and the
      code templates are validated against them by `check:templates`. A
      second copy in the database would drift from the first, and the
      product has been bitten by exactly that twice.
    - collections, trends and analytics describe a catalogue that is being
      browsed at scale. There are zero uploaded templates today.

  So: one table, the same classification vocabulary the code templates use,
  and room to normalise later when something is actually being counted.

  ## What `document` holds

  The native slot shape — surface, shapes, slots — validated in
  src/lib/create/templateUpload.ts BEFORE it is written. The renderer, the
  fitter and the export path then treat it exactly like a code template,
  which is the whole reason this is small: no second renderer, no sandbox,
  no conversion pipeline.

  `editability` is stated per row because "it uploaded" and "it is editable"
  are different facts. A JSON layout is 'full'; a PNG is 'asset'. Nothing is
  labelled editable because the upload succeeded.

  ## Visibility

  Published rows are public — they are catalogue entries, not customer data.
  Everything else is staff-only. Writing is staff-only throughout: this is
  the shop window, and `is_staff()` already means what it needs to mean.

  Re-runnable.
*/

CREATE TABLE IF NOT EXISTS public.design_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /** Addressable in the catalogue, and unique ACROSS the code templates too —
      the uploader is handed every existing key so it cannot shadow one. */
  key           text NOT NULL UNIQUE,
  label         text NOT NULL,
  description   text,

  /** One of DELIVERABLE_CATEGORIES. Checked in the app, not by an enum here:
      the list lives in code and an enum would be a second copy to drift. */
  category      text NOT NULL,
  styles        text[] NOT NULL DEFAULT '{}',
  industries    text[] NOT NULL DEFAULT '{}',
  tags          text[] NOT NULL DEFAULT '{}',

  /** The validated slot document. See templateUpload.ts for the contract. */
  document      jsonb NOT NULL,

  editability   text NOT NULL DEFAULT 'full'
                CHECK (editability IN ('full', 'partial', 'asset', 'preview')),
  source_format text,
  /** Where the original upload is kept, for re-processing or provenance. */
  source_path   text,
  preview_url   text,

  /*
    Import state and editorial state are SEPARATE on purpose. A template can
    import cleanly and still not be approved, and a rejected one must not
    look like a failed upload.
  */
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'rejected', 'archived')),

  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.design_templates IS
  'Uploaded Create Media templates. The code templates in src/lib/designTemplates.ts remain the other half of the catalogue; both produce the same DesignTemplate shape.';

/* The catalogue reads "published, by category, newest first" and nothing else. */
CREATE INDEX IF NOT EXISTS idx_design_templates_published
  ON public.design_templates (category, published_at DESC)
  WHERE status = 'published';

ALTER TABLE public.design_templates ENABLE ROW LEVEL SECURITY;

/*
  A published template is a catalogue entry, so it is public. Everything
  else — drafts, rejected work, archived layouts — is staff-only, because a
  half-finished template in the public gallery is worse than no template.
*/
DROP POLICY IF EXISTS "Anyone can view published templates" ON public.design_templates;
CREATE POLICY "Anyone can view published templates"
  ON public.design_templates FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "Staff view every template" ON public.design_templates;
CREATE POLICY "Staff view every template"
  ON public.design_templates FOR SELECT
  USING (is_staff());

DROP POLICY IF EXISTS "Staff manage templates" ON public.design_templates;
CREATE POLICY "Staff manage templates"
  ON public.design_templates FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());
