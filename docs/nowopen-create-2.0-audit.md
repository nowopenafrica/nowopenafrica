# NowOpen Create 2.0 — Phase 1 audit

*Written 2026-09-07. Required by §29 of the brief: "First audit the existing
implementation… Preserve working functionality. Upgrade and consolidate it."*

This maps every section of the brief onto what the codebase actually contains
today. It exists so that the next ten phases start from evidence rather than
from the assumption that nothing is built — a large amount is.

**How to read the status column.**

| | |
|---|---|
| **Built** | Working in production today. Do not rebuild. |
| **Partial** | Real foundation exists; named gaps. |
| **Absent** | Nothing there. |
| **Declined** | Deliberately not doing it, with a reason. |

---

## 1. What already exists

Before any plan, the honest inventory. Create is not a blank page.

### The design engine

`src/lib/designTemplates.ts` — **39 templates as DATA, not JSX.** A template is
a surface, optional decorative shapes and a list of role-based slots, each with
a fractional box, a type step and an optional entrance. Geometry is 0..1 of the
canvas and type sizes are multiples of the short edge, so **one definition is
correct at 1080×1080, 1080×1920 and a 2480×3508 print poster** with no
per-format variants.

Two renderers consume it and are guaranteed to agree:

- `src/components/studio/TemplateSurface.tsx` — DOM, editable in place.
- `src/lib/drawTemplate.ts` — canvas, used for PNG and for video frames.

They agree by construction: both resolve slots through `motionAt()`, and that
function is clamped so that at `settleTime()` every slot is *exactly* settled.
A still therefore cannot drift from the animation's last frame.

### The look

- `src/lib/design/typefaces.ts` — 8 self-hosted SIL OFL families, 12 weights,
  218KB. `ensureTypefacesReady()` is awaited before every PNG, PDF and video
  frame, so an export can never bake a fallback.
- `src/lib/design/styles.ts` — 8 styles (typography pairing + colour rule +
  surface + type scale) applied over any layout. **39 × 8 = 312 finished looks.**
  Contrast is asserted structurally: every style on every brand colour clears
  WCAG AA 4.5:1, enforced by test.
- `src/lib/design/taxonomy.ts` — use / industry / style tagging and search.
  Industry tags are the *same twelve groups* the directory uses; a test rejects
  any other value.

### Motion

- `src/lib/renderVideo.ts` — a real in-browser renderer. Canvas + MediaRecorder,
  producing playable MP4/WebM plus poster and contact-sheet PNGs. Deterministic,
  seeded from business + direction + scene, with footage audio routed through a
  shared AudioContext into the capture stream.
- `src/lib/motionGraphics.ts` — scene model, timeline operations (move, split,
  duplicate, set duration, per-element override).
- `src/lib/motionProject.ts` — projects, statuses, templates, duplication.
- 10 entrance types, 6 named easing curves, 5 camera moves.

### Around it

Brand Kit (`BrandKitStudio`, `studioBrand.ts`, `cardSettings`), Media Library,
Export Centre, Design Coach, Creative Director, Content Factory, social
publishing, QR studio, catalogue and receipt studios, Print orders
(`create_orders` + `/order/:reference` tracking), advert placements.

**The gap was never "no engine". It was reach, discovery, and the last 20% of
each surface.**

---

## 2. Section-by-section

### Positioning and home (§1)

| Item | Status | Note |
|---|---|---|
| Two studios + AI layer framing | **Partial** | Creative Studio and Motion Studio exist as separate modules; `CreativeDirectorStudio` is the AI layer. They are not presented as one product with one door. |
| "What do you want to create?" home | **Partial** | `QuickCreatePanel` does exactly this and is already the first thing in the hub. It offers ~12 cards, not the 15 named. |
| Create with AI from a brief | **Partial** | `motionProjectFromPrompt()` builds a video project from a sentence. There is no equivalent for static design. |

**Next:** one Create home that fronts both studios, and a prompt→static-design
path mirroring the one that already exists for video.

### Template library (§2, §4, §18)

| Item | Status | Note |
|---|---|---|
| Structured categories | **Built** | `TemplateUse` — business / social / marketing / event / industry. |
| Industry filter | **Built** | The 12 real NowOpen groups, opening pre-filtered to the business's own trade. |
| Style filter | **Built** | 20 style tags, searchable; 8 applicable styles. |
| Natural-language search | **Built (tolerant, not clever)** | Words are reduced and AND-matched against each template's own tags. No model. "luxury restaurant weekend promotion" works because we tagged well, not because anything inferred intent. |
| Thousands of templates | **Absent** | 39. See "On volume" below. |
| Quality score | **Partial** | Enforced as *tests*, not as a stored score: shape-vs-headline clearance, settle time under 2.2s, contrast AA, no duplicate keys, minimum tag coverage. A template that fails does not enter the catalogue because the build fails. |
| Usage count, favourites, versions, creator, licence per template | **Absent** | Needs a table; templates are code today. |

