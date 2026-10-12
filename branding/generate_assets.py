"""Builds every logo and icon file the apps use from the originals in this folder.

    python branding/generate_assets.py

Originals (edit these, then rerun): kannect-logo.png (wide wordmark), app-icon.ico (favicon),
retailer-app-icon.png / consumer-app-icon.png / supplier-app-icon.png (one per app).

For each of retailer, consumer and supplier it writes:
  public/kannect-logo.png        header logo (resized, transparent)
  public/favicon.ico             browser tab icon
  public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png   PWA / home screen
  android/app/src/main/res/mipmap-*/ic_launcher{,_round,_foreground}.png + launcher background colour
and public/favicon.ico for the landing page. Needs Pillow (pip install pillow).
"""

import re
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
APPS = HERE.parent / "apps"
APP_ICONS = {"retailer": "retailer-app-icon.png", "consumer": "consumer-app-icon.png", "supplier": "supplier-app-icon.png"}

# Android launcher densities: legacy icon size, adaptive-foreground size (108dp)
DENSITIES = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216), "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}
LOGO_WIDTH = 640


def square(art: Image.Image, size: int, fill: float = 1.0, bg: tuple[int, int, int] | None = None) -> Image.Image:
    """The artwork centred on a square canvas, its longest side being `fill` of the canvas."""
    canvas = Image.new("RGBA", (size, size), (*bg, 255) if bg else (0, 0, 0, 0))
    side = max(1, round(size * fill))
    scale = side / max(art.size)
    resized = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def plate_colour(art: Image.Image) -> tuple[int, int, int]:
    """The icon plate's colour, sampled along the middle of its four edges."""
    w, h = art.size
    points = []
    for i in range(30, 71):
        t = i / 100
        points += [(round(t * w), round(0.05 * h)), (round(t * w), round(0.95 * h)), (round(0.05 * w), round(t * h)), (round(0.95 * w), round(t * h))]
    px = [art.getpixel(p) for p in points if art.getpixel(p)[3] > 200]
    return tuple(round(sum(c[i] for c in px) / len(px)) for i in range(3))  # type: ignore[return-value]


def round_icon(art: Image.Image, size: int, bg: tuple[int, int, int]) -> Image.Image:
    """Legacy round launcher icon: the plate colour in a circle with the artwork on it."""
    big = size * 4
    disc = square(art, big, 0.8, bg)
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    out = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    out.paste(disc, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)


def main() -> None:
    logo = Image.open(HERE / "kannect-logo.png").convert("RGBA")
    logo = logo.resize((LOGO_WIDTH, round(logo.height * LOGO_WIDTH / logo.width)), Image.LANCZOS)
    ico = HERE / "app-icon.ico"

    for app, icon_name in APP_ICONS.items():
        art = Image.open(HERE / icon_name).convert("RGBA")
        bg = plate_colour(art)
        public = APPS / app / "public"
        res = APPS / app / "android" / "app" / "src" / "main" / "res"

        save(logo, public / "kannect-logo.png")
        shutil.copyfile(ico, public / "favicon.ico")
        save(square(art, 192), public / "icon-192.png")
        save(square(art, 512), public / "icon-512.png")
        save(square(art, 512, 0.78, bg), public / "icon-maskable-512.png")  # full-bleed, inside the safe zone
        save(square(art, 180, 0.86, bg), public / "apple-touch-icon.png")

        for density, (legacy, foreground) in DENSITIES.items():
            folder = res / f"mipmap-{density}"
            save(square(art, legacy), folder / "ic_launcher.png")
            save(round_icon(art, legacy, bg), folder / "ic_launcher_round.png")
            # adaptive icon: the plate fills the visible 72dp of the 108dp canvas, the background colour is its colour
            save(square(art, foreground, 72 / 108), folder / "ic_launcher_foreground.png")

        colour_file = res / "values" / "ic_launcher_background.xml"
        text = colour_file.read_text(encoding="utf-8")
        hex_bg = "#{:02X}{:02X}{:02X}".format(*bg)
        colour_file.write_text(re.sub(r'(<color name="ic_launcher_background">)[^<]*(</color>)', rf"\g<1>{hex_bg}\g<2>", text), encoding="utf-8")
        print(f"{app}: icons written, launcher background {hex_bg}")

    shutil.copyfile(ico, APPS / "landing-page" / "public" / "favicon.ico")
    print("landing-page: favicon.ico written")


if __name__ == "__main__":
    main()
