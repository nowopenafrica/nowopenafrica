# Studio typefaces

Self-hosted WOFF2 files, built by `scripts/build-studio-fonts.py`
(fontTools plus the `brotli` module; the script re-adds the user site-packages
that `python -I` hides).

## Source

- Repository: https://github.com/google/fonts (the `ofl/<family>/` folders)
- Commit: `86aced91de05cd4f96a06838124cca45be337b2b` (`main`, fetched 2026-11-07)
- Files: `https://raw.githubusercontent.com/google/fonts/86aced91de05cd4f96a06838124cca45be337b2b/ofl/<family>/<file>`

| Face | Upstream file | Weights built |
|---|---|---|
| Outfit | `outfit/Outfit[wght].ttf` | 400, 600, 800 |
| Playfair Display | `playfairdisplay/PlayfairDisplay[wght].ttf` | 700, 900 |
| Space Mono | `spacemono/SpaceMono-Bold.ttf` | 700 |
| Bebas Neue | `bebasneue/BebasNeue-Regular.ttf` | 400 |
| DM Serif Display | `dmserifdisplay/DMSerifDisplay-Regular.ttf` | 400 |
| Fraunces | `fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf` | 600 (opsz 144, SOFT 0, WONK 1) |
| Space Grotesk | `spacegrotesk/SpaceGrotesk[wght].ttf` | 500, 700 |
| Archivo Black | `archivoblack/ArchivoBlack-Regular.ttf` | 400 |
| Source Sans 3 | `sourcesans3/SourceSans3[wght].ttf` | 400, 600, 700 |
| Dancing Script | `dancingscript/DancingScript[wght].ttf` | 400 |

Variable fonts are instanced to each weight with `fontTools.varLib.instancer`.

## Subset ranges

- U+0000, U+000D, U+0020–00FF (Basic Latin, Latin-1 Supplement)
- U+0100–024F (Latin Extended-A and -B)
- IPA letters used by African orthographies: U+0251 0253 0254 0256 0257 0259 025B 0263 0268 0269 0272 0283 028A 028B 0292
- U+02B9–02DD (spacing modifiers, including Hausa ʼ U+02BC)
- U+0300–036F (combining diacritics)
- U+1E00–1EFF (Latin Extended Additional)
- U+2000–206F (General Punctuation), U+20A0–20CF (Currency Symbols)
- U+2122 2191 2193 2212 2215 FEFF FFFD (kept from Google's old `latin` subset)

Glyphs a family does not have upstream are still absent. OpenType features
kept: kern, liga, mark, mkmk, ccmp, locl, calt, clig, rlig, rvrn (where the
family has them). Hinting is dropped.

## Added 2026-11-16 (Creative Intelligence Library)

Same commit, same ranges, one display weight each: `jost-600`, `bodoni-moda-600` (opsz pinned to 96), `zilla-slab-700`, `cormorant-garamond-600`.
Build with `python -I scripts/build-studio-fonts.py <dir> --only jost,bodoni-moda,zilla-slab,cormorant-garamond`.
None has the naira or cedi sign upstream, so all four use the glyph fallback below.

Unbounded and Inter were measured then and held back; both shipped in the second batch below.

## Added 2026-11-16, second batch (extended faces)

On the founder's instruction to stock the library with the strongest
open-source faces. Same commit, same subset ranges. Every family's `OFL.txt`
was read and is SIL Open Font License 1.1.

| Face | Key | Upstream file | Weights built |
|---|---|---|---|
| Inter | `neutral` | `inter/Inter[opsz,wght].ttf` | 400, 700 (opsz 14) |
| Unbounded | `wide` | `unbounded/Unbounded[wght].ttf` | 700 |
| Anton | `impact` | `anton/Anton-Regular.ttf` | 400 |
| Oswald | `narrow` | `oswald/Oswald[wght].ttf` | 600 |
| Instrument Serif | `elegant` | `instrumentserif/InstrumentSerif-Regular.ttf` | 400 |
| Cinzel | `classical` | `cinzel/Cinzel[wght].ttf` | 700 |
| Lora | `reading` | `lora/Lora[wght].ttf` | 400, 600 |
| Poppins | `friendly` | `poppins/Poppins-Medium.ttf`, `Poppins-Bold.ttf` | 500, 700 |
| Montserrat | `urban` | `montserrat/Montserrat[wght].ttf` | 700 |
| Nunito | `rounded` | `nunito/Nunito[wght].ttf` | 800 |
| Caveat | `handwritten` | `caveat/Caveat[wght].ttf` | 700 |
| Pacifico | `retro` | `pacifico/Pacifico-Regular.ttf` | 400 |
| JetBrains Mono | `technical` | `jetbrainsmono/JetBrainsMono[wght].ttf` | 500 |
| Bricolage Grotesque | `expressive` | `bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf` | 700 (opsz 96, wdth 100) |
| Abril Fatface | `fatface` | `abrilfatface/AbrilFatface-Regular.ttf` | 400 |
| Big Shoulders | `industrial` | `bigshoulders/BigShoulders[opsz,wght].ttf` | 800 (opsz 72) |
| Syne | `artistic` | `syne/Syne[wght].ttf` | 700 |
| Noto Sans | `universal` | `notosans/NotoSans[wdth,wght].ttf` | 400, 700 (wdth 100) |

Cinzel and Caveat have no 600 instance upstream, so 700 is built.

**Loading.** These are tier `extended` in `typefaces.ts`: declared in
`src/index.css`, fetched by the browser only when a design draws text in one.
`ensureTypefacesReady()` with no keys warms the `core` faces only. The weight
budget in `typefaces.test.ts` therefore holds the core set (660 KB), with a
70 KB ceiling on each extended file and 1,400 KB on the whole library. Noto
Sans is the exception: it is core, because it is the glyph fallback.

**When to use each face** is written down in
`src/lib/create/intel/typeUse.ts` and generated into
`docs/creative-intelligence/typography.md`.

After adding or rebuilding any face, run `python -I scripts/build-font-metrics.py`:
the composition engine measures text from the widths in these files.

## The glyph fallback

`src/index.css` declares the Noto Sans files a second time, as
`"NowOpen Glyph Fallback"`, with `unicode-range: U+0100-024F, U+0250-02FF,
U+0300-036F, U+1E00-1EFF, U+20A0-20CF`. Every Studio stack names it second, so a
face's missing ₦, ẹ or ɛ comes from it, while Basic Latin and Latin-1 never do:
if a face fails to load, its Latin falls to the web-safe face of the same
shape. See `GLYPH_FALLBACK` in `src/lib/design/typefaces.ts`.

It was Source Sans 3 until 2026-11-16. Source Sans 3 has no Hausa Ƙ ƙ Ƴ ƴ and
no Ewe Ɖ Ʋ Ƒ, and neither did any other face then shipped, so those seven
supported letters could not be drawn at all (`UPSTREAM_GAPS`). Noto Sans has
all of them, and that list is now empty. Text that needed the fallback before
(₦, ẹ, ọ and the like) is now drawn in Noto Sans, not Source Sans 3.

`src/lib/design/fontCoverage.test.ts` reads these files and checks them against
the supported languages and currencies.

## Licences

Every family above is SIL Open Font License 1.1. Each family's `OFL.txt`, as
published in that commit, is in the `licences/` subfolder as
`licences/<family>-OFL.txt`, byte-identical to upstream:
`licences/.gitattributes` turns off line-ending conversion, because four of
the upstream files use CRLF.

Coolvetica (`public/fonts/coolvetica/`) is not built here and is not OFL. Its
licence text is still pending from the founder.
