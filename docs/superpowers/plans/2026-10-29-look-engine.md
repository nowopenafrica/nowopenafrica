# Look Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Create Media template carry its own designed look — a five-role palette, gradient ground, pattern, photo duotone and type pairing — rendered identically in the gallery, the editor/export and the motion painter, and customisable (brand colours, Remix with locks, Reset) without ever losing readable text.

**Architecture:** Pure data + pure functions in `src/lib/design/` (palettes, patterns, look resolution, brand palette, remix). One resolver, `resolveLook`, turns a template + optional override into concrete colours, gradient layers, pattern SVG, duotone pair and type pairing; all three renderers read only its output. Templates without a `look` resolve through a fallback that reproduces today's single-accent output exactly, so the 175 existing templates render unchanged until sub-project 2 redesigns them.

**Tech Stack:** TypeScript, React 18, Vite 7, Vitest 3, existing `styles.ts` colour maths (`normaliseHex`, `relativeLuminance`, `contrastRatio`, `towardLuma`), existing `TYPE_PAIRINGS` in `typefaces.ts`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-create-media-redesign-design.md` §4 (sub-project 1). Read it first.

## Global Constraints

- No new npm dependencies. Patterns are hand-written SVG strings.
- Hex colours live ONLY in `palettes.ts`. Templates, styles and looks reference palette keys and roles (`ground | ink | primary | secondary | highlight`), never hex.
- Contrast: body text ≥ 4.5:1; display text (slot size ≥ 0.06) ≥ 3:1. Enforced by test, not review.
- Pattern opacity under any text box ≤ 0.12, or the pattern's `zone` must not intersect the text box.
- Patterns: original geometry only — nothing traced or copied from a third-party pattern pack; names say "inspired" (e.g. "Step (adire-inspired)"), never claim to be a specific people's design.
- A template with no `look` must render pixel-for-pixel as it does today (fallback path).
- `'accent'` remains valid everywhere it is accepted today, as an alias of `primary`.
- Run the typecheck with `npm run typecheck` (bare `npx tsc --noEmit` checks nothing in this repo).
- The repo has ~590 unrelated uncommitted files. Stage ONLY the files a task lists. Do not commit unless the founder has approved committing; if not approved, skip the commit step and leave the files staged-clean for review.
- Dev server shares the production database — do not write rows while verifying.

## Review Focus

1. **A malformed brand colour** ("red", "#12", empty) typed into "Use my brand colours" — expect it normalised or rejected with the original look kept, never a crash or NaN colour. → Task 4 test.
2. **A saved design referencing a palette key that no longer exists** — expect it to open in the template's hero look (or fallback), not blank. → Task 7 test.
3. **Remix with every part locked** — expect the same look back, not an error or an infinite search. → Task 4 test.
4. **A pattern on a 9:16 story or a 3:1 sign** — expect the pattern zone to stay clear of text at that shape, not only on the square. → Task 8 test (runs every format in `FORMATS`).
5. **Export of a patterned/gradient design at A4 (2480×3508)** — expect a non-blank PNG under the 4096px cap with the pattern present. → Task 9 browser step.

---

### Task 1: Palette library

**Files:**
- Create: `src/lib/design/palettes.ts`
- Test: `src/lib/design/palettes.test.ts`

**Interfaces:**
- Consumes: `normaliseHex`, `contrastRatio`, `relativeLuminance` from `./styles`.
- Produces:
  - `type PaletteRole = 'ground' | 'ink' | 'primary' | 'secondary' | 'highlight'`
  - `type PaletteFamily = 'warm' | 'cool' | 'earth' | 'bold' | 'pastel' | 'mono'`
  - `interface Palette { key: string; name: string; family: PaletteFamily; scheme: 'dark' | 'light'; colours: Record<PaletteRole, string> }`
  - `const PALETTES: Palette[]`
  - `paletteOf(key: string | undefined): Palette | null`
  - `readableInk(hex: string): string` — returns `'#ffffff'` or `'#0b1220'`, whichever has the higher contrast against `hex`.
  - `const TEXT_ROLES: PaletteRole[] = ['ground', 'primary', 'secondary', 'highlight']` — roles text may be set on.

- [ ] **Step 1: Write the failing tests** in `palettes.test.ts`:
  - `it('ships at least 30 palettes, at least 3 per family')` — `PALETTES.length >= 30`; each of the six families has ≥ 3.
  - `it('has unique keys and names')`.
  - `it('stores only normalised 6-digit hex')` — every colour equals `normaliseHex(colour)` and matches `/^#[0-9a-f]{6}$/`.
  - `it('puts ink on the ground at 4.5:1 or better')` — `contrastRatio(colours.ink, colours.ground) >= 4.5` for every palette.
  - `it('can set readable text on every text role')` — for every palette and every role in `TEXT_ROLES`, `contrastRatio(readableInk(c), c) >= 4.5`, OR the role is `highlight`/`primary` and `>= 3` (display only). Record the display-only roles: export `displayOnlyRoles(p: Palette): PaletteRole[]` and assert body text is never assigned to them in Task 8.
  - `it('matches its declared scheme')` — `scheme === 'dark'` ⇔ `relativeLuminance(ground) < 0.2`.
  - `it('returns null for an unknown key')` — `paletteOf('nope') === null`.

