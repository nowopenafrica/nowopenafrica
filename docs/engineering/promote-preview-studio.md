# Advertising preview studio

Seeing an advertisement on the medium it will run on, before committing to a
quote. Four mediums: **billboard, digital LED, bus flank, social feed.**

Built 2026-10-27. Phase 0 of the brief — audit first — is what this opens
with, because most of what follows was decided by what the inventory
actually contains.

---

## What the inventory really holds

`public.advertisements`: **97 rows, 89 active, every one with an image**,
13 types. Billboard 38, Digital Screen 13, Transit 10, Vehicle Wrap 9,
Airport 9, Mall Media 6, Street Furniture 4, the rest in ones and twos.

The brief asks for "verified dimensions". There is a `dimensions` column and
it is free text, used for **five different things**:

| what it says | what it is | count |
|---|---|---:|
| `12m x 6m`, `9m x 4.5m` | a real size | **51** |
| `Unipole, 3 faces`, `Network of 8` | a count of faces | 22 |
| `Both flanks`, `Full exterior` | a described extent | 14 |
| `30 seconds`, `30s spot, one a day` | airtime, not area | 4 |
| `Programme billing`, `Multi-city route` | unreadable | 6 |

So `readAdDimensions` returns a **tagged** answer and the interface decides
what it can honestly show. A preview that treats "Both flanks" as a width
draws nonsense; one that treats "30 seconds" as a width is worse.

Nothing is invented. An advertising surface is manufactured from these
numbers, and a guessed width puts a business in front of a printer with the
wrong artwork. Unreadable comes back `unknown` and the page says
**"Dimensions pending confirmation"**.

## Why the scenes are drawn, not photographed

Three ways to get a believable environment. Two were not available:

- **A photograph of the real site.** The inventory carries its own images,
  but nobody has marked where the advertising surface sits inside them.
  Guessing would show a business their artwork on the wrong wall.
- **A stock or third-party mockup.** This product already has a rule about
  lifting assets from Canva, Freepik and the rest, and a mockup library is
  exactly that.

So the scenes are **drawn as vector, in the repository**. Unambiguously
illustrative, no licence, scale to any size, and — most usefully — the
surface is known *exactly*, because it was placed deliberately rather than
estimated from a photo. A test asserts no scene references a remote asset.

## The geometry

A billboard photographed from the pavement is not a rectangle on screen; its
far edge is shorter than its near one. An affine transform cannot express
that — it keeps parallel lines parallel, and the whole point of a receding
surface is that they do not.

So: a **homography**, solved from the four corners (eight unknowns, two
equations per corner, Gaussian elimination with partial pivoting), applied
through CSS `matrix3d`. No canvas, no WebGL, no new dependency — the artwork
stays a live `<img>`, which is what keeps re-fitting instant.

Three details that are easy to get subtly wrong, and are tested:

- **CSS `matrix3d` is column-major.** A 2D homography sits at the corners of
  the 4×4. Transposing it produces a plausible-looking but sheared result,
  which is worse than an obviously broken one.
- **The surface is also a `clip-path`.** The transform alone fills the quad
  exactly, but a user who has scaled up to crop would otherwise paint over
  the scene around the board.
- **A degenerate quad returns null**, not NaNs. Three corners in a line has
  no transform, and NaNs paint an invisible element nobody can debug.

The test proves it is genuinely projective: on a receding surface the centre
of the artwork does **not** land at the midpoint of the quad's diagonals.

## Occlusion is the feature

A flat rectangle with artwork in it tells a business nothing they could not
see in the editor. What they need is what the medium does to their design:

- **Bus flank** — windows and wheel arches are drawn **in front** of the
  wrap. A headline that sits behind a window is a headline nobody reads, and
  the preview shows it immediately.
- **Social feed** — deliberately flat, because there is no perspective in a
  feed; adding one would be decoration pretending to be information. What it
  shows instead is how much of the image the interface eats.
- **Digital LED** — lit rather than printed, with a glow. A digital screen
  previewed as paper misrepresents the medium.

## Fitting and honesty

`contain` / `cover` / `stretch`, with `contain` the default. **Stretch is
offered and warned about**: distorting a logo to fill a board is the single
most common way a preview lies about what will be printed. `cover` says when
it has cropped.

A resolution check runs only when the placement's size is actually known —
`requiredPixels` works from the real metres at 400px/m, which is about where
large-format print is specified, since it is read from across a road. With no
confirmed size it returns **`unknown`**: a warning computed from a size
nobody verified is a warning about nothing, and a reassurance would be worse.

The panel always states which shape it used — the placement's own
proportions, or the medium's usual ones.

