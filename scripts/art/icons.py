"""Icône de l'appli : la tête de loup noir aux yeux dorés du portail du décor Blackops, sur fond noir et or.

    python3 scripts/art/icons.py scripts/art/decor-src/blackops.png public/icons store

→ public/icons : icônes de l'appli installable (192, 512, maskable, iPhone, favicon) ;
→ store : icônes carrées pour les magasins (Google Play 512, App Store 1024).
"""
import math, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

SRC = sys.argv[1]
OUT = sys.argv[2]
STORE = sys.argv[3] if len(sys.argv) > 3 else OUT
N = 1024

def radial(size, inner, outer, c0, c1):
    """Dégradé radial c0 (centre) → c1 (bord)."""
    img = Image.new('RGB', (size, size))
    px = img.load()
    cx = cy = size / 2
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy) / (size / 2)
            t = min(1, max(0, (d - inner) / (outer - inner)))
            px[x, y] = tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
    return img

def wolf(scale_px):
    dec = Image.open(SRC).convert('RGBA')
    # Tête du loup du portail (coordonnées du décor 1882 × 836)
    crop = dec.crop((828, 62, 1062, 296))
    crop = crop.resize((scale_px, scale_px), Image.LANCZOS)
    # Fondu circulaire : on garde la tête, le portail autour s'efface dans le noir.
    mask = Image.new('L', (scale_px, scale_px), 0)
    m = mask.load()
    c = scale_px / 2
    for y in range(scale_px):
        for x in range(scale_px):
            d = math.hypot(x - c, (y - c) * 1.08) / c
            m[x, y] = int(255 * min(1, max(0, (0.98 - d) / 0.22)))
    crop.putalpha(ImageChops.multiply(crop.split()[3], mask))
    return crop

def icon(ring=True, wolf_frac=0.74, bg_outer=1.0):
    bg = radial(N, 0.0, bg_outer, (38, 27, 14), (6, 5, 8)).convert('RGBA')
    # Halo doré derrière la tête
    glow = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    r = int(N * 0.30)
    g.ellipse((N/2 - r, N/2 - r, N/2 + r, N/2 + r), fill=(242, 190, 80, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(N * 0.08))
    bg.alpha_composite(glow)
    w = wolf(int(N * wolf_frac))
    off = (N - w.size[0]) // 2
    bg.alpha_composite(w, (off, off + int(N * 0.02)))
    if ring:
        d = ImageDraw.Draw(bg)
        for i, (col, wd) in enumerate([((122, 87, 24), 30), ((242, 199, 92), 18), ((255, 231, 154), 6)]):
            pad = int(N * 0.035) + i * 6
            d.ellipse((pad, pad, N - pad, N - pad), outline=col, width=wd)
    return bg

any_icon = icon(ring=True)
maskable = icon(ring=False, wolf_frac=0.62)
for size in (512, 192):
    any_icon.resize((size, size), Image.LANCZOS).save(f'{OUT}/icon-{size}.png', optimize=True)
maskable.resize((512, 512), Image.LANCZOS).save(f'{OUT}/icon-maskable-512.png', optimize=True)
# iPhone et magasins : carré plein (le téléphone arrondit lui-même les coins), loup plus grand, sans transparence.
full = icon(ring=False, wolf_frac=0.86)
full.convert('RGB').resize((180, 180), Image.LANCZOS).save(f'{OUT}/apple-touch-icon.png', optimize=True)
full.convert('RGB').resize((512, 512), Image.LANCZOS).save(f'{STORE}/icone-google-play-512.png', optimize=True)
full.convert('RGB').save(f'{STORE}/icone-app-store-1024.png', optimize=True)
any_icon.resize((48, 48), Image.LANCZOS).save(f'{OUT}/favicon-48.png', optimize=True)
print('icônes faites')
