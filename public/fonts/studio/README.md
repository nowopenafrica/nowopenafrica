# Studio typefaces

Self-hosted WOFF 1.0 files, built by `scripts/build-studio-fonts.py`.

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
| Source Sans 3 | `sourcesans3/SourceSans3[wght].ttf` | 400, 700 |
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
family has them). Hinting is dropped. WOFF rather than WOFF2, as ruled for the
2026-11-07 build; setting `opts.flavor = 'woff2'` in the script (which needs
the `brotli` Python module) would make the files about 30% smaller.

`src/lib/design/fontCoverage.test.ts` reads these files and checks them against
the supported languages and currencies.

## Licences

Every family above is SIL Open Font License 1.1. Each family's `OFL.txt`, as
published in that commit, is in `licences/<family>-OFL.txt`.

Coolvetica (`public/fonts/coolvetica/`) is not built here and is not OFL. Its
licence text is still pending from the founder.
