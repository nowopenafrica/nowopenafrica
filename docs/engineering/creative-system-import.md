# Claude Design → Create Media

How an artboard from the **NowOpen Africa Creative System** canvas becomes a
template in the Create Media catalogue, and what deliberately does not.

Measured and published 2026-10-26.

---

## What the Creative System actually contains

134 artboards across 13 pages. They are not all templates, and treating them
as one bucket is the first mistake available:

| | count | what they are |
|---|---:|---|
| **Single deliverables** | 76 | One design on one canvas — a post, a card, a poster, an invoice |
| **Presentation sheets** | 48 | 1600×1120 boards showing four or six mockups at once |
| **Brand documentation** | 10 | Strategy, audit, logo usage, voice, roadmap, handoff |

Only the first group can become a catalogue template. A sheet showing a
packaging set is a *picture of six designs*; rebuilding it as eleven slots
would lose five of them.

## The problem that decides the architecture

A `.dc.html` artboard lays itself out with **flexbox and grid**:
`margin-top: auto`, `justify-content: space-between`, `gap`, and text that
wraps. Create Media's templates are **fractional slot coordinates**.

Where the headline sits is decided by the layout engine and by the glyph
advances of the font. It is not written anywhere in the markup.

```
T01 Bold typographic — headline measured at y = 692 of 1350.
Nothing in the file says 692. `margin-top: auto` says it.
```

So the artboard is **laid out and measured**, never parsed into a guess. This
is the same rule the PDF import follows after the version that "recreated"
text produced layouts nobody recognised.

### Measured in the fonts it will be drawn in

The artboards are set in Inter, Inter Tight and Instrument Serif. Create
Media ships nine self-hosted faces. Measuring in Inter and rendering in
Outfit would import geometry correct for a font the result never uses, so
the measuring document is given **our** faces, mapped by role. **Coolvetica
is in both systems**, so the display type — the part that decides a poster's
composition — is measured in the face it will be drawn in.

## The pipeline

| module | what it does | pure? |
|---|---|---|
| `designCanvas.ts` | Reads the artboard, resolves `{{token}}` holes from `data-props`, strips everything that is not the design | ✅ |
| `measureArtboard.ts` | Lays it out in a sandboxed frame at full size and reads every text run back | browser |
| `canvasSlots.ts` | Turns measured pixels into fractional slots with roles | ✅ |
| `classifyArtboard.ts` | Proposes a category, a canvas and a name | ✅ |
| `ingestTemplates.ts` | One door for both `.dc.html` and native template JSON | ✅ (measurer injected) |

### Two safety barriers, because one of them is a regex

1. `parseDesignCanvas` removes every `<script>`, `on*=` handler, stylesheet
   link, frame and remote reference **before anything renders**.
2. It renders in an iframe whose `sandbox` does **not** include
   `allow-scripts`, so nothing in it can execute even if step 1 missed
   something. `allow-same-origin` is what lets the parent read geometry back;
   without script execution it grants no power.

## What is imported, and what is left behind

**Imported**: where each line sits, how big it is relative to the canvas, its
weight, case, tracking, alignment, whether it is pinned to the bottom, and
whether a group of rows is one list.

**Not imported**: the words and the colours.

That is not a shortcoming — it is the catalogue's model. A Create Media
template is drawn in the brand colour of whoever uses it, with their own
copy. An artboard reading "NOWOPEN AFRICA · Discover NowOpen" becomes a
layout with a **brand slot** and a **call to action**, filled by the business
owner's own name. Copying NowOpen's words into a public template would hand
every business on the platform a flyer for somebody else.

Verified: `JSON.stringify(template)` contains no artboard text at all.

### Three decisions worth not re-litigating

**The headline follows SIZE, not the token name.** A milestone poster
declares `{{number}}` at 300px above `{{headline}}` at 92px. Honouring the
name would put the user's headline in the small slot and their supporting
line in the huge one — the layout inverted.

**The bottom third is anchored from the bottom.** One template renders across
a square post, a 9:16 story and an A3 poster. A footer measured as "y = 0.91
from the top" drifts off a taller canvas; pinned to the bottom it stays where
the designer put it. This is the one place the import reinterprets rather
than copies.

**A repeating group is one list, not five headlines.** A service menu, a
claim checklist and a three-column slide each lost most of themselves at
first, because every row competed for one of eleven roles and ten lost. They
are not eleven things — they are one list, which the catalogue already
renders through `services`, `price`, `stats` and `contact`. Adding group
detection took the conversion from 70 to 71 and, more importantly, took
**30 templates from flat to list-bearing** — including the invoice, which now
carries both a services column and a price column.

## The result, measured

