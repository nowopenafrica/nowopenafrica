# Master Creative Intelligence & Template Catalogue Upgrade — design spec

2026-11-07 · status: **approved by the founder 2026-11-07, as written (all §16 recommendations); nothing built** · branch `creative-intel-spec` (worktree `nowopen-creative-intel`, uncommitted)
Audit (Phase 1 review sheet): https://claude.ai/artifact/MXe846k1kJLoCtR8VhT53A
Requirements: the founder's brief, "Master Creative Intelligence & Design Template Catalogue Upgrade" (16 sections), plus three extra decisions. This spec follows the brief's numbering where it can. It extends `2026-10-31-create-flow-10-design.md`; that spec's payment and finish steps are unchanged.

---

## 1. Intent

**The brief, in short:**
- Make the catalogue a premium, curated, production-ready creative ecosystem. Every template must be something a real business, agency, event organiser or advertiser would use.
- Every template must be practical, editable, correctly sized and exportable.
- Optimise for quality, diversity, relevance, realism and usefulness, not template count.

**The founder's extra decisions:**
1. A real, searchable, licensed asset library, not screenshots.
2. Depth inside each category. Business cards, for example, come in luxury, minimal, corporate, editorial, bold, contemporary, playful and industry directions.
3. Template, preview and mockup are kept separate. Billboard artwork is correctly proportioned and exports on its own.
4. Build and validate a representative collection first, then scale.

**Assumptions (please correct):**
- AI may suggest and check (§11), but it never generates published imagery in this programme, and nothing is published without an admin.
- The founder, or an admin the founder names, gives the human part of each quality score.
- "Verified" means checked against a recorded source with a date. A badge or claim without that evidence is not shown.

**Success = the brief's §16 acceptance list.** Each item maps to a phase in §13.

## 2. What the audit found

The review sheet has the detail. These are the findings the design depends on:

| Finding | Consequence |
|---|---|
| 110 code templates, 67 listed; most deliverables have 0–1 designs | Depth is measured per deliverable |
| Variety is mostly palette (33 palettes across 67 designs) | Directions and composition are measured, not colour |
| 71 uploaded rows are published but none is shown (no look, need or preview) | Uploads go through the same gate (Phase 5) |
| The image library is 8 hotlinked Pexels URLs; no asset or licence tables | A new asset library (§6) |
| **All 12 Studio font files are Latin-only subsets**: no ₦ or ₵, no Yoruba or Igbo dot-below, no Hausa hooks, no Akan or Ewe ɛ ɔ. The demo copy uses ₦ 33 times | Font files replaced with Latin Extended; glyph coverage becomes a critical check (§9) |
| No template detail page; cards open the customiser | A detail page (§10) |
| PDF export is a PNG inside a PDF; no JPG, SVG or .pptx export; no bleed or crop marks | No "print-ready" claims until Phase 6 |
| 5 size registries; billboard is one 4500×1500 (3:1) canvas; platform sizes carry no source or date | One format registry with sources (§5) |
| Template Manager: multi-file upload with named refusals, but no ZIP, versions, collections, featured or pricing | Admin work (Phase 5) |
| Two category systems (9 needs on the page, 7 old categories in the DB and the audit script) | One taxonomy (§4) |

## 3. Approach

**Recommended: A. Templates stay in code until the gate is proven.** Code templates remain TypeScript `DesignTemplate` objects. Assets, licences and mockup scenes live in the database and storage, exported to a committed `assetManifest.json`. Quality reviews live in a committed ledger. Every template change is a reviewed diff, tests enforce the gate offline, and the live gallery never depends on a database read.

In Phase 5, uploaded templates get the same gate in the database (review state, versions, admin approval), and the Template Manager becomes the place admins approve both kinds.

Rejected:
- **B. Everything in the database from day one.** The 71 published-but-invisible rows show what an unproven upload path produces.
- **C. Live stock search inside the editor.** It means hotlinked files, no per-file evidence and a licence that can change underneath us. Stock services are used only as intake sources, through their official APIs or downloads (§6.3).

## 4. Catalogue taxonomy

