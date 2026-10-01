import { GameEngine } from '../src/engine/engine.ts';
import { getRole } from '../src/engine/roles/index.ts';
import { seededRng } from '../src/engine/rng.ts';
import type { ClientCommand, PhaseId, RoleId } from '../src/shared/types.ts';

export const T0 = 1_000_000;

/**
 * Prépare une partie dont les rôles sont imposés par siège (tests uniquement :
 * en production la distribution est toujours aléatoire).
 */
export function setup(roles: RoleId[], settings: Record<string, unknown> = {}, extraCards: RoleId[] = []) {
  let now = T0;
  const engine = GameEngine.create('TEST', now, seededRng(42));
  const host = engine.join('P0', 'h0', now);
  engine.setConnected(host.id, true, now);
  for (let i = 1; i < roles.length; i++) {
    const p = engine.join(`P${i}`, `h${i}`, now);
    engine.setConnected(p.id, true, now);
  }
  const counts: Record<string, number> = {};
  for (const r of [...roles, ...extraCards]) if (r !== 'villager') counts[r] = (counts[r] ?? 0) + 1;
  if (!counts.werewolf) counts.werewolf = 1; // la validation exige un loup, la répartition est imposée ensuite
  engine.updateSettings(host.id, { roles: counts, captainEnabled: false, ...settings }, now);
  engine.start(host.id, now);
  const s = engine.state;
  const comp: Record<string, number> = {};
  s.players.forEach((p, i) => {
    p.role = roles[i];
    p.originalRole = roles[i];
    p.roleData = getRole(roles[i])!.initRoleData?.() ?? {};
  });
  for (const r of [...roles, ...extraCards]) comp[r] = (comp[r] ?? 0) + 1;
  s.composition = comp;
  s.extraCards = [...extraCards];

  const ids = s.players.map((p) => p.id);
  const api = {
    engine,
    ids,
    get now() {
      return now;
    },
    get phase(): PhaseId {
      return engine.state.phase.id;
    },
    view: (i: number) => engine.view(ids[i], now),
    cmd: (i: number, c: ClientCommand) => engine.command(ids[i], c, now),
    act: (i: number, action: string, targets: number[] = [], option?: string) =>
      engine.command(ids[i], { action, targets: targets.map((t) => ids[t]), option }, now),
    /** Avance l'horloge jusqu'à la fin de la phase courante. */
    skip() {
      const d = engine.nextDeadline();
      if (d === null) throw new Error(`Pas de timer en phase ${engine.state.phase.id}`);
      now = d;
      engine.tick(now);
    },
    /** Avance jusqu'à atteindre la phase demandée (en sautant les timers). */
    until(phase: PhaseId, max = 200) {
      for (let i = 0; i < max && engine.state.phase.id !== phase; i++) {
        if (engine.state.status === 'finished') break;
        api.skip();
      }
      if (engine.state.phase.id !== phase) throw new Error(`Phase ${phase} non atteinte (actuelle : ${engine.state.phase.id})`);
    },
    advance(ms: number) {
      now += ms;
      engine.tick(now);
    },
    alive: (i: number) => engine.state.players[i].alive,
    announcements: () => engine.state.announcements.map((a) => a.text),
    privateLog: (i: number) => (engine.state.privateMessages[ids[i]] ?? []).map((m) => m.text),
  };
  return api;
}
