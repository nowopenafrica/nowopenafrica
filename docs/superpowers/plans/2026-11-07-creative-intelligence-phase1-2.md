# Creative Intelligence P1–P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status: spec approved 2026-11-07, as written. This plan awaits the founder's review and a choice of execution method.**

**Goal:** P1 lays the foundations: formats, fonts, directions, measured composition, taxonomy, the quality gate and a licensed asset library. P2 redesigns discovery and the detail page, and validates both on a representative collection of 20 templates.

**Architecture:** Templates stay as TypeScript `DesignTemplate` objects (spec approach A). Assets, licences and mockup scenes live in Supabase and reach the code through a committed `assetManifest.json`. Human reviews go in a committed ledger, so tests enforce the gate offline. `/media` changes only in P2. The gate switches on for the three pilot subcategories in the last task.

**Tech Stack:** React 18, Vite 7, TypeScript, Vitest, Supabase (Postgres + Storage), Node scripts, `vite-node`.

**Spec:** `docs/superpowers/specs/2026-11-07-creative-intelligence-catalogue-design.md`

## Global Constraints

- **Approvals:**
  - No commits, deploys, downloads or production database writes without the founder's go-ahead in chat. "Commit" means: propose it, then wait.
  - The dev server writes to production. In the browser, never click save, submit, approve or publish.
- **Migrations:**
  - Dry-run inside `BEGIN … ROLLBACK`.
  - Apply with `npx supabase db query --linked -f <file>`.
  - Insert the `schema_migrations` row, then run `npm run check:drift`.
  - Never use `supabase db push`. Never write `*/` inside a SQL comment.
- **Files you must not edit:** `src/lib/promote/*`, `src/pages/MediaPlan.tsx`, `src/pages/StudioEditor.tsx`, `src/components/promote/*`. Importing from `src/lib/promote/surface.ts` (read-only) is allowed.
- **Content rules:**
  - No Canva or Freepik assets.
  - No invented businesses, testimonials, awards, ratings, endorsements or statistics. Industry examples are the only sanctioned filler.
  - No automatic tribal patterns, flags or maps.
- **Design rules:**
  - Looks reference palette keys and roles, never hex.
  - Fix a design, never a threshold.
  - Preserve each file's line endings (`file <path>` before editing).
  - Today's date comes from `src/lib/dates.ts`. Use `ConfirmDialog`, never `window.confirm`.
- **Spec values:**
  - To publish: score ≥ **85** and no critical failure C1–C13. Automated points max **59**, reviewer points **41**.
  - Distinctness: ≥ **3 of 7** descriptor features differ; ≤ **2** templates per direction per subcategory; a subcategory is shown with ≥ **4** directions.
  - Ratio tolerance **1%**. Platform formats need re-verification after **180 days**.
  - Pilot board: 48-sheet, **6096 × 3048 mm**, **3600 × 1800 px** at 1:10 and 150 dpi.
  - Legacy mark: **60 days** (only if the founder chooses it).
  - Supported languages: English, French, Portuguese, Swahili, Yoruba, Igbo, Hausa, Twi/Akan, Ewe, Zulu and Kinyarwanda. Currencies: ₦ ₵ KSh R RWF USh TSh.
- **Checks:** `npm run typecheck` (bare `npx tsc --noEmit` checks nothing), `npx vitest run <paths>`, `npm run check:templates`, `npm run lint`, and `npm run verify` before any deploy.

## Review Focus

1. **A template edited after review**: its hash changes, and the build fails with "stale review" instead of the design quietly leaving the gallery. Tested in Task 7.
2. **A retired asset still referenced**: the regenerated manifest makes a test name every template that uses it. Tested in Task 10.
3. **Uploaded DB rows with no direction**: `fetchCatalogue` keeps every code template, and lists no unreviewed row in a gated subcategory. Tested in Task 7.
4. **The new Latin Extended fonts shift line breaks**: no listed design may start clipping (C5) with its demo copy or the longest sample name. Tested in Task 2, against all 67 listed designs.
5. **A search phrase with words the lexicon doesn't know** ("posh flyer for my estate agency"): the known facets still rank results, and nothing errors or returns empty when a facet matches. Tested in Task 14.

---

