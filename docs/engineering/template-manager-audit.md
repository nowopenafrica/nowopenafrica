# Template Manager — Phase 1 audit and first slice

**2026-10-26.** The brief asked for an admin engine that onboards externally
made designs and publishes them into Create Media without a deploy. This
records what the codebase actually allows, which decided what got built.

---

## Where templates live today

All 66 layouts are **in code**: `src/lib/designTemplates.ts`, 2,717 lines,
imported as a static array by six places —

```
TemplateGallery · IntentComposer · DesignStudio
MotionGraphicsStudio · design/deliverables.ts · StudioEditor
```

There is **no reader in between**. Adding a template today means editing that
file and deploying. That is the gap, and it is real.

## The decision that makes this small

A template in this product is plain data: a surface, some shapes, and a list
of slots. The renderer, the gallery, the editor, the export path and the
motion studio already consume that shape.

So an uploaded template **does not need a new renderer, a sandbox, or a
conversion pipeline**. It needs to arrive AS that shape, validated because it
came from a file. The catalogue then becomes *code templates + published
rows*, and everything downstream is untouched.

That is the entire architecture. The brief's "NowOpen Template Package" is a
good idea whose schema already exists in the repository.

---

## What was built

### `src/lib/create/templateUpload.ts`

Turns untrusted JSON into a `DesignTemplate`, or refuses it with a reason.
20 tests.

Refusals are by name, never silent, because **a template that half-imports is
worse than one that does not — the missing half is invisible**:

| refused | why |
|---|---|
| unknown slot role | it would draw nothing and lose a line of somebody's design |
| coordinates above 1 | they are fractions of the canvas; a flat export loses what sits outside the frame rather than clipping it |
| two slots with one role | copy is keyed by role, so the second would draw the same words twice |
| no headline | the fitter sizes against it and the gallery previews it |
| unknown category | the same rule `check:templates` enforces on code templates |
| a key that already exists | an upload must never shadow one of the 66 |

Numbers inside an accepted template are **clamped, not trusted** — type size,
weight, tracking, surface angle.

### Formats: what is honest

| | |
|---|---|
| **`.json`** (native slot shape) | → a fully editable template. Nothing to convert. |
| **PNG / JPG / WebP** | → an image asset. It can back a design; it is not one. |
| **PSD · AI · Figma · SVG · ZIP · PDF** | **refused by name**, each with what to do instead |

There is no PSD, AI or Figma importer in this codebase. Accepting one would
mean storing a file nobody can open and labelling it editable. PDF now yields
real text per page in the Studio, but into a *document*, not a reusable slot
template.

Every template carries an **editability level** — `full | partial | asset |
preview` — because "it uploaded" and "it is editable" are different facts,
and conflating them is how a customer finds out at export time that the words
are baked in.

### `supabase/migrations/20261026130000_design_templates.sql`

**One** table, not the fourteen the brief lists. Categories, styles and
industries already exist in code and are already enforced against the code
templates by `check:templates`; a second copy in the database would drift
from the first, which this product has been bitten by twice. Collections,
trends and analytics describe a catalogue being browsed at scale — there are
zero uploaded templates today.

Published rows are public (a catalogue entry is not customer data);
everything else is `is_staff()`. Import state and editorial state are
separate columns, so a clean import that is not yet approved does not look
like a failed one.

---

## Built and verified — 2026-10-26

| | |
|---|---|
| **Merged catalogue reader** | `src/lib/create/templateCatalogue.ts`. Returns code templates **on every path, including the failure path**, and says separately whether the uploaded half was readable. The opposite default from `businessProjects.ts`, deliberately: there, showing nothing is a false claim about somebody's business; here it would hide work sitting in the repository. |
| **`useDesignCatalogue`** | No loading state. The 66 code templates are already in the bundle, so the first render is the full code catalogue synchronously and uploads append when they land. Cached in module scope; `invalidateCatalogue()` after a publish. |
| **Admin screen** | `src/components/admin/TemplateManager.tsx`, Admin Creator section 34, group Create. Upload → classify → **drawn through the real `TemplateSurface`** → classify → save draft or publish. |
| **`format` column** | Migration `20261026140000`, applied and recorded. Without it an uploaded business card opened on a 1080×1080 square — a card in name only, and every export the wrong shape. |

### The gap that nearly shipped

`DELIVERABLES` is a hand-written map keyed by template key, and seven
functions in `deliverables.ts` read it. An uploaded row is not in it, so
without classification a published template would have appeared in the
gallery's "Everything" shelf **and nowhere else** — no category, no count,
no collection. `registerUploadedDeliverables()` is a named overlay rather
than a mutation of that map, and a code template's classification can never
be overridden from the network.

### End-to-end, measured

A probe template was uploaded, published, opened and deleted on the live
database:

- validator accepted it → preview drew 4 slots through `TemplateSurface`
- published → **67 layouts × 11 styles = 737 designs** on `/media` (was 66/726)
- **Menus & price lists went 2 → 3** and the card appears in that shelf
- `/media/studio?template=<key>` opened it as a real editable document —
  4 layers, 1080×1080, PNG and PDF export
- removed via the screen's own Remove button; `design_templates` is back to
  0 rows

### Still open

- **Not deployed.** `npx vercel deploy --prod` was refused by the permission
  classifier. Everything above is verified against the dev server and the
  live database; the live site does not have it yet.
- **Non-staff refusal unproven.** The only browser session is `role = admin`.
  Same gap as `business_projects` — check the role before calling a 201 a hole.

## Deliberately not attempted

- **PSD / AI / Figma / Canva conversion.** No importer exists and none can be
  written honestly in this pass. Refused by name with guidance instead.
- **Sandboxed HTML/JS templates.** Executing uploaded markup needs a separate
  origin and a CSP of its own. The slot model gives editable templates
  without running anybody's code, which is a better answer than a sandbox.
- **Trend collections and usage analytics.** Both would be invented numbers
  today. The product already carries a rule about that.
