from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image


@dataclass(frozen=True)
class OutputSet:
    root: Path

    @property
    def images_dir(self) -> Path:
        return self.root / 'assets' / 'images'

    def path(self, name: str) -> Path:
        return self.images_dir / name


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _is_background_red(r: int, g: int, b: int) -> bool:
    # Rough chroma-key for the app background (#ff2a2a-ish).
    return r > 200 and g < 90 and b < 90


def _find_content_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    px = img.convert('RGB').load()
    w, h = img.size
    left, top, right, bottom = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if not _is_background_red(r, g, b):
                found = True
                if x < left:
                    left = x
                if y < top:
                    top = y
                if x > right:
                    right = x
                if y > bottom:
                    bottom = y
    if not found:
        return (0, 0, w, h)
    return (left, top, right + 1, bottom + 1)


def _square_crop(img: Image.Image, bbox: tuple[int, int, int, int], pad: int = 60) -> Image.Image:
    w, h = img.size
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(w, r + pad)
    b = min(h, b + pad)
    bw, bh = r - l, b - t
    size = max(bw, bh)
    cx = l + bw // 2
    cy = t + bh // 2
    sl = max(0, cx - size // 2)
    st = max(0, cy - size // 2)
    sr = min(w, sl + size)
    sb = min(h, st + size)
    # Adjust if we hit an edge.
    sl = max(0, sr - size)
    st = max(0, sb - size)
    return img.crop((sl, st, sr, sb))


def _make_transparent_foreground(img: Image.Image) -> Image.Image:
    rgba = img.convert('RGBA')
    data = rgba.getdata()
    new = []
    for r, g, b, a in data:
        if _is_background_red(r, g, b):
            new.append((r, g, b, 0))
        else:
            new.append((r, g, b, a))
    rgba.putdata(new)
    return rgba


def generate_icons(source_png: Path, out: OutputSet):
    out.images_dir.mkdir(parents=True, exist_ok=True)
    base = Image.open(source_png)
    if base.size[0] != base.size[1]:
        # Ensure we work from a square canvas for icons.
        size = max(base.size)
        square = Image.new('RGB', (size, size), (255, 42, 42))
        square.paste(base, ((size - base.size[0]) // 2, (size - base.size[1]) // 2))
        base = square

    bbox = _find_content_bbox(base)
    cropped = _square_crop(base, bbox, pad=80)

    icon = cropped.resize((1024, 1024), Image.Resampling.LANCZOS)
    icon.save(out.path('app-icon.png'), optimize=True)

    fg = _make_transparent_foreground(icon)
    fg.save(out.path('adaptive-foreground.png'), optimize=True)

    mono = icon.convert('L').convert('RGBA')
    mono.save(out.path('adaptive-monochrome.png'), optimize=True)

    favicon = icon.resize((48, 48), Image.Resampling.LANCZOS)
    favicon.save(out.path('favicon.png'), optimize=True)


def main():
    src = Path(r'C:/Users/mzazimhenga/Downloads/1000373061.png')
    if not src.exists():
        raise SystemExit(f'Missing source PNG: {src}')

    for root in [PROJECT_ROOT, PROJECT_ROOT / 'movieflixtv']:
        generate_icons(src, OutputSet(root=root))
        rel = (root / 'assets' / 'images').relative_to(PROJECT_ROOT)
        print(f'Updated icon assets in {rel}')


if __name__ == '__main__':
    main()
