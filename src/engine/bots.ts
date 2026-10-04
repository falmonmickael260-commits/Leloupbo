/**
 * Bots de test. Ils ne voient QUE leur propre vue (comme un humain) et passent
 * par exactement la même validation serveur : ils servent à tester une partie
 * complète seul, et à vérifier qu'aucune information secrète n'est nécessaire.
 */
import type { ClientCommand, PlayerView } from '../shared/types.ts';
import { shuffle, type Rng } from './rng.ts';

export function decideBotCommand(view: PlayerView, rng: Rng): ClientCommand | null {
  if (view.status !== 'running') return null;
  if (view.phase.canFinish) return { action: 'finish' };
  const prompt = view.prompt;
  if (!prompt) return null;
  if (prompt.submitted && (!prompt.canChange || prompt.action === 'vote' || prompt.action === 'wolf_vote')) {
    // Les loups s'alignent sur le premier choix de la meute pour conclure vite.
    if (prompt.action !== 'wolf_vote') return null;
    const votes = (prompt.info?.packVotes as { targetId: string | null }[]) ?? [];
    const first = votes.find((v) => v.targetId)?.targetId;
    if (first && prompt.current?.[0] !== first && prompt.targets.includes(first)) return { action: 'wolf_vote', targets: [first] };
    return null;
  }

  const myself = view.me.id;
  const pack = new Set((view.me.pack ?? []).map((p) => p.id));
  let pool = prompt.targets.filter((t) => t !== myself);
  // Un loup évite de voter contre sa meute le jour.
  if (prompt.action === 'vote' && pack.size) {
    const nonPack = pool.filter((t) => !pack.has(t));
    if (nonPack.length) pool = nonPack;
  }
  if (pool.length === 0) pool = prompt.targets;

  switch (prompt.action) {
    case 'wolf_vote': {
      const votes = (prompt.info?.packVotes as { targetId: string | null }[]) ?? [];
      const first = votes.find((v) => v.targetId && prompt.targets.includes(v.targetId))?.targetId;
      // Bot Loup Noir : il tue (il garde son infection).
      const kill = prompt.options?.some((o) => o.id === 'kill') ? { option: 'kill' } : {};
      return { action: 'wolf_vote', targets: [first ?? shuffle(pool, rng)[0]], ...kill };
    }
    case 'witch': {
      const opts = prompt.options?.map((o) => o.id) ?? ['none'];
      const r = rng.int(10);
      if (opts.includes('save') && r < 5) return { action: 'witch', option: 'save' };
      if (opts.includes('kill') && r >= 8 && pool.length) return { action: 'witch', option: 'kill', targets: [shuffle(pool, rng)[0]] };
      return { action: 'witch', option: 'none' };
    }
    case 'thief': {
      const opts = prompt.options?.map((o) => o.id) ?? [];
      return { action: 'thief', option: shuffle(opts, rng)[0] };
    }
    case 'white_wolf':
    case 'hunter_shot':
      if (pool.length === 0 || rng.int(4) === 0) return { action: prompt.action, targets: [] };
      return { action: prompt.action, targets: [shuffle(pool, rng)[0]] };
    default: {
      const n = Math.max(prompt.minTargets, Math.min(1, prompt.maxTargets));
      const source = prompt.minTargets >= 2 ? prompt.targets : pool;
      return { action: prompt.action, targets: shuffle(source, rng).slice(0, n) };
    }
  }
}
