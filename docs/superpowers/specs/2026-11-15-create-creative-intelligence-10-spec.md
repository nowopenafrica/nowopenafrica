# NowOpen Create: from 3/10 to world-class. Audit, gap analysis and phased spec

2026-11-15 · status: **APPROVED by the founder 2026-11-15 ("Approve, start CI-0"), with the recommended D1–D9. D7 (reviewers) had no recommendation and is still open.** CI-0 in progress · worktree `nowopen-creative-intel`, branch `creative-intel-spec` (HEAD `711d9a5`), uncommitted.
Extends `2026-11-07-creative-intelligence-catalogue-design.md` (approved 2026-11-07). That spec is not replaced: its catalogue, asset library, gate, criticals C1–C13 and phases P3, P5 and P6 continue. This spec adds what the new brief, "NowOpen Create — The 10/10 Creative Intelligence Upgrade", asks for and that one did not cover: a brief, concepts, a composition engine, a library of creative knowledge, the founder's 100-point rubric and a benchmark.

Reference images (six mood boards) are used for principles only (Ruling AJ). No layout, mark, photograph or lettering from Nike, Louis Vuitton, Loewe, Piaget, Rolls-Royce, Mode Suisse or any studio is reproduced. The same rule covers Canva and Freepik.

---

## 1. What exists already (read before planning)

The Creative Intel programme (worktree `nowopen-creative-intel`) has built, reviewed and committed locally (not merged, not deployed):

| Built | Where |
|---|---|
| Format registry with sources; Latin Extended fonts (₦, ₵, Yoruba/Igbo/Hausa letters) | `src/lib/design/formats*`, `public/fonts/studio` |
| 8 creative directions (luxury, minimal, corporate, editorial, bold, contemporary, playful, industry) | `src/lib/design/directions.ts` |
| Composition descriptor (7 features) and distinctness rules (≥3 of 7 differ) | `src/lib/design/composition.ts` |
| Catalogue taxonomy A–H, subcategories, occasions, industry groups | `src/lib/create/catalogueTaxonomy.ts` |
| Quality scorer (59 automated points), criticals C1–C13, review ledger, gate (off) | `src/lib/design/quality/` |
| Asset library tables + buckets (**live in production** since 2026-11-08), manifest, intake script, asset review tab | migration `20261114010000`, `scripts/assets/` |
| Template detail page, intent search ranking, collections, filters, mockups | `src/lib/create/*`, `/media/templates/:key` |
| 20 pilot templates (8 cards, 6 Instagram 4:5, 6 billboards), redesigned in 18c-1 and 18c-2 | `pilotTemplates.ts` |

Open on that branch: the founder's scores for the 20 pilots (sheet https://claude.ai/artifact/KwHKyBXyifN9qhGNVorNh8, no scores saved), the photo intake (34 licensed photos + 4 in-house files rebuilt in `nowopen-creative-intel-assets`, never run), switching the gate on, the final review, and the merge. The branch is 10 commits behind the main checkout's `promote-step2` and carries about 20,800 changed lines.

## 2. Audit: one request traced from input to export

The five benchmark briefs were run through the live intent reader (`classifyIntent`, `routeFor`, `deliverableForIntent` in `src/lib/create/intent.ts`, main checkout) on 2026-11-15. No production writes.

**Correction (CI-0, 15 Nov):** the first version of this table said two briefs end at "What are you making?". That is what `routeFor` returns, but the live composer (`IntentComposer`) checks `needForIntent` first, so in the UI all five briefs open a gallery section. The real failure is what those sections hold. The table below is from the UI, confirmed in the browser.

| Brief as typed | What the live composer opens | Where quality is lost |
|---|---|---|
| Launch poster for a luxury Nigerian skincare brand | Flyers & posters → Poster: **1 design**, a square "Coming soon" flyer tagged Technology & media | "launch" read as an event; skincare, Nigeria and audience dropped |
| Billboard for high-end Lagos real estate | Signs & outdoor → Billboard: **2 designs** (billboard, LED screen) | Lagos, real estate and high-end positioning dropped |
| Brand identity for a premium African fashion label | Brand → **Product label** (2 designs) | "label" read as a product label; no identity system exists |
| Social posts for an international tech conference | Social → Instagram post: **3 designs, none about events** | "conference" ignored |
| Instagram post for a contemporary restaurant opening | **the same 3 Instagram posts** as the conference | "contemporary", restaurant and opening all ignored |

