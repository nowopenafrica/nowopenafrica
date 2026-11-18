> **Superseded — do not merge this branch.** Production already has a
> `design_templates` table, a Template Manager with ZIP import, and a review gate
> (85 or more, no criticals) applied on 17 November 2026. See
> `docs/template-review.md` on `release/2026-11-18-create`, which replaced this work.
> This branch's migration used the same table name with a different shape and has
> been removed so it cannot be applied by mistake. The rest is kept for reference.

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
| End to end | A browser drives the admin screen against the real migration on a local Postgres: upload, import, reject, approve, publish, the public gallery, unpublish, re-upload | `bash scripts/template-bank/e2e.sh` |
| Package build | Renders previews, writes the ZIP and catalogue PDF, re-reads the ZIP through the importer | `npm run bank:build` |

The build, the fit audit and the end-to-end test need Playwright installed on the
machine; it is not a project dependency. The migration and end-to-end tests need a
local Postgres install. The end-to-end test stands in for Supabase with a small shim
that always acts as an admin, so it does not exercise sign-in.

## The official bank

Source: `src/data/templateBank/`. Version 1.0.0 holds 33 layouts across social media,
advertising and outdoor, and events. None has been scored. They are type-led layouts
with no photography and should be expected to score well below the gate until reviewed.

Each is art-directed for its first listed format. At other formats it holds together
(nothing collides or is cut) but only scales: on a story or a 3:1 strip the type is
small and space is left unused. These layouts do not recompose per format.

## What merging this ships

The importer, review flow, database gate and library wiring. It does not ship any of
the 33 layouts: nothing in the app imports `src/data/templateBank`, so they are in no
production bundle, and the importer code sits only in the admin dashboard chunk. A
layout reaches a customer one way only: the package is uploaded, a reviewer scores it
80 or more, and its collection is published.

## Not done

- The migration has not been applied to any Supabase project.
- Print, brand identity, packaging and motion divisions have no templates.
- `scripts/sql/apply_all_migrations.sql` does not include this migration. That file was
  last updated on 3 September and already lacks the later migrations, so apply
  `supabase/migrations/20261116000000_template_bank.sql` directly.
- The Studio deep link to a published template was not tested in a browser: Studio
  is behind sign-in and the end-to-end harness has no session.

## Open questions

- **Creative Intelligence.** That work adds a composition engine with measured text
  fitting, 32 typefaces and house critical gates. If compositions replace fixed slot
  layouts, this bank's templates may be the wrong asset, and the fit audit here
  duplicates checks that already exist there. The package format, importer and review
  flow are independent of that choice; the 33 layouts are not.
- **Who reviews.** The gate needs a reviewer of record.
