# Design fundamentals

The rules that hold in every movement. A movement decides how these are applied; none of them is switched off.

Numbers marked *heuristic* are house rules taken from common practice, not published standards. They are starting points for the checks in `src/lib/design/quality/` and can be tuned from review.

## 1. Start from an idea

A design answers one question for one person. Before any layout exists, the brief must be able to complete this sentence: *"This tells [who] that [what], so that they [do what]."*

- If the sentence cannot be completed, ask. Do not design.
- An idea is specific to the business. "Now open" is a status. "The first suya spot on Admiralty Way open until 3am" is an idea.
- Three concepts means three ideas or three ways of seeing one idea. The same layout in three colours is one concept.

## 2. One focal point

- One element is at least twice the visual weight of the next. *heuristic*
- The eye should land within one second and know where to go next.
- Count the things competing for first place. If there are two, remove or shrink one.

## 3. Hierarchy

Three levels are enough for almost everything: the line that stops you, the line that explains, the details that let you act.

- Posts and billboards: headline at least 3x body size. Cards: name at least 1.6x details. *heuristic*
- Use a ratio (1.333 or 1.5) and keep to its steps. No in-between sizes.
- Three sizes per surface; four on dense posts.

## 4. Grid and alignment

- Every element's edge aligns with at least one other edge or a grid line. Nothing floats.
- 12 columns for posts and billboards; 6 columns and a baseline for cards. *heuristic*
- Margins are equal on all sides unless an asymmetry is deliberate: cards at least 8% of the short edge, posts at least 6% of the width, billboards at least 5% of the height. *heuristic*
- Related things sit close together; unrelated things are separated by more space, not by lines.

## 5. Space

- Empty space is a material. It should look placed, not left over.
- Aim for at least 35% on cards and minimal pieces, 25% on denser ones. *heuristic*
- Emptiness only works around something excellent. An empty frame where a picture should be is not minimalism.

## 6. Typography

See [typography.md](typography.md). In short: two families, three weights, a steep scale, tracking set by hand, real typographic marks, no widows.

## 7. Colour

- About 60/30/10: a dominant, a support and an accent. Three colours plus neutrals at most.
- The accent covers 10% or less and appears in one or two places.
- Text contrast meets WCAG AA at minimum (4.5:1 for body, 3:1 for large type). Billboards aim for 7:1.
- Avoid pairs of equal value (red on green, blue on red): they vibrate.
- Colour carries meaning consistently within a piece and across a set.
- Gradients come from palette roles only. No rainbow, no fake metal.

## 8. Imagery

See [photography.md](photography.md). The first rule is relevance: the picture shows what the business sells, makes or is. A picture of the wrong thing is worse than no picture.

## 9. Copy

- Use the customer's own words where they gave them. Never paraphrase a quoted line.
- Specific beats clever. Name the dish, the street, the date.
- Billboards: seven words or fewer in the headline.
- Never invent a business, claim, award, rating, price, testimonial or statistic.
- Placeholder labels ("Your name") belong in templates. A finished concept has finished words.

## 10. Consistency across a set

A campaign is one system: the same grid logic, type roles, colour roles and image treatment on every piece. Adapting to another format means recomposing with the same system, not stretching the layout.

## 11. Accessibility and reach

- Minimum sizes by format are enforced in the quality checks. If a detail must be read, it must be readable.
- The thumbnail test: a post's headline is legible at 25% scale.
- Every face must render the languages and currencies we support (naira, cedi, Yoruba, Igbo and Hausa letters, and the rest of the supported list).
- Do not rely on colour alone to carry a fact.

## 12. Honesty

- Stock and AI images are labelled as such where they could be taken for the real place, product or person.
- A render is not presented as a photograph.
- "Print-ready" is said only of a file that is.
- A mockup is an illustration and is never exported as the artwork.

## What "generic" means

A design is generic when it could be handed to a different business in the same trade, or a different trade, without changing anything but the name. The test for every concept: *what in this piece could only belong to this business?* If the answer is "nothing", it has not passed, whatever it scores elsewhere.