After the reader, the path is: keyword search over templates → pick a template → the customiser swaps palette and type style (11 styles × 36 palettes) → export.

**Where quality is lost (L1–L10):**

1. **L1 Input.** A keyword lexicon with no fields for industry, audience, objective or placement. Every brief lands on a deliverable shelf of 1–3 generic designs; two different briefs get identical results.
2. **L2 No brief object.** Nothing carries objective, audience, tone or brand assets to the later steps.
3. **L3 No concept stage.** The user goes straight to a template list. Variety comes from recolouring fixed geometry; the 11-07 audit found 33 palettes doing the work across 67 designs.
4. **L4 Thin art direction.** 8 directions. There is no knowledge of movements (Swiss, Bauhaus, Afro-Contemporary, Retro-Futurism…), of when each fits, or of what each industry expects.
5. **L5 Imagery, the biggest single loss.** The live library is 8 hotlinked Pexels photos. The 34 licensed photos have never been taken in. Most photo-led pilots render the designed empty fallback (e.g. ig-luxury: a patterned empty frame). Premium work in every reference board is image-led.
6. **L6 Copy.** By founder decision D1, sample lines are generic ("Come see what's new"). Nothing writes to the brief.
7. **L7 Adaptation.** Coordinates are normalised 0–1, so a design changed from 4:5 to 2:1 is scaled, not recomposed. No module rearranges a layout by aspect.
8. **L8 Export.** PNG via html-to-image. The PDF is that PNG inside a PDF. There is no JPG, no SVG, no vector PDF, no bleed and no crop marks (unchanged since the 11-07 audit; old P6).
9. **L9 Measurement.** The 20 pilots score 53.3–59 of 59 automated points with no criticals, while the art-director critique counted 0 premium. My own look at the latest shots agrees: clean, correct, generic. The automated score measures compliance, not quality. The founder's rubric weights originality, art direction and composition (45 of 100), and none of those can be measured by code.
10. **L10 Create's own interface.** Coolvetica is loaded (`src/index.css`) and mapped as `font-coolvetica` in Tailwind, but no Create page or component uses it.

## 3. Gap analysis against the brief

| Brief item | Exists | Gap | Phase |
|---|---|---|---|
| 1. Brief engine (industry, audience, objective, placement, brand assets, smart defaults, few questions) | intent reader (keywords, format, style) | Brief model, fields, industry defaults, ≤3 questions, the five failures above | CI-2 |
| 1. Three genuinely different concepts | none | Concept engine; distinctness across idea, composition and visual language | CI-3 |
| 1. Art direction → production → adaptation → QC → delivery | directions, scorer, export (PNG) | Composition engine, recomposition, vector exports | CI-3, CI-6 |
| 2. Creative Intelligence Library (fundamentals, ~25 movements, 2026 trends, ~25 industries, request taxonomy, type pairings, photography, print) | 8 directions, taxonomy A–H, `TYPE_PAIRINGS`, `printSpec.ts`, premium brief (SDD, git-ignored) | Docs and a typed registry; movements; industries; dated trends | CI-1 |
| 3. Structured editable document | `DesignDocument` v2: layers, text, image, shape, group, z, lock; history (undo); snapping; groups | Grid and type tokens, safe area and bleed on the document, image crop, recompose-on-resize | CI-3, CI-6 |
| 3. Exports PNG, JPG, SVG, print PDF | PNG; raster PDF | JPG, SVG, vector PDF with bleed, trim and embedded fonts | CI-6 (= old P6) |
| 4. 100-point rubric with thresholds and named defects; human review | 59-point automated scorer + 41 reviewer points; criticals; ledger | Founder's rubric; defect naming; screenshot-based review | CI-0 (sheet), CI-5 (code) |
| 5. Template families, originality checker | composition distance, ≤2 per direction | Families by archetype; recolour detection | CI-5 |
| 5. Screenshot visual regression | none; no Playwright in `package.json` | Screenshot harness | CI-5 |
| 5. Admin curation of profiles, templates, references with approval | Template Manager, asset review tab | Profiles and references tabs; approval before publish | CI-7 (= old P5) |
| 6. Create UI in Coolvetica + NowOpen logo | font loaded, unused in Create | Apply to Create chrome only, never to customer designs | CI-2 |
| 7. Benchmark: 5 briefs × 3 directions | none | Before and after, rendered and scored | CI-0 (before), CI-4 (after) |
| Longer target: 30 briefs ≥ 90 on independent review | none | Scale-up with independent reviewers | CI-8 |