| | before | after |
|---|---:|---:|
| Layouts in the public catalogue | 66 | **137** |
| Designs (layouts × styles) | 726 | **1,507** |
| Social media shelf | 11 | 56 |
| Flyers & posters | 13 | 21 |
| Branding & cards | 11 | 16 |
| Business documents | 12 | 16 |
| Events & tickets | 4 | 9 |
| Offers & campaigns | 13 | 16 |
| Menus & price lists | 2 | 3 |

71 of 76 candidates converted. Average 4.61 slots; 41 carry five or more.

### The five that were refused, and why

Refusal is the design, not a failure: a template that half-imports is worse
than one that does not, because the missing half is invisible.

| artboard | reason |
|---|---|
| `L2-Menu` | 34 separate text runs — a real menu, not one deliverable |
| `A1-Deck-Slide` | 3 columns × 3 differently-sized lines: a layout, not a repetition |
| `P2-Certificate` | signature blocks and a reference number with nowhere to go |
| `T13-Profile-Checklist` | tick marks measured apart from their labels |
| `B1-Carousel-2` | paired rows that are not uniform enough to read as a list |

Each names what could not be placed, so the decision to split the artboard
is the designer's.

## Doing it again

In **Admin Creator → Create → Template Manager**: pick any number of
`.dc.html` files (or template JSON), watch them measured one at a time, edit
the name, category and canvas on each card, then **Save all as drafts** or
**Publish all**. Published rows join the same catalogue as the shipped
layouts through `templateCatalogue.ts`; nothing downstream knows the
difference.

To get the files out of the canvas: **Share → Export** on the Design
artifact, or ask here and they can be fetched directly.

## The canvas bug the first pass shipped

Auditing the 71 published rows found `format` wrong on most of them, and the
cause was worth more than the fix.

**`DESIGN_FORMATS` had no 4:5 portrait canvas.** 1080×1350 is the most used
feed size there is and about forty of the artboards are that shape. With no
4:5 entry, every one of them resolved to the nearest proportion we *did*
ship — **US Letter**. A social post opening on a sheet of American office
paper, which is precisely the failure the business-card sizes in
`studioPresets.ts` already record in a comment: the label changed and the
canvas did not.

**Shape and size were weighted equally.** An A5 flyer went to a portrait
business card, because the card's pixel area was nearer than A4's even though
its proportion was ten times further out. An artboard is drawn at whatever
scale suited the canvas — one roll-up in this set is 0.5 px per millimetre —
so its **area carries almost no information and its proportion carries all of
it**. Shape now decides at 100:1 and size only breaks ties between formats
that share a proportion, which is exactly what tells A4 from A5.

**A filing code is not a paper size.** `A3-ID-Front.dc.html` is a CR80 staff
ID card. Its board code reads exactly like the poster size, and it was given
an A3 canvas. The filename may say what a design is FOR; only the artboard's
own title may say how big it is.

**Some canvases only a name can pick.** A business card artboard is 344×231 —
91×61mm *including bleed* — which is proportionally nearer Half A4 than the
trimmed 85.6×54 card. Both measurements are right; they measure different
rectangles. A named canvas is accepted only when its proportion is in the
same family, so "48-sheet billboard" on a 2:1 board is not forced onto our
3:1 billboard and returned the wrong shape.

Two formats added: **`instagram-portrait`** (1080×1350) and **`a5`**
(877×1240). Corrected across all 71 live rows:

| | before | after |
|---|---|---|
| 38 × 4:5 feed posts | `letter` | `instagram-portrait` |
| A5 flyer | `business-card-portrait` | `a5` |
| Roll-up banner | `business-card-portrait` | `rollup` |
| Invoice | `a5` | `a4` |
| Staff ID (×2) | `a3` | `business-card-portrait` |
| Business card (×2) | *none* | `business-card` |
| Email newsletter | `rollup` | *none — no shipped canvas fits* |

### And the column was not load-bearing

Having corrected every `format`, a link straight to a template still opened
**1080×1080**, because `StudioEditor` defaulted the canvas whenever the URL
carried no `w`/`h`. The Create page passes them — its customiser has already
resolved the format — so the column only worked on the one path the gallery
happens to use. A business card opened square, which is the bug we had just
spent an afternoon fixing in the data.

`StudioEditor` now falls back to the template's own deliverable format, and
`templateByKeyAnywhere` registers that single row's classification (opening
by link never goes through `fetchCatalogue`, so there was nothing registered
to read). Verified on production: `?template=f2-card-front` opens
**1011×638**, `?template=t21-service-menu` opens **1080×1350**.

Two IAB display canvases were added at the same time — **MPU 300×250** and
**Leaderboard 728×90**. This platform sells ad placements and neither size
had a canvas, so a display ad designed in Studio came out square and was
cropped by whoever trafficked it.