## Where it is

`/advertise#preview`. The existing marketplace, listings and revenue
products are untouched.

| file | what |
|---|---|
| `lib/promote/adDimensions.ts` | reads the free-text column into a tagged answer |
| `lib/promote/surface.ts` | homography, `matrix3d`, clip-path, fitting, resolution |
| `lib/promote/mockupScenes.ts` | the four drawn scenes and their surfaces |
| `components/promote/AdPreviewStudio.tsx` | the studio |

35 tests across the three libraries. `npm run verify`: 0 errors, 12/12
guards, 427 files / 6,179 tests.

## On a real placement

`/adverts/:id` now carries its own preview, matched to that placement's
medium by `sceneForType` against the real `advertisements.type`.

Verified on two production rows:

**`2-Sided Unipole Billboard, Aba Road, Port Harcourt`** — the billboard
scene opens automatically and the specification panel is driven entirely by
that row:

| | |
|---|---|
| Size | 12m × 6m *(read from the free-text column)* |
| Shape | 2.00 : 1 *(derived)* |
| Artwork | 4800 × 2400px *(12m at 400px/m)* |
| | "Previewed at this placement's own proportions." |

A 1600 × 800px upload got: *"Too small to print at this size: 4800 × 2400px
is needed and yours is 1600 × 800px."* — a warning that is only possible
because the size was real.

**`Channels TV Sunrise Breakfast Spot (30s), Lagos`** — **no preview section
at all**, and its Dimensions field reads **"30 second slot"** rather than the
raw `30s spot, one a day`. That is the tagged parser doing its job on live
data: the column said airtime, so the page showed airtime and offered no
billboard.

The detail page also stops printing the raw column. Everything goes through
`describeDimensions`, so "Unipole, 3 faces" reads as *"Unipole · 3 faces"*
and an unreadable value reads as *"Dimensions pending confirmation"*.

## On the placement's own photograph

Every placement carries a photograph. None of them said **where the board is
inside it**, which is why a preview could only ever use a drawn scene and had
to caption itself illustrative. That one fact cannot be inferred, so it is an
editor rather than a script.

**Admin Creator → Produce → Advert Surface Editor** (section 35). Pick a
placement, drag four handles onto its advertising surface, publish. Arrow
keys nudge the focused handle, shift moves further — a corner is a position,
and a mouse is not the only way to specify one.

`ad_mockup_surfaces` stores four fractions, which is the same `Quad` the
drawn scenes use, so the renderer does not change at all. Migration
`20261027120000`, applied and recorded, RLS on: published rows public,
drafts staff-only, `is_staff()` the only thing that can write.

Three refusals built in:

- **Nothing publishes until it is a real shape.** Convex, and at least 2% of
  the photograph. Nearly right is the one outcome worse than none — an
  advert across a lamppost looks deliberate.
- **Corners belong to one picture.** The row remembers which image they were
  drawn on; if the media owner swaps the photograph, the editor warns and
  the public preview falls back to the drawn scene rather than showing a
  board that is not there.
- **The caption changes with the backdrop.** A drawn scene says it is an
  illustration. A marked photograph says *"this placement's own photograph,
  with the advertising surface marked by our team"* — plus whatever note the
  person left — because captioning that as illustrative would undersell the
  truth. A toggle switches back to a generic scene.

### The bug it exposed

With the real photo in place the artwork was the right size and **128px too
low**. Measured, not eyeballed: the artwork's box was `{70, 827, 418, 280}`
against a surface at `{70, 699, 418, 280}`.

The transform was being solved against a notional 1000-unit canvas while the
element was laid out in CSS pixels of a 670px box. The translation is in
whatever space the matrix was solved in, so it was 128px out — the right
size in the wrong place, which reads as a design decision rather than a bug.

The frame is now measured with a `ResizeObserver` and the surface rect is
expressed in its own pixels, so the two cannot disagree. Re-measured
afterwards across **all four drawn scenes and the photograph**: `dx, dy, dw,
dh` all **0**. The fix corrected a latent error in every scene, not just the
new path.

## Not built, and deliberately

This is the vertical slice the brief asks for first, not Promote 2.0.

- **No campaign builder, no quote flow, no AI assistant.** Those are Phases
  5–8, and they are now the honest next step: a placement can open its own
  preview, so the thing to build is what happens after somebody likes it.
- **96 of 97 placements still have no surface marked.** The editor exists;
  the marking is human work, a minute or two per board.
- **Radio, Television, Cinema and Print have no preview** and are listed as
  such. A radio slot previewed on a billboard is not a preview.