## 4. Design

### 4.1 Pipeline

```
Brief ──► Concepts (3) ──► Art direction ──► Composition ──► Imagery + copy ──► QC ──► Editable delivery
 CI-2        CI-3            library CI-1       CI-3           D1, D2            CI-5    Studio + CI-6
```

Each stage writes a typed object; nothing is passed as a flattened image. The output is a `DesignDocument` (schema v2 plus the CI-3 additions) that opens in Studio.

### 4.2 Creative Intelligence Library (CI-1)

- **Docs** for people: `docs/creative-intelligence/` with `README.md`, `fundamentals.md`, `movements.md`, `trends-2026.md`, `industries.md`, `request-taxonomy.md`, `typography.md`, `photography.md`, `print-production.md`. Each says where its rules came from, and which numbers are heuristics.
- **Registry** for code: `src/lib/create/intel/` (`movements.ts`, `industries.ts`, `trends.ts`, `pairings.ts`, `photography.ts`). This follows the real layout (`src/lib/create`, `src/lib/design`); there is no `src/create`. A test checks that every movement and industry in the docs exists in the registry and the other way round, so the two cannot drift.
- **Movements (about 25).** Each has: principles, grid and type behaviour, palette logic, imagery mode, the composition archetypes it may use, **when to use, when not to**, and the industries it suits. The list includes Swiss International, Bauhaus, Luxury Minimalism, Neo-Brutalism, Editorial, Contemporary Maximalism, Afro-Contemporary, African Modernism, Retro-Futurism, Corporate Precision, Analog Experimental, 3D/CGI, Art Deco, Japanese Minimalism, Psychedelic/Y2K, Organic/Natural, Kinetic Typography, Memphis, Constructivism, Heritage/Craft, Data-led/Information design, Monochrome Photographic, Gradient Futurism, Collage, Typographic Monumentalism. The 8 existing directions become movement groupings, so existing templates keep their tags.
- **Trends 2026.** Every entry has a date added and a review-by date. A test fails once a review-by date has passed, so stale trends are never presented as current.
- **Industries (about 25).** Each has: audience, goals, the movements that fit and those to avoid, required information (e.g. clinic hours, property price and size), imagery subjects, regulatory cautions (health claims, alcohol, finance), and default deliverables. They extend `INDUSTRY_GROUPS`.
- **Request taxonomy.** The founder's 7 request families (branding, social, advertising and outdoor, events, packaging, print and merch, production) map onto categories A–H. They do not replace them.
- **Typography.** Only faces we self-host with a recorded licence (OFL or owned). Each pairing names its roles and the movements it serves.
- **Referenced from `AGENTS.md`.** The repo has no `CLAUDE.md` (see D8).

### 4.3 Brief engine (CI-2)

- `src/lib/create/brief/` holds `CreativeBrief`: deliverable(s), placement and format, industry, audience, objective, tone, brand assets (logo, colours, fonts, photos), mandatory copy, constraints, and a `source` for each field (typed / inferred / default).
- The reader is extended rather than replaced. The five failures in §2 become regression tests first.
- Defaults come from the industry profile. At most 3 questions, and only those whose answer changes the concepts.
- Optional model fill (D2): the model may propose values for empty fields. Every proposed value is checked against the library's vocabulary and shown as "suggested".

### 4.4 Concepts and composition (CI-3)

- **Composition archetypes (about 16).** Each is a grid-based generator, not a fixed layout. Examples: full-bleed image with type in negative space; typographic poster; asymmetric editorial split; Swiss modular grid; passe-partout frame; monumental type; product hero on a colour field; collage; information-led. Each generator takes a format and returns a `DesignDocument` with grid, type tokens, image regions, safe area and bleed.
- **Recomposition.** Each archetype defines its layout for each aspect class (tall 9:16, portrait 4:5, square, landscape 16:9, ultra-wide 2:1 and wider). Changing format re-runs the generator with the same content; nothing is stretched.
- **Concept = {idea in one sentence, headline and support copy, movement, archetype, type pairing, palette, imagery brief, rationale}.** The three concepts in a set must differ in movement **and** archetype **and** imagery mode, and their rendered composition descriptors must be at least 4 of 7 apart. A palette-only difference is refused.
- **Who proposes.** With D2 approved, a model proposes concepts as JSON inside the library vocabulary. A validator refuses anything outside it, and the composition engine guarantees the craft (grid, scale, margins, contrast). Without a model, a deterministic picker chooses from the industry profile. Both paths are tested.
- **Copy.** Brief-specific lines from the model, or the user's own. Never invented claims, awards, prices or testimonials (C10 applies).

