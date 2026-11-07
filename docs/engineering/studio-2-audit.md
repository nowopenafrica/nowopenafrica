# NowOpen Studio 2.0 — Phase 0 audit

**2026-10-21.** The brief asked for a repository audit before any code, and
set its own Definition of Done: ten things a real authenticated user must be
able to do. That list is testable, so this answers it with evidence rather
than restating the plan.

---

## The headline finding

**Eight of the ten are already built.** The vertical slice the brief asks for
as a first milestone — create a project, add an artboard, edit a text
element, save, reopen, export — exists and is in use.

| # | Definition of Done | state | evidence |
|---|---|---|---|
| 1 | Open Create Media | **yes** | `/media` → `CreateMarketplace` |
| 2 | Create a design project | **yes** | `design_projects`; **4 rows on production** |
| 3 | Generate ≥1 editable design | **partly** | from a template, yes — 66 layouts convert to a structured document. From a *prompt*, no: needs the model path |
| 4 | Edit text, images, shapes | **yes** | full properties panel; drag-and-drop image replace added 2026-10-20 |
| 5 | Multiple artboards | **yes** | `addPage` / `duplicatePage` / `movePage` / `removePage` / `variantPage` |
| 6 | Apply a Brand Kit | **was missing** | the editor had no notion of a business at all — only an accent colour in the URL |
| 7 | Save | **yes** | `save()` + debounced autosave (`autosaveDecision`) |
| 8 | Reopen without loss | **yes** | `/media/studio/:id` → `readDocument` with schema validation |
| 9 | Export a usable file | **yes** | PNG and PDF. **Not** SVG or JPG |
| 10 | Undo an unwanted AI change | **yes** | one history for typed and dragged edits; verified in a browser |

So the work is not "build a studio". It is **close two gaps and decide three
architectural questions.**

---

## What was built in this pass: the Brand Kit (#6)

### The rights problem it exists to solve

"Create with my brand" sounds like a convenience. It is a **licensing**
feature, because the output gets printed and sold.

**Measured on production, 2026-10-21** — 528 businesses carry a logo:

| provenance | count | with a recorded licence |
|---|---:|---:|
| `business` (the owner put it there) | 319 | 29 |
| `unknown` | **209** | **0** |

Those 209 came from somewhere nobody wrote down. Dropping one into a
customer's flyer and sending it to a printer creates a rights risk on their
behalf, silently, to save them one upload.

`src/lib/studio/brandKit.ts` therefore gates on provenance: a logo is used
when the business supplied it, and withheld — with the reason said out loud —
when it did not. A source it has never heard of must opt in; it does not
inherit permission by existing.

### A second finding the type system was hiding

The provenance columns have existed for a while and **no TypeScript carried
them**, so nothing in the product could tell an owner's logo from an
importer's. They are now on the `Business` type.

There is a guard — `fetchAllBusinesses.test.ts` — that fails when application
code reads a column the public directory does not deliver. It fired on this
work, correctly: a business fetched by the directory carries no provenance,
so a later caller could pass one and get `undefined`.

Rather than quiet the guard, the resolver now keeps `undefined` and
`'unknown'` apart. Both withhold the logo — the safe answer either way — but
only one of them is a bug in the caller, and the message says which.

### What a Brand Kit honestly contains

| | |
|---|---|
| name | real, always present |
| logo | gated on provenance, as above |
| tagline | the owner's own words, when they wrote one |
| **colour** | **not stored anywhere** |
| **typeface** | **not stored anywhere** |

`BrandIdentity` holds voice and copy — tagline, mission, story, keywords —
and no visual tokens at all. There is no brand-colour column on the
businesses table. The colour on a design today is whatever was picked in the
customiser for *that design*.

So the kit reports its colour as **chosen**, never as "your brand colour",
and lists the two gaps as missing. A kit that quietly invents a brand colour
teaches an owner that the platform knows their brand when it does not.

### How it applies

Through the **same ten validated operations** a typed instruction produces
(`designPatch.ts`), so a brand kit is clamped, validated and undone by
exactly the machinery everything else uses. Applying a brand is not a second,
privileged way to write into a document.

It touches only what it can justify: the `brand` slot takes the real business
name, and the template's own accent lines take the chosen colour. It does
**not** restyle headlines, swap fonts or recolour backgrounds — a feature
that rearranges somebody's artwork because they pressed "use my brand" is one
they press once.

---

## Three decisions, not engineering problems

### 1. Paged document vs infinite multi-board canvas

The brief wants boards side by side on one pannable canvas with 1–100+
artboards. The document model is **paged**: many pages, one visible at a
time, with a switcher.

Both are legitimate. Moving to side-by-side means a viewport/culling layer
and a different selection model — real work, and it changes nothing about
what a design *is*. Worth doing when somebody genuinely needs to see a
campaign at once; not worth doing to look like a reference screenshot.

### 2. The rendering engine was already decided

The brief suggests evaluating Konva or Fabric. That evaluation happened: the
editor uses a **DOM slot model**, because canvas text is invisible to screen
readers and the 66 templates were already structured as slots.

Adopting a canvas engine now would mean re-authoring every template and the
export path. Recorded so it is not re-opened by default — if it is re-opened,
it should be for a measured reason.

### 3. Where a brand colour and typeface live

They have to be stored before "use my brand" can mean anything beyond a name.
That is a small schema addition and an owner-facing screen to set them — and
it is the single highest-value next step, because it turns the kit from
"your name" into an actual brand.

---

## Not built, and why

- **Prompt-to-design generation.** Needs the model path, which is blocked on
  three decisions recorded in `editor-prompt-layer.md` (a public endpoint,
  rate limits/credits, provider credit). Not an engineering blocker.
- **Batch generation (Phase 7).** The brief itself says not to start it
  before the foundations are reliable.
- **SVG and JPG export.** PNG and PDF work; the other two should not be
  offered until they do.
