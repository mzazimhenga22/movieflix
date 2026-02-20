from __future__ import annotations

from pathlib import Path
from typing import Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageFont

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_ROOT / 'assets' / 'images' / 'movies-splash.png'

WIDTH, HEIGHT = 1242, 2688


def lerp(start: Tuple[int, int, int], end: Tuple[int, int, int], t: float) -> Tuple[int, int, int]:
    return tuple(int(s + (e - s) * t) for s, e in zip(start, end))


def get_font(size: int, weight: str = 'regular') -> ImageFont.FreeTypeFont:
    weight_map = {
        'bold': ['SegoeUI-Bold.ttf', 'Roboto-Bold.ttf', 'Arial Bold.ttf'],
        'semibold': ['SegoeUI-Semibold.ttf', 'Roboto-Medium.ttf', 'Arial Bold.ttf'],
        'regular': ['SegoeUI.ttf', 'Roboto-Regular.ttf', 'Arial.ttf'],
    }
    candidates = weight_map.get(weight, weight_map['regular'])
    for name in candidates:
        font_path = Path('C:/Windows/Fonts') / name
        if font_path.exists():
            try:
                return ImageFont.truetype(str(font_path), size)
            except OSError:
                continue
    return ImageFont.load_default()


def base_canvas() -> Image.Image:
    start = (5, 6, 15)
    end = (10, 11, 34)
    canvas = Image.new('RGBA', (WIDTH, HEIGHT), start)
    draw = ImageDraw.Draw(canvas)
    for y in range(HEIGHT):
        color = lerp(start, end, y / HEIGHT)
        draw.line([(0, y), (WIDTH, y)], fill=color + (255,))
    return canvas