### 4.5 Quality engine (CI-5) and the rubric

- **The founder's rubric replaces old §9.2** (D3): Originality 15, Art direction 15, Typography 15, Composition 15, Imagery 10, Colour 10, Brand relevance 10, Commercial effectiveness 5, Technical execution 5. Below 70 reject, 70–79 revise, 80 and above strong.
- **Criticals C1–C13 stay as hard gates**, whatever the score.
- **Measured evidence** (contrast, scale steps, margins, grid alignment, word budget, glyphs, dimensions) feeds the Technical line and is shown beside the Typography and Composition lines. It never fills them alone.
- **Named defects.** Each check and each reviewer note names the defect, for example "headline cap height 4.1% of board; floor 7%" or "accent covers 22% of area; 10% target".
- **No self-scores.** A model critique may list suspected defects for a reviewer to confirm. It is never recorded as a score. Scores come only from people looking at rendered screenshots, recorded in the ledger with who, when and the content hash.
- **Originality.** Template families are keyed by archetype. A recolour (same descriptor, different palette) of a listed sibling counts as a duplicate (C13). Each deliverable has a family cap.
- **Visual regression.** A screenshot harness renders every listed template and benchmark concept at fixed sizes and compares against approved baselines. The tool is decision D9.

### 4.6 Editor and exports (CI-6, old P6)

Image crop with a focal point on the document object; recompose on resize (from CI-3); JPG and SVG export; vector PDF with 3 mm bleed, trim and crop marks and embedded fonts; output checked against the preview (C8). `StudioEditor.tsx` has been off-limits for this branch (see D6).

### 4.7 Create's own interface

Create's chrome (headings, navigation, buttons on `/media` and the brief and concept screens) uses Coolvetica and the existing NowOpen logo. Customer designs never inherit it.

## 5. Phases

Every phase ends with a review sheet (an Artifact with rendered screenshots) and waits for the founder's approval. No push, merge, deploy or production write without the founder's word.

| Phase | Builds | Done when |
|---|---|---|
| **CI-0 Baseline** | Rebase or merge plan for `creative-intel-spec`; the **"before" benchmark**: the 5 briefs through today's Create, best 3 matches each = 15 renders; the 20 pilots added to the same sheet; founder scores all of them with the new rubric | Founder scores saved; baseline numbers recorded honestly |
| **CI-1 Library** | `docs/creative-intelligence/*` + `src/lib/create/intel/*` + parity test + `AGENTS.md` reference; one plate per movement built from our own compositions | Founder approves the library sheet |
| **CI-2 Brief** | `CreativeBrief`, reader fixes (5 regression tests), industry defaults, ≤3 questions screen, Coolvetica on Create chrome | The 5 briefs produce complete briefs with ≤3 questions |
| **CI-3 Concepts + composition** | Archetype generators, recomposition by aspect class, concept engine (model + deterministic), distinctness check | Each brief gives 3 concepts that pass distinctness and C1–C13 |
| **CI-4 Benchmark** | 15 "after" renders, side by side with CI-0; founder scores | Each of the 15 scores ≥ 80, and none reads as generic to the founder. Otherwise revise and repeat. Not passed until then |
| **CI-5 Quality engine** | Rubric in code, defect naming, family and recolour checks, screenshot regression | Regressions caught in tests; ledger holds rubric reviews |
| **CI-6 Editor + exports** | Crop, recompose resize, JPG, SVG, vector print PDF (= old P6) | Exports match previews (C8 on) |
| **CI-7 Admin curation** | Profiles, templates and references in Template Manager with approval before publish (= old P5 scope) | Nothing publishes without approval |
| **CI-8 Scale** | 30 briefs, before/after reports | 30 briefs ≥ 90 on independent review |

The old P3 (asset panel and intake at scale) runs alongside, once D1 is settled.

## 6. Decisions for the founder

