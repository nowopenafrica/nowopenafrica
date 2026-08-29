"""Rasterise public/icon.svg to PNG at the sizes index.html and the manifest ask for.

No image dependency: the mark is a rounded rectangle plus six circles, so it is
cheaper to rasterise directly (4x supersampled for antialiasing) than to add a
toolchain. Geometry mirrors public/icon.svg exactly, in its 512x512 viewBox.
"""
import struct
import zlib

BG = (0x0F, 0x17, 0x2A)
RADIUS_RECT = 112.0
CIRCLES = [
    (0.0, -120.0, 56.0, (0x3B, 0x82, 0xF6)),
    (104.0, -60.0, 56.0, (0x8B, 0x5C, 0xF6)),
    (104.0, 60.0, 56.0, (0xEC, 0x48, 0x99)),
    (0.0, 120.0, 56.0, (0xF9, 0x73, 0x16)),
    (-104.0, 60.0, 56.0, (0xEA, 0xB3, 0x08)),
    (-104.0, -60.0, 56.0, (0x22, 0xC5, 0x5E)),
]
CX = CY = 256.0
VIEW = 512.0
SS = 4  # supersampling factor per axis


def sample(x, y):
    """Colour + coverage at one point in the 512x512 viewBox. None = transparent."""
    # Rounded-rect mask.
    rx = min(x, VIEW - x)
    ry = min(y, VIEW - y)
    if rx < 0 or ry < 0:
        return None
    if rx < RADIUS_RECT and ry < RADIUS_RECT:
        dx = RADIUS_RECT - rx
        dy = RADIUS_RECT - ry
        if dx * dx + dy * dy > RADIUS_RECT * RADIUS_RECT:
            return None
    # Circles paint over the background, later ones on top.
    for cx, cy, r, colour in CIRCLES:
        dx = x - (CX + cx)
        dy = y - (CY + cy)
        if dx * dx + dy * dy <= r * r:
            return colour
    return BG


def render(size):
    scale = VIEW / size
    step = scale / SS
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = (px * scale) + (sx + 0.5) * step
                    y = (py * scale) + (sy + 0.5) * step
                    c = sample(x, y)
                    if c is not None:
                        r += c[0]
                        g += c[1]
                        b += c[2]
                        a += 255
            n = SS * SS
            cov = a / n
            if cov == 0:
                row += b"\x00\x00\x00\x00"
            else:
                # Un-premultiply: average colour over the covered samples only.
                covered = a / 255
                row += bytes((round(r / covered), round(g / covered), round(b / covered), round(cov)))
        rows.append(bytes(row))
    return rows


def write_png(path, size):
    rows = render(size)
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({size}x{size}, {len(png)} bytes)")




def write_ico(path, sizes=(16, 32, 48)):
    """ICO wrapping PNG entries — supported by every browser still in use."""
    import io as _io
    entries = []
    for s in sizes:
        buf = _io.BytesIO()
        rows = render(s)
        raw = b"".join(b"\x00" + r for r in rows)

        def chunk(tag, data):
            return (struct.pack(">I", len(data)) + tag + data
                    + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

        png = b"\x89PNG\r\n\x1a\n"
        png += chunk(b"IHDR", struct.pack(">IIBBBBB", s, s, 8, 6, 0, 0, 0))
        png += chunk(b"IDAT", zlib.compress(raw, 9))
        png += chunk(b"IEND", b"")
        buf.write(png)
        entries.append((s, buf.getvalue()))

    header = struct.pack("<HHH", 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    dir_bytes = b""
    data_bytes = b""
    for s, png in entries:
        dim = 0 if s >= 256 else s
        dir_bytes += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(png), offset)
        data_bytes += png
        offset += len(png)
    with open(path, "wb") as f:
        f.write(header + dir_bytes + data_bytes)
    print(f"wrote {path} ({[s for s, _ in entries]}, {len(header + dir_bytes + data_bytes)} bytes)")


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "public"
    write_png(f"{out}/apple-touch-icon.png", 180)
    write_png(f"{out}/icon-192.png", 192)
    write_png(f"{out}/icon-512.png", 512)
    write_ico(f"{out}/favicon.ico")
