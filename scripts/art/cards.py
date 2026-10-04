"""Cartes des rôles : PNG fournis (carte posée au centre d'un grand fond transparent)
→ public/assets/cartes/<rôle>.webp, format 2:3 (640×960), carte centrée, fond transparent.

Usage : python3 scripts/art/cards.py <dossier des PNG>      (pip install opencv-python-headless numpy)

Le détourage des fichiers fournis a rongé le bord de certaines cartes (et parfois l'intérieur).
Chaque carte est donc :
  1. recadrée sur son cadre (éclats de la carte voisine écartés) et mise au même format ;
  2. découpée selon une silhouette nette commune (cadre aux coins arrondis + médaillon) ;
  3. un montant du cadre rongé est reconstitué en miroir du montant opposé ;
  4. complétée là où le détourage a mangé l'image : petits manques reconstitués à partir des
     pixels voisins (le cadre se referme), grands manques remplis d'un fond sombre fondu.
Le dos (dos.webp) est recadré à la même silhouette depuis scripts/art/dos-src.webp.
"""
import sys, glob, os
import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '..', '..', 'public', 'assets', 'cartes')
W, H = 640, 960            # canevas final (2:3, comme les emplacements de carte du jeu)
CW, CH = 496, 924          # carte normalisée (2× la taille d'origine ≈ 248×462)
FRAME_TOP = 32             # haut du cadre (le médaillon dépasse au-dessus)
RADIUS = 18                # arrondi des coins du cadre
MEDAL_R = 74               # rayon du médaillon
SS = 4                     # sur-échantillonnage de la silhouette (bord lissé)
NAMES = {
    'loup-garou': 'werewolf', 'loup-noir': 'black_wolf', 'loup-blanc': 'white_wolf', 'voyante': 'seer',
    'sorciere': 'witch', 'chasseur': 'hunter', 'salvateur': 'salvateur', 'cupidon': 'cupid',
    'voleur': 'thief', 'villageois': 'villager', 'civil': 'civil', 'loup': 'loup',
}
RATIO = 0.535              # largeur / hauteur d'une carte intacte