1. **D1 Imagery.** The 11-07 spec says AI never generates published imagery. Premium output in these boards is image-led, and the 34 licensed photos cannot cover skincare product shots, Lagos interiors and 3D key art. Options: (a) licensed and customer photos only; (b) add AI-generated key visuals through the existing `generate-image` function, labelled as AI, approved by a person, never of real people or brands; (c) both. **Recommended: (c)**, plus running the pending photo intake now.
2. **D2 Concept model.** Model-proposed concepts within the library vocabulary, with a deterministic fallback, or rules only? **Recommended: model-assisted.** The Groq path used by Brand Autopilot already exists; each request costs model tokens, which should count against NOC credits later.
3. **D3 Rubric.** Replace old §9.2 with the founder's 100-point rubric, keep C1–C13 as gates, and keep 85 as the catalogue publication bar? **Recommended: yes.**
4. **D4 Branch.** Continue on `creative-intel-spec`, rebased onto the current line first, rather than starting a parallel branch. **Recommended: continue.**
5. **D5 Pilot scores.** Score the 20 pilots on the old sheet now, or once with the new rubric in CI-0? **Recommended: once, in CI-0.**
6. **D6 Studio.** Concepts must open and be edited in Studio, but `StudioEditor.tsx` has been off-limits because Promote edits it. Allow small additive edits, coordinated with the Promote session? **Recommended: yes, from CI-3.**
7. **D7 Independent reviewers.** The 30-brief target needs reviewers other than the builder. Founder alone, or the founder plus a named designer?
8. **D8 Library home.** `docs/creative-intelligence/` + `src/lib/create/intel/`, referenced from `AGENTS.md`. Also add a short `CLAUDE.md` that points to `AGENTS.md`? **Recommended: yes.**
9. **D9 Screenshot tests.** Add Playwright as a dev dependency for visual regression (new tooling; Vitest only today), or keep manual browser captures? **Recommended: Playwright, local only at first.**

## 6a. CI-0 record (2026-11-15)

**Before benchmark.** The five briefs were typed into the real `/media` composer on the main checkout's dev server (code `e8fe795` plus live uncommitted work; localhost sends no analytics; nothing saved). The cards were rendered with html-to-image at 7× pixel ratio. 15 scored renders plus 3 context renders are in `.superpowers/sdd/2026-11-07-creative-intelligence-phase1-2/scoring/ci0/before/` (`b1-1`…`b5-3`, `b45-ctx-*`). Selection rule: what the request opened first; where it opened fewer than 3 relevant designs, the closest designs from the same section, each labelled on the sheet. Styles and colours are the gallery's showcase rotation.

**Scoring sheet:** https://claude.ai/artifact/Ss77QxceDeUAjY62BBdVgi. It holds the 15 before designs and the 20 pilots on the 100-point rubric, with a "reads as generic" flag and defect notes. Saves go to the artifact's own store (`reviews/<item id>`), never to NowOpen's database. Read back with ArtifactData `list reviews`. No scores yet.

