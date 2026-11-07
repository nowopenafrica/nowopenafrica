# Session log — Template Manager, Creative System, Promote 2.0

26–28 October 2026. Everything below is deployed to `www.nowopenafrica.com`
and verified there, not on the dev server.

---

## What was asked, in order

1. "How do we onboard/upload templates to Create Media on the dashboard?"
2. Sync the **NowOpen Africa — Creative System** Claude Design canvas into
   Create Media, classified by category, style, industry and use case.
3. Apply all pending migrations; test-use one of the new templates.
4. Make the Create Media editor adaptive — images, vector, text, colour,
   shape, gradients.
5. Promote 2.0: billboard, digital LED, bus and social advert previews, with
   real perspective and clipping.

## What shipped

| | |
|---|---|
| **Template Manager** | Upload a design into Create Media from the dashboard, no deploy |
| **Merged catalogue reader** | Published uploads join the 66 shipped layouts as one catalogue |
| **Creative System import** | 134 artboards audited → **71 published**; catalogue **66 → 137 layouts**, **726 → 1,507 designs** |
| **Advert preview studio** | Billboard, digital LED, bus flank, social feed — real homography, clipping, occlusion |
| **Advert surface editor** | Mark where the board is inside a placement's own photograph |
| **Media plans** | Several placements taken to media owners as one enquiry |

Four migrations applied to live and recorded in the ledger:
`design_template_format`, `ad_mockup_surfaces`, `ad_campaigns`
(plus `business_projects` / `design_templates` from the preceding session).

Final gate: **0 lint errors, 12/12 guards, 429 test files, 6,201 tests.**

---

## The decisions worth keeping

### Measure before building

Every piece here started with an audit, and the audit changed the design
every time:

- The editor already had text styling, images, shapes, groups, layers,
  snapping, rotation, multi-page, undo, autosave and four importers. The
  complaint "it only shows basic designs" was **data**, not the editor.
- Of 134 Creative System artboards, **48 are presentation sheets** showing
  several designs at once and **10 are brand documentation**. Only 76 were
  single deliverables.
- `advertisements.dimensions` is free text meaning **five different things**.
- All 97 placements are `provenance = 'unverified_import'` — so there is no
  confirmed price in the inventory, and the media plan is built around that.

### Read, do not regenerate

A Claude Design artboard lays itself out with flexbox. Where the headline
sits is decided by the layout engine, not written in the markup — T01's
headline measured at **y = 692 of 1350**, and nothing in the file says 692.

So artboards are **rendered at full size in a sandboxed frame and measured**,
in the faces Create Media actually ships. Same rule as the PDF import.

### Refuse rather than half-import

71 of 76 artboards converted. The five refusals each name what could not be
placed, so splitting the artboard stays the designer's call. A template that
half-imports is worse than one that does not, because the missing half is
invisible.

### Never state what has not been verified

- 6 of 97 placements say **"Dimensions pending confirmation"**.
- A drawn scene says it is illustrative; a photograph with its surface marked
  by a person does not, because that would undersell the truth.
- A resolution warning only appears when the real size is known.
- Media plan totals are grouped by **where the number came from** and never
  summed across; a group with any uncosted line shows no total at all.
- Imported colours become **brand roles**, never hexes — which is what lets
  an imported design belong to somebody else.

---

## Bugs found, and what each one teaches

Every one surfaced because something real was put through the thing.

### The validator was eating its own output

`readTemplateUpload` rebuilds a template from an allowlist of fields, and
`shapes` was not in it. The importer measured geometry, the Template Manager
wrote it to the database, and **every read threw it away** — 71 rows held
shapes while 71 templates rendered flat.

Committed inside the validator whose entire job is preventing exactly that.

### A missing asset became the app shell, cached for a year

```
GET /assets/DoesNotExist-aaaaaaa.js
→ 200 OK · Content-Type: text/html · Cache-Control: immutable, 1 year
```

The SPA rewrite caught everything but `/api/`, so any visitor who requested a
chunk at the wrong moment cached **HTML under a `.js` URL for a year**. The
browser refuses an HTML module, the page goes blank, and `immutable` means no
reload and no later deploy can fix it.

Diagnostic trap: `fetch()` and `curl` both returned correct JavaScript while
only the module loader got HTML. Module imports use the HTTP cache; those
do not. "I fetched it and it's fine" proved nothing.

### A comment claimed a behaviour that did not exist

`public.sw.js` said *"Bumped on every deploy by the build"* above
`const VERSION = 'nowopen-v1'`. Nothing bumped it, and `activate` deletes
only caches that do **not** start with VERSION — so **508 chunks** had
accumulated since the PWA shipped.

