# Print and production standards

What a file must be before it leaves Create. The numbers that code enforces live in `src/lib/design/printSpec.ts` and `src/lib/design/formats.ts`; this page explains them and must not contradict them.

Numbers marked *heuristic* are house rules from common trade practice. Regional print sizes and large-format targets need a print partner's confirmation before any "print-ready" claim is made for them.

## What Create can deliver today

| Output | State |
|---|---|
| PNG at the format's pixel size | Works |
| PDF | A PNG placed in a PDF: not vector, no bleed, no crop marks |
| JPG, SVG | Not built (phase CI-6) |
| Vector PDF with bleed, trim marks and embedded fonts | Not built (phase CI-6) |

Until CI-6 ships, no design is described as "print-ready" or "press-ready". The readiness shown to a customer comes from `printSpec.ts`: **press** (300 dpi or better in the delivered file), **office** (150 to 299 dpi) or **not for print at this size** (under 150 dpi).

## Resolution

- Press work: 300 dpi at finished size.
- Desk and office printing: 150 dpi is acceptable.
- Large format is judged by viewing distance, not dpi. A 48-sheet is commonly produced at low dpi at full size; quoting a dpi for it would be a precise-sounding lie, so the code does not.
- Images are never upscaled to reach a number. Source pixels must cover the placed size at export scale.

## Bleed, trim and safe area

- **Bleed:** 3 mm beyond the trim on every edge for press work. Backgrounds and edge-to-edge pictures extend into it.
- **Safe area:** text and logos stay at least 5 mm inside the trim; business cards use 4.5 mm on an 85.6 x 54 mm card. *heuristic*
- **Crop marks** sit outside the bleed. Create does not produce them yet.
- Bleed and safe area are quoted only where the file is going to a press. A poster printed at home needs neither.

## Colour

- Create works in sRGB. It does not produce CMYK files or embed print profiles.
- Tell the customer plainly: bright screen colours, especially oranges, greens and blues, print duller. A printed proof is the only real check.
- Rich blacks, spot colours, foil and emboss are finishes a printer applies. Show them as flat, named layers ("foil: logo only"), never as a fake gradient.
- One finish per piece, with a reason. *heuristic*

## Type in print

- Nothing smaller than 6.5 pt on cards and labels; 7 to 8 pt for contact details. *heuristic*
- No hairlines under 0.25 pt at print size. *heuristic*
- Fine reversed type (light on dark) needs more weight than the same type dark on light.
- Fonts are self-hosted with recorded licences; a vector PDF must embed them (CI-6).

## Formats

- Canvas ratios must match the format within 1% (critical check C4). Artwork is never stretched to fit.
- Two-sided pieces carry both sides; multi-page pieces carry every page.
- Platform sizes carry a source and a verification date in the format registry. A "platform size" badge shows only while that date is current.

## Outdoor and large format

- Read time is 3 to 7 seconds. Seven words or fewer, the brand, and one short way to respond.
- A working rule is about 1 inch of letter height per 10 feet of viewing distance. On a 48-sheet read from 30 to 60 m, headline cap height is at least 10% of board height; anything that must be read, at least 7%. *heuristic*
- Contrast of 7:1 or better between type and ground.
- Brand sign-off at 15 to 20% of board width, clear of every edge. *heuristic*
- No body copy, long phone numbers, small icons or multi-step offers.

## Packaging and labels

- Work from the printer's dieline. Never guess one.
- Mandatory information (ingredients, weight or volume, batch, dates, producer, registration numbers) is set by the market's rules. The brief must supply it; Create does not invent it.
- Barcodes need quiet zones and a tested size. Create does not generate retail barcodes.

## Merchandise

- Screen print and embroidery have colour limits and minimum line weights. Ask the supplier before designing.
- Supply artwork at the supplier's size and position. A mockup is an illustration, not the print file.

## Mockups

A mockup is offered only when the scene's surface matches the format's ratio within 1%. It is labelled "Mockup: illustration only" and is never exported as the artwork.
