import type { RoleId, RoleInfo } from '../../shared/types.ts';
import { fail } from '../errors.ts';
import type { Ctx, GameState, PlayerState } from '../state.ts';
import type { NightStep, RoleDefinition } from './types.ts';

const roles = new Map<RoleId, RoleDefinition>();
const steps: NightStep[] = [];

export function registerRole(def: RoleDefinition): void {
  if (roles.has(def.id)) throw new Error(`Rôle déjà enregistré : ${def.id}`);
  roles.set(def.id, def);
}

export function registerNightStep(step: NightStep): void {
  if (steps.some((s) => s.id === step.id)) throw new Error(`Étape déjà enregistrée : ${step.id}`);
  steps.push(step);
  steps.sort((a, b) => a.order - b.order);
}

export function getRole(id: RoleId | null | undefined): RoleDefinition | undefined {
  return id ? roles.get(id) : undefined;
}

export function requireRole(id: RoleId): RoleDefinition {
  const r = roles.get(id);
  if (!r) throw new Error(`Rôle inconnu : ${id}`);
  return r;
}

export function allRoles(): RoleDefinition[] {
  return [...roles.values()];
}

export function nightSteps(): readonly NightStep[] {
  return steps;
}

export function getNightStep(id: string): NightStep | undefined {
  return steps.find((s) => s.id === id);
}

export function roleInfo(def: RoleDefinition): RoleInfo {
  return {
    id: def.id,
    name: def.name,
    emoji: def.emoji,
    team: def.team,
    description: def.description,
    unique: def.unique,
    distributable: def.distributable,
  };
}

// ---------- Aides communes aux rôles ----------

export function isWolfPack(p: PlayerState): boolean {
  return !!getRole(p.role)?.wolfPack;
}

export function playersWithRole(state: GameState, roleId: RoleId, aliveOnly = true): PlayerState[] {
  return state.players.filter((p) => p.role === roleId && (!aliveOnly || p.alive));
}

/** Données privées de l'étape pour la nuit en cours. */
export function stepData<T extends Record<string, unknown>>(ctx: Ctx, stepId: string, init: () => T): T {
  const night = ctx.state.night;
  if (!night) throw new Error('Pas de nuit en cours');
  return (night.stepData[stepId] ??= init()) as T;
}

/** Vérifie qu'une liste de cibles est valide pour un prompt donné. */
export function validateTargets(targets: unknown, allowed: string[], min: number, max: number): string[] {
  if (targets === undefined) targets = [];
  if (!Array.isArray(targets)) fail('BAD_TARGET', 'Cibles invalides.');
  const list = targets as unknown[];
  if (list.length < min || list.length > max) fail('BAD_TARGET', 'Nombre de cibles invalide.');
  const seen = new Set<string>();
  for (const t of list) {
    if (typeof t !== 'string' || !allowed.includes(t)) fail('BAD_TARGET', 'Cible non autorisée.');
    if (seen.has(t)) fail('BAD_TARGET', 'Cible en double.');
    seen.add(t);
  }
  return list as string[];
}
