# Create Media redesign — design spec

2026-10-29 · status: **awaiting review**

## 1. Intent

**What the founder asked for, in their words:** Create Media should be a page
where people make creative requests in plain language — "I need a business
card" — and get the design right there. Clean, premium, modern. Every design
unique and colourful, never one palette. Customisable. And: *"I want the
template to be the exact designs you make as templates"* — every template a
finished, art-directed piece, shown exactly as designed. All existing
templates are to be redesigned to that standard.

**Decisions taken in the brainstorm:**

| Question | Decision |
|---|---|
| What produces the options | Smart templates — no AI model, no per-request cost |
| Ask for details first, or show first | Show options first; a "Your details" panel fills them live |
| Rest of the page | Keep it, tidy and reorder |
| Colour approach | A real look layer (palette + gradient + pattern + type), not recolour-only |
| Look extras | Gradients & duotone photos, patterns & textures, Remix, type pairing per design |
| What a template is | One finished, art-directed design with its own hero look, shown as-is |
| Scope of redesign | All templates — 104 built-in + 71 uploaded |

**Success looks like:**

1. Typing "I need a business card" shows six finished, visibly different
   business cards within a second, on a mid-range phone, at card proportions.
2. Typing a name and phone updates all six live; one click downloads a
   print-ready PNG/PDF or opens the editor with the details in.
3. A gallery screen of 12 cards shows 12 different colour worlds — no two
   share a palette or pattern.
4. Every template's gallery card is the exact design that opens in the
   editor and exports — the same renderer, the same look.
5. Every text/ground pair in every hero look and every remix passes WCAG
   4.5:1 (3:1 for display type ≥ 0.06 of the short edge), enforced by test.

**Out of scope:** AI-written copy, AI-generated imagery, logo generation,
video/motion redesign (motion keeps working with the new looks but is not
redesigned), checkout/printing changes.

## 2. Today, measured

- Every design is drawn from **one colour**: `styleColours()` returns
  `{ base, accent, ink }`, all derived from a single brand accent. A template's
  shapes can only be `accent | ink | base | white | black`. Hence "one palette".
- Templates are deliberately colourless (styles "carry no hex"), so no
  template can be art-directed.
- The request box (`IntentComposer`) classifies the sentence correctly but
  answers with a text panel and one button that opens one template. No
  previews, no choice, no details.
- Three renderers draw a template and must stay in step: `TemplateSurface`
  (DOM — gallery, customiser), `DesignSurface` via `documentFromTemplate`
  (editor + export), `drawTemplate.ts` (canvas — motion/video).
- 71 templates live as `design_templates` rows imported from a canvas; they
  carry geometry only.

## 3. The four sub-projects

Built in this order; each gets its own implementation plan and review.

1. **Look engine** — templates can carry a designed look. *(Specified in full
   below.)*
2. **Template redesign programme** — all 175 redesigned in batches.
3. **Request flow** — request → options → details → pick → download/edit.
4. **Page reorganisation** — the page ordered around the request.

Sub-project 1 is the foundation: until a template can own colours, gradients,
patterns and a type pairing, nothing can be art-directed.

---

## 4. Sub-project 1 — Look engine

### 4.1 Model