**Provisional review (Claude, 15 Nov; not a human review).** The founder's saves never reached the sheet's store (the store stayed empty, and the founder's own export showed 0 scores), and the founder then asked Claude to score. File: `scoring/ci0/claude-provisional-review.json` (9 rubric scores, a total and named defects for each of the 35). Results: before average 34.6 (26–52); pilots 55.4 (43–67): cards 59.1, Instagram 54.7, billboards 51.2. **0 of 35 reach 70.** 28 of 35 have no photograph, and 6 of the 7 that do show the wrong subject. By §4.5 these are not scores of record: `ledger.ts` is unchanged and the gate stays off. They are the working baseline for CI-4 until a human review replaces them.

**Merge plan (D4).** `git merge-tree promote-step2 creative-intel-spec` (2026-11-15) merges with **no conflicts**. The main checkout has 117 uncommitted files (NOC, Brand Autopilot and other live work owned by other sessions). Only `package.json` (two script lines each side) and `src/App.tsx` (additive routes each side) overlap with the branch, and both are additive. Order:
1. Do not merge yet. Merging is shipping: deploys ship the whole folder, so the next deploy by any session would take the branch's gallery, detail page and pilots live while the gate is off. The 11-07 rule is that the pilot does not deploy before the gate is on.
2. CI-1 to CI-3 continue on `creative-intel-spec`. Merge `promote-step2` into the branch at each phase end so the gap stays small. That brings no Promote edits into Create files.
3. Once the founder's CI-0 scores are in: write REVIEWS to `ledger.ts`, set `GATED_SUBCATEGORIES`, and turn the gate on. Any pilot under 85 or with a critical stays unlisted.
4. Then, on the founder's word: the other sessions commit the live uncommitted work first, then merge the branch, hand-merge the two additive files, run `npm run build` and `npm run verify`, and run `npm run check:drift`. That closes the known drift note, because migration `20261114010000` then has its file. Deploy is a separate go-ahead.

## 6b. CI-1 record (2026-11-15)

Founder accepted the provisional review as the working baseline and said "start CI-1". Built, uncommitted, on `creative-intel-spec`:

- **Registry** `src/lib/create/intel/`: `types.ts`, `archetypes.ts` (16), `pairings.ts` (6 new pairings beside the 7 existing; `FACE_GAPS`), `movements.ts` (25), `industries.ts` (25), `trends.ts` (10, all `proposed`, added 2026-11-15, review by 2027-02-15), `photography.ts`, `requests.ts` (7 families), `docs.ts`, `index.ts` (`movementsForIndustry`).
- **Docs** `docs/creative-intelligence/`: README, fundamentals and print-production are hand-written; movements, industries, typography, photography, request-taxonomy and trends-2026 are generated by `npm run intel:docs` (new script in `package.json`).
- **References:** a section in `AGENTS.md`; a new `CLAUDE.md` pointing at it (D8).
- **Checks:** `npx vitest run src/lib/create/intel` 101 pass; `npm run typecheck` clean; eslint clean on the folder. The full suite was not re-run (only new files, one script line and two docs changed).
- **Review sheet:** https://claude.ai/artifact/BMixgkr2TjQp6PgS3G7HJM (25 plates drawn from registry tokens; hatched areas mark where imagery goes, because no licensed imagery exists yet).

Findings to carry forward:
- **Typeface gap.** Ten customer-facing faces cannot speak 25 movements (no geometric sans, neutral neo-grotesque, didone, old-style text serif, extended display or slab). Six OFL candidates are listed as `proposed`; each needs founder approval, a licence check and the C3 glyph check.
- A test requires every industry to be offered movements from three or more groups. It caught gyms being all "bold" and now guards concept distinctness.
- Trends stay off: the engine may read only `activeTrends()`.

Waiting on the founder: approve the library vocabulary; decide on the six faces; trends stay off unless told otherwise.

## 6c. CI-2 record (2026-11-15)

Founder approved the library and the six typeface candidates and said "start CI-2". Built, uncommitted:

- **Engine** `src/lib/create/brief/`: `types.ts` (`CreativeBrief`; every field carries a source: typed / inferred / default), `lexicon.ts` (industry, objective, tier, place, audience and movement words; listing category → industry), `readBrief.ts` (`readBrief`, `questionsFor`, `answerBrief`, `briefIsReady`, `directionsToExplore`). Deterministic; builds on `parseQuery` in `searchRank.ts`. No model call.
- **Screen:** `src/components/create/BriefPanel.tsx`, shown under the request bar by `IntentComposer.tsx`. `CreateMarketplace.tsx` gained a `stay` flag so a typed request no longer scrolls away from its brief. Coolvetica on the page h1 and the panel headings.
- **The brief now chooses what opens below.** A system-scope request passes no deliverable, so the fashion identity opens Brand, not Product label.
- **Checks:** 5 benchmark briefs are regression tests (`readBrief.test.ts`, 28 tests; `BriefPanel.test.tsx`, 5). `npx vitest run src/lib/create src/components/create`: 643 pass. Typecheck and eslint clean. Browser check on the branch dev server: panel renders, Coolvetica loads, no console errors, nothing saved. The full suite was not run; 8 SQL line-ending tests under `src/test` fail in this checkout on files not touched here (the CRLF checkout artefact already in the ledger).
- **Review sheet:** https://claude.ai/artifact/QdutB6wmLZqqscK4dveQMB

Not done in CI-2, by design: concepts (CI-3); using the answers in a design (CI-3); passing the signed-in business name, category and city into `readBrief` (the reader accepts them, the page does not send them yet); model-assisted fill (D2, with CI-3).

Next: the six typeface candidates (download, licence check, C3 glyph check), then CI-3.

## 7. Risks

- **Generic output despite the machinery.** The rubric and the benchmark exist to catch this. CI-4 has no "pass with notes".
- **Model cost and drift.** Concepts are validated against the vocabulary, the deterministic fallback stays tested, and tokens are recorded.
- **Merge distance.** About 20,800 unmerged lines, and other sessions edit Create and Promote. CI-0 settles the plan before any new code.
- **The dev server writes to production.** Benchmark renders read only. Nothing is saved from the browser.
- **Copyright.** References are principles only (Ruling AJ). AI imagery prompts never name brands, artists or living designers.
