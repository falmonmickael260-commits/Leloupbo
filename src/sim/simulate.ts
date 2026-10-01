/**
 * Simulation headless de parties complètes (horloge virtuelle + bots).
 *
 *   npm run simulate -- [nbJoueurs=10] [nbParties=1] [graine=1] [--verbose]
 */
import { decideBotCommand } from '../engine/bots.ts';
import { GameEngine } from '../engine/engine.ts';
import { GameError } from '../engine/errors.ts';
import { seededRng, type Rng } from '../engine/rng.ts';
import type { RoleId, WinResult } from '../shared/types.ts';

export interface SimOptions {
  players: number;
  seed: number;
  roles?: Record<RoleId, number>;
  settings?: Record<string, unknown>;
  verbose?: boolean;
  /** Appelé après chaque étape (tests d'invariants). */
  onStep?: (engine: GameEngine, now: number) => void;
}

export interface SimResult {
  winner: WinResult;
  engine: GameEngine;
  days: number;
  phases: number;
  virtualMs: number;
}

export function defaultRolesFor(n: number): Record<RoleId, number> {
  const wolves = n >= 15 ? 3 : n >= 9 ? 2 : 1;
  const roles: Record<RoleId, number> = { werewolf: wolves, seer: 1, witch: 1 };
  if (n >= 6) roles.cupid = 1;
  if (n >= 7) roles.hunter = 1;
  if (n >= 8) roles.salvateur = 1;
  if (n >= 10) roles.white_wolf = 1;
  if (n >= 11) roles.thief = 1;
  return roles;
}

export function simulateGame(opts: SimOptions): SimResult {
  const rng: Rng = seededRng(opts.seed);
  const botRng: Rng = seededRng(opts.seed * 7919 + 13);
  let now = 1_000_000;
  const engine = GameEngine.create('SIM', now, rng);
  const host = engine.join('Hôte', 'hash-host', now);
  engine.setConnected(host.id, true, now);
  for (let i = 1; i < opts.players; i++) engine.addBot(host.id, now);
  engine.updateSettings(host.id, { roles: opts.roles ?? defaultRolesFor(opts.players), ...(opts.settings ?? {}) }, now);
  engine.start(host.id, now);
  // L'hôte humain est piloté comme un bot.
  const actors = engine.state.players.map((p) => p.id);

  let lastSeq = -1;
  let phases = 0;
  for (let guard = 0; guard < 200_000; guard++) {
    const s = engine.state;
    if (s.status === 'finished') break;
    if (s.phase.seq !== lastSeq) {
      lastSeq = s.phase.seq;
      phases++;
      if (opts.verbose) console.log(`[N${s.nightNumber} J${s.dayNumber}] ${s.phase.id}`);
    }
    let acted = false;
    for (const id of actors) {
      const view = engine.view(id, now);
      const cmd = decideBotCommand(view, botRng);
      if (!cmd) continue;
      try {
        engine.command(id, cmd, now);
        acted = true;
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        if (opts.verbose) console.log(`  refus ${id} ${cmd.action}: ${e.message}`);
      }
      opts.onStep?.(engine, now);
      if (engine.state.phase.seq !== lastSeq) break;
    }
    if (!acted) {
      // Personne n'agit : on saute à l'expiration du timer.
      const deadline = engine.nextDeadline();
      if (deadline === null) throw new Error(`Phase bloquée sans timer : ${s.phase.id}`);
      now = Math.max(now + 1, deadline);
      engine.tick(now);
      opts.onStep?.(engine, now);
    } else {
      now += 500;
      engine.tick(now);
    }
  }
  if (engine.state.status !== 'finished' || !engine.state.winner) throw new Error('La partie ne s’est pas terminée');
  return { winner: engine.state.winner, engine, days: engine.state.dayNumber, phases, virtualMs: now - 1_000_000 };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!);
if (isMain) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const verbose = process.argv.includes('--verbose');
  const players = Number(args[0] ?? 10);
  const games = Number(args[1] ?? 1);
  const seed = Number(args[2] ?? 1);
  const tally: Record<string, number> = {};
  for (let g = 0; g < games; g++) {
    const r = simulateGame({ players, seed: seed + g, verbose });
    tally[r.winner.camp] = (tally[r.winner.camp] ?? 0) + 1;
    if (games === 1 || verbose) {
      console.log('\n=== Annonces publiques ===');
      for (const a of r.engine.state.announcements) console.log(a.text);
    }
    console.log(`Partie ${g + 1} : ${r.winner.title} — ${r.days} jour(s), ${r.phases} phases, ~${Math.round(r.virtualMs / 60000)} min de jeu`);
  }
  if (games > 1) console.log('\nRésultats :', tally);
}