def runs(mask1d):
    """Suites de True : [(début, fin)]"""
    out, start = [], None
    for i, v in enumerate(list(mask1d) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    return out


def frame_rect(alpha):
    """Rectangle du cadre (x0, y0, x1, y1) dans l'image complète, éclats voisins écartés."""
    ys, xs = np.nonzero(alpha)
    y0, y1 = ys.min(), ys.max() + 1
    a = alpha[y0:y1] > 0
    h = y1 - y0
    cols = a.sum(axis=0)
    # Bloc principal : plus longue suite de colonnes un peu remplies.
    blocks = runs(cols >= h * 0.05)
    bx0, bx1 = max(blocks, key=lambda r: r[1] - r[0])
    strong = [x for x in range(bx0, bx1) if cols[x] > 0.5 * h]
    left, right = min(strong), max(strong) + 1
    width = round(h * RATIO)
    if right - left < width * 0.85:
        # Un montant du cadre a disparu au détourage : le bord est pris au dernier pixel
        # d'image restant de ce côté (le montant sera reconstitué en miroir).
        top = np.nonzero(a[2:12].any(axis=0))[0]
        medal = (top.min() + top.max() + 1) / 2
        if medal - left < right - medal:
            left = bx0
        else:
            right = bx1
    return left, y0, right, y1


def silhouette(medal_x):
    big = np.zeros((CH * SS, CW * SS), np.uint8)
    r = RADIUS * SS
    x0, y0, x1, y1 = 0, FRAME_TOP * SS, CW * SS - 1, CH * SS - 1
    cv2.rectangle(big, (x0 + r, y0), (x1 - r, y1), 255, -1)
    cv2.rectangle(big, (x0, y0 + r), (x1, y1 - r), 255, -1)
    for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
        cv2.circle(big, (cx, cy), r, 255, -1)
    cv2.circle(big, (round(medal_x * SS), MEDAL_R * SS), MEDAL_R * SS, 255, -1)
    return cv2.resize(big, (CW, CH), interpolation=cv2.INTER_AREA)


def repair(rgba):
    """Comble les manques à l'intérieur de la silhouette."""
    rgb = rgba[:, :, :3].copy()
    known = rgba[:, :, 3] > 127
    a = rgba[:, :, 3:4].astype(np.float32) / 255
    rgb = (rgb.astype(np.float32) * a).astype(np.uint8)   # pas de franges claires
    holes = (~known).astype(np.uint8) * 255
    painted = cv2.inpaint(rgb, holes, 3, cv2.INPAINT_TELEA)
    # Loin de tout pixel connu, la reconstitution bave : on l'assombrit progressivement.
    dist = cv2.distanceTransform(holes, cv2.DIST_L2, 5)
    k = np.clip((dist - 1.5) / 2.5, 0, 1)[:, :, None]
    dark = cv2.GaussianBlur(painted, (0, 0), 8).astype(np.float32) * 0.15 + np.array([6, 5, 8], np.float32)
    fill = painted.astype(np.float32) * (1 - k) + dark * k
    out = np.where(known[:, :, None], rgb.astype(np.float32), fill)
    return np.clip(out, 0, 255).astype(np.uint8)


def mirror_frame(card, band=26):
    """Cadre symétrique : un montant rongé est reconstitué à partir du montant opposé."""
    a = card[:, :, 3]
    for side in (slice(0, band), slice(CW - band, CW)):
        other = slice(CW - band, CW) if side.start == 0 else slice(0, band)
        src = card[:, other][:, ::-1]
        miss = (a[:, side] < 128) & (src[:, :, 3] >= 128)
        card[:, side][miss] = src[miss]


def place(rgba):
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    img = Image.fromarray(rgba, 'RGBA')
    s = H / img.height
    img = img.resize((round(img.width * s), H), Image.LANCZOS)
    out.alpha_composite(img, ((W - img.width) // 2, 0))
    return out


def process(path):
    full = np.array(Image.open(path).convert('RGBA'))
    x0, y0, x1, y1 = frame_rect(full[:, :, 3])
    crop = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    sx0 = max(0, x0)
    crop[:, sx0 - x0:sx0 - x0 + (x1 - sx0)] = full[y0:y1, sx0:x1]
    card = cv2.resize(crop, (CW, CH), interpolation=cv2.INTER_LANCZOS4)
    # Position du médaillon (il n'est pas toujours exactement centré).
    top = np.nonzero((card[4:24, :, 3] > 127).any(axis=0))[0]
    medal_x = (top.min() + top.max() + 1) / 2 if len(top) else CW / 2
    shape = silhouette(medal_x)
    mirror_frame(card)
    rgb = repair(card)
    return np.dstack([rgb, shape]), (x1 - x0, y1 - y0)


if __name__ == '__main__':
    src = sys.argv[1]
    files = {os.path.basename(f)[3:-4]: f for f in glob.glob(os.path.join(src, '*.png'))}
    for key, path in sorted(files.items()):
        rgba, size = process(path)
        place(rgba).save(os.path.join(OUT, NAMES[key] + '.webp'), quality=92, method=6)
        print(NAMES[key], size)

    # Dos : mêmes dimensions et coins arrondis que les faces.
    dos = Image.open(os.path.join(HERE, 'dos-src.webp')).convert('RGB')
    cw = round(dos.height * CW / CH)
    dos = dos.crop(((dos.width - cw) // 2, 0, (dos.width - cw) // 2 + cw, dos.height)).resize((CW, CH), Image.LANCZOS)
    rgb = np.array(dos)
    big = np.zeros((CH * SS, CW * SS), np.uint8)
    r = RADIUS * SS
    cv2.rectangle(big, (r, 0), (CW * SS - 1 - r, CH * SS - 1), 255, -1)
    cv2.rectangle(big, (0, r), (CW * SS - 1, CH * SS - 1 - r), 255, -1)
    for cx, cy in ((r, r), (CW * SS - 1 - r, r), (r, CH * SS - 1 - r), (CW * SS - 1 - r, CH * SS - 1 - r)):
        cv2.circle(big, (cx, cy), r, 255, -1)
    shape = cv2.resize(big, (CW, CH), interpolation=cv2.INTER_AREA)
    place(np.dstack([rgb, shape])).save(os.path.join(OUT, 'dos.webp'), quality=92, method=6)
    print('dos')
