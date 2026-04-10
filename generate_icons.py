"""One-off script to generate placeholder extension icons.

Usage:
    pip install Pillow
    python generate_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ICONS_DIR = Path(__file__).parent / "extension" / "icons"
SIZES = [16, 48, 128]
COLOR = (92, 107, 192)  # indigo #5C6BC0


def generate():
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        # Rounded rectangle background
        radius = max(2, size // 6)
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=COLOR)
        # Small "C" letter for Claude, only at larger sizes
        if size >= 48:
            font_size = size // 2
            cx, cy = size // 2, size // 2
            margin = size // 5
            arc_box = [margin, margin, size - margin - 1, size - margin - 1]
            draw.arc(arc_box, start=40, end=320, fill="white", width=max(2, size // 12))
        img.save(ICONS_DIR / f"{size}.png")
        print(f"Created {size}.png")


if __name__ == "__main__":
    generate()
