/**
 * Version du jeu côté navigateur : empreinte des fichiers servis (page, scripts, styles).
 * Elle ne change que si le jeu affiché change ; un téléphone resté ouvert sur une ancienne
 * version le détecte à la reconnexion et se met à jour (voir public/js/app.js).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(js|css|html|json)$/.test(name)) out.push(p);
  }
  return out;
}

export function clientBuildId(publicDir: string): string {
  const h = createHash('sha256');
  try {
    for (const f of [path.join(publicDir, 'index.html'), path.join(publicDir, 'style.css'), ...files(path.join(publicDir, 'js'))]) {
      h.update(f.slice(publicDir.length));
      h.update(readFileSync(f));
    }
  } catch {
    h.update(String(Date.now()));
  }
  return h.digest('hex').slice(0, 12);
}

/** Dossier des fichiers servis au navigateur (page, scripts, styles, décors). */
export const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

/** Empreinte du dossier public du jeu, calculée une fois au démarrage du serveur. */
export const CLIENT_BUILD = clientBuildId(PUBLIC_DIR);
