"""
NowOpen brand social cards, rendered locally with Pillow (free, offline).

Usage:  python scripts/social-cards/render_cards.py <cards.json> <out_dir> [--story]

cards.json: [{"id", "kicker", "head", "accent", "cta", "theme": "dark"|"light", "sub"?}]

Every word on a card comes from the spec, so a card can never carry a
template placeholder. Any "[" or "]" in the spec is refused, for the same
reason the caption checker blocks brackets: on 2026-11-15, 18 scheduled posts
were found with "@[handle]", "[City]" and "[Source...]" baked into their art,
which no caption check can see.

--story renders 1080x1920 (Stories / Reels covers) instead of 1080x1350 (4:5 feed).
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FONT_DIR = os.path.join(ROOT, 'public', 'fonts', 'coolvetica')
BOLD = os.path.join(FONT_DIR, 'Coolvetica-Bold.otf')
REG = os.path.join(FONT_DIR, 'Coolvetica-Regular.otf')

W, M = 1080, 72
THEMES = {
    'dark': {'bg': (11, 17, 32), 'fg': (255, 255, 255), 'accent': (143, 176, 255), 'kicker': (226, 232, 240),
             'pill_bg': (255, 255, 255), 'pill_fg': (11, 17, 32), 'word_a': (143, 176, 255), 'word_b': (255, 255, 255),
             'sub': (203, 213, 225)},
    'light': {'bg': (244, 246, 250), 'fg': (11, 17, 32), 'accent': (37, 99, 235), 'kicker': (37, 99, 235),
              'pill_bg': (37, 99, 235), 'pill_fg': (255, 255, 255), 'word_a': (37, 99, 235), 'word_b': (11, 17, 32),
              'sub': (71, 85, 105)},
}
RING = [(236, 72, 153), (217, 70, 239), (79, 70, 229), (59, 130, 246), (34, 211, 238)]
RULE = [(59, 130, 246), (139, 92, 246), (236, 72, 153), (249, 115, 22), (234, 179, 8), (34, 197, 94)]


def lerp(stops, t):
    t = max(0.0, min(1.0, t)) * (len(stops) - 1)
    i = min(int(t), len(stops) - 2)
    f = t - i
    a, b = stops[i], stops[i + 1]
    return tuple(int(a[k] + (b[k] - a[k]) * f) for k in range(3))


def ring(img, cx, cy, r, width, h):
    s = 2  # supersampled for a smooth edge
    layer = Image.new('RGBA', (W * s, h * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    box = [(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s]
    for deg in range(0, 360):
        d.arc(box, deg, deg + 1.6, fill=lerp(RING, deg / 359) + (255,), width=width * s)
    img.alpha_composite(layer.resize((W, h), Image.LANCZOS))


def rule(d, y, x0=M, x1=W - M, hgt=6):
    for x in range(x0, x1):
        d.line([(x, y), (x, y + hgt - 1)], fill=lerp(RULE, (x - x0) / (x1 - x0)))


def spaced(d, xy, text, font, fill, spacing):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + spacing


def wrap(d, text, font, maxw):
    lines, cur = [], ''
    for w in text.split():
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=font) <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def render(spec, out, story=False):
    for k in ('kicker', 'head', 'accent', 'cta', 'sub'):
        v = spec.get(k) or ''
        if '[' in v or ']' in v:
            raise ValueError(f"{spec['id']}: brackets are not allowed on a card ({k})")
    h = 1920 if story else 1350
    # Stories: the platform's header covers the top ~250px and the reply bar
    # the bottom ~300px, so text stays inside the middle.
    shift = 270 if story else 0
    top = 300 if story else 82
    theme = spec.get('theme', 'dark')
    th = THEMES[theme]
    img = Image.new('RGBA', (W, h), th['bg'] + (255,))
    if theme == 'dark':
        ring(img, 985, 95, 300, 105, h)
    else:
        ring(img, 950, 150, 70, 26, h)
    d = ImageDraw.Draw(img)

    spaced(d, (M, top), spec['kicker'].upper(), ImageFont.truetype(REG, 30), th['kicker'], 5)

    maxw = W - 2 * M
    size = 132
    while True:
        hf = ImageFont.truetype(BOLD, size)
        head = wrap(d, spec['head'], hf, maxw)
        acc = wrap(d, spec['accent'], hf, maxw) if spec.get('accent') else []
        lh = size
        if (len(head) + len(acc) <= 6 and (len(head) + len(acc)) * lh <= 760) or size <= 60:
            break
        size -= 4
    sf = ImageFont.truetype(REG, 38)
    sub = wrap(d, spec['sub'], sf, maxw) if spec.get('sub') else []
    block = (len(head) + len(acc)) * lh + (len(sub) * 50 + 24 if sub else 0)
    y = 1120 + shift - block
    for line in head:
        d.text((M, y), line, font=hf, fill=th['fg'])
        y += lh
    for line in acc:
        d.text((M, y), line, font=hf, fill=th['accent'])
        y += lh
    if sub:
        y += 24
        for line in sub:
            d.text((M, y), line, font=sf, fill=th['sub'])
            y += 50

    rule(d, 1160 + shift)

    # Coolvetica has no arrow glyph, so the arrow is drawn.
    pf = ImageFont.truetype(REG, 34)
    tw = d.textlength(spec['cta'], font=pf)
    d.rounded_rectangle([M, 1205 + shift, M + tw + 112, 1281 + shift], radius=38, fill=th['pill_bg'])
    d.text((M + 36, 1225 + shift), spec['cta'], font=pf, fill=th['pill_fg'])
    ax, ay = M + 36 + tw + 18, 1244 + shift
    d.line([(ax, ay), (ax + 24, ay)], fill=th['pill_fg'], width=4)
    d.line([(ax + 14, ay - 10), (ax + 25, ay)], fill=th['pill_fg'], width=4)
    d.line([(ax + 14, ay + 10), (ax + 25, ay)], fill=th['pill_fg'], width=4)

    wf = ImageFont.truetype(BOLD, 36)
    a, b = 'NOWOPEN', ' AFRICA'
    wa, wb = d.textlength(a, font=wf), d.textlength(b, font=wf)
    x = W - M - wa - wb
    d.text((x, 1228 + shift), a, font=wf, fill=th['word_a'])
    d.text((x + wa, 1228 + shift), b, font=wf, fill=th['word_b'])

    img.convert('RGB').save(out, quality=90, optimize=True, progressive=True)


if __name__ == '__main__':
    specs = json.load(open(sys.argv[1], encoding='utf-8'))
    out_dir = sys.argv[2]
    story = '--story' in sys.argv
    os.makedirs(out_dir, exist_ok=True)
    for s in specs:
        render(s, os.path.join(out_dir, s['id'] + ('-story' if story else '') + '.jpg'), story)
    print(f'rendered {len(specs)} card(s) to {out_dir}')
