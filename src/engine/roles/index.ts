/**
 * Point d'entrée du système de rôles : importer un fichier suffit à
 * enregistrer le rôle et ses étapes nocturnes.
 */
import './villager.ts';
import './werewolf.ts';
import './whiteWolf.ts';
import './blackWolf.ts';
import './seer.ts';
import './witch.ts';
import './cupid.ts';
import './thief.ts';
import './hunter.ts';
import './salvateur.ts';
import './captain.ts';

export * from './registry.ts';
export type * from './types.ts';