- [ ] **Step 2: Run** `npx vitest run src/lib/design/palettes.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement `palettes.ts`.** Curate ≥ 30 palettes by hand (5 roles each) across the six families, roughly half dark-ground, half light-ground. Names are evocative and original (e.g. "Lagos Sunset", "Forest & Brass", "Ink & Coral", "Harmattan Sand", "Lagoon", "Indigo Dye"). `secondary` must be a genuinely different hue from `primary` (hue distance ≥ 40°) except in the `mono` family. Iterate values until the tests pass — adjust a colour, never loosen a threshold.

- [ ] **Step 4: Run** the test file — expect PASS.

- [ ] **Step 5: Commit** (if approved): `git add src/lib/design/palettes.ts src/lib/design/palettes.test.ts && git commit -m "Look engine: curated palette library with contrast guarantees"`

---

### Task 2: Look model, template type extensions and `resolveLook`

**Files:**
- Create: `src/lib/design/look.ts`
- Modify: `src/lib/designTemplates.ts` (types `ShapeTone`, `ShapeSpec` rect/circle, `SlotSpec`, `DesignTemplate`; `shapeColor`)
- Test: `src/lib/design/look.test.ts`

**Interfaces:**
- Consumes: Task 1 exports; `styleColours`, `styleOf` from `./styles`; `TYPE_PAIRINGS`, `TypePairing` from `./typefaces`; `surfaceSpecLayers` and its layer type from `../designTemplates`.
- Produces (in `look.ts`):
  - `interface GradientSpec { kind: 'linear' | 'radial' | 'mesh'; stops: PaletteRole[]; angle?: number }` (2–4 stops)
  - `type PatternKey` (union of Task 3's keys — declare it here; Task 3 implements them)
  - `interface PatternSpec { key: PatternKey; role: PaletteRole; opacity: number; scale: number; zone?: 'full' | 'top' | 'bottom' | 'left' | 'right' | 'band' }`
  - `interface Look { palette: string; gradient?: GradientSpec; pattern?: PatternSpec; duotone?: [PaletteRole, PaletteRole]; type: string; headlineGradient?: boolean }`
  - `type LookPart = 'palette' | 'gradient' | 'pattern' | 'type'`
  - `interface ResolvedLook { roles: Record<PaletteRole, string>; inkOn: Record<PaletteRole, string>; groundLayers: SurfaceLayer[]; pattern: { svg: string; opacity: number; zone: PatternSpec['zone'] } | null; duotone: [string, string] | null; pairing: TypePairing; headlineGradient: string | null; scheme: 'dark' | 'light'; source: 'look' | 'fallback' }`
  - `resolveLook(tpl: DesignTemplate, opts: { override?: Partial<Look>; brandPalette?: Palette; accent: string; base?: string; styleKey?: string; width: number; height: number }): ResolvedLook`
  - `gradientCss(g: GradientSpec, roles: Record<PaletteRole, string>): string`
- Produces (in `designTemplates.ts`):
  - `ShapeTone` gains `'primary' | 'secondary' | 'highlight'`.
  - `rect` and `circle` shapes gain optional `fill?: GradientSpec`.
  - `SlotSpec.tone` gains `'primary' | 'secondary' | 'highlight'`; `SlotSpec` gains `on?: PaletteRole` (the ground this slot's text sits on; default `'ground'`).
  - `DesignTemplate` gains `look?: Look`.
  - `shapeColor(tone, accent, ink, base, roles?: Record<PaletteRole, string>)` — new tones read `roles`; `'accent'` returns `roles?.primary ?? accent`. Existing 4-arg calls keep working.

- [ ] **Step 1: Write the failing tests** in `look.test.ts`:
  - `it('falls back to today’s colours for a template with no look')` — for 5 existing templates (`statement`, `card-front`, `promo-burst`, `menu-column`, `web-hero`) and accent `#2563eb`: `source === 'fallback'`; `roles.primary === styleColours(...).accent`; `roles.ground === styleColours(...).base`; `groundLayers` deep-equals `surfaceSpecLayers(tpl, accent, base)`; `pattern === null`; `duotone === null`.
  - `it('resolves a template look to its palette')` — a fixture template with `look: { palette: PALETTES[0].key, type: 'modern' }` → `roles` equals that palette's colours, `source === 'look'`, `pairing.key === 'modern'`.
  - `it('lets an override replace one part and keep the rest')` — override `{ palette: PALETTES[1].key }` changes `roles`, keeps `pairing`.
  - `it('prefers a brand palette over the template palette')`.
  - `it('picks readable ink for every role')` — `contrastRatio(inkOn[r], roles[r]) >= 4.5` for `TEXT_ROLES` on a body-safe palette.
  - `it('turns a gradient spec into CSS using role colours')` — `gradientCss({kind:'linear', stops:['primary','secondary'], angle:135}, roles)` contains both hexes and `135deg`.
  - `it('keeps accent as an alias of primary')` — `shapeColor('accent', a, i, b, roles) === roles.primary`; `shapeColor('accent', a, i, b) === a`.
  - `it('falls back when the look names a palette that does not exist')` → `source === 'fallback'`. *(Review Focus 2.)*