### Africa Collection (§3)

**Absent**, and this one needs a decision rather than a sprint. Doing it well
means commissioning African photography and art direction — the brief's own
instruction is "internationally premium with African relevance", and the fastest
way to fail it is to generate patterns and call them African. The tagging
vocabulary (`afro-modern`) is in place to hold the work when it exists.

### Asset library (§5)

| Item | Status |
|---|---|
| Photos | **Partial** — Pexels is wired and CSP-allowed; not organised into the named collections. |
| Video | **Partial** — Pexels video in Motion Studio. |
| Graphics / shapes | **Partial** — 5 primitive shape types in templates; no browsable library. |
| Audio | **Absent** — no licensed music library. |
| Licensing metadata as a first-class field | **Absent** for assets, **Built** for typefaces. |

**The rule that must not bend:** nothing enters the library without a licence
that permits commercial use and redistribution. That is why the type library
records `licence` and `source` per family and shows it in the picker. Audio is
the expensive one — Afrobeat and Amapiano tracks that are genuinely cleared cost
money, and un-cleared music on a customer's advert is a takedown on their page.

### Font library (§6)

| Item | Status |
|---|---|
| Browse by classification | **Partial** — 8 families each carry a `role` and a `voice` line; the picker shows pairings rather than a classified browser. |
| Pairings | **Built** — 6, because what a design tool sells is decisions, not fonts. |
| Upload your own font | **Absent** — needs a private bucket, a validator and a per-business `@font-face`. Real work: an uploaded font is an executable-adjacent binary and a licence question. |

### Brand Kit control (§7, §8)

| Item | Status |
|---|---|
| Brand Kit exists and is loaded | **Built** |
| AI and templates respect it | **Partial** — colour flows through `styleColours()`; the brand's *fonts* do not yet override a style's pairing. |
| Brand locks | **Absent** — the single highest-value item in this section. Nothing stops an editor changing the logo or the footer. |

### Reference image → editable design (§9)

**Absent.** Also the section most likely to be built wrong. Analysing a
reference and reconstructing "an original editable interpretation" is a fine
line, and a feature that reproduces somebody's layout closely enough to be
useful is reproducing it closely enough to be a problem. If built, it should
extract *structure only* — grid, hierarchy, type scale, colour relationships —
map it onto an existing `DesignTemplate`, and never place the reference's own
imagery or wording.

### The editor (§10, §11)

| Item | Status |
|---|---|
| Left rail / centre canvas / right inspector | **Partial** — three tabs (Design / Content / Style), not a rail-and-inspector shell. |
| Typography controls | **Partial** — per-style, not per-element. |
| Layers, groups, free transform, blend modes, masks | **Absent** — templates are slot-based by design. |
| Pages / artboards | **Partial** — multi-page exists in the catalogue and proposal studios. |
| Undo/redo, autosave, version history | **Partial** — autosave and projects in Motion Studio; no undo stack in Creative Studio. |

**The real architectural decision in this section.** The slot model is *why*
one definition renders as a poster, a story and a video frame, and why a style
can restyle 39 layouts at once. A free-transform layer editor throws that away.
The right answer is almost certainly **both**: keep the slot engine as the
template system, and add `FreeCanvas` (which already exists) as the escape hatch
for people who want to move things by hand. Replacing one with the other would
be the single most expensive mistake available here.

### Magic resize (§12)

**Built, and this is worth being clear about.** Fractional geometry means
a template is *already* correct at every format — this was never a resize
feature that had to reflow content, because content was never positioned in
pixels. `DESIGN_FORMATS` covers social, print and billboard.

### Motion Studio (§13–§17)

| Item | Status |
|---|---|
| Real browser renderer with audio | **Built** |
| Scene-based templates | **Built** — scenes with per-scene duration, split, duplicate, reorder. |
| Entrances | **Built** — 10. |
| Easing curves | **Built** — 6 named, including spring and elastic; all land exactly on 1 so the still and the last frame agree. |
| Camera movement | **Built** — 5 moves, applied to the whole frame in the canvas renderer, scoped to the 8 templates that suit one. |
| Keyframes on arbitrary properties | **Absent** — motion is declarative per slot, not keyframed. |
| Multi-track timeline | **Partial** — one track of scenes with per-element overrides. |
| Captions, voiceover | **Partial** — voiceover text exists in the scene model. |
| Particles, 3D transforms, motion blur, LUTs, beat sync | **Absent** |
| Motion style presets by genre | **Partial** — `MotionStyle` exists; not the named genre list. |

### AI Creative Director (§17, §27)

