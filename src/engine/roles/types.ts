import type { ActionPrompt, ClientCommand, DeathCause, GameSettings, PhaseId, RoleId, SeerResult, Team } from '../../shared/types.ts';
import type { Ctx, PlayerState } from '../state.ts';

/**
 * Définition d'un rôle. Ajouter un rôle = créer un fichier qui appelle
 * `registerRole` (et éventuellement `registerNightStep`), puis l'importer
 * dans `roles/index.ts`. Le moteur n'a pas à être modifié.
 */
export interface RoleDefinition {
  id: RoleId;
  name: string;
  emoji: string;
  team: Team;
  description: string;
  /** Une seule carte de ce rôle au maximum. */
  unique: boolean;
  /** Peut être choisi par l'Hôte et distribué (false pour un titre comme Capitaine). */
  distributable: boolean;
  /** Se réveille avec la meute des Loups (et partage leur canal privé). */
  wolfPack?: boolean;
  /** Réponse renvoyée à la Voyante. */
  seerResult(settings: GameSettings): SeerResult;
  /** Données de rôle initiales (ex. potions). */
  initRoleData?(): Record<string, unknown>;
  /** Informations privées exposées au joueur sur son propre rôle (ex. potions restantes). */
  selfInfo?(ctx: Ctx, player: PlayerState): Record<string, unknown> | null;
  /** Déclenché à la mort du joueur (ex. Chasseur → tir). */
  onDeath?(ctx: Ctx, player: PlayerState, cause: DeathCause): void;
}

/**
 * Étape nocturne. Le PhaseManager enchaîne les étapes par `order`.
 * Une étape est planifiée si un des `roleIds` figure dans la composition ;
 * si aucun acteur n'est vivant, la phase est simulée (durée aléatoire) pour
 * ne pas révéler aux autres joueurs que le rôle est mort ou écarté.
 */
export interface NightStep {
  id: string;
  phase: PhaseId;
  order: number;
  roleIds: RoleId[];
  duration(settings: GameSettings): number;
  /** Planification selon la nuit (ex. Cupidon : nuit 1 seulement). */
  isScheduled(ctx: Ctx): boolean;
  /** Joueurs vivants autorisés à agir pendant cette étape. */
  actors(ctx: Ctx): PlayerState[];
  onStart?(ctx: Ctx): void;
  prompt(ctx: Ctx, actor: PlayerState): ActionPrompt | null;
  /** Valide et applique une commande. Doit lever une GameError si invalide. */
  handle(ctx: Ctx, actor: PlayerState, cmd: ClientCommand): void;
  /** Toutes les actions attendues sont faites : la phase peut se terminer en avance. */
  isComplete(ctx: Ctx): boolean;
  /** Appelé à la fin de la phase (fin normale ou timeout). */
  onEnd?(ctx: Ctx): void;
}