Both now have guards that were **proven to fail** when each bug was
reinstated, before being trusted. `check:all` went 10 → 12.

### No 4:5 canvas existed

1080×1350 is the most-used feed size there is, and about forty Creative
System artboards are that shape. With no 4:5 entry every one of them
resolved to the nearest proportion that did exist: **US Letter**. A social
post opening on a sheet of American office paper.

Two further matching bugs alongside it: shape and size were weighted equally
(so an A5 flyer went to a portrait business card), and a **filing code is not
a paper size** (`A3-ID-Front.dc.html` is a CR80 staff ID card).

### A matrix in the wrong coordinate space

With a real site photograph the artwork was the right **size** and **128px
too low** — measured at `{70, 827, 418, 280}` against a surface at
`{70, 699, 418, 280}`.

The transform was solved against a notional 1000-unit canvas while the
element was laid out in CSS pixels of a 670px box. Right size, wrong place,
which reads as a design decision rather than a defect. After the fix, every
scene measured `dx, dy, dw, dh = 0` — it had been latently wrong in **all
four**, and only a real photo made it visible.

### A second formatter is a second opinion

The first working media plan showed **"₦14 / day"** for a billboard whose own
listing said ₦18,680/day. `advertisements.pricing` is stored in **USD** and
converted by `useCurrency`; the plan page had its own `Intl.NumberFormat`.
Wrong by three orders of magnitude, on the page whose whole job is care about
money.

### Apostrophes truncated business names

`change the headline to "Ada's Hair Studio"` set the headline to **Ada**. One
pattern treated every quote character as both opener and closer and banned
all of them inside the copy. It would have silently truncated most African
business names — Mama's Kitchen, Joe's Barbers, We're open.

### An image box is a hole, not a fill

Painting it filled the top half of a photo-led poster with solid accent,
directly over the photograph the template exists to show.

### `border-radius: 50%` comes back as the string `"50%"`

`getComputedStyle` cannot resolve a percentage without the box. Read as a
number that is 50; on a 150px disc, a third of the real rounding — so every
circle in the Creative System measured as a soft-cornered rectangle.

---

## Tooling note

Writing TypeScript regexes through a `python - <<'PY'` heredoc turns `\b`
into an actual **backspace character (0x08)**. ESLint's `no-control-regex` is
what catches it. It cost two rounds of rework before the lesson stuck: **use
the Edit tool for code containing regex escapes.**

---

## Where it all lives

| area | files |
|---|---|
| Template catalogue | `lib/create/templateCatalogue.ts`, `hooks/useDesignCatalogue.ts`, `components/admin/TemplateManager.tsx` |
| Artboard import | `lib/create/designCanvas.ts`, `measureArtboard.ts`, `canvasSlots.ts`, `classifyArtboard.ts`, `ingestTemplates.ts` |
| Advert previews | `lib/promote/surface.ts`, `mockupScenes.ts`, `adDimensions.ts`, `adSurfaces.ts`, `components/promote/AdPreviewStudio.tsx`, `components/admin/AdSurfaceEditor.tsx` |
| Media plans | `lib/promote/campaignPlan.ts`, `campaigns.ts`, `pages/MediaPlan.tsx` |

Longer write-ups: `creative-system-import.md`, `template-manager-audit.md`,
`promote-preview-studio.md`, `media-plan.md`.

---

## Honestly not done

- **96 of 97 placements have no marked surface.** The editor exists; marking
  is human work, a minute or two per board. That is what retires the
  "illustrative" caveat across the inventory.
- **No artwork on a plan line.** The column and the "Artwork ready on 0 of 2"
  count exist; the picker that puts a Create Media design onto a specific
  placement does not. This is the Promote ↔ Create join, and everything it
  needs is now built on both sides — the clearest next step.
- **No gradient you can create or edit.** A gradient can arrive from a
  template's surface as a CSS string, but a shape's `fill` is a flat colour
  and the page background control is a colour picker that destroys it.
- **SVG paths and polygons are counted, not converted** (`importSvg.ts:147`),
  so vector import is nominal. The `polygon` shape already in the document
  model is where converted paths belong.
- **Nothing writes `price_basis = 'quoted'`.** It exists so a real quote can
  be shown differently, not so today's numbers can be dressed up.
- **45 of 71 imported templates are filed under `social`** — that is what the
  Creative System mostly contains. More print and document artboards would
  balance the catalogue.
- **Non-owner RLS is still unproven** on `business_projects` and the new
  tables: the only browser session available is `role = admin`, so a 201 is
  the policy working, not a hole. It needs a non-admin account to confirm.