| Item | Status |
|---|---|
| Exists | **Built** — `CreativeDirectorStudio`, `designCoach`, `createForMe`, `motionProjectFromPrompt`. |
| Never invents business facts | **Built and enforced** — a standing rule across the codebase, with tests. |
| Brief → full campaign across formats | **Partial** — `OneClickCampaigns` is the closest. |
| "What are you trying to achieve?" as the front door | **Absent** — the most valuable single item in the whole brief, and the cheapest. It is a re-framing of things that already exist, not new machinery. |

### Inspiration, marketplace, mockups (§19, §20, §21)

All **Absent**. All correctly last: an inspiration gallery with 39 templates in
it is an empty room, and a creator marketplace needs the library to be worth
contributing to first.

### Export, print, advertise (§22, §23, §24)

| Item | Status |
|---|---|
| PNG / JPG / PDF / MP4 / WebM | **Built** |
| SVG, GIF | **Absent** |
| CMYK, bleed, crop marks, 300 DPI | **Absent** — and it matters: every printed price is still an estimate with no partner behind it, so print-ready output has nobody to receive it yet. |
| Create → Print | **Partial** — the order flow, configurator and tracking are live; a finished design does not yet flow into one. |
| Create → Advertise | **Partial** — placements exist; a design does not become a campaign asset in one step. |
| The "what next?" menu on a finished asset | **Absent** — cheapest differentiating item on the list. |

### Projects, teams, admin (§25, §26, §28)

| Item | Status |
|---|---|
| Projects with autosave, duplicate, status | **Built** for Motion; **Absent** for Creative Studio. |
| Version history, comments, approvals | **Absent** |
| Roles | **Partial** — platform roles exist; no per-project creative roles. |
| Admin template management | **Absent** — templates are code, so "upload a template" means a schema and a validator. |
| The dashboard tree in §28 | **Partial** — every leaf exists; the tree does not. |

---

## 3. Declined, with reasons

**Scraping any library.** Canva, Freepik, Vimeo and Behance are all off-limits
for assets, templates and UI. The brief says so and it is also the only
defensible position: a customer prints this and sells it.

**Claiming a template count we do not have.** `libraryDepth()` is a function
over real data, not a written number, so nothing in the product can advertise
"10,000 templates".

**A style picker full of tags that do nothing.** 20 style *tags* are searchable;
8 styles are *applicable*. Shipping 20 switches that produce the same design
would look richer and be worse.

**Print-ready CMYK output before a print partner exists.** It would be a button
that produces a file nobody can use.

---

## 4. On volume

The brief asks for thousands of templates. The honest arithmetic:

- 39 layouts × 8 styles = **312 finished looks today**, each one art-directed
  rather than generated.
- Hand-authoring 2,000 templates at current quality is roughly 2,000 × the
  effort that produced 39, and the failure mode is visible in every template
  marketplace: 200 good designs and 1,800 nobody picks.

The path to volume that does not destroy quality, in order:

1. **More layouts** (39 → ~120). Each one multiplies by 8.
2. **More styles** (8 → ~16). Each one multiplies by every layout.
3. **Then** a creator marketplace, with the quality gate already enforced by
   test so contributions cannot lower the floor.

120 × 16 = 1,920, every one of which passes contrast, clearance and settle-time
checks. That is a real library. Twenty thousand tagged JPEGs is not.

---

## 5. Sequence

Ordered by value per unit of work, not by the brief's numbering.

**Phase 2 — the front door.** One Create home. "What are you trying to
achieve?" above "what template do you want?". A finished asset offers Download /
Share / Post / Print / Advertise / Make a video. *Almost entirely re-framing of
existing machinery, and it is the differentiator.*

**Phase 3 — brand locks + brand fonts.** Lock logo, colours, contact, footer,
legal. Let a Brand Kit font override a style's pairing. *Small, and the thing a
business will actually ask for first.*

**Phase 4 — Creative Studio projects.** Save, name, duplicate, autosave, reopen.
Motion already has this; static design loses work today.

**Phase 5 — layouts to ~120,** with a template schema in the database so admins
and later creators can add without a deploy.

**Phase 6 — assets.** Organised photo and video collections, then licensed
audio. Licence metadata mandatory from the first row.

**Phase 7 — Motion depth.** Genre style presets, captions, beat-aware pacing.
Keyframes only if a real user asks — the declarative model is why scenes stay
editable after a template swap.

**Phase 8 — Africa Collection,** commissioned rather than generated.

**Phase 9 — Inspiration, then the creator marketplace.**

**Phase 10 — collaboration, approvals, version history.**

Font upload, reference-image recreation, free-transform layers and print-ready
CMYK sit outside this sequence until the questions in §2 above are answered.

---

## 6. The rule that survives all of it

Every visible control works or is absent. No placeholder buttons, no tabs that
open nothing, no "coming soon" inside the editor. Where a capability is not
built, the product does not imply it is — which is why this document exists in
the repo rather than in a slide.