- [ ] **Step 2: Run** `npx vitest run src/lib/design/look.test.ts` — expect FAIL.

- [ ] **Step 3: Extend the types and `shapeColor` in `designTemplates.ts`;** import the look types with `import type` only (avoid a value cycle — the same reason `catalogueTemplates.ts` does).

- [ ] **Step 4: Implement `resolveLook` and `gradientCss` in `look.ts`.** Fallback path: compute `styleColours(style, accent, scheme)` exactly as callers do today; `secondary` = `highlight` = accent, `pairing` = the style's pairing. Look path: palette (brand palette > override > template), `groundLayers` from the gradient spec (flat ground when absent), `pattern.svg` left `null`-safe until Task 3 lands (call `patternSvg` if defined), `duotone` from roles, `headlineGradient` = `gradientCss` of primary→secondary when enabled.

- [ ] **Step 5: Run** the new test file and `npx vitest run src/lib/designTemplates.test.ts src/lib/design` — expect PASS (existing suites unchanged).

- [ ] **Step 6: Commit** (if approved): `git add src/lib/design/look.ts src/lib/design/look.test.ts src/lib/designTemplates.ts && git commit -m "Look engine: look model, role tones and one resolver with a faithful fallback"`

---

### Task 3: Pattern library

**Files:**
- Create: `src/lib/design/patterns.ts`
- Test: `src/lib/design/patterns.test.ts`