## P1: Foundation

### Task 1: One format registry

**Files:** Create `src/lib/design/formats.ts` and its test. Modify `src/lib/design/printSpec.ts` (read physical sizes from the registry) and `src/data/studioPresets.ts` (add `board-48-sheet`).

**Interfaces (produces):**
```ts
export type Medium = 'screen' | 'office' | 'press' | 'large-format';
export interface Format { key: string; label: string; w: number; h: number; mm?: { w: number; h: number }; medium: Medium; targetDpi: number | null; bleedMm: number; safeMm: number; source?: string; verifiedAt?: string }
export const FORMATS: Record<string, Format>;
export function formatOf(key: string): Format | null;
export function sameRatio(a: number, b: number, tolerance = 0.01): boolean;
export function needsReverify(f: Format, today: string, days = 180): boolean;
```

- [ ] Write failing tests:
  - Every `DELIVERABLES[k].format` resolves.
  - `PHYSICAL` entries equal `FORMATS[key].mm`.
  - The px and mm ratios agree within 1%.
  - `board-48-sheet` is 3600×1800 with mm 6096×3048 and medium `large-format`.
  - The legacy `billboard` stays 4500×1500.
  - Every screen format for a named platform (Instagram, Facebook, LinkedIn, YouTube, TikTok, X, WhatsApp) has `source` and `verifiedAt`.
  - `needsReverify` is true at 181 days.
- [ ] Run `npx vitest run src/lib/design/formats.test.ts`. Expected: FAIL.
- [ ] Implement:
  - Seed from `PHYSICAL`, `studio/formats.ts` `PRESETS` and the `studioPresets.ts` arrays. Where they disagree, the physical size wins.
  - Fill platform `source` and `verifiedAt` by reading each platform's official help page on the day. Record the URL. Do not copy sizes from third-party blogs.
  - Keep the `PHYSICAL` export's name and shape.
- [ ] Run `npx vitest run src/lib/design src/lib/studio` and `npm run typecheck`. Expected: PASS.
- [ ] Commit (on approval).

### Task 2: Fonts that cover the supported languages

**Files:** Create `src/lib/design/fontCoverage.ts` (a Node-only cmap reader for WOFF2 and OTF, using `zlib.brotliDecompressSync`) and `src/lib/design/fontCoverage.test.ts`. Modify `public/fonts/studio/*.woff2` (replaced), `src/lib/design/typefaces.ts` (add one humanist and one script face), and `src/index.css` (`@font-face` for the new files).

**Interfaces (produces):**
```ts
export function codepointsOf(file: Buffer): Set<number>;
export const SUPPORTED_CHARS: Record<string, string>;  // per language and currency, copied from the spec §12 list
export function missingChars(file: Buffer, chars: string): string;
```

- [ ] Write failing tests:
  - Every file in `TYPEFACES[*].files` covers every `SUPPORTED_CHARS` entry. Today this fails on all 12 Studio files and on Coolvetica (missing ₦ ₵ ɓ ɗ ƙ ɛ ɔ ẹ ọ ṣ).
  - Every character in `sampleCopy.ts` is covered by the face its template uses.
  - Snapshot test: the `fitSlotSize` result for each of the 67 listed designs stays at or above `MIN_TYPE_PX` with demo copy and with the longest sample name (Review Focus 4).
- [ ] Run. Expected: FAIL, listing each face and its missing characters.
- [ ] **Ask the founder to approve the download:** the Latin Extended (`latin-ext`) WOFF2 files for Outfit, Playfair Display, Space Mono, Bebas Neue, DM Serif Display, Fraunces, Space Grotesk and Archivo Black, plus one OFL humanist face (proposed: Source Sans 3) and one OFL script face (proposed: Dancing Script), from Google Fonts' official repository (github.com/google/fonts), with each family's OFL.txt.
  - Store each OFL.txt beside the files. Self-host; do not subset below Latin Extended.
  - If a family lacks a character upstream, the test names it. Then drop the face from the supported list, or pair a fallback face for that script and record why.
