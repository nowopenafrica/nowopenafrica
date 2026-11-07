# Template Redesign Programme — Plan (sub-project 2)

**Spec:** `docs/superpowers/specs/2026-10-29-create-media-redesign-design.md` §5. Builds on the shipped look engine (`docs/superpowers/plans/2026-10-29-look-engine.md`).

**Goal:** every Create Media template becomes one finished, art-directed design with its own hero `look`, shown as-is in the gallery, customiser, editor and export.

**Execution:** controller designs each batch directly (palette, pattern, type, shape roles need visual iteration in the dev browser), then a review sheet goes to the founder before the batch ships. No commits without approval; LF line endings preserved per file.

## Global rules (every batch)

- A look references a palette key, roles and pattern keys only — never hex.
- `looks.test.ts` (every looked template × every style, alpha-aware contrast) must pass; fix the design, never a threshold.
- **Variety:** no palette used by more than 6 templates library-wide; within one deliverable collection (e.g. business cards) no palette repeats. Enforced by `src/lib/design/libraryVariety.test.ts`.
- Multi-colour is the point: where a layout has decorative shapes, at least one uses `secondary` or `highlight`, not only `primary`.
- Lookless templates keep rendering exactly as today until their batch.
- Uploaded (database) templates are a later batch: each gets a code version first; archiving rows is a production write and is asked for separately.

## Batches (most-requested first)

1. **Business cards & branding** — 8 business cards, quiet-luxe, swiss-grid, minimal-grid, and the 8 catalogue branding layouts (brand-intro-reveal already looked).
2. Social posts & stories
3. Flyers & posters
4. Campaigns
5. Print & documents
6. Banners & ads
7. Events & menus
8. Uploaded rows → code versions (+ archive rows on approval)

## Per-batch steps

1. Assign palettes across the batch (variety rule), pick pattern and type pairing per design, move decorative shapes to `secondary`/`highlight` where it improves the composition.
2. `npx vitest run src/lib/design src/lib/designTemplates.test.ts src/components/studio` + `npm run check:templates` + `npm run typecheck`.
3. Render every design in the dev browser at its true canvas through the real `TemplateSurface`; fix anything that reads poorly.
4. Publish a review sheet (screenshots of every design) for the founder; ship the batch only on approval.