Ten labels that named NowOpen's own campaigns rather than the layout were
rewritten too ("Africa is NowOpen city post" → "City launch post", "Be heard
Promote post" → "Advertising announcement post"). No published label now
contains "NowOpen", "Be found", "Be heard" or "Create Media".

## Using one for real, and what it found

A template was taken end to end on 2026-10-27: **Service menu poster** opened
from its link, the headline changed by typed instruction, and exported.

- Opens at **1080×1350**, its own canvas, with layers Cta / Eyebrow /
  Headline / Brand / **Services**
- `change the headline to "Ada's Hair Studio"` → applied
- PNG out: `service-menu-poster@2x.png`, **2160×2700**, 2.07 MB, valid
  PNG signature

Two defects surfaced, neither of them in the import:

**The prompt bar truncated the apostrophe.** The quoted-copy pattern,
`["“”'‘’]([^"“”'‘’]{1,200})["“”'‘’]`, treated an apostrophe as a closing
quote and forbade one inside the copy — so the headline became **Ada**. It
would have truncated most business names (Mama's Kitchen, Joe's Barbers,
We're open), always silently, always leaving a design that looked like the
instruction had worked. Each quote form now closes with its own kind, double
quotes are read first, and a straight single quote only counts when it opens
and closes like a quotation rather than sitting inside a word.

**The site went blank on production** — covered in its own note, because it
has nothing to do with templates and everything to do with deploying three
times in an hour. See `nowopen-spa-fallback-poisoning` in memory.

## The visual layer — a second pass

The first import read **text and nothing else**, and that is why the
catalogue looked basic. Measured: 71 imported templates with zero shapes and
zero photography, against 35 of the 66 code templates carrying geometry and
29 built around a photograph. A design is not its sentences — the rainbow
rule under the headline, the disc behind the week number, the panel the
business name sits on and the 760px photograph at the top ARE the design.

The measurer now collects painted boxes as well as type:

| measured | becomes |
|---|---|
| a filled or gradient box | `rect`, with its corner radius |
| round, and roughly square | `circle` |
| round, outlined, unfilled | `ring` — a photo frame |
| rotated | `stripe`, keeping the angle |
| a box that held a picture | nothing — but it sets `photoLed` |

**Colour becomes a brand ROLE, never a hex.** A blue pill and a rainbow rule
both read as `accent`, so they come out in the user's own brand colour. Near
white and near black stay structural, because a white card on a dark ground
is a white card whatever colour the business picks. This is the whole reason
an imported design can belong to somebody else.

Result on production: **63 of 71 carry geometry, 186 shapes in all, 32 built
around a photograph.** The eight without are the ones that genuinely have
none — a plain type poster has no bars.

### Three bugs this pass found

**`getComputedStyle` returns `border-radius: 50%` as "50%".** It cannot
resolve a percentage without the box. Read as a number that is 50, and on a
150px disc it is a third of the rounding there is — so every circle in the
Creative System measured as a rectangle with soft corners.

**A picture's box is a HOLE, not a fill.** Painting it filled the top half of
a photo-led poster with solid accent, directly over the photograph the
template exists to show. An *outlined* one is different: that is a frame
round the picture, and the frame is part of the design.

**The validator silently dropped every shape.** `readTemplateUpload` rebuilds
a template from an allowlist of fields, and `shapes` was not in it. So the
importer measured geometry, the Template Manager wrote it to the database,
and every READ threw it away: 71 rows held shapes while 71 templates
rendered flat. This is the same failure the rest of this document keeps
warning about — a half that is invisible — committed in the validator whose
job is to prevent it. `shapes` and `photoLed` are now validated and carried,
and a shape painted in a literal colour is refused.

## Still open

- **Deployed** 2026-10-27 and verified on `www.nowopenafrica.com`:
  137 layouts × 11 styles = 1,507 designs, every shelf grown, and imported
  templates opening in the editor at their own canvas size.
- **45 of 71 are filed under `social`**, which is what the Creative System
  mostly contains. The catalogue is now social-heavy; more print and document
  artboards would balance it.
- **The editor still has no gradient you can make.** One can arrive from a
  template's surface as a CSS string, but a shape's `fill` is a flat colour
  and the page background control is a colour picker — using it replaces an
  inherited gradient with a solid. Adding a gradient type to both is the
  next real step towards the brief.
- **SVG paths and polygons are counted, not converted** (`importSvg.ts`), so
  vector import is nominal. The document model already has a `polygon`
  shape, which is where converted paths would go.
- **One template still has no canvas**: the 640×1900 email newsletter.
  Studio does not design emails — an EDM is built in tables or MJML, as that
  artboard's own note says — so it falls back to the square default rather
  than being given a canvas that would imply otherwise.
