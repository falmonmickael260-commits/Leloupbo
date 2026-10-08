/**
 * Persistance des parties. L'interface permet de remplacer le stockage fichier
 * par Redis / PostgreSQL plus tard sans toucher au moteur ni au GameManager.
 */
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GameState } from '../engine/state.ts';

export interface GameStore {
  save(state: GameState): Promise<void>;
  /** Attend la fin des écritures en cours (arrêt du serveur). */
  flush?(): Promise<void>;
  loadAll(): Promise<GameState[]>;
  delete(code: string): Promise<void>;
}

export class MemoryGameStore implements GameStore {
  readonly data = new Map<string, string>();
  async save(state: GameState) {
    this.data.set(state.code, JSON.stringify(state));
  }
  async loadAll() {
    return [...this.data.values()].map((s) => JSON.parse(s) as GameState);
  }
  async delete(code: string) {
    this.data.delete(code);
  }
}

/** Un fichier JSON par partie, écrit de façon atomique (fichier temporaire + rename). */
export class FileGameStore implements GameStore {
  private chains = new Map<string, Promise<void>>();

  constructor(private readonly dir: string) {}

  async flush(): Promise<void> {
    await Promise.allSettled([...this.chains.values()]);
  }

  private file(code: string) {
    return path.join(this.dir, `${code.replace(/[^A-Z0-9]/gi, '')}.json`);
  }

  /** Écriture prévue (pas encore commencée) par partie : on la réutilise au lieu d'en empiler une autre. */
  private pending = new Map<string, { state: GameState; done: Promise<void> }>();

  save(state: GameState): Promise<void> {
    const code = state.code;
    // Plusieurs changements rapprochés (actions, votes, réactions…) = UNE seule écriture,
    // avec l'état le plus récent (il est sérialisé au moment d'écrire, pas à chaque appel).
    const waiting = this.pending.get(code);
    if (waiting) {
      waiting.state = state;
      return waiting.done;
    }
    // Écritures sérialisées par partie pour ne jamais écraser un état plus récent.
    const prev = this.chains.get(code) ?? Promise.resolve();
    const slot = { state, done: Promise.resolve() };
    slot.done = prev
      .catch(() => undefined)
      .then(async () => {
        this.pending.delete(code); // les changements suivants prépareront l'écriture d'après
        const json = JSON.stringify(slot.state);
        await mkdir(this.dir, { recursive: true });
        const target = this.file(code);
        const tmp = `${target}.${process.pid}.tmp`;
        await writeFile(tmp, json, 'utf8');
        await rename(tmp, target);
      });
    this.pending.set(code, slot);
    this.chains.set(code, slot.done);
    return slot.done;
  }

  async loadAll(): Promise<GameState[]> {
    let files: string[] = [];
    try {
      files = await readdir(this.dir);
    } catch {
      return [];
    }
    const out: GameState[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        out.push(JSON.parse(await readFile(path.join(this.dir, f), 'utf8')) as GameState);
      } catch (e) {
        console.warn(`[store] fichier ignoré ${f}:`, (e as Error).message);
      }
    }
    return out;
  }

  async delete(code: string): Promise<void> {
    await (this.chains.get(code) ?? Promise.resolve()).catch(() => undefined);
    this.chains.delete(code);
    this.pending.delete(code);
    await rm(this.file(code), { force: true });
  }
}
