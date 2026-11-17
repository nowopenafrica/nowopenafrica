# Template review: the publish gate for uploaded templates

*2026-11-17. Replaces the Template Bank branch (`claude/template-bank-wip`), which
was built on a September base that predates the Template Manager and is not merged.*

## What changed

Uploaded templates live in `design_templates` and are managed in Admin Creator →
Template Manager. Until now any staff member could publish an upload with one
click, and an import could be published in bulk the moment it was read.

Now:

1. **Import** JSON, Claude Design artboards (`.dc.html`) or a **ZIP** of either.
   Every file in a ZIP goes through the same validation as a file picked alone;
   anything else in the archive (previews, readmes) is listed as left out.
2. **File for review.** Imports are saved as `in_review`. There is no bulk publish.
3. **Review.** An admin opens a row, scores the nine rubric lines and records a
   decision. The browser-safe house criticals run on the stored layout and are
   recorded with the review; C10 is the reviewer's tick.
4. **Publish.** Allowed only when the review approves, scores 85 or more and records
   no critical, and the layout has not changed since it was scored.

## The rule and where it is enforced

The founder's rubric and bar from the Creative Intelligence spec (D3): originality 15,
art direction 15, typography 15, composition 15, imagery 10, colour 10, brand relevance
10, commercial effectiveness 5, technical execution 5; publish at 85 with no criticals.

| Piece | Where |
|---|---|
| Gate (CHECK constraint), score computed from the lines, reviewer and time from the session, admin-only reviews, stale-review hash | `supabase/migrations/20261117000000_design_template_review_gate.sql` |
| Screen copy of the gate, rubric, ZIP reader | `src/lib/create/templateReview.ts` |
| Review panel | `src/components/admin/TemplateReviewPanel.tsx` |
| Browser-safe criticals (all automated ones except C3) | `src/lib/design/quality/criticalCore.ts` |

`critical.ts` still exports `automatedCriticals` unchanged; it now takes everything but
C3 from `criticalCore.ts`. A test holds the two equal on every code template.

## The 71 already live

Production held 71 published uploads with no scores on 2026-11-17. The migration
marks them `legacy_listing` so they stay listed. The flag can only be lost:
unpublishing one clears it, and it then needs a review to come back.

Run in the browser against those 71 (read-only, 2026-11-17), the house criticals
find on **every one**: C2 (no subcategory, no direction), C5 (contrast or fit), and
C9 (the gallery shows the fallback "Your headline here"). Two also fail C12.

## Product, direction and demo copy

C2 and C9 failed on every upload because the importer never asked for what they
need. It does now, on the import card and in the review panel:

- **Product** (a `catalogueTaxonomy` subcategory) and **direction**
  (`design/directions.ts`) clear C2. Pick a canvas the product is made on, or C4
  says so.
- **Demo copy**, one field per text role the layout draws, plus list rows. It is
  what the gallery card shows (`sampleFor` reads `DesignTemplate.sample`), so it
  clears C9. Same rule as `sampleCopy.ts`: name what goes there, never a business.

All three live in the stored `document`, not in columns, so the public catalogue
read is unchanged and the review hash covers them. The hash now also covers the
`format` column (`design_template_review_hash`): changing the canvas, product,
direction or demo copy of a reviewed template stales its review. The import card
runs the same browser-safe criticals as the review panel, so whoever imports sees the
findings before filing.

For the 71 rows already live, the review panel's Details section edits these and
saves them to the document (Save details) before scoring; Save review stays off while
details are unsaved, so the findings recorded are those of what is stored. On a
published row that changes the live gallery card.

Checked in the browser (read-only, 2026-11-17) on an upload copied from
`pilot-ig-bold`: with the three filled in, C2 and C9 clear; C5 remains (its palette
was dropped at the door for contrast) and C13 (it is a near-copy of the original),
both real findings.

## Tests

- `src/lib/create/templateReview.test.ts`: rubric equals the SQL, the gate,
  the ZIP reader, `criticalCore` parity.
- `src/components/admin/TemplateReviewPanel.test.tsx`: the panel saves only a
  complete review and never sends a score.
- The migration was run on Postgres (PGlite) on top of the two existing
  `design_templates` migrations: 28 checks, all passing (legacy marking, re-run,
  admin-only review, line validation, computed score, 84 refused, 85 published,
  criticals and "revise" refused, stale document, canvas or demo copy refused,
  legacy cleared on unpublish). That harness is not in the repo; PGlite is not a project dependency.

## Applied to production (2026-11-17)

Applied on the founder's word with `supabase db query --linked -f` and recorded in
`supabase_migrations.schema_migrations`; `npm run check:drift` reports no drift and
the ledger matching disk. Before and after: 71 rows, all published; after, all 71
`legacy_listing`. Exercised live inside a block that always rolls back: unpublishing
clears legacy, republishing without a review is refused, a non-admin review is
refused, and legacy cannot be granted back. The 71 were unchanged afterwards.

**The deployed site still runs the old Template Manager.** Its "Publish all" and
one-click Publish now hit the gate and fail with a database error; nothing is lost,
but nothing new can be published from production until this branch is deployed.
The public gallery is unaffected (it reads the same columns as before).

## Not done
- C3 (glyphs), C6 (preview) and C8 (export) do not run in the panel; it says so.
- Review notes and the reviewer's id are readable by anyone once a template is
  published (the table's public policy returns whole rows). The panel says so.
