"""Cartes des rôles : PNG fournis (carte posée au centre d'un grand fond transparent)
→ public/assets/cartes/<rôle>.webp, format 2:3 (640×960), carte centrée, fond transparent.

Usage : python3 scripts/art/cards.py <dossier des PNG>

Les zones transparentes à l'intérieur d'une carte (détourage trop large) sont bouchées
avec un noir profond, à partir de la silhouette d'une carte intacte (« civil »).
Le dos (dos.webp) est recadré à la même silhouette depuis scripts/art/dos-src.webp.
"""
import sys, glob, os
from PIL import Image, ImageChops

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'cartes')
W, H = 640, 960
FILL = (8, 7, 10, 255)
NAMES = {
    'loup-garou': 'werewolf', 'loup-noir': 'black_wolf', 'loup-blanc': 'white_wolf', 'voyante': 'seer',
    'sorciere': 'witch', 'chasseur': 'hunter', 'salvateur': 'salvateur', 'cupidon': 'cupid',
    'voleur': 'thief', 'villageois': 'villager', 'civil': 'civil', 'loup': 'loup',
}

def run(counts, minimum):
    """Plus longue suite de colonnes (ou lignes) assez opaques : écarte les éclats voisins."""
    best, start = (0, 0), None
    for i, c in enumerate(list(counts) + [0]):
        if c >= minimum and start is None:
            start = i
        elif c < minimum and start is not None:
            best = max(best, (start, i), key=lambda r: r[1] - r[0])
            start = None
    return best

def crop(path):
    im = Image.open(path).convert('RGBA')
    im = im.crop(im.getbbox())
    a = im.split()[3].point(lambda v: 1 if v else 0)
    w, h = a.size
    px = a.load()
    cols = [sum(px[x, y] for y in range(h)) for x in range(w)]
    rows = [sum(px[x, y] for x in range(w)) for y in range(h)]
    x0, x1 = run(cols, h * 0.05)
    y0, y1 = run(rows, 1)
    return im.crop((x0, y0, x1, y1))

def place(card):
    """Carte mise à la hauteur du canevas 2:3, centrée."""
    s = H / card.height
    c = card.resize((round(card.width * s), H), Image.LANCZOS)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.alpha_composite(c, ((W - c.width) // 2, 0))
    return out

src = sys.argv[1]
files = {os.path.basename(f)[3:-4]: f for f in glob.glob(os.path.join(src, '*.png'))}
template = crop(files['civil']).split()[3]

for key, path in sorted(files.items()):
    card = crop(path)
    shape = template.resize(card.size, Image.LANCZOS).point(lambda v: 255 if v > 127 else 0)
    alpha = ImageChops.lighter(card.split()[3], shape)
    base = Image.new('RGBA', card.size, FILL)
    base.alpha_composite(card)
    base.putalpha(alpha)
    place(base).save(os.path.join(OUT, NAMES[key] + '.webp'), quality=90, method=6)
    print(NAMES[key], card.size)

# Dos : même silhouette que les faces.
dos = Image.open(os.path.join(os.path.dirname(__file__), 'dos-src.webp')).convert('RGBA')
ratio = template.width / template.height
cw = round(dos.height * ratio)
dos = dos.crop(((dos.width - cw) // 2, 0, (dos.width - cw) // 2 + cw, dos.height))
dos.putalpha(ImageChops.multiply(dos.split()[3], template.resize(dos.size, Image.LANCZOS)))
place(dos).save(os.path.join(OUT, 'dos.webp'), quality=90, method=6)
print('dos', dos.size)