One registry, `src/lib/create/catalogueTaxonomy.ts` (separate from the search helpers in `src/lib/design/taxonomy.ts`), replaces the 9 needs and the 7 old categories as the source of truth:
- **Categories:** the brief's A–H. Brand identity & corporate; Social & digital marketing; Advertising; Print & publishing; Presentations & documents; Events & entertainment; Product, packaging & merch; Photo, video & production.
- **Subcategories:** the deliverables, each with its format keys. Business card, letterhead, 48-sheet billboard, pitch deck, and so on.
- **Facets** on every template: industry (the brief's I list, mapped to the real category groups in `data/categories.ts`), occasion (sale, launch, opening, holiday, wedding, church and community, sport), direction (§7.2), format, orientation and editability.
- **Industry collections (I)** are curated views over facets, not a separate tree. "Hospitality & restaurants" collects menus, flyers, social posts and signage that carry that industry.
- **Business needs:** the 9 current need tiles become a "Browse by need" facet that maps onto subcategories, so old links and the request bar keep working.
- **No padding (J).** A category or subcategory is shown only when it holds at least 4 directions of published work. Until then it is absent, not empty.

## 5. Format registry

`src/lib/design/formats.ts` is the single source for canvases. Every format records:
- key, label, pixel canvas;
- physical size in mm (if printed), medium (screen, office, press or large-format), target delivered DPI, bleed, trim and safe area;
- for platform formats, a `source` URL and a `verifiedAt` date. A platform format not re-verified for 180 days appears on the audit as "needs re-check", and its "platform size" badge is hidden.

`printSpec.ts`, `studio/formats.ts`, `studioPresets.ts` and `deliverables.ts` read from it. `promote/sizeSpec.ts` belongs to the Promote session and gets an adapter later; this work never edits it.

**Boards.** The pilot board is the 48-sheet, 6096 × 3048 mm (2:1), delivered at 1:10 scale at 150 dpi (3600 × 1800 px). That target must be confirmed with a print partner before any "print-ready" claim. More board ratios (96-sheet, unipole, LED screens, bus and taxi) come from the placement inventory once its free-text dimensions are structured.

**Regional print sizes** (A-series, US Letter, the common Nigerian and Kenyan sizes) are added only with a recorded source.

## 6. Asset ecosystem

### 6.1 Tables (one migration, dry-run first, applied only on approval)

**`design_asset_licences`**: one row per accepted licence.
- `key`, `name`, `url`, `terms_snapshot_path`;
- yes/no fields: `commercial_use`, `modification`, `attribution_required`, `standalone_resale`, `template_embedding`, `print_use`;
- `restrictions` (text), `reviewed_by`, `reviewed_at`.

**`design_assets`**: one row per file, carrying every field brief §14 lists.
- `kind`: photo, illustration, vector, icon, pattern, texture, gradient, frame, mask, shape, chart, map, badge, device_frame, overlay or mockup_scene.
- Description: `title`, `description`, `tags[]`, `subjects[]`, `industries[]`, `regions[]` (country codes), `dominant_colours[]`, `orientation`.
- File: `width_px`, `height_px`, `bytes`, `mime`, `storage_path`, `thumb_path`, `sha256` (unique).
- Provenance: `source_name`, `source_url`, `source_asset_id`, `creator_name`, `creator_url`, `licence_key` (fk, not null), `licence_evidence_path`, `retrieved_at`, `attribution_text`, `restrictions`.
- For icons: `icon_set` and `stroke_style`.
- Rights: `contains_people`, `contains_brands`, `release_on_file`.
- Review: `status` (draft, in_review, approved, retired), `retired_reason`, `created_by`, `reviewed_by`, `reviewed_at`.
- `search` (a generated tsvector).

Constraints:
- `approved` requires evidence and a retrieval date.
- `contains_brands` can never be approved.
- `contains_people` without a release is approved only under a licence whose restrictions permit it, and is then tagged `no-endorsement`.
- `retired` needs a reason.

**`design_mockup_surfaces`**: `asset_id` (a mockup_scene), four normalised corners, `ratio`, `format_keys[]`, `label`.

RLS and storage:
- Anyone may read `approved` rows. Only staff (`is_staff()`) write.
- Two buckets: private `design-assets-intake` and public `design-assets`. Approval copies the file across, so a draft is never reachable by URL.
- The intake bucket validates type and size in storage policy (PNG, JPG, WebP, SVG, WOFF2 and OTF, 25 MB). SVG is sanitised before approval with the same stripping Studio's SVG import already uses.

**Search:** `search_design_assets(q, kind, colour, orientation, industry, region, limit, offset)`. It runs as the caller (SECURITY INVOKER), uses GIN indexes and pages with a stable tiebreaker because of the 1000-row cap.

### 6.2 How templates use assets
- `npm run assets:manifest` writes `src/lib/design/assetManifest.json` (committed) from approved rows.
- Templates reference assets as `asset:<uuid>`, never by URL. Tests fail on a missing or retired id and on any external image URL.
- A template declares one `iconSet`. Mixing icon sets in one template is a critical failure, which enforces the brief's "don't mix icon styles".
- An image or icon placed in the editor keeps its asset id, and an export lists any required attribution.
- Icons are recoloured through `currentColor` on sanitised SVG.

### 6.3 Sources: what may enter, and how

Every source's terms are re-read and captured into `terms_snapshot_path` at the first intake. The table records what this spec expects to find, so the founder can see the policy; the capture is the evidence.

| Source | Expected terms to verify | Policy |
|---|---|---|
| Pexels | Free commercial use and modification; no selling unaltered copies; no implied endorsement by people shown; API key and attribution in API use | Accept. Self-hosted. Downloads of the raw file are not offered |
| Pixabay | Content Licence, similar to Pexels; its API asks that images be downloaded rather than hotlinked | Accept. Self-hosted |
| Unsplash | Unsplash Licence is permissive, but its API guidelines require hotlinking and photographer credit | Manual download under the licence only, with credit stored. No API |
| Openverse / Wikimedia Commons | The licence varies per file | Accept only CC0, public domain or CC BY 4.0 per file. Reject BY-SA, NC and ND |
| unDraw | Its licence restricts building a competing illustration library | Not accepted until its terms are reviewed |
| OpenMoji | CC BY-SA 4.0 | Not accepted (share-alike would extend to templates) unless the founder accepts it |
| Lucide (ISC), Heroicons (MIT), Tabler (MIT), Material Symbols (Apache 2.0) | Permissive code licences | Accept. Lucide first; it is already a dependency |
| Google Fonts (OFL 1.1) | Free commercial use and embedding | Accept. Latin Extended files self-hosted (§9) |
| Coolvetica | Ray Larabie / Typodermic terms | Use only once the official licence text is captured |
| `nowopen-original`, `commissioned` | Made in-house, or a work-for-hire agreement on file | Accept |
| Canva, Freepik, unknown, scraped | — | No licence row exists, so they cannot be recorded |

Rules for every source:
- Use only official APIs or the official download page; no scraping.
- Respect rate limits; intake is batch and staff-run.
- Business logos and photos never enter this library; they stay in `business_media_assets`.
- No automatic tribal patterns, flags, maps or stereotypes (brief §11). Heritage patterns are a design choice made per template, never applied by country.

## 7. Art direction system

### 7.1 Tokens
- **Palettes.** The 36 palettes stay. They are tagged into the brief's families: luxury, corporate, editorial, monochrome, vibrant, earth, futuristic, heritage, seasonal. Gaps are filled in Phase 4, not invented now.
- **Typography roles.** Display, contemporary sans, editorial serif, geometric, humanist, condensed, mono and script. Today there is no humanist face and no script face; one OFL face each is added in Phase 1 with Latin Extended coverage. Pairings stay curated in `TYPE_PAIRINGS`.
- **Finishing.** Shadows, texture, borders and frames come from asset kinds (`texture`, `frame`) and from shape specs. There are no free gradients: gradients come only from palette roles.

### 7.2 Creative directions
A **direction** is a named art direction, held in `src/lib/design/directions.ts`:

```ts
interface Direction {
  key: DirectionKey; name: string; intent: string;
  archetype: Archetype;   // composition family
  pairings: string[]; paletteFamilies: string[];
  imagery: 'none' | 'full-bleed' | 'framed' | 'cut-out' | 'duotone';
  hierarchy: 'headline-led' | 'image-led' | 'information-led';
}
```

The starting eight are the founder's own list:

| Direction | Archetype | Typical for |
|---|---|---|
| Luxury | generous whitespace, centred, fine rules | hotels, fashion, beauty, real estate |
| Minimal | one strong element, strict margins | studios, tech, architecture |
| Corporate | header band, modular grid | finance, professional services, government |
| Editorial | asymmetric split, serif display | media, consulting, culture |
| Bold | stacked type, full-bleed colour | retail, food, events, sales |
| Contemporary | offset grid, grotesk, photo frames | startups, agencies, creators |
| Playful | rounded shapes, offset blocks | children, cafés, community |
| Industry | built from the trade's own imagery and information | clinics, schools, logistics, agriculture |

The **Industry** direction requires `industries` to be set, and is reviewed against that industry's real needs (brief §3 I). Photo-led and pattern-led are attributes of a template, not directions.

### 7.3 Measured composition and distinctness
`src/lib/design/composition.ts` computes a 7-feature descriptor from a template's slots and shapes at its true canvas:
- headline anchor in a 3×3 grid;
- headline size step;
- image share (0, under 25%, 25–60%, over 60%);
- number of text blocks;
- alignment;
- pattern coverage;
- whether the text sits in a container.

Rules, enforced by tests:
- Within a deliverable, any two listed templates differ in at least **3 of 7** features.
- No direction appears more than **twice** in a deliverable.
- A deliverable is shown only with at least **4** directions.

The pilot business card aims for all 8.

## 8. Template, preview and mockup

| | Template | Preview | Mockup |
|---|---|---|---|
| What | Artwork at its true canvas, all pages and sides | A picture derived from the template | A licensed scene with a surface |
| Lives in | Code (Phase 5: also DB rows) | Live `TemplateSurface`, or a cached thumbnail | Asset library + `design_mockup_surfaces` |
| Exported | Yes, alone | No | Never as artwork |

Rules:
- An export holds only the template.
- A mockup composites the rendered artwork at display time. It uses the homography in `src/lib/promote/surface.ts`, imported and never edited.
- A mockup is offered only when the scene's ratio matches the format within **1%**. Artwork is never stretched.
- Every mockup is labelled "Mockup: illustration only". A mockup is never presented as a verified placement; verified placements stay in Promote, under the trust model.

## 9. Quality standard

Every template version gets an evidence-based score out of 100. To publish it needs **at least 85 and no critical failure**. Each line records its evidence: a measured value, or the reviewer's note. Admins approve, reject, send for revision or publish.

### 9.1 Critical failures (any one blocks publication)

| # | Failure (brief §6 wording first) | Evidence |
|---|---|---|
| C1 | **Unlicensed or unknown asset**: any asset without an approved manifest entry, or any external image URL | test |
| C2 | **Missing metadata**: the template lacks category, subcategory, format, direction, editability or `iconSet` (when it uses icons) | test |
| C3 | **Broken font**: a face that is not self-hosted, has no licence, or is missing a glyph used by the template's copy or by the supported languages list (§12) | test |
| C4 | **Wrong dimensions**: the canvas ratio is off its format by more than 1%, or a side or page is missing for a two-sided deliverable | test |
| C5 | **Unreadable essentials**: contrast below WCAG AA in any of the 11 styles, essential text below the format's minimum size, or clipped with long real-world copy | test |
| C6 | **Broken preview**: the card or detail render throws, or shows a missing image | test |
| C7 | **Editable claim not kept**: a text slot, image or colour shown as editable cannot be changed in the customiser and Studio | test |
| C8 | **Corrupted export**: the export fails, has the wrong pixel size, or differs from the preview | test (fully from Phase 6) |
| C9 | Placeholder or nonsense copy (lorem ipsum, fake phone numbers, "Your headline here" outside a marked placeholder) | test |
| C10 | Invented business, testimonial, award, rating, endorsement or statistic | reviewer |
| C11 | A mockup, frame or scene baked into the artwork | test + reviewer |
| C12 | Print content outside the safe area, or no bleed on a press format | test |
| C13 | Mixed icon sets, or a duplicate composition of a listed sibling (§7.3) | test |

### 9.2 Scored criteria (brief §6 list)

| Criterion | Points | Evidence |
|---|---|---|
| Visual quality | 10 | reviewer |
| Typography | 10 | 5 test (registry pairing, scale steps, line length) + 5 reviewer |
| Composition | 10 | reviewer, with the descriptor shown |
| Real-world relevance | 10 | 4 test (required fields for the deliverable present) + 6 reviewer |
| Industry fit | 5 | reviewer |
| Image quality | 5 | test (source pixels ≥ placed size × export scale; no upscaling) |
| Editability | 10 | test (survives 11 styles, a brand colour, a long name, an empty optional field) |
| Correct dimensions | 10 | test (format match, safe areas, all pages and sides) |
| Export readiness | 10 | test (reaches the format's DPI under the export cap; formats offered really work) |
| Accessibility and readability | 10 | 7 test (contrast margin, minimum sizes) + 3 reviewer (e.g. billboard read in 3 seconds at distance) |
| Licensing and provenance | 5 | test (every asset has full metadata and evidence) |
| Mobile preview | 5 | 3 test (card legible at 160 px wide) + 2 reviewer |

Automated points total 59 and reviewer points 41. A template cannot pass on automation alone.

### 9.3 Where it lives
- The scorer is `src/lib/design/quality/`. It runs in tests and in `npm run audit:quality`.
- Reviews for code templates go in a committed ledger: key, content hash, reviewer, date, human points with notes, decision (approve, reject or revise).
- Editing a template changes its hash, so its review goes stale. A test fails for any directed template without a current passing review, so nothing drops out of the gallery silently.
- Phase 5 adds the same review record to uploaded rows in the database, with an admin screen to approve, reject, revise and publish.
- **Designs already live (founder decision).** Proposed: score the 67 in Phase 2. Hide any with a critical failure at once. Keep any scoring under 85 with a `legacy` mark for up to 60 days, until improved or replaced. The C3 font failure (₦) is fixed for all of them by the Phase 1 font work.

## 10. Discovery and detail (brief §7–8)

**Create page.**
- A hero with the request bar ("luxury real estate flyer", "billboard for a new restaurant").
- Featured collections, curated by admins.
- Popular and recent, from real counts.
- Industry collections.
- Browse by category, format, occasion, style and business need.
- **Trending styles and popularity appear only once there is reliable usage data.** `analytics_events` is not reliable, so they are hidden until a clean counter exists.

**Search.**
- The request bar parses intent into deliverable, industry, direction, occasion and format using a lexicon. It extends `intent.ts`.
- Results are ranked by how many parsed facets each template matches, then by quality score, so "luxury real estate flyer" finds flyers in the Luxury direction tagged real estate before any flyer that merely contains "luxury".
- Searches that find nothing are recorded so they can guide new designs (the store is decided in the Phase 2 plan).

**Filters.**
- Category, industry, format, dimensions, direction, colour family, orientation, editable format and recent.
- "Free or paid" appears only once something paid exists.
- A filter that would match nothing is not shown.

**Cards.**
- The artwork at its true shape, name, subcategory, direction, format and one practical line.
- Badges only when verified: "Editable" when C7 passes, "Print-ready" only once Phase 6 produces bleed PDFs, "Platform size" only when the format's `verifiedAt` is current.

**Detail page** (`/media/templates/:key`):
- a large preview;
- every page or slide, and front and back;
- mockup angles (labelled, where scenes match);
- dimensions in px and mm;
- the export formats that actually work today;
- the list of editable elements, from the slots;
- required fonts and assets, with their licences and attribution;
- intended use and related templates (same subcategory, other directions).

The main action is **Use this template**, which opens the real customiser or Studio on that design. A preview-only resource says so and has no "Use this" button.

## 11. AI curation (brief §10; Phase 7)
- First, rule-based tools built on the scorer and the descriptor:
  - gap finder (subcategories under 4 directions, industries with no collection, failed searches);
  - duplicate detector;
  - dimension and image-quality checks;
  - recommendations by parsed intent.
- Later, model-assisted suggestions (concepts, variations within the design system, asset matching) go through the same gate.
- Human approval is the default. Nothing is auto-published.
- This becomes the standing "Creative Asset & Template Intelligence" system the founder mentioned, reporting to the admin dashboard.

## 12. African and global intelligence (brief §11)
- **Languages.** The supported list starts with English, French, Portuguese, Swahili, Yoruba, Igbo, Hausa, Twi/Akan, Ewe, Zulu and Kinyarwanda. Every face must render their characters (C3).
- **Currencies.** Demo copy uses `useCurrency` conventions; ₦, ₵, KSh, R, RWF, USh and TSh must render.
- **Regional conventions.** Date and phone formats, and event formats (church programmes, owambe and wedding sets, conferences), are captured as subcategories with sourced examples.
- **Imagery.** African businesses and settings come from licensed sources with regions tagged. Stereotypes and automatic cultural motifs are rejected at review.

## 13. Phases (the brief's §15; each is tested on the real implementation and ships only after founder review)

| Phase | Builds | Acceptance items it closes (brief §16) |
|---|---|---|
| **P1 Foundation** | Format registry; Latin Extended fonts (+ humanist and script faces); directions; composition and distinctness; taxonomy registry; quality scorer, ledger and gate (off); `audit:quality`; asset migration; manifest; intake script; asset review tab | coherent design system; recorded licences; verified dimensions |
| **P2 Catalogue redesign + representative collection** | Detail page; cards with verified badges; search and filters; category, collection and need browse; mockup view; pilot asset intake; **pilot collection: business card × 8 directions (front and back), Instagram post 4:5 × 6, 48-sheet billboard × 6 with 2 mockups**; scoring of the live designs in those subcategories; gate on for the three | meaningful categories; real diversity; relevant previews; honest editing; useful search; mobile and desktop |
| P3 Assets | Editor "Photos & graphics" panel (search, browse, recolour, insert); first full intake from accepted sources | licences recorded at scale |
| P4 Template expansion | Most-used subcategories first, in every major category; usability tests with real businesses | real diversity at scale |
| P5 Admin | ZIP and bulk import with validation; DB review state; versions; collections; featured; pricing; mobile preview; triage of the 71 rows | admin management; upload validation |
| P6 Editing and export | JPG, SVG and vector PDF with bleed, trim and embedded fonts; large-format output; front and back in Studio; exports checked against the preview (C8 fully on) | working exports |
| P7 Intelligence | §11 | — |

Existing features stay intact throughout: the current 67 designs, Studio, Promote and the export already shipped.

## 14. Out of scope
- AI-generated published imagery.
- Payments (create-flow spec).
- Promote files (`src/lib/promote/*`, `MediaPlan.tsx`, the `plan_line` banner in `StudioEditor.tsx`).
- The 209 logos of unknown provenance, which are business assets.

## 15. Risks
- **The dev server writes to production.** Intake is staff-run, starts as drafts, and the first run is reviewed row by row.
- **Licence terms change.** A snapshot of the terms is taken at every intake. Retiring an asset fails the tests for each template that uses it.
- **Reviewer time.** 41 points need a person. The pilot measures time per review before batch sizes are set.
- **Font replacement** can shift line breaks in all 110 templates. The C5 clipping test and a visual pass over the 67 listed designs cover it.
- **Large-format targets and regional print sizes** need a print partner's confirmation before any print claim.
- **Overlap with Promote.** This work reads Promote's surface maths and never edits Promote files.

## 16. Decisions for the founder
1. Approach A (templates in code until Phase 5), or everything in the database now?
2. The 8 directions as listed?
3. The taxonomy: brief categories A–H as the main browse, with the 9 needs kept as a facet?
4. The pilot: business card × 8, Instagram 4:5 × 6, 48-sheet billboard × 6?
5. Live designs: the 60-day `legacy` mark, or the gate for everything at once?
6. Reviewers: the founder alone, or a named admin designer too?
7. Licence policy: confirm that OpenMoji (share-alike) and unDraw stay excluded, and that Unsplash is manual-download only.
