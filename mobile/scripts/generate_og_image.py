#!/usr/bin/env python3
"""
Generate the 1200x630 social preview image (Open Graph / Twitter card) for fourthroute.org.

Output: mobile/assets/og-image.png (copied into web-build/ by scripts/inject-analytics.js)

Drawn in code (not AI-generated) so every word is exact. The right-hand panel is an
*illustration* of the idea (fastest route through cameras vs. a route around them),
not real map data. Requires Pillow and macOS system fonts (Avenir Next).

    python3 mobile/scripts/generate_og_image.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")
OUT = os.path.join(ASSETS, "og-image.png")

W, H = 1200, 630
BG = (13, 13, 30)            # #0d0d1e, app theme
PANEL = (22, 22, 46)
STREET = (40, 40, 72)
RED = (231, 76, 60)          # camera red used in the app
BLUE = (74, 144, 217)        # privacy-route blue used in the app
GREY = (120, 120, 140)
WHITE = (255, 255, 255)
MUTED = (176, 176, 196)
GREEN = (46, 204, 113)

AVENIR = "/System/Library/Fonts/Avenir Next.ttc"


def font(size, face):
    idx = {"bold": 0, "demi": 2, "medium": 5, "regular": 7, "heavy": 8}[face]
    return ImageFont.truetype(AVENIR, size, index=idx)


def main():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # ── Right panel: illustrative street grid ───────────────────────────────
    px0, py0, px1, py1 = 640, 60, 1140, 570
    d.rounded_rectangle((px0, py0, px1, py1), radius=28, fill=PANEL)
    for x in range(px0 + 50, px1, 75):
        d.line((x, py0 + 20, x, py1 - 20), fill=STREET, width=6)
    for y in range(py0 + 45, py1, 75):
        d.line((px0 + 20, y, px1 - 20, y), fill=STREET, width=6)

    start, end = (px0 + 50, py1 - 60), (px1 - 50, py0 + 45)

    # Fastest route: straight diagonal-ish path through the cameras (grey, dashed feel)
    fastest = [start, (px0 + 200, py1 - 60), (px0 + 200, py0 + 270), (px0 + 350, py0 + 270),
               (px0 + 350, py0 + 120), (px1 - 50, py0 + 120), end]
    d.line(fastest, fill=GREY, width=9, joint="curve")

    # Privacy route: goes around (blue)
    privacy = [start, (px0 + 50, py0 + 345), (px0 + 125, py0 + 345), (px0 + 125, py0 + 195),
               (px0 + 275, py0 + 195), (px0 + 275, py0 + 45), end]
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).line(privacy, fill=BLUE + (140,), width=26, joint="curve")
    img.paste(glow.filter(ImageFilter.GaussianBlur(10)), (0, 0), glow.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(img)
    d.line(privacy, fill=BLUE, width=10, joint="curve")

    # Cameras sitting on the fastest route
    cams = [(px0 + 125, py1 - 60), (px0 + 200, py0 + 345), (px0 + 275, py0 + 270),
            (px0 + 350, py0 + 195), (px0 + 425, py0 + 120), (px1 - 50, py0 + 82)]
    for (cx, cy) in cams:
        d.ellipse((cx - 17, cy - 17, cx + 17, cy + 17), fill=(231, 76, 60))
        d.ellipse((cx - 7, cy - 7, cx + 7, cy + 7), fill=(255, 220, 215))

    for (x, y), col in ((start, GREEN), (end, WHITE)):
        d.ellipse((x - 15, y - 15, x + 15, y + 15), fill=col, outline=BG, width=4)

    # Legend
    ly = py1 - 22
    d.line((px0 + 200, ly, px0 + 230, ly), fill=GREY, width=7)
    d.text((px0 + 238, ly), "fastest", font=font(20, "medium"), fill=MUTED, anchor="lm")
    d.line((px0 + 312, ly, px0 + 342, ly), fill=BLUE, width=7)
    d.text((px0 + 350, ly), "Fourth Route", font=font(20, "medium"), fill=MUTED, anchor="lm")

    # ── Left: brand + message ───────────────────────────────────────────────
    icon = Image.open(os.path.join(ASSETS, "pwa", "icon-512.png")).convert("RGBA").resize((92, 92), Image.LANCZOS)
    img.paste(icon, (60, 64), icon)
    d.text((168, 110), "Fourth Route", font=font(44, "bold"), fill=WHITE, anchor="lm")

    y = 186
    for line in ("Route around", "license plate", "cameras."):
        d.text((60, y), line, font=font(60, "heavy"), fill=WHITE)
        y += 70

    d.text((60, y + 18), "See the ALPR cameras on your drive", font=font(26, "medium"), fill=MUTED)
    d.text((60, y + 52), "and find a route that passes fewer.", font=font(26, "medium"), fill=MUTED)

    # Pills
    px = 60
    py = 540
    for label in ("Free", "No account", "No tracking", "Open source"):
        f = font(20, "demi")
        w = d.textlength(label, font=f)
        d.rounded_rectangle((px, py - 20, px + w + 32, py + 20), radius=20, outline=(70, 70, 110), width=2)
        d.text((px + 16, py), label, font=f, fill=WHITE, anchor="lm")
        px += w + 40

    d.text((60, 596), "fourthroute.org", font=font(22, "bold"), fill=BLUE, anchor="lm")

    img.save(OUT, optimize=True)
    print(f"Wrote {OUT} ({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