- [ ] Coolvetica lacks the characters upstream. Keep it for the NowOpen wordmark and display Latin only: mark `typefaces.ts` `coverage: 'latin-basic'`, so the test exempts it from the language list but not from ₦. Get its official licence text from the founder; until then it fails C3.
- [ ] Run `npx vitest run src/lib/design` and `npm run typecheck`. Then render 10 listed designs in the dev browser, including a menu with ₦ prices, and compare them with screenshots taken before the change. Expected: PASS, and ₦ draws in the template face.
- [ ] Commit (on approval).

### Task 3: Creative directions

**Files:** Create `src/lib/design/directions.ts` and its test. Modify `src/lib/designTemplates.ts`: add `direction?: DirectionKey`, `iconSet?: string` and `sides?: 'single' | 'front-back'` to `DesignTemplate`, as type-only imports.

**Interfaces (produces):**
```ts
export type DirectionKey = 'luxury' | 'minimal' | 'corporate' | 'editorial' | 'bold' | 'contemporary' | 'playful' | 'industry';
export type Archetype = 'whitespace-centred' | 'single-element' | 'header-band' | 'asymmetric-split' | 'stacked-type' | 'offset-grid' | 'offset-blocks' | 'trade-led';
export interface Direction { key: DirectionKey; name: string; intent: string; archetype: Archetype; pairings: string[]; paletteFamilies: string[]; imagery: 'none' | 'full-bleed' | 'framed' | 'cut-out' | 'duotone'; hierarchy: 'headline-led' | 'image-led' | 'information-led' }
export const DIRECTIONS: Direction[];
export function directionOf(key: string | undefined): Direction | null;
```

- [ ] Write failing tests:
  - 8 directions with unique keys and unique archetypes.
  - Every pairing exists in `TYPE_PAIRINGS`.
  - Each intent is one sentence under 120 characters.
  - A template with `direction: 'industry'` and no `industries` fails a validation helper, `directionProblems(tpl): string[]`.
- [ ] Run. Expected: FAIL. Then implement with names and archetypes from spec §7.2. Run again: PASS, and `npm run typecheck` passes.
- [ ] Commit (on approval).

### Task 4: Composition descriptor and distinctness

**Files:** Create `src/lib/design/composition.ts` and its test.

**Interfaces:**
- Consumes: `slotOf`, `typePx` (`designTemplates.ts`), `formatOf` (Task 1).
- Produces:
  ```ts
  export interface Descriptor { anchor: string; headlineStep: number; imageShare: 0 | 1 | 2 | 3; textBlocks: number; align: 'left' | 'center' | 'right' | 'mixed'; pattern: 'none' | 'accent' | 'field'; container: boolean }
  export function describe(tpl: DesignTemplate): Descriptor;
  export function distance(a: Descriptor, b: Descriptor): number;   // 0..7
  export function distinctnessIssues(ts: DesignTemplate[]): { subcategory: string; a: string; b: string; distance: number }[];
  export function directionOverflow(ts: DesignTemplate[]): { subcategory: string; direction: DirectionKey; keys: string[] }[];
  ```

- [ ] Write failing tests:
  - An inline snapshot of `describe(templateByKey('editorial-split'))`, with the anchor checked by hand.
  - `distance(d, d) === 0`, and changing only `align` gives 1.
  - A `photoLed` full-bleed template gives `imageShare` 3.
  - Two same-slot templates that differ only in palette give an issue at distance 0.
  - Three of one direction in one subcategory are flagged.
  - Only templates with a `direction` are compared, so today both functions return `[]`.
- [ ] Run. Expected: FAIL. Then implement:
  - The anchor is from the headline's `x + w/2` and `y` (flipped for `fromBottom`) on a 3×3 grid.
  - `imageShare` buckets are 0, under 25%, 25–60% and over 60%.
  - `container` is a `rect` or `wedge` shape covering the headline.

  Run again. Expected: PASS.
- [ ] Commit (on approval).

### Task 5: Catalogue taxonomy

**Files:** Create `src/lib/create/catalogueTaxonomy.ts` and its test. Modify `src/lib/design/deliverables.ts` so each entry also names a `subcategory` from the registry.

