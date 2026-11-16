# Template Bank

*Written 2026-11-16, against `creative-studio-live-canvas` as pushed on 13 September.
It does not account for the Creative Intelligence work (`creative-intel-spec`), which
was not on GitHub when this was built. Read "Open questions" before merging.*

The Template Bank lets a reviewed design template be added to NowOpen Create from
admin, without a deploy. It is the "template schema in the database" that
`nowopen-create-2.0-audit.md` lists as Phase 5.

## What a template is

A native `DesignTemplate` (`src/lib/designTemplates.ts`): a surface, optional shapes
and role-based slots, all in fractions of the canvas. An imported template is the same
data as a built-in one, so it is editable in place, takes any of the styles, and
renders at every format through both renderers.

That also sets the limit. A template cannot hold separate image regions, more than one
page, dielines or custom vector artwork, and exports are RGB with no bleed. Packaging,
merchandise, multi-page documents and decks cannot be expressed in this format.

## The package

A ZIP with `manifest.json` and one folder per template:

```
manifest.json
02-social-media/bank-timetable/template.json   metadata + `definition`
02-social-media/bank-timetable/preview.png     for catalogues; the product renders from the definition
README.md  TEMPLATE-INDEX.md  QA-REPORT.md  LICENSES-AND-ASSETS.md
```

Format and validation: `src/lib/templateBank/package.ts`, `schema.ts`.

## The flow

1. **Upload** in Admin → Template Bank. The ZIP is read and checked in the browser.
2. **Check.** The report lists package errors, missing files, duplicates, rejected
   templates and why, and any sample copy that does not fit its layout. Every
   importable template is previewed through the real renderer.
3. **Import.** One database transaction. All valid templates are stored as *pending*;
   a failure stores nothing.
4. **Review.** A reviewer scores each template on the nine-criterion, 100-point rubric.
5. **Publish.** Approved templates in the collection go live together; an older live
   version of the same key is retired in the same transaction.

Published templates join the built-in layouts in the public Create gallery and in
Studio through `useTemplateLibrary()`.

## The quality gate

A template is live only while it is approved and carries a recorded review score of 80
or more. That is a CHECK constraint on `design_templates`, so no code path can publish
around it. A score inside a package is the author's claim: it is displayed as
provisional and never copied into the review.

## Checks

| Check | What it covers | Command |
|---|---|---|
| Structural gate | Same rules as the built-in catalogue tests, applied to uploads | runs at upload |
| Fit audit | Real text, real fonts: cut lines, collisions, words wider than their box | `npm run bank:audit` |
| Unit tests | Validator, package, bank data, registry, fit logic | `npx vitest run src/lib/templateBank` |
| Migration | Import rollback, review, publish gate, row security, on a local Postgres | `npm run bank:test-migration` |
| Package build | Renders previews, writes the ZIP and catalogue PDF, re-reads the ZIP through the importer | `npm run bank:build` |

The build and the fit audit need Playwright installed on the machine; it is not a
project dependency. The migration test needs a local Postgres install.

## The official bank

Source: `src/data/templateBank/`. Version 1.0.0 holds 33 layouts across social media,
advertising and outdoor, and events. None has been scored. They are type-led layouts
with no photography and should be expected to score well below the gate until reviewed.

## Not done

- The migration has not been applied to any Supabase project.
- The admin screen was exercised in a browser up to the import button, with no
  database behind it. Import, review and publish were tested at the SQL level only.
- A deep link to a published template (`/studio?module=design&template=…`) resolves
  before published templates have loaded and falls back to no selection.
- Print, brand identity, packaging and motion divisions have no templates.
- `apply_all_migrations.sql` has not been regenerated to include the new migration.

## Open questions

- **Creative Intelligence.** That work adds a composition engine with measured text
  fitting, 32 typefaces and house critical gates. If compositions replace fixed slot
  layouts, this bank's templates may be the wrong asset, and the fit audit here
  duplicates checks that already exist there. The package format, importer and review
  flow are independent of that choice; the 33 layouts are not.
- **Who reviews.** The gate needs a reviewer of record.
