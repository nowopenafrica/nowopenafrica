# NowOpen Africa

> Category: Marketplace & Local Commerce
> A directory that answers one question — is it open right now — for businesses across Africa. Bright, plain, high-contrast, built to be read on a cheap phone in daylight.

## 1. Visual Theme & Atmosphere

NowOpen Africa is a working tool before it is a brand. Somebody opens it standing on a street, on a mid-range Android, on mobile data they are paying for by the megabyte, to find out whether the pharmacy two streets away is open. Every design decision in this system is downstream of that sentence.

The surface language is therefore light, flat and quiet. White canvas, one blue accent, a thin grey rule where two things need separating. There is no ambient gradient wash, no glassmorphism, no dark hero that eats a phone battery and washes out in sunlight. The expressive weight sits in exactly two places: the business's own photograph, and the open/closed state.

Open versus closed is the product. Green and red are spent on nothing else. When a generated artifact uses green for an unrelated decorative accent, it has quietly borrowed the one signal the product cannot afford to blur.

The second register is commercial. A large part of what gets made here is a flyer, a price list, a shop sign, an Instagram post for a business with one employee. That work must look like it was ordered from a competent print shop — straight, legible, confidently typeset — rather than like a template with the placeholder text swapped out.

**Key Characteristics:**
- Light canvas (`#ffffff`) with a single blue action colour (`#2563eb`); no second accent
- One typeface, Coolvetica, doing display and text work through weight and scale
- Separation by 1px border (`#e5e7eb`) before separation by shadow
- Green/red reserved exclusively for open/closed and true success/failure
- Photography is the business's own; never a stock image presented as theirs
- Generous tap targets — the product's root font-size is under 16px, so sizes are set in explicit px
- Composed for small screens first and for print second; never for a desktop hero that degrades

## 2. Color Palette & Roles

> **Source:** `tailwind.config.js` (`colors.nowopen`), `index.html` (`<meta name="theme-color">`), `src/index.css`. These are the values the live product renders; none were chosen for this document.

### Primary
- **NowOpen Blue** (`#2563eb`): The action colour. Buttons, links, the focused state, the light-mode browser chrome. `nowopen.600`.
- **Ink** (`#111827`): Primary text, and the dark-mode `theme-color`. Near-black rather than black, so a full page of body copy does not vibrate.
- **Canvas** (`#ffffff`): The default background, everywhere.

### Secondary & Accent
- **Blue Pressed** (`#1d4ed8`, `nowopen.700`) and **Blue Active** (`#1e40af`, `nowopen.800`): hover and active steps. Taken from the ramp, not mixed.
- **Blue Tint** (`#eff6ff`, `nowopen.50`): the only sanctioned large blue field — a callout band or a selected row. Not a hero wash.

### Surface & Background
- **Surface** (`#f9fafb`): cards and secondary bands.
- **Surface Warm** (`#f3f4f6`): a third stop for a surface sitting on a surface.
- **Border** (`#e5e7eb`) and **Border Soft** (`#f3f4f6`): the workhorse separators.

### Semantic — load-bearing, not decorative
- **Open Green** (`#16a34a`): the business is open now. Nothing else.
- **Closed Red** (`#dc2626`): closed, or a destructive action.
- **Caution Amber** (`#eab308`): closing soon, or unconfirmed information.

A business whose hours have never been confirmed is **not** green. "Hours not confirmed" counts as off. Rendering it as open is the single worst thing this system can do, because it sends somebody across town.

## 3. Typography

**Coolvetica**, self-hosted at weights 300, 400 and 700 (`src/index.css`), with `system-ui` behind it for the moment before the webfont lands.

One family does all the work. There is no display/text pairing: a headline is Coolvetica 700 at 36–48px, body is Coolvetica 400 at 16px, and the distance between them comes from size and weight rather than from a second designer's typeface. This keeps a flyer coherent and keeps the webfont payload to one family.

| Role | Token | Size | Weight |
|---|---|---|---|
| Hero / headline | `--text-4xl` | 48px | 700 |
| Section head | `--text-3xl` | 36px | 700 |
| Subhead | `--text-2xl` | 28px | 700 |
| Lead | `--text-xl` | 22px | 400 |
| Body | `--text-base` | 16px | 400 |
| Supporting | `--text-sm` | 14px | 400 |
| Meta / legal | `--text-xs` | 12px | 400 |

