"""Web-size copy of a library photograph.

Usage: python -E -P scripts/assets/webcopy.py <in> <out>  (not -I: Pillow is a user-site package)

The originals are camera files (2-9 MB, up to 6000 px). A gallery card is a
few hundred pixels wide, so it is drawn from this copy instead: at most
WEB_EDGE px on the long edge, JPEG, progressive. Metadata (EXIF, which can
carry a location) is dropped; the colour profile is kept so colours match the
original. Opening a design in the editor swaps back to the original, so print
quality never depends on this file.

Prints the output's width and height as JSON.
"""
import json
import sys

from PIL import Image, ImageOps

WEB_EDGE = 1200
QUALITY = 78


def main(src: str, dst: str) -> None:
    with Image.open(src) as im:
        icc = im.info.get("icc_profile")
        im = ImageOps.exif_transpose(im)
        if im.mode != "RGB":
            im = im.convert("RGB")
        im.thumbnail((WEB_EDGE, WEB_EDGE), Image.Resampling.LANCZOS)
        extra = {"icc_profile": icc} if icc else {}
        im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True, **extra)
        print(json.dumps({"width": im.width, "height": im.height}))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: webcopy.py <in> <out>")
    main(sys.argv[1], sys.argv[2])