**Interfaces (produces):**
```ts
export type CategoryKey = 'brand' | 'social' | 'advertising' | 'print' | 'presentations' | 'events' | 'product' | 'production';
export interface Subcategory { key: string; name: string; category: CategoryKey; formats: string[]; requiredRoles: SlotRole[]; sides: 'single' | 'front-back' }
export const CATEGORIES: { key: CategoryKey; name: string; blurb: string }[];
export const SUBCATEGORIES: Subcategory[];
export const OCCASIONS: string[];
export function subcategoryFor(tpl: Pick<DesignTemplate, 'key'>): Subcategory | null;
export function needToSubcategories(need: NeedSlug): string[];  // keeps the 9 needs working
export function shownSubcategories(listed: DesignTemplate[]): Subcategory[]; // ≥ 4 directions
```

- [ ] Write failing tests:
  - All 110 templates map to exactly one subcategory.
  - Every `NEEDS[*].deliverables[*].slug` maps through `needToSubcategories`.
  - `business-card` has `sides: 'front-back'` and requires `brand`, `headline` and `contact`.
  - `shownSubcategories` hides a subcategory with 3 directions.
  - Every `formats` key resolves in `FORMATS`.
  - Industry facets use only `INDUSTRY_GROUPS`.
- [ ] Run. Expected: FAIL. Implement from spec §4 (the brief's A–H). Add only subcategories that have at least one template or are pilot targets; the rest come in P4. Run again: PASS, and `npm run typecheck` passes.
- [ ] Commit (on approval).

### Task 6: Quality scorer and critical checks

**Files:** Create `src/lib/design/quality/{hash,critical,score}.ts` with tests.

**Interfaces:**
- Consumes: Tasks 1–5; `contrastRatio`, `DESIGN_STYLES`, `applyStyle`, `fitSlotSize`, `MIN_TYPE_PX`, `sampleCopy`, `missingChars` (Task 2), `AssetManifest` (type from Task 10; tests pass `{ assets: [] }`).
- Produces:
  ```ts
  export function contentHash(tpl: DesignTemplate): string;  // sorted-key JSON → FNV-1a 64-bit hex
  export type CriticalCode = `C${1|2|3|4|5|6|7|8|9|10|11|12|13}`;
  export interface CriticalFailure { code: CriticalCode; detail: string }
  export function automatedCriticals(tpl: DesignTemplate, siblings: DesignTemplate[], manifest: AssetManifest): CriticalFailure[]; // all but C10
  export interface AutoScore { typography: number; relevance: number; image: number; editability: number; dimensions: number; exportReady: number; access: number; licensing: number; mobile: number; total: number; evidence: Record<string, string> }
  // maxima 5, 4, 5, 10, 10, 10, 7, 5, 3 = 59
  export function automatedScore(tpl: DesignTemplate, siblings: DesignTemplate[], manifest: AssetManifest): AutoScore;
  ```

- [ ] Write failing tests, one per code, each with a fixture that trips it and one that does not:
  - **C1:** a `pexels.com` URL; a manifest id passes.
  - **C2:** missing `direction`.
  - **C3:** copy with ₦ on a face missing it.
  - **C4:** a `billboard` canvas against `board-48-sheet`; a `front-back` subcategory with no `extraPages`.
  - **C5:** 3.0:1 body text in one style; a 120-character name below `MIN_TYPE_PX`.
  - **C6:** `TemplateSurface` rendering throws in jsdom.
  - **C7:** a text role with no customiser field.
  - **C8:** returns `{ code: 'C8', detail: 'not checked until P6' }` only as a warning, never a failure, in P1–P2.
  - **C9:** "Your headline here" or "080 0000 0000".
  - **C11:** a `mockup_scene` asset referenced.
  - **C12:** a slot inside the 5 mm safe margin on a press format.
  - **C13:** two `iconSet`s; or siblings at distance 2.
  - Scores: `total ≤ 59`; `evidence` has an entry for every non-zero criterion; an empty optional field does not lower editability.
- [ ] Run. Expected: FAIL.
- [ ] Implement:
  - C7 reads the customiser's field map. Export it from `TemplateCustomiser.tsx` if it is not exported, with no behaviour change.
  - The mobile score renders the card at 160 px and checks that the headline is at least 9 px.
- [ ] Run `npx vitest run src/lib/design/quality` and `npm run typecheck`. Expected: PASS.
- [ ] Commit (on approval).

### Task 7: Review ledger and gate (off)

**Files:** Create `src/lib/design/quality/{ledger,gate}.ts` and `gate.test.ts`. Modify `src/lib/create/needs.ts` (`isListed`) and `src/lib/create/templateCatalogue.ts`.

**Interfaces (produces):**
```ts
export interface HumanScore { visual: number; typography: number; composition: number; relevance: number; industry: number; access: number; mobile: number } // maxima 10, 5, 10, 6, 5, 3, 2 = 41
export interface Review { key: string; hash: string; reviewer: string; date: string; human: HumanScore; notes: Record<keyof HumanScore, string>; decision: 'approve' | 'reject' | 'revise'; c10: boolean; legacyUntil?: string }
export const REVIEWS: Review[];
export const GATED_SUBCATEGORIES: ReadonlySet<string>;  // empty in P1
export function gate(tpl: DesignTemplate, all: DesignTemplate[], today: string): { listed: boolean; score: number | null; reasons: string[] };
```
`isListed`: in a gated subcategory, use `gate(...).listed`; elsewhere keep `Boolean(t.look)`.

- [ ] Write failing tests:
  - With the gate empty, `listedIn` and `shownNeeds` equal their current output (captured first).
  - In a gated subcategory: no review → `no review`; a hash mismatch → `stale review` (Review Focus 1).
  - 84 is not listed; 85 with `decision: 'approve'` is listed; `revise` is not listed; `c10: true` is not listed.
  - An expired `legacyUntil` is not listed.
  - Every template with a `direction` passes `gate`.
  - `fetchCatalogue`, with a mocked unreviewed uploaded row in a gated subcategory, lists all code templates and not the row (Review Focus 3).
- [ ] Run. Expected: FAIL. Implement. Run `npx vitest run src/lib/design src/lib/create src/components/create`: PASS, with the gallery unchanged.
- [ ] Commit (on approval).

### Task 8: `audit:quality`

**Files:** Create `src/lib/design/quality/report.ts` with a test, and `scripts/audit-quality.ts`. Modify `package.json` (add `"audit:quality": "vite-node scripts/audit-quality.ts"`) and `scripts/audit-templates.mjs` (group by subcategory).

**Produces:** `buildReport(ts, manifest, today): ReportRow[]`. Each row has category, subcategory, directions present, shown, and per template: score, criticals, stale and evidence. Formats due for re-verification are listed separately.

- [ ] Write a failing test on a two-template fixture: the counts are right, and C8 shows as "not checked".
- [ ] Implement. Then run `npm run audit:quality` (expected: a table per category with 0 directions today) and `npm run check:templates` (expected: still passes).
- [ ] Commit (on approval).

### Task 9: Asset library migration

**Files:** Create `supabase/migrations/20261113010000_design_asset_library.sql` and `scripts/check-design-assets.mjs` (modelled on `check-placement-trust.mjs`; every check rolls back; one summary SELECT at the end).

**Produces:**
- Tables `design_asset_licences`, `design_assets` and `design_mockup_surfaces`, with columns, checks and kinds exactly as spec §6.1.
- Seed licence rows: `pexels`, `pixabay`, `unsplash`, `cc0`, `public-domain`, `cc-by-4.0`, `sil-ofl-1.1`, `isc`, `mit`, `apache-2.0`, `nowopen-original`, `commissioned`.
- Function `search_design_assets(q text, p_kind text, p_colour text, p_orientation text, p_industry text, p_region text, p_limit int, p_offset int)`: SECURITY INVOKER, `set search_path = public`, ordered by rank then `id`.
- Buckets `design-assets-intake` (private; type and size limits per spec) and `design-assets` (public read; staff write).

- [ ] Write 12 checks:
  1. anon reads approved and not draft;
  2. a non-staff insert fails;
  3. approving without evidence fails;
  4. `contains_brands` approval fails;
  5. people without a release under `pexels` must carry the `no-endorsement` tag;
  6. a duplicate `sha256` fails;
  7. retiring without a reason fails;
  8. an unknown licence fails;
  9. search finds an approved row by tag, not a draft;
  10. paging at limit 2 is stable;
  11. anon cannot list the intake bucket;
  12. an `.exe` upload to intake is refused.

  Run them. Expected: they fail on the missing tables.
- [ ] Write the migration and dry-run it in `BEGIN … ROLLBACK`. Expected: no error.
- [ ] **Stop and ask the founder to apply it.** On a yes: apply, record the ledger row, run `npm run check:drift` (expected: clean, 234/234), then run the check script (expected: 12/12).
- [ ] Commit (on approval).

### Task 10: Asset manifest

**Files:** Create `src/lib/design/assetManifest.ts`, `assetManifest.json` (`{ "assets": [] }`), `scripts/assets/manifest.mjs` and a test. Modify `package.json` (`assets:manifest`).

**Produces:**
```ts
export interface ManifestAsset { id: string; kind: string; path: string; w: number; h: number; licence: string; attribution: string | null; tags: string[]; people: boolean; iconSet: string | null }
export interface AssetManifest { assets: ManifestAsset[] }
export const MANIFEST: AssetManifest;
export function assetById(id: string): ManifestAsset | null;
export function assetUrl(id: string): string | null;
export function templateAssetIds(tpl: DesignTemplate): string[];  // every `asset:<uuid>`
```

- [ ] Write failing tests:
  - Every referenced id resolves. Removing one from a fixture manifest names the template (Review Focus 2).
  - There is no external image URL except an allowlist holding today's 8 `previewMedia.ts` photos, which Task 17 removes.
- [ ] Implement: the script reads approved rows with the anon key, sorts them by id and writes LF output. Run the tests and the script (expected: an empty manifest).
- [ ] Commit (on approval).

### Task 11: Intake script

**Files:** Create `scripts/assets/intake.mjs`, `scripts/assets/intake-lib.mjs` and `src/lib/design/intake.test.ts`.

**Produces:**
- `node scripts/assets/intake.mjs <folder> <metadata.csv> [--dry-run]`. The CSV columns are the spec §6.1 provenance fields plus `file` and `evidence_file`.
- `intake-lib.mjs` exports `parseRow`, `sha256` and `dominantColours(rgba, n = 5)`.

- [ ] Write failing tests:
  - `parseRow` rejects an unknown licence, a missing evidence file, a canva.com or freepik.com source, and an unsplash.com `source_url` whose `source_name` is "Unsplash API".
  - It accepts a full Pexels row.
  - `dominantColours` returns the two colours of a two-colour buffer.
  - An SVG with `<script>` or an `on*=` attribute is rejected unless the sanitiser strips it. Reuse the logic in `src/lib/studio/importSvg.ts`; extract a pure `sanitiseSvg(text)` there if needed, with no behaviour change.
- [ ] Implement. Decode images with a library only if one is already a dependency; ask before adding one. The service key comes from the environment. Run the tests, then `--dry-run` on a two-file scratch fixture. Expected: two rows parsed, nothing written.
- [ ] Commit (on approval).

### Task 12: Asset review tab

**Files:** Create `src/components/admin/AssetReview.tsx` with a test, and `src/lib/design/assetAdmin.ts`. Modify `src/components/admin/TemplateManager.tsx` (add the tab).

**Produces:** `listAssets(status)`, `approveAsset(id)`, `returnAsset(id, note)` and `retireAsset(id, reason)`. Each returns `{ ok: true } | { ok: false; reason }` and reads supabase-js `{ data, error }`; never use `.catch()`. Approval copies the file to the public bucket, then updates the row. If the update fails, the public copy is deleted.

- [ ] Write failing tests with a mocked client:
  - An approval error shows its reason and removes the public copy.
  - Retiring without a reason is blocked.
  - Every draft shows its evidence link, licence and restrictions.
  - Confirmations use `ConfirmDialog`.
- [ ] Implement. Run the tests and `npm run typecheck`. In the browser, open the tab read-only and do not approve anything.
- [ ] Commit (on approval).

---

## P2: Catalogue redesign and the representative collection

### Task 13: Template detail page

**Files:** Create `src/pages/TemplateDetail.tsx`, `src/components/create/TemplateFacts.tsx` and a test. Modify `src/App.tsx` (add `/media/templates/:key`; the file uses CRLF), `TemplateGallery.tsx` (cards link to the detail page) and `src/lib/seo.ts` usage.

**Consumes:** `formatOf`, `subcategoryFor`, `directionOf`, `templateAssetIds` and `assetById`, `gate`, and `scenesFor` (Task 16; until then, an empty list).

- [ ] Write failing tests:
  - The page shows dimensions in px and mm.
  - Every page and side is shown, with a front-back toggle for business cards.
  - The export formats list only PNG and PDF (what works today).
  - The editable-elements list matches the slot roles.
  - Fonts and assets are listed with licence and attribution.
  - Related templates come from the same subcategory and other directions.
  - "Use this template" opens the customiser on that key.
  - An unknown key shows a not-found state with a link back to `/media`.
  - A template that fails C7 shows "Preview only" and no "Use this template".
- [ ] Implement, using `TemplateSurface` for the large preview. Run the tests, then check `/media/templates/editorial-split` at desktop and 375 px in the browser, read-only.
- [ ] Commit (on approval).

### Task 14: Intent search with ranking

**Files:** Create `src/lib/create/searchRank.ts` and its test. Modify `src/lib/create/intent.ts` (add direction, industry, occasion and subcategory lexicons and synonyms; keep `classifyIntent`'s existing outputs) and `IntentComposer.tsx`.

**Produces:**
```ts
export interface ParsedQuery { subcategory: string | null; direction: DirectionKey | null; industry: string | null; occasion: string | null; format: string | null; rest: string[] }
export function parseQuery(input: string): ParsedQuery;
export function rankTemplates(q: ParsedQuery, ts: DesignTemplate[], scores: Map<string, number>): DesignTemplate[];
```
Ranking: the count of matched facets (the subcategory weighs double), then quality score, then `key`. Text-only matching applies only when no facet parsed.

- [ ] Write failing tests:
  - "luxury real estate flyer" parses to `{ subcategory: 'flyer', direction: 'luxury', industry: <real-estate group> }`, and a luxury real-estate flyer ranks above a plain flyer containing "luxury".
  - "billboard for a new restaurant" gives the billboard subcategory, the hospitality industry and the opening occasion.
  - "investor pitch deck" gives the pitch-deck subcategory (absent until P4, so the result is empty with a "not yet in the catalogue" message, and the miss is recorded).
  - "fashion Instagram campaign", "modern business card".
  - "posh flyer for my estate agency" still finds flyers (Review Focus 5).
  - The existing `intent.test.ts` still passes.
- [ ] Implement, and record misses in a local in-memory list exposed for P3. Run the tests.
- [ ] Commit (on approval).

### Task 15: Create page browse, cards and filters

**Files:** Create `src/components/create/{CategoryBrowse,CollectionStrip,CatalogueFilters,TemplateCard}.tsx` with tests. Modify `CreateMarketplace.tsx`, `NeedView.tsx` and `TemplateGallery.tsx`.

- [ ] Write failing tests:
  - Category browse shows only `shownSubcategories`.
  - Need tiles still route to the same subcategories (old `?category=` links redirect).
  - Each filter group hides values that match nothing. There is no "Free or paid", "Trending" or "Popularity" filter.
  - A card shows name, subcategory, direction, format and one line.
  - The "Editable" badge appears only when C7 passes. "Print-ready" never appears in P2. "Platform size" appears only when `needsReverify` is false.
  - Cards mount `TemplateSurface` only in view; this is kept from today.
  - The loading state is a skeleton, and empty and error states have copy.
  - Filters are keyboard operable.
- [ ] Implement. Featured collections come from a committed `collections.ts` list, edited by the founder, with no invented "trending". Run `npx vitest run src/components/create src/lib/create`. Then check `/media` in the browser at 1280 px and 375 px, read-only, and screenshot both.
- [ ] Commit (on approval).

### Task 16: Mockups in Create

**Files:** Create `src/lib/create/mockup.ts` with a test, and `src/components/create/MockupView.tsx`.

**Produces:**
```ts
export interface MockupScene { assetId: string; url: string; quad: Quad; ratio: number; formatKeys: string[]; label: string }
export function scenesFor(formatKey: string, scenes: MockupScene[]): MockupScene[];
export async function fetchScenes(): Promise<{ scenes: MockupScene[]; ok: boolean }>;
```
`MockupView` places a rendered `TemplateSurface` with `matrix3dFor` (imported from `src/lib/promote/surface.ts`) and the label "Mockup: illustration only".

- [ ] Write failing tests:
  - For `board-48-sheet`, a 2.00 and a 2.019 scene are kept, a 2.021 scene is dropped, and an unusable quad is dropped.
  - A fetch error gives `{ scenes: [], ok: false }`.
  - The label renders.
  - Export receives the bare surface node, never the mockup.
- [ ] Implement, run the tests, and wire the scenes into the Task 13 detail page and the Task 15 cards' "See it in place" toggle.
- [ ] Commit (on approval).

### Task 17: Pilot assets (production writes; go-ahead needed)

**Files:** Create `docs/assets/pilot-intake.csv`. Modify `src/lib/design/previewMedia.ts` (read from the manifest) and `assetManifest.json`.

- [ ] Assemble about 40–60 files, recording each one's official source page and capture:
  - the 8 existing Pexels photos;
  - photos for business cards (desk, materials), Instagram (fashion, food, retail; African settings, regions tagged) and billboards;
  - Lucide icons for contact rows;
  - textures and frames drawn in-house;
  - 2 street scenes with a frontal 48-sheet within 1% of 2:1.
- [ ] Run `intake.mjs --dry-run`. Expected: every row parses.
- [ ] **Ask the founder** to run the real intake. On a yes, run it, then review the drafts together in the Assets tab, where the founder approves.
- [ ] Run `npm run assets:manifest`. Switch `previewMedia.ts` to manifest ids and delete the allowlist from Task 10. Check `vercel.json`'s CSP allows the Supabase storage host for images; if not, ask before changing it. Run `npx vitest run src/lib/design`. Expected: PASS, with the same photos now served from `design-assets`.
- [ ] Commit (on approval).

### Task 18: The pilot collection, review and gate

**Files:** Create `src/lib/design/pilotTemplates.ts` (spread into `DESIGN_TEMPLATES`). Modify `sampleCopy.ts`, `deliverables.ts`, `quality/ledger.ts` and `GATED_SUBCATEGORIES` (`business-card`, `instagram-post`, `billboard-48-sheet`).

- [ ] Write 20 templates:
  - business card × 8 directions, front and back (`extraPages`);
  - Instagram post 4:5 × 6;
  - 48-sheet × 6.

  Images come only from manifest ids, there is one `iconSet` per template, and copy uses industry examples only.
- [ ] Run `npx vitest run src/lib/design src/lib/create` and `npm run audit:quality`. Expected: no automated critical failure on the 20, every pair at distance 3 or more, and ≤ 2 per direction. Fix the designs, never the thresholds.
- [ ] Render all 20 at their true canvas through `TemplateSurface`, plus the 2 billboard mockups. Export each billboard as PNG and confirm it is 3600 × 1800 with no scene in it. Check each detail page at 1280 px and 375 px.
- [ ] Score the live designs in the same three subcategories. Publish a review sheet (Artifact) with the 20 new and the existing designs, their automated scores and evidence, and blank reviewer columns. The founder scores. Record the scores in `ledger.ts` with `contentHash`. Apply spec §16.5 to the existing designs.
- [ ] Switch on `GATED_SUBCATEGORIES`. Run `npm run verify`. Expected: pass, and the three subcategories show only reviewed designs at 85 or above. Deploy only on the founder's go-ahead, after `npm run check:drift`.

---

## Self-review notes
- **Coverage:**
  - Spec §4 → Task 5; §5 → Task 1; §6.1 → Task 9; §6.2 → Tasks 10 and 17; §6.3 → Tasks 11 and 12.
  - §7.1 fonts → Task 2; §7.2 → Task 3; §7.3 → Task 4; §8 → Task 16.
  - §9.1–9.2 → Task 6; §9.3 → Tasks 7, 8 and 18; §10 → Tasks 13–15; §12 languages → Task 2.
  - P3–P7 (editor asset panel, expansion, admin, export, intelligence) get their own plans.
- **Types:** `DirectionKey`, `Format`, `Subcategory`, `Descriptor`, `AssetManifest`, `CriticalCode`, `Review` and `ParsedQuery` are defined once and used with the same names later.
