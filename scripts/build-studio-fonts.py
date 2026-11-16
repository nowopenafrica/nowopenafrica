#!/usr/bin/env python3
"""
Build the self-hosted Studio typefaces from Google's official font repository.

WHY THIS REPLACED scripts/fetch-typefaces.mjs

That script took Google Fonts' `latin` subset: about 220 glyphs, with no naira
(U+20A6), no cedi (U+20B5) and none of the letters Yoruba, Igbo, Hausa, Akan
or Ewe are written with. The demo copy sets prices in naira, so every one of
them was drawn in a fallback face while the design claimed to be Outfit.

This builds from the full upstream TTFs instead, pinned to one commit of
github.com/google/fonts, and keeps every glyph the family really has in the
ranges below. What a family does not have upstream it still does not have:
src/lib/design/fontCoverage.test.ts reads the result and names any gap.

USAGE (fontTools 4.66+ and the brotli module; the output is WOFF2):

    python -I scripts/build-studio-fonts.py --fetch <empty-download-dir>
    python -I scripts/build-studio-fonts.py <download-dir>

The first form downloads the TTFs and each family's OFL.txt into the directory;
the second builds public/fonts/studio/*.woff2 and copies the licences.
"""
import argparse
import os
import shutil
import site
import sys
import urllib.request

# `-I` drops the user site-packages, which is where fontTools and brotli live.
sys.path.append(site.getusersitepackages())

from fontTools import subset  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402
from fontTools.varLib import instancer  # noqa: E402

COMMIT = '86aced91de05cd4f96a06838124cca45be337b2b'  # google/fonts main, fetched 2026-11-07
RAW = f'https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl'

# slug, upstream folder, upstream file, {weight: extra axis pins}
FAMILIES = [
    ('outfit', 'outfit', 'Outfit[wght].ttf', {400: {}, 600: {}, 800: {}}),
    ('playfair-display', 'playfairdisplay', 'PlayfairDisplay[wght].ttf', {700: {}, 900: {}}),
    ('space-mono', 'spacemono', 'SpaceMono-Bold.ttf', {700: None}),
    ('bebas-neue', 'bebasneue', 'BebasNeue-Regular.ttf', {400: None}),
    ('dm-serif-display', 'dmserifdisplay', 'DMSerifDisplay-Regular.ttf', {400: None}),
    # Fraunces is only ever a headline here, so the optical size is pinned to
    # its display end. SOFT and WONK stay at the defaults Google Fonts serves.
    ('fraunces', 'fraunces', 'Fraunces[SOFT,WONK,opsz,wght].ttf', {600: {'opsz': 144, 'SOFT': 0, 'WONK': 1}}),
    ('space-grotesk', 'spacegrotesk', 'SpaceGrotesk[wght].ttf', {500: {}, 700: {}}),
    ('archivo-black', 'archivoblack', 'ArchivoBlack-Regular.ttf', {400: None}),
    # Dancing Script ships one weight: the 600 KB budget in typefaces.test.ts
    # holds every face, Coolvetica included.
    ('source-sans-3', 'sourcesans3', 'SourceSans3[wght].ttf', {400: {}, 600: {}, 700: {}}),
    ('dancing-script', 'dancingscript', 'DancingScript[wght].ttf', {400: {}}),
    # Added 2026-11-16 for the Creative Intelligence Library (pairings.ts FACE_GAPS):
    # voices the first ten could not produce. One weight each, because the
    # 600 KB budget in typefaces.test.ts holds every face.
    ('jost', 'jost', 'Jost[wght].ttf', {600: {}}),
    ('bodoni-moda', 'bodonimoda', 'BodoniModa[opsz,wght].ttf', {600: {'opsz': 96}}),
    ('zilla-slab', 'zillaslab', 'ZillaSlab-Bold.ttf', {700: None}),
    ('cormorant-garamond', 'cormorantgaramond', 'CormorantGaramond[wght].ttf', {600: {}}),
    # Added 2026-11-16 (second batch), on the founder's instruction to stock the
    # library with the strongest open-source faces. The 600 KB budget now holds
    # only the faces a page loads eagerly (tier 'core' in typefaces.ts); these
    # are tier 'extended' and are fetched only when a design uses one.
    #
    # A family whose weights are separate static files gives a dict instead of
    # one file name.
    ('inter', 'inter', 'Inter[opsz,wght].ttf', {400: {'opsz': 14}, 700: {'opsz': 14}}),
    ('unbounded', 'unbounded', 'Unbounded[wght].ttf', {700: {}}),
    ('anton', 'anton', 'Anton-Regular.ttf', {400: None}),
    ('oswald', 'oswald', 'Oswald[wght].ttf', {600: {}}),
    ('instrument-serif', 'instrumentserif', 'InstrumentSerif-Regular.ttf', {400: None}),
    ('cinzel', 'cinzel', 'Cinzel[wght].ttf', {700: {}}),
    ('lora', 'lora', 'Lora[wght].ttf', {400: {}, 600: {}}),
    ('poppins', 'poppins', {500: 'Poppins-Medium.ttf', 700: 'Poppins-Bold.ttf'}, {500: None, 700: None}),
    ('montserrat', 'montserrat', 'Montserrat[wght].ttf', {700: {}}),
    ('nunito', 'nunito', 'Nunito[wght].ttf', {800: {}}),
    ('caveat', 'caveat', 'Caveat[wght].ttf', {700: {}}),
    ('pacifico', 'pacifico', 'Pacifico-Regular.ttf', {400: None}),
    ('jetbrains-mono', 'jetbrainsmono', 'JetBrainsMono[wght].ttf', {500: {}}),
    ('bricolage-grotesque', 'bricolagegrotesque', 'BricolageGrotesque[opsz,wdth,wght].ttf', {700: {'opsz': 96, 'wdth': 100}}),
    ('abril-fatface', 'abrilfatface', 'AbrilFatface-Regular.ttf', {400: None}),
    ('big-shoulders', 'bigshoulders', 'BigShoulders[opsz,wght].ttf', {800: {'opsz': 72}}),
    ('syne', 'syne', 'Syne[wght].ttf', {700: {}}),
    # The glyph fallback (Ruling L closed 2026-11-16): the one family here that
    # draws every supported African letter, Hausa hooked letters included.
    ('noto-sans', 'notosans', 'NotoSans[wdth,wght].ttf', {400: {'wdth': 100}, 700: {'wdth': 100}}),
]