```ts
// src/lib/design/look.ts
type PaletteRole = 'ground' | 'ink' | 'primary' | 'secondary' | 'highlight';

interface Palette {
  key: string;            // 'lagos-sunset'
  name: string;           // 'Lagos Sunset'
  family: 'warm' | 'cool' | 'earth' | 'bold' | 'pastel' | 'mono';
  colours: Record<PaletteRole, string>;   // hex, curated, contrast-tested
  scheme: 'dark' | 'light';               // which side the ground sits on
}

interface GradientSpec {
  kind: 'linear' | 'radial' | 'mesh';
  stops: PaletteRole[];   // 2–4 roles, never hex
  angle?: number;
}

interface PatternSpec {
  key: PatternKey;        // 'kente-step' | 'adire-dots' | 'grain' | 'waves' | ...
  role: PaletteRole;      // drawn in this role
  opacity: number;        // 0..1
  scale: number;          // relative to short edge
  zone?: 'full' | 'top' | 'bottom' | 'left' | 'right' | 'band';
}

interface Look {
  palette: string;               // Palette.key
  gradient?: GradientSpec;       // ground gradient; absent = flat ground
  pattern?: PatternSpec;
  duotone?: [PaletteRole, PaletteRole];  // photo treatment for photoLed layouts
  type: string;                  // TypePairing.key
  headlineGradient?: boolean;    // gradient-filled display type
}

interface TypePairing { key: string; display: FontKey; text: FontKey; name: string }
```

**Templates gain `look: Look`** — the hero look, written per design. Shapes and
slots gain the new tones: `ShapeTone` adds `'primary' | 'secondary' |
'highlight'` (`'accent'` stays as an alias of `primary` so nothing breaks);
slot `tone` adds `'primary' | 'secondary' | 'highlight'`. Shapes may also take
`fill: GradientSpec` instead of a flat tone.

**Why palettes are curated hex while templates stay colour-free in their own
data:** a template references roles and a palette *key*; the palette library
is the one place hex lives. That keeps "Reset to original", "Use my brand
colours" and Remix as simple swaps of one key, and keeps every colour in one
tested table.

### 4.2 Libraries

- **Palettes** — `src/lib/design/palettes.ts`, ~30 to start, spread across the
  six families. Each must pass the contrast suite (4.4) before it can ship.
- **Patterns** — `src/lib/design/patterns.ts`, ~20, each a pure function
  `(spec, w, h, colour) → SVG string`, drawn as vector so they stay crisp in
  print and identical in all three renderers. Includes original
  African-inspired geometric motifs drawn for this library (step, chevron,
  dot-grid, adire-style resist dots, mudcloth-style marks) — **original
  geometry only, nothing traced from a third-party source or pattern pack**,
  per the existing asset rule. Plus grain, dots, waves, grid, halftone,
  confetti, rays, topography.
- **Type pairings** — `src/lib/design/typePairings.ts`, ~12, using only the
  self-hosted OFL faces already in `typefaces.ts`.

### 4.3 Resolution — one function, three renderers

```ts
resolveLook(template, override?: Partial<Look> | BrandLook) → ResolvedLook
// ResolvedLook: concrete hex per role, ink per role (contrast-chosen),
// gradient CSS + canvas stops, pattern SVG, duotone matrix, font stacks.
```

`TemplateSurface`, `documentFromTemplate`/`DesignSurface` and `drawTemplate`
all call `resolveLook` and read only its output. One resolver is the guarantee
the gallery card, the editor and the exported file cannot disagree — the same
principle `DesignSurface` already follows for export.

**Ink per role, not per design.** Text set on a `secondary` panel gets the ink
that measures ≥ 4.5:1 against `secondary`, not the ground's ink. Today's
renderer only knows one ground; this is the change that lets a coral button
carry the right text.

### 4.4 Contrast and safety

- `palettes.test.ts`: for every palette, every role pair a template may put
  text on passes 4.5:1 (body) / 3:1 (display ≥ 0.06).
- `looks.test.ts`: for every template × its hero look, every text slot is
  checked against the colour actually beneath it (ground, gradient end-stops,
  or the shape it sits on). Pattern opacity under text is capped (≤ 0.12) or
  the pattern's `zone` must avoid the text box.
- Remix and brand looks run through the same check; a combination that fails
  is skipped, never rendered.

### 4.5 Customisation

- **Use my brand colours** — `brandLook(primary, secondary?, harmony)` builds a
  Palette: missing roles are filled by harmony (analogous / complementary /
  split), the ground pushed to the template's scheme by target luminance
  (reusing `towardLuma`), then contrast-checked and nudged (existing logic).
