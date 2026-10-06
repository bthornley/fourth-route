#!/usr/bin/env python3
"""
Generates high-resolution tailored Fourth Route icons and favicons
from the official Scales of Justice shield avatar.
"""

import os
from PIL import Image, ImageEnhance

SRC_AVATAR = "/Users/bthornley/Desktop/fourth_route_avatar.jpg"
BASE_DIR = "/Users/bthornley/Documents/alpr-nav/mobile"

# 1. Load and prepare centered 1024x1024 icon
src = Image.open(SRC_AVATAR).convert("RGBA")
# Crop emblem from avatar
emblem = src.crop((290, 225, 790, 835))
ew, eh = emblem.size

canvas_size = 1024
canvas_bg = (8, 14, 38, 255) # Deep midnight navy #080e26
icon_1024 = Image.new("RGBA", (canvas_size, canvas_size), canvas_bg)

# Scale emblem to fill ~76% of canvas
target_h = int(canvas_size * 0.76)
target_w = int(ew * (target_h / eh))
emblem_resized = emblem.resize((target_w, target_h), Image.Resampling.LANCZOS)

pos_x = (canvas_size - target_w) // 2
pos_y = (canvas_size - target_h) // 2
icon_1024.paste(emblem_resized, (pos_x, pos_y), emblem_resized)

# Ensure directories exist
os.makedirs(f"{BASE_DIR}/assets", exist_ok=True)
os.makedirs(f"{BASE_DIR}/web-build", exist_ok=True)
os.makedirs(f"{BASE_DIR}/web-build/pwa/apple-touch-icon", exist_ok=True)

# 2. Save source assets for Expo
icon_1024.save(f"{BASE_DIR}/assets/icon.png", format="PNG")
icon_512 = icon_1024.resize((512, 512), Image.Resampling.LANCZOS)
icon_512.save(f"{BASE_DIR}/assets/favicon.png", format="PNG")

# 3. Save web-build assets (PWA + Navicons)
icon_512.save(f"{BASE_DIR}/web-build/icon-512.png", format="PNG")

icon_192 = icon_1024.resize((192, 192), Image.Resampling.LANCZOS)
icon_192.save(f"{BASE_DIR}/web-build/icon-192.png", format="PNG")

icon_180 = icon_1024.resize((180, 180), Image.Resampling.LANCZOS)
icon_180.save(f"{BASE_DIR}/web-build/pwa/apple-touch-icon/apple-touch-icon-180.png", format="PNG")

# For tiny favicons (32x32 and 16x16), increase contrast and saturation slightly so scales pop
enhancer = ImageEnhance.Contrast(icon_1024)
icon_boosted = enhancer.enhance(1.15)
color_enhancer = ImageEnhance.Color(icon_boosted)
icon_boosted = color_enhancer.enhance(1.2)

icon_32 = icon_boosted.resize((32, 32), Image.Resampling.LANCZOS)
icon_32.save(f"{BASE_DIR}/web-build/favicon-32.png", format="PNG")

icon_16 = icon_boosted.resize((16, 16), Image.Resampling.LANCZOS)
icon_16.save(f"{BASE_DIR}/web-build/favicon-16.png", format="PNG")

# Multi-resolution ICO
icon_48 = icon_boosted.resize((48, 48), Image.Resampling.LANCZOS)
icon_32.save(
    f"{BASE_DIR}/web-build/favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=[icon_16, icon_48]
)

print("✅ Successfully generated all Fourth Route tailored icons & favicons!")
