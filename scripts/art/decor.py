"""
Prépare un décor fourni (image avec ciel transparent) pour le plateau :

  - copie optimisée du décor (WebP) ;
  - calque « lumières » : les lampes / fenêtres du décor isolées, qui restent
    allumées pendant la nuit (le reste du décor est assombri) ;
  - fichier de configuration (.json) : position des lumières et de la place.

Usage (outil ponctuel, hors dépendances du jeu : pip install pillow) :
  python3 scripts/art/decor.py <image> <nom> [--plaza cx,cy,rx,ry] [--glow x0,y0,x1,y1]...

--glow : zone (ex. une enseigne) dont les parties claires s'illuminent la nuit.
Coordonnées de --plaza et --glow en pixels de l'IMAGE SOURCE : centre et rayons du cercle
des joueurs (pieds). Le plateau mesure 1536×1024 ; le décor y est mis à l'échelle
sur la hauteur et centré (les bords gauche/droit d'une image très large sont rognés).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageFilter

W, H = 1536, 1024
OUT = Path(__file__).resolve().parents[2] / 'public' / 'assets' / 'decor'


def main():
    src, name = sys.argv[1], sys.argv[2]
    plaza = None
    if '--plaza' in sys.argv:
        plaza = [float(v) for v in sys.argv[sys.argv.index('--plaza') + 1].split(',')]
    glows = [[int(v) for v in sys.argv[i + 1].split(',')] for i, a in enumerate(sys.argv) if a == '--glow']
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    s = H / h
    offx = (W - w * s) / 2
    OUT.mkdir(parents=True, exist_ok=True)
    im.save(OUT / f'{name}.webp', 'WEBP', quality=88, method=6)

    # --- Lumières : pixels chauds et très lumineux (lampes, fenêtres éclairées)
    px = im.load()
    mask = Image.new('L', (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            lum = (r + g + b) / 3
            if r > 200 and g > 150 and r - b > 55 and lum > 165:
                mp[x, y] = min(255, int((lum - 150) * 3))
    # Enseignes : leurs lettres claires s'illuminent (en plus des lampes).
    for x0, y0, x1, y1 in glows:
        for y in range(max(0, y0), min(h, y1)):
            for x in range(max(0, x0), min(w, x1)):
                r, g, b, a = px[x, y]
                lum = (r + g + b) / 3
                if a > 200 and lum > 120:
                    mp[x, y] = max(mp[x, y], min(255, int((lum - 100) * 2.6)))
    mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    lights = im.copy()
    lights.putalpha(mask)
    lights.save(OUT / f'{name}-lights.webp', 'WEBP', quality=88, method=6)

    # --- Sources de lumière (regroupement sur une grille) pour les halos de nuit
    cell = 8
    gw, gh = w // cell + 1, h // cell + 1
    grid = [[0] * gw for _ in range(gh)]
    mp = mask.load()
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if mp[x, y] > 120:
                grid[y // cell][x // cell] += 1
    seen = set()
    spots = []
    for gy in range(gh):
        for gx in range(gw):
            if grid[gy][gx] < 2 or (gx, gy) in seen:
                continue
            stack, cells = [(gx, gy)], []
            seen.add((gx, gy))
            while stack:
                cx, cy = stack.pop()
                cells.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < gw and 0 <= ny < gh and (nx, ny) not in seen and grid[ny][nx] >= 2:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
            if len(cells) < 2:
                continue
            mx = sum(c[0] for c in cells) / len(cells) * cell + cell / 2
            my = sum(c[1] for c in cells) / len(cells) * cell + cell / 2
            size = max(max(c[0] for c in cells) - min(c[0] for c in cells), max(c[1] for c in cells) - min(c[1] for c in cells)) * cell
            sx, sy = mx * s + offx, my * s
            if not (0 <= sx <= W):
                continue
            r = max(45, min(150, size * s * 1.6))
            spots.append({'x': round(sx / W, 4), 'y': round(sy / H, 4), 'r': round(r / W, 4), 'kind': 'lantern'})

    for x0, y0, x1, y1 in glows:
        cx, cy = (x0 + x1) / 2 * s + offx, (y0 + y1) / 2 * s
        spots.append({'x': round(cx / W, 4), 'y': round(cy / H, 4), 'r': round((x1 - x0) * s * 0.75 / W, 4), 'kind': 'sign'})

    if plaza:
        pcx, pcy, prx, pry = plaza
        # computeLayout : centre = cy*H + 20, rayons = rx*W*0.8 et ry*H*0.78
        square = {'cx': (pcx * s + offx) / W, 'cy': (pcy * s - 20) / H, 'rx': prx * s / 0.8 / W, 'ry': pry * s / 0.78 / H}
    else:
        square = {'cx': 0.5, 'cy': 0.78, 'rx': 0.21, 'ry': 0.19}
    cfg = {
        'width': W,
        'height': H,
        'image': f'/assets/decor/{name}.webp',
        'lightsImage': f'/assets/decor/{name}-lights.webp',
        'fit': 'cover',
        'square': square,
        'lights': spots,
    }
    (OUT / f'{name}.json').write_text(json.dumps(cfg))
    print(f'{name} : {len(spots)} lumières, place {square}')


main()