# What is kept. Glyphs a family does not have are simply absent.
UNICODES = [
    0x0000, 0x000D,           # null and CR: the zero-width glyphs Google's subsets keep
    *range(0x0020, 0x0100),   # Basic Latin + Latin-1 Supplement
    *range(0x0100, 0x0250),   # Latin Extended-A and -B (Ɓ Ɗ Ƙ Ƴ Ɛ Ɔ Ŋ Ʋ Ƒ Ɣ Ɖ ...)
    # IPA letters African orthographies use: ɑ ɓ ɔ ɖ ɗ ə ɛ ɣ ɨ ɩ ɲ ʃ ʊ ʋ ʒ
    0x0251, 0x0253, 0x0254, 0x0256, 0x0257, 0x0259, 0x025B, 0x0263, 0x0268, 0x0269,
    0x0272, 0x0283, 0x028A, 0x028B, 0x0292,
    *range(0x02B9, 0x02DE),   # spacing modifiers: ʼ (Hausa) and the accents fonts build from
    *range(0x0300, 0x0370),   # combining diacritics (Yoruba/Igbo tones on dot-below vowels)
    *range(0x1E00, 0x1F00),   # Latin Extended Additional (Ẹ Ọ Ṣ Ị Ụ Ṅ Ḿ ...)
    *range(0x2000, 0x2070),   # General Punctuation
    *range(0x20A0, 0x20D0),   # Currency (₦ ₵ ...)
    # Kept from Google's old `latin` subset, so nothing regresses.
    0x2122, 0x2191, 0x2193, 0x2212, 0x2215, 0xFEFF, 0xFFFD,
]

FEATURES = ['kern', 'liga', 'mark', 'mkmk', 'ccmp', 'locl', 'calt', 'clig', 'rlig', 'rvrn']


def fetch(dest, only=None):
    os.makedirs(dest, exist_ok=True)
    for slug, folder, file, _ in FAMILIES:
        if only and slug not in only:
            continue
        names = sorted(set(file.values())) if isinstance(file, dict) else [file]
        for name, out in (*((n, n) for n in names), ('OFL.txt', f'{slug}-OFL.txt')):
            url = f'{RAW}/{folder}/{urllib.request.quote(name)}'
            print('GET', url)
            with urllib.request.urlopen(url) as r, open(os.path.join(dest, out), 'wb') as f:
                f.write(r.read())


def build(src, out_dir, licence_dir, only=None):
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(licence_dir, exist_ok=True)
    opts = subset.Options()
    opts.layout_features = FEATURES
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    # Unhinted: the variable instances carry no hinting worth keeping, and on
    # the static display faces it was a third of the file for type set large.
    opts.hinting = False
    # WOFF2 needs the `brotli` module. It is installed in the user
    # site-packages, which `-I` hides; the sys.path line at the top re-adds it.
    opts.flavor = 'woff2'
    opts.with_zopfli = False

    for slug, _folder, file, weights in FAMILIES:
        if only and slug not in only:
            continue
        for weight, pins in weights.items():
            font = TTFont(os.path.join(src, file[weight] if isinstance(file, dict) else file))
            if pins is not None and 'fvar' in font:
                axes = {'wght': weight, **pins}
                font = instancer.instantiateVariableFont(font, axes, updateFontNames=True)
            sub = subset.Subsetter(opts)
            sub.populate(unicodes=UNICODES)
            sub.subset(font)
            target = os.path.join(out_dir, f'{slug}-{weight}.{opts.flavor}')
            font.flavor = opts.flavor
            font.save(target)
            print(f'{target}  {os.path.getsize(target)} bytes  {len(font.getBestCmap())} code points')
        shutil.copyfile(os.path.join(src, f'{slug}-OFL.txt'), os.path.join(licence_dir, f'{slug}-OFL.txt'))


def main():
    p = argparse.ArgumentParser()
    p.add_argument('src', help='directory holding the upstream TTFs and OFL.txt files')
    p.add_argument('--fetch', action='store_true', help='download into src instead of building')
    p.add_argument('--out', default='public/fonts/studio')
    p.add_argument('--only', default='', help='comma-separated slugs: fetch or build just these families')
    a = p.parse_args()
    only = set(filter(None, a.only.split(','))) or None
    if a.fetch:
        fetch(a.src, only)
    else:
        build(a.src, a.out, os.path.join(a.out, 'licences'), only)


if __name__ == '__main__':
    main()
