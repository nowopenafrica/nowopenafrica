# The editor's prompt layer

Audit and first slice, **2026-10-20**. The brief was a prompt-first creative
workspace. This records what the repository actually allows, which decided
what got built.

---

## The constraint that decided the architecture

There are two AI paths in this product and they are not equally available.

| path | function | who may call it |
|---|---|---|
| Language model | `supabase/functions/ai-command` | **staff and admin only** — it resolves the JWT through `is_staff()` / `is_admin()` |
| Image generation | `supabase/functions/generate-image` | anyone — anon key, no credentials, provider key stays a Supabase secret |

So a business owner in the editor **cannot reach a language model today**.
Making one reachable is not a code change, it is three decisions:

1. A new public edge function, or opening `ai-command` — which would be a
   security regression, since it is the AI Command Centre's own endpoint.
2. Rate limiting and cost control. The Credits ledger exists and is
   deliberately **inert**: unpriced means refused, not free.
3. Provider credit. `vela billing summary` returns 403 and the Anthropic /
   Groq credit question has been open since before this work.

None of those are mine to decide, and none of them block the thing that
matters most.

## What the founder's own brief said, and why it is right

> *"Don't make every prompt generate a new image. Text changes, spacing,
> colors and layout adjustments should normally update the design document
> directly. Use image generation for work that genuinely requires a new
> image."*

That is the whole insight. Most instructions people type at a design are
deterministic document edits — bigger, white, centred, this exact wording —
and a rule does them **instantly, offline, for nothing, and the same way
twice**. Routing those through a model would be slower, dearer and less
reliable.

So the first slice is the cheap path, complete, with the expensive path
left clearly unbuilt rather than faked.

---

## What was built

### `src/lib/studio/designPatch.ts` — the contract

A closed vocabulary of ten operations (`setText`, `scaleText`, `setColour`,
`setAlign`, `setWeight`, `setCase`, `nudge`, `setFill`, `setOpacity`,
`setBackground`). `applyPatch` is pure: it returns a new page, never mutates
the old one, and reports every rejection with a reason.

Everything is validated rather than trusted:

- **Colours** are `#rgb`, `#rrggbb` or one of fifteen names. Nothing else. A
  CSS colour string can carry `url(...)` and `var(...)`, and a document is
  rendered into the page's own DOM — so an unvalidated colour is a hole.
- **Numbers** are clamped. Type between 0.004 and 0.4 of the page; opacity
  no lower than 0.05; a nudge cannot push an object off the canvas, because
  a flat export does not clip it, it loses it.
- **An operation outside the vocabulary is refused**, never guessed at.

That last point is the reason this layer exists at all. A rule parser writes
these operations today; something else may write them later. Neither gets
unlimited reach into the document.

### `src/lib/studio/promptOps.ts` — reading the sentence

Maps instructions onto those operations and **refuses by name** when it
cannot. "Make it more premium" is not a document operation; guessing
produces a random change the person then has to undo. The refusal names
three things it can do instead.

It resolves the target by slot role ("the heading", "the strapline", "the
price"), falling back to the selection. Quoted copy is used **exactly** as
typed — a headline the owner wrote is a fact — but only when the sentence
asks for a replacement, so `make the "headline" bigger` is emphasis, not new
copy.

### `variantPage` in `src/lib/studio/pages.ts` — another size

"Create a matching Story version" is a PAGE, not an edit: the square one has
to still be there afterwards. So it duplicates — with fresh object ids, for
the reason stated at the top of that file — and refits the copy.

The refit mode is chosen, not asked. `refitPage` already offers `stretch`
(every object keeps its share of the page) and `fit` (the whole design scales
uniformly and centres), and `shapeChangesMuch` already measures when the
first one would distort. Square to Story is a big change of shape, so it
fits — a round logo must not arrive as an oval.

A size word alone is **not** a request for one: "make the card bigger" names
a format and a size change and is plainly an edit. An explicit
`version | variant | resize | adapt` is required, so nothing ever silently
gains a page.

### `src/components/studio/PromptComposer.tsx`

One bar under the canvas. No transcript, because there is no conversation to
keep: the document is the state and the existing history is the record. A
typed change and a dragged one undo in the same order.

The word "AI" does not appear anywhere in it, because this is a parser.

---

## The operator switch

`editor_prompt`, in the existing kill-switch table — not a new mechanism.
It appears in the admin Feature Flags panel beside the others, and
`CONSEQUENCE` tells whoever is reaching for it what will happen.

**Seeded ON.** The table's own rule is that everything defaults on except
what spends money or reaches a customer, and this does neither: the bar runs
entirely in the browser, calls no provider and no endpoint, and costs nothing
per use. The switch exists so the surface can be withdrawn, not because using
it is expensive.

Turning it off removes the **bar**, not the **capability** — every operation
it performs is also reachable from the editor's own panels, and existing
designs are untouched.

`isEnabled` answers true for a flag that does not exist yet, so an older
database never silently removes a working feature. The failure mode of a typo
is a bar that stays, not one that vanishes with no error anywhere.

Applied to production on 2026-10-20 and recorded in
`supabase_migrations.schema_migrations` as `20261020120000`. Before that the
row did not exist, and a flag with no row does not appear in the console —
the panel joins the ordered key list to real rows.

## Verified, in a browser, against a real design

| instruction | result |
|---|---|
| `make the headline much bigger` | 183.4px → 293.4px, exactly ×1.6 |
| `make the headline white` | refused — *"it is already that colour"* |
| `make it more premium` | refused, nothing changed |
| `make the background navy` | gradient → `rgb(30, 58, 138)` |
| Undo | restored the gradient |
| `create a matching Story version` | canvas 1.000 → 0.563; both pages present |
| Undo again | removed the added page |
| Flag off, reload | bar gone, canvas and all 10 objects still working |
| Flag on, reload | bar back |
| `/media` → template → Open in Studio | bar present on the real journey |

Plus 59 unit tests across the four modules.

## Measured

| | before | after | delta |
|---|---:|---:|---:|
| `StudioEditor` chunk | 92.00 kB | 103.29 kB | **+11.29 kB** |
| gzipped | 29.40 kB | 33.41 kB | **+4.01 kB** |

It adds no dependency — it is pure TypeScript over the document model that
already existed — but it is not free, and 4.0 kB gzipped is the honest price
of the feature. The editor is a lazy route, so this is not paid by anyone who
never opens it.

---

## Not built, deliberately

- **Any model call from the editor.** Blocked on the three decisions above.
  When they are made, the model's job is to emit *these operations* into
  *this validator* — it becomes one more caller, not a rewrite.
- **Generate a whole design from a sentence.** That needs the model path.
  The existing template gallery already covers "start from something".
- **Multi-page and campaign-family generation.** Later.

## The next thing worth doing

**Generate a design from a sentence.** That is the one remaining piece of the
brief's loop, and it is the one that genuinely needs the model path — so it
is blocked on the three decisions above rather than on engineering.

Everything else the brief asked for that can be done deterministically is
done: describe a change, see it, refine it, make another size, undo any of
it. The cheap path will keep serving those sentences even after a model
arrives, which is the point of having built it first.