Body text sets at `--leading-body` (1.6); headlines at `--leading-tight` (1.15) with `--tracking-display` (-0.01em). Coolvetica is already a tight face — tightening further closes the counters and costs legibility at the exact sizes where legibility matters.

**Licensing.** Coolvetica is used under a *free for commercial use* grant, which is not the SIL Open Font License that the Studio's other nine faces carry. It may be set into artwork. It may not be redistributed as a font file to a customer. If a deliverable needs to hand over editable source with fonts embedded, that is a question to answer before promising it, not after.

## 4. Layout & Spacing

A 4px grid throughout (`--space-1` … `--space-12`). Container 1200px with a 16px phone gutter — the product's own `site-container`.

Section rhythm is 80 / 56 / 40px (desktop / tablet / phone). The phone number is deliberately tight: vertical space on a 360px screen is the scarcest resource in the product, and generous whitespace there reads as "nothing here" rather than as calm.

**Touch targets are specified in px, never in Tailwind's rem-based sizes.** The product's root font-size is 15px on desktop and drops to 13.5px on small screens, so `w-11 h-11` resolves to about 39px rather than the 44px it looks like. Anything tappable gets an explicit minimum.

## 5. Shape, Elevation & Motion

Radii are 10 / 14 / 20px, softer than a default scale — that softness is a brand characteristic, not an accident. Pills are for filter chips and status badges only.

Elevation order: flat, then a 1px ring, then — rarely — a small shadow. A shadow is an admission that the ring was not enough. **In print output there are no shadows at all**; a drop shadow on a flyer is a printing cost and a visible mistake.

Motion is two durations (150ms, 200ms) and one curve. Transitions confirm that something happened; they do not perform.

## 6. Photography & Imagery

The imagery is the business's own photograph. That is the whole point of the directory.

Where a real photograph is not available, a stock image may stand in **only if it is labelled as stock**. The product already distinguishes these by host and credits them; roughly seven in eight listings currently show a stock cover. An artifact that presents a stock interior as "their shop" is making a claim on the business's behalf that nobody authorised.

Covers are positioned by focal point and never cropped destructively, so a generated layout must assume it will receive an image whose subject may sit anywhere in the frame.

**Never source artwork from Canva, Freepik, Pinterest or Behance.** Customers print and sell what comes out of this system. The only safe inputs are the business's own assets, the OFL/commercial-grant fonts listed in the Studio, and imagery with an explicit commercial licence recorded alongside it.

## 7. Voice

Plain, specific, and unwilling to overclaim. "Open until 6pm" beats "Serving you around the clock". "Hours not confirmed" beats a confident guess.

The audience is pan-African and multilingual, and English is often a second or third language. Short sentences and concrete nouns. No idiom that does not travel. A price is written with its currency symbol and no abbreviation a reader has to decode.

Never write a testimonial, a rating, a certification, an award or a partnership that does not exist. This has a direct product history: a marketplace page once served eighteen invented studios with fabricated ratings to the public.

## 8. Accessibility

Contrast is treated as a measurement, not an intention. Ink on canvas and canvas on accent both clear 4.5:1, but **this document asserts that rather than proving it per artifact** — any generated surface that introduces a new foreground/background pair has to be checked, not assumed.

Colour never carries meaning alone: an open/closed state gets a word beside the dot. Focus is always visible via `--focus-ring`. Text is real text, never a picture of text — a headline baked into an image cannot be read aloud, translated or resized.

## 9. Prohibited

- A second accent colour, or green/red used decoratively.
- Dark hero sections as a default register.
- Gradient washes, glassmorphism, neumorphism, or a shadow doing a border's job.
- Lorem ipsum, or placeholder copy shipped as finished work.
- Invented businesses, prices, addresses, ratings, reviews or partnerships.
- Stock photography presented as a specific business's own premises.
- Assets lifted from Canva, Freepik, Pinterest or Behance.
- A listing shown as open when its hours have never been confirmed.
- Claiming an artifact is print-ready, vector or editable unless that has been verified for that file.