def add_orb(canvas: Image.Image, center: Tuple[int, int], radius: int, fill: Tuple[int, int, int, int]):
    orb = Image.new('RGBA', (radius * 2, radius * 2), (0, 0, 0, 0))
    ImageDraw.Draw(orb).ellipse([0, 0, radius * 2, radius * 2], fill=fill)
    orb = orb.filter(ImageFilter.GaussianBlur(radius // 2))
    canvas.alpha_composite(orb, (center[0] - radius, center[1] - radius))


def rounded_rect(
    target: Image.Image,
    rect: Tuple[int, int, int, int],
    radius: int,
    fill,
    outline=None,
    width: int = 1,
):
    overlay = Image.new('RGBA', target.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle(rect, radius=radius, fill=fill, outline=outline, width=width)
    target.alpha_composite(overlay)


def draw_header(canvas: Image.Image, fonts):
    rect = (80, 220, WIDTH - 80, 540)
    rounded_rect(canvas, rect, 60, (30, 32, 55, 220), (255, 255, 255, 40), 3)
    draw = ImageDraw.Draw(canvas)
    dot_center = (rect[0] + 50, rect[1] + 80)
    draw.ellipse(
        [dot_center[0] - 14, dot_center[1] - 14, dot_center[0] + 14, dot_center[1] + 14],
        fill=(229, 9, 20, 255),
    )
    draw.text(
        (rect[0] + 90, rect[1] + 60),
        "Tonight's picks",
        font=fonts['eyebrow'],
        fill=(220, 220, 230, 255),
    )
    draw.text((rect[0] + 90, rect[1] + 120), 'MovieFlix', font=fonts['hero'], fill=(255, 255, 255, 255))
    icon_x = rect[2] - 70
    for _ in range(4):
        rounded_rect(canvas, (icon_x - 70, rect[1] + 40, icon_x, rect[1] + 120), 26, (229, 9, 20, 180))
        icon_x -= 90


def draw_meta(canvas: Image.Image, fonts):
    base_y = 580
    pill_width = (WIDTH - 220) // 3
    for index, label in enumerate(['68 trending', 'Glassy hero ready', 'Offline vault syncing']):
        left = 80 + index * (pill_width + 10)
        rounded_rect(
            canvas,
            (left, base_y, left + pill_width, base_y + 90),
            50,
            (255, 255, 255, 35),
            (255, 255, 255, 40),
        )
        ImageDraw.Draw(canvas).text(
            (left + 34, base_y + 28),
            label,
            font=fonts['meta'],
            fill=(255, 255, 255, 230),
        )


def draw_genres(canvas: Image.Image, fonts):
    chips = ['Spotlight', 'Thrillers', 'Glow Reels', 'Offline vault', 'Romance']
    y = 720
    draw = ImageDraw.Draw(canvas)
    draw.text((80, y), 'Browse by vibe', font=fonts['eyebrow'], fill=(210, 210, 220, 255))
    x = 80
    for chip in chips:
        text_width = fonts['chip'].getlength(chip)
        rect = (x, y + 60, x + int(text_width) + 80, y + 130)
        color = (229, 9, 20, 220) if chip == 'Spotlight' else (255, 255, 255, 40)
        rounded_rect(canvas, rect, 60, color)
        draw.text((rect[0] + 32, rect[1] + 18), chip, font=fonts['chip'], fill=(255, 255, 255, 255))
        x = rect[2] + 20


def draw_featured(canvas: Image.Image, fonts):
    rect = (80, 930, WIDTH - 80, 1320)
    rounded_rect(canvas, rect, 60, (28, 10, 12, 200), (255, 255, 255, 40), 2)
    poster = (rect[0] + 40, rect[1] + 60, rect[0] + 220, rect[1] + 320)
    rounded_rect(canvas, poster, 32, (80, 80, 80, 255))
    draw = ImageDraw.Draw(canvas)
    draw.text(
        (poster[2] + 40, poster[1]),
        'Glow feed warming up',
        font=fonts['featureTitle'],
        fill=(255, 255, 255, 255),
    )
    draw.text(
        (poster[2] + 40, poster[1] + 90),
        'Syncing profiles, prepping stories, and polishing gradients.',
        font=fonts['body'],
        fill=(220, 220, 230, 255),
    )


def draw_cards(canvas: Image.Image, fonts):
    base_y = 1370
    cards = [
        ('Trending flames', '68 cinematic drops curated tonight.'),
        ('Watch parties', 'Synced chats with glowing UI.'),
        ('Offline vault', 'Downloads stay cozy when signal drops.'),
    ]
    for title, copy in cards:
        rect = (80, base_y, WIDTH - 80, base_y + 200)
        rounded_rect(canvas, rect, 40, (10, 10, 18, 200), (255, 255, 255, 30))
        draw = ImageDraw.Draw(canvas)
        draw.text((rect[0] + 40, rect[1] + 40), title, font=fonts['cardTitle'], fill=(255, 255, 255, 255))
        draw.text((rect[0] + 40, rect[1] + 110), copy, font=fonts['body'], fill=(210, 210, 220, 255))
        base_y += 230


def draw_preview(canvas: Image.Image, fonts):
    rect = (80, HEIGHT - 620, WIDTH - 80, HEIGHT - 340)
    rounded_rect(canvas, rect, 50, (8, 9, 20, 230), (255, 255, 255, 25))
    poster = (rect[0] + 40, rect[1] + 40, rect[0] + 180, rect[1] + 220)
    rounded_rect(canvas, poster, 28, (70, 70, 70, 255))
    draw = ImageDraw.Draw(canvas)
    draw.text((poster[2] + 32, poster[1]), 'Offline vault ready', font=fonts['cardTitle'], fill=(255, 255, 255, 255))
    draw.text(
        (poster[2] + 32, poster[1] + 80),
        'Your splash now mirrors the movies tab aesthetic.',
        font=fonts['body'],
        fill=(215, 215, 225, 255),
    )


def draw_status(canvas: Image.Image, fonts):
    rect = (130, HEIGHT - 260, WIDTH - 130, HEIGHT - 140)
    rounded_rect(canvas, rect, 60, (5, 6, 15, 230), (255, 255, 255, 30))
    draw = ImageDraw.Draw(canvas)
    draw.text((rect[0] + 40, rect[1] + 30), 'Calibrating your cinema…', font=fonts['body'], fill=(255, 255, 255, 255))
    draw.text(
        (rect[0] + 40, rect[1] + 90),
        'Matching the movies home gradient & layout.',
        font=fonts['meta'],
        fill=(210, 210, 220, 255),
    )


def main():
    fonts = {
        'eyebrow': get_font(32, 'semibold'),
        'hero': get_font(70, 'bold'),
        'meta': get_font(30, 'regular'),
        'chip': get_font(32, 'semibold'),
        'body': get_font(34, 'regular'),
        'featureTitle': get_font(50, 'bold'),
        'cardTitle': get_font(42, 'bold'),
    }

    canvas = base_canvas()
    add_orb(canvas, (220, 240), 260, (125, 216, 255, 120))
    add_orb(canvas, (WIDTH - 160, HEIGHT - 260), 260, (95, 132, 255, 100))
    draw_header(canvas, fonts)
    draw_meta(canvas, fonts)
    draw_genres(canvas, fonts)
    draw_featured(canvas, fonts)
    draw_cards(canvas, fonts)
    draw_preview(canvas, fonts)
    draw_status(canvas, fonts)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT_PATH)
    rel = OUTPUT_PATH.relative_to(PROJECT_ROOT)
    print(f'Created {rel}')


if __name__ == '__main__':
    main()