**Interfaces:**
- Consumes: `PatternSpec`, `PatternKey` from `./look`.
- Produces:
  - `const PATTERNS: { key: PatternKey; name: string; family: 'heritage' | 'texture' | 'geometric' | 'playful' }[]` — ≥ 20 entries. Keys: `step`, `chevron`, `resist-dots`, `mud-marks`, `diamond-weave`, `sun-rays`, `grain`, `dots`, `halftone`, `grid`, `waves`, `topography`, `diagonal`, `rings`, `confetti`, `squiggle`, `blocks`, `arches`, `cross-hatch`, `scales`.
  - `patternSvg(spec: PatternSpec, w: number, h: number, colour: string): string` — a complete `<svg xmlns=... width=w height=h>` string, drawn with a `<pattern>` tile scaled by `spec.scale × min(w,h)`, clipped to `spec.zone`.
  - `patternZoneBox(zone, w, h): { x: number; y: number; w: number; h: number }`

- [ ] **Step 1: Write the failing tests:**
  - `it('ships at least 20 patterns across four families')`.
  - `it('draws every pattern as a self-contained SVG')` — for each key at 1080×1080: starts with `<svg`, contains `xmlns="http://www.w3.org/2000/svg"`, contains the colour, contains no `href="http`, no `<script`, no `<image`.
  - `it('is deterministic')` — same args → identical string (no `Math.random`; seeded where needed).
  - `it('stays small enough for an A4 export')` — every key at 2480×3508 < 20 000 characters.
  - `it('clips to its zone')` — `patternZoneBox('top', 1000, 2000)` is `{x:0,y:0,w:1000,h:<1000}`; `'full'` covers the canvas.

- [ ] **Step 2: Run** `npx vitest run src/lib/design/patterns.test.ts` — expect FAIL.

- [ ] **Step 3: Implement** each pattern as a small function returning its tile markup (paths/circles/rects only). Original geometry; heritage entries are named "(adire-inspired)", "(kente-inspired step)", "(mudcloth-inspired marks)" in `name`.

- [ ] **Step 4: Run** — expect PASS. Then re-run `look.test.ts` (resolveLook now fills `pattern.svg`).

- [ ] **Step 5: Commit** (if approved): `git add src/lib/design/patterns.ts src/lib/design/patterns.test.ts && git commit -m "Look engine: twenty original vector patterns"`

---

### Task 4: Brand palette and Remix

**Files:**
- Create: `src/lib/design/remix.ts`
- Test: `src/lib/design/remix.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `towardLuma`, `normaliseHex` from `./styles`.
- Produces:
  - `type Harmony = 'analogous' | 'complementary' | 'split'`
  - `brandPalette(input: { primary: string; secondary?: string; harmony?: Harmony; scheme: 'dark' | 'light' }): Palette | null` — `null` when `primary` is not a parseable colour.
  - `remixLook(base: Look, seed: number, locks: ReadonlySet<LookPart>, scheme: 'dark' | 'light'): Look`
  - `seedFrom(text: string): number` — stable 32-bit hash (same algorithm shape as `previewPhotoFor`).

- [ ] **Step 1: Write the failing tests:**
  - `it('builds a full readable palette from one brand colour')` — for 11 brand colours (reuse the list in `styles.test.ts`) × both schemes × three harmonies: every role present, ink-on-ground ≥ 4.5, `readableInk` works for every `TEXT_ROLES` role per the Task 1 rule.
  - `it('keeps the brand colour as primary when it can carry type')` — `#0f766e` dark scheme → `primary === '#0f766e'`.
  - `it('rejects a colour it cannot read')` — `brandPalette({ primary: 'red' })`, `'#12'`, `''` → `null`. *(Review Focus 1.)*
  - `it('remixes deterministically')` — same `(base, seed, locks)` → deep-equal looks; different seeds → at least 8 distinct palettes across seeds 1..20.
  - `it('never changes a locked part')` — lock `palette` → `palette` unchanged across 20 seeds.
  - `it('returns the base look when everything is locked')` — all four parts locked → deep-equal to `base`. *(Review Focus 3.)*
  - `it('only picks palettes on the template’s scheme side')`.

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement.** Harmony by HSL hue rotation (analogous ±30°, complementary 180°, split 150°/210°); ground via `towardLuma` to 0.06 (dark) / 0.80 (light); nudge any role failing its contrast rule toward the far luminance in 0.04 steps (max 12 steps, then drop that role to ground-tint). Remix: seeded mulberry32; pick from libraries filtered by scheme; bounded attempts (≤ 20) to satisfy contrast, else keep the base part.