- **Remix** — re-rolls unlocked parts (palette, gradient, pattern, type) from
  the libraries with a seeded generator: same seed → same result, so a remix
  is reproducible and shareable via URL (`?look=<seed>`). Locks: any of the
  four parts.
- **Reset to original** — drops the override; the hero look returns.
- **Styles** stay. A style now adjusts *how* a look is applied (pattern
  strength, surface treatment, type case/weight) rather than inventing
  colour. The old per-style colour rules (`brand/deep/wash/mono/duotone`)
  become a fallback for templates that have no `look` yet, so the 175 keep
  rendering throughout the redesign programme.

### 4.6 Persistence

Editor documents store the resolved `look` (palette key, overrides, seed) in
`document` jsonb — no migration needed (`schema_version` bump, `readDocument`
upgrades old documents by deriving a look from their stored accent).
`design_templates` rows can carry `look` inside `document`; the upload
validator (`readTemplateUpload`) gains `look` in its allowlist — recall the
shapes field was once silently dropped there.

### 4.7 Testing

Unit tests for palettes, patterns (SVG well-formed, deterministic), resolver,
brand-look harmony, remix determinism, contrast suite (4.4). Renderer parity:
render one template with a gradient + pattern + duotone through the DOM
surface and the canvas painter and compare sampled pixels. Existing template
tests keep passing on the fallback path.

---

## 5. Sub-project 2 — Template redesign programme (outline)

- Every template gets a hand-written hero `look` and, where the composition
  needs it, revised shapes using `secondary`/`highlight`/gradient fills.
- Batches, most-requested first: business cards & branding → social posts &
  stories → flyers & posters → campaigns → print & documents → banners & ads →
  events & menus.
- Each batch: designed in code, rendered in the real gallery at true shape,
  screenshot review sheet for the founder, ship.
- **Variety rule across the library:** no palette used by more than ~6
  templates; adjacent cards in the default gallery order never share a palette.
- **Uploaded rows (71):** each gets a code version; the row is set to
  `archived`, not deleted. A code template always wins a key lookup already.
- Done = every template has a `look`; the fallback colour rules are then only
  used for user-uploaded templates without one.

## 6. Sub-project 3 — Request flow (outline)

1. Request box (existing `IntentComposer`) plus quick chips: Business card,
   Flyer, Instagram post, Story, Logo kit, Banner, Menu, Invitation.
2. Options render **inline**: 6 finished designs for the deliverable
   (`deliverableSlugForIntent` + `findTemplates`), each in its hero look, at
   true proportions, then "Show 6 more". Variety rule applies across the set.
3. **Your details** panel: fields per deliverable (card: name, role, phone,
   email, website; flyer: headline, date, venue, phone…), logo upload, "Use my
   brand colours". Live-updates all options. Signed-in businesses pre-filled
   from their profile.
4. Per option: **Remix**, **Download** (PNG/PDF via the existing export path),
   **Customise** (editor with details applied). Two-sided items flip front/back.
5. No template for the request → say so plainly; offer nearest designs or
   "Hire a creator". Never an unrelated design.
6. Entirely client-side; options mount only when in view (existing pattern).

## 7. Sub-project 4 — Page reorganisation (outline)

Order: request + inline options → colourful gallery (browse all, filters) →
"Hire a creator" and services, shortened → trust strip. Nothing removed; the
categories grid folds into the gallery filters and the chips.

## 8. Risks

- **Three renderers drifting** — mitigated by the single resolver and a parity
  test.
- **Patterns in print** — SVG patterns must survive `html-to-image` and the
  4096px export cap; tested at A4.
- **Bundle size** — patterns are small functions; palettes are data; no new
  dependencies.
- **Redesign volume** — 175 designs is the bulk of the work; batching keeps
  each review small and lets value ship early.
- **Cultural motifs** — original geometry only, described as "inspired by",
  never named as a specific people's sacred or protected design.