- [ ] **Step 4: Run** — expect PASS.

- [ ] **Step 5: Commit** (if approved): `git add src/lib/design/remix.ts src/lib/design/remix.test.ts && git commit -m "Look engine: brand palettes by harmony, deterministic Remix with locks"`

---

### Task 5: DOM renderer reads the resolved look

**Files:**
- Modify: `src/components/studio/TemplateSurface.tsx`
- Test: `src/components/studio/TemplateSurface.look.test.tsx`

**Interfaces:**
- Consumes: `resolveLook`, `ResolvedLook`, `Look` (Task 2), `patternSvg` (Task 3).
- Produces: `TemplateSurfaceProps` gains `look?: Partial<Look>` (override) and `brandPalette?: Palette`. With neither, and a template with no `look`, output is unchanged.

- [ ] **Step 1: Write the failing tests** (jsdom, render to markup):
  - `it('renders a template without a look exactly as before')` — snapshot of `card-front` markup equals a snapshot taken from the pre-change component (capture it first, commit the snapshot in this step).
  - `it('paints shapes in their role colours')` — fixture template with a `secondary` rect and look palette X → the rect's background is X.secondary.
  - `it('sets text on its declared ground')` — slot with `on: 'secondary'` → its colour equals `inkOn.secondary`.
  - `it('draws the pattern layer below the type')` — pattern layer present, z-order before the first slot, `opacity` as specified.
  - `it('applies a duotone to the photo')` — `photoLed` fixture with `duotone` → the media element carries an SVG filter reference built from the two role colours.
  - `it('fills the headline with a gradient when asked')` — `headlineGradient: true` → headline style has `background-clip: text` and the gradient.

- [ ] **Step 2: Run** `npx vitest run src/components/studio/TemplateSurface.look.test.tsx` — expect FAIL (except the snapshot).

- [ ] **Step 3: Implement.** Call `resolveLook` once per render (memoised on template, accent, base, look, brandPalette, size). Replace direct `accent/base/ink` reads with `roles`/`inkOn`; ground from `groundLayers`; pattern as an absolutely-positioned `<div>` with `background-image: url("data:image/svg+xml;utf8,…")` (encode with `encodeURIComponent`) clipped to the zone; duotone via an inline `<svg><filter feColorMatrix …>` referenced by id (unique per instance with `useId`); headline gradient via `background-clip:text`. Font stacks from `pairing` only when the template has a `look` (styles keep owning type otherwise).

- [ ] **Step 4: Run** the new tests and `npx vitest run src/components src/lib/design src/test/createGallery.test.ts` — expect PASS.

- [ ] **Step 5: Commit** (if approved): `git add src/components/studio/TemplateSurface.tsx src/components/studio/TemplateSurface.look.test.tsx src/components/studio/__snapshots__ && git commit -m "Look engine: TemplateSurface renders palettes, patterns, duotone and gradient type"`

---

### Task 6: Canvas painter parity

**Files:**
- Modify: `src/lib/drawTemplate.ts` (`drawTemplateFrame`, `PaintOptions`)
- Test: `src/lib/drawTemplate.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveLook`, `patternSvg`.
- Produces: `PaintOptions` gains `look?: Partial<Look>` and `brandPalette?: Palette`, mirroring Task 5.

- [ ] **Step 1: Write the failing tests** (mock 2D context records calls):
  - `it('fills role-toned shapes with role colours')`.
  - `it('paints the ground gradient from the look')` — `createLinearGradient` called; stops carry the palette hexes.
  - `it('paints the pattern before any text')` — `drawImage` of the pattern bitmap precedes the first `fillText`.
  - `it('still paints a look-less template exactly as before')` — call log for `statement` unchanged versus the recorded baseline.

- [ ] **Step 2: Run** `npx vitest run src/lib/drawTemplate.test.ts` — expect FAIL.

- [ ] **Step 3: Implement.** Same resolver; pattern painted by rasterising `patternSvg` into an `Image` once per frame size (cache by key+size+colour); duotone applied via an offscreen canvas pass (luma → mix of the two role colours). Motion keeps working; no motion redesign.

- [ ] **Step 4: Run** — expect PASS.

- [ ] **Step 5: Commit** (if approved): `git add src/lib/drawTemplate.ts src/lib/drawTemplate.test.ts && git commit -m "Look engine: canvas painter matches the DOM renderer"`

---

### Task 7: Editor document and upload persistence

**Files:**
- Modify: `src/lib/studio/designDocument.ts` (`SCHEMA_VERSION`, `DesignDocument`, `DesignPage`, `documentFromTemplate`, `readDocument`)
- Modify: `src/components/studio/DesignSurface.tsx` (page pattern layer)
- Modify: `src/lib/create/templateUpload.ts` (allowlist + validation of `look`)
- Test: `src/lib/studio/designDocument.test.ts`, `src/lib/create/templateUpload.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveLook`, `Look`, `paletteOf`.
- Produces:
  - `SCHEMA_VERSION = 2`.
  - `DesignDocument` gains `look?: { palette: string; override?: Partial<Look>; seed?: number; brand?: { primary: string; secondary?: string; harmony?: Harmony } }`.
  - `DesignPage` gains `pattern?: { svg: string; opacity: number; zone?: PatternSpec['zone'] }`; `background` may hold gradient CSS (already a string).
  - `documentFromTemplate(..., opts)` opts gain `look?: Partial<Look>`, `brandPalette?: Palette`; shapes/text objects receive resolved hex fills; page gets `background` (gradient CSS) and `pattern`.
  - `readTemplateUpload` accepts and validates `look` (palette key must exist; pattern key must exist; stops are roles) and refuses a `look` carrying hex.

- [ ] **Step 1: Write the failing tests:**
  - `it('carries the look into the document')` — `documentFromTemplate(fixtureWithLook, …)` → `doc.look.palette` set; page `background` contains the palette ground; `page.pattern.svg` starts with `<svg`.
  - `it('upgrades a version 1 document without changing how it looks')` — a stored v1 doc → `readDocument` ok, `schemaVersion === 2`, objects' fills unchanged.
  - `it('opens a design whose palette has been removed')` — doc with `look.palette: 'gone'` → ok, renders with fallback. *(Review Focus 2.)*
  - `it('keeps the look on an uploaded template')` and `it('refuses a look that carries hex')` in `templateUpload.test.ts`.

- [ ] **Step 2: Run** `npx vitest run src/lib/studio/designDocument.test.ts src/lib/create/templateUpload.test.ts` — expect FAIL.

- [ ] **Step 3: Implement**, including `DesignSurface` drawing `page.pattern` above the background and below objects (same data-URL technique as Task 5) so the editor and `downloadNodePng` export include it.

- [ ] **Step 4: Run** those files plus `npx vitest run src/lib/studio` — expect PASS.

- [ ] **Step 5: Commit** (if approved): `git add src/lib/studio/designDocument.ts src/lib/studio/designDocument.test.ts src/components/studio/DesignSurface.tsx src/lib/create/templateUpload.ts src/lib/create/templateUpload.test.ts && git commit -m "Look engine: looks persist in editor documents and template uploads"`

---

### Task 8: Contrast suite across every template and look

**Files:**
- Create: `src/lib/design/looks.test.ts`
- Modify: `src/lib/design/catalogueTemplates.ts` — give three templates hero looks as proving fixtures: `brand-intro-reveal`, `tiered-sale`, `swiss-event-poster` (gradient, pattern and duotone between them; one uses a `secondary` panel with an `on: 'secondary'` slot).

**Interfaces:**
- Consumes: everything above; `slotBox`, `typePx`, `FORMATS` list as in `designTemplates.test.ts`.

- [ ] **Step 1: Write the tests:**
  - `it('keeps every text slot readable on what is actually beneath it')` — for every template in `DESIGN_TEMPLATES` that has a `look`, at every format in `FORMATS`: find the colour under each text slot (the topmost opaque shape whose bounds contain the slot box's centre, else the ground gradient's nearest stop) and assert contrast ≥ 4.5 (≥ 3 for size ≥ 0.06) against the slot's ink.
  - `it('keeps patterns out from behind text')` — pattern opacity ≤ 0.12, or `patternZoneBox` does not intersect any text slot box, at every format. *(Review Focus 4.)*
  - `it('never assigns body text to a display-only role')` — via `displayOnlyRoles`.
  - `it('stays readable under 20 remixes')` — for each looked template, `remixLook(look, seed, ∅)` seeds 1..20, same assertions.
  - `it('stays readable on brand palettes')` — 11 brand colours × 3 harmonies.

- [ ] **Step 2: Add the three hero looks**, run `npx vitest run src/lib/design/looks.test.ts` — iterate on the looks (not the thresholds) until PASS.

- [ ] **Step 3: Run the template gates:** `npm run check:templates` and `npx vitest run src/lib src/components src/test/createGallery.test.ts` — expect PASS.

- [ ] **Step 4: Commit** (if approved): `git add src/lib/design/looks.test.ts src/lib/design/catalogueTemplates.ts && git commit -m "Look engine: contrast suite over every look, remix and brand palette"`

---

### Task 9: Customiser controls — palette, brand colours, Remix, Reset

**Files:**
- Modify: `src/components/create/TemplateCustomiser.tsx`
- Modify: `src/components/create/TemplateGallery.tsx` (pass the template's look; a `?look=<seed>` link opens the customiser remixed)
- Test: `src/test/lookCustomiser.test.tsx`

**Interfaces:**
- Consumes: `PALETTES`, `brandPalette`, `remixLook`, `seedFrom`, `LookPart`.
- Produces: customiser state `{ override: Partial<Look>; brand: {primary; secondary?; harmony} | null; seed: number | null; locks: Set<LookPart> }`, passed to `TemplateSurface` and into `documentFromTemplate` when opening the editor.

- [ ] **Step 1: Write the failing tests** (Testing Library):
  - `it('shows the original look first and resets to it')` — pick a palette swatch → surface colours change; click "Reset to original" → back to the hero look.
  - `it('applies my brand colours')` — enter `#0f766e` → primary changes; enter `red` → inline message "That isn’t a colour we can read — try a hex like #0f766e" and the look is unchanged. *(Review Focus 1.)*
  - `it('remixes and respects locks')` — lock Palette, click Remix twice → palette unchanged, pattern or type changed.
  - `it('carries the look into the editor link')` — "Open in editor" URL contains `look=`.

- [ ] **Step 2: Run** `npx vitest run src/test/lookCustomiser.test.tsx` — expect FAIL.

- [ ] **Step 3: Implement** a "Look" panel above the existing colour controls: palette swatch row (grouped by family), "Use my brand colours" (1–2 colour inputs + harmony select), Remix button with four lock toggles (Palette, Background, Pattern, Fonts), "Reset to original". Templates without a `look` keep today's single colour picker as the only control (fallback path).

- [ ] **Step 4: Run** the test file plus `npx vitest run src/test/createGallery.test.ts src/components` — expect PASS.

- [ ] **Step 5: Verify in the browser** (dev server `nowopen-edit`, http://localhost:5175/media): open each of the three looked templates; screenshot the hero look; remix three times; apply brand colour `#0f766e`; reset; open in editor and confirm the same look; export PNG at A4 for `swiss-event-poster` and confirm the file is non-blank, ≤ 4096px on its long edge, and shows the pattern. *(Review Focus 5.)* Check the console has no errors.

- [ ] **Step 6: Full gate:** `npm run verify` — expect 0 type errors, 0 lint errors, all guards OK, all tests pass (the known load-sensitive timeouts in `adminCreator.smoke`, `fetchAllBusinesses`, `brandColour` must pass when re-run alone).

- [ ] **Step 7: Commit** (if approved): `git add src/components/create/TemplateCustomiser.tsx src/components/create/TemplateGallery.tsx src/test/lookCustomiser.test.tsx && git commit -m "Look engine: palette, brand colours, Remix and Reset in the customiser"`

---

## Not in this plan (later sub-projects)

Hero looks for the remaining templates (sub-project 2), the request-to-options flow and details panel (3), page reorder (4).
