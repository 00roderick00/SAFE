// Public game naming + internal-ID compatibility (Section 5).
//
// SAFE must not commercially rely on recognizable third-party arcade
// names, characters, or art. The INTERNAL module ids (the MODULE_CONFIG
// keys, saved loadouts, seeds, and the server attack contract) are
// PRESERVED for backward compatibility; only the player-facing
// name/description/emblem were changed to original SAFE-owned concepts.
//
// This module documents the internal→public mapping and is covered by
// gameNaming.test.ts, which asserts the internal ids still exist, the
// public names match MODULE_CONFIG, and no banned third-party term leaks
// into any player-facing name or description.

import { MODULE_CONFIG } from './constants';
import type { ModuleType } from '../types';

export interface GameRename {
  /** Internal module id — unchanged; used by loadouts, seeds, server. */
  id: ModuleType;
  /** Former recognizable name — never shown to players. */
  legacy: string;
  /** Current SAFE-owned public name (matches MODULE_CONFIG[id].name). */
  publicName: string;
}

/** The de-branded arcade roster. Public names are original SAFE concepts. */
export const DEBRANDED_GAMES: GameRename[] = [
  { id: 'pacman', legacy: 'Pac-Man', publicName: 'Grid Runner' },
  { id: 'tetris', legacy: 'Tetris', publicName: 'Stack Breach' },
  { id: 'qbert', legacy: 'Q*bert', publicName: 'Prism Steps' },
  { id: 'galaga', legacy: 'Galaga', publicName: 'Star Intercept' },
  { id: 'digdug', legacy: 'Dig Dug', publicName: 'Tunnel Charge' },
  { id: 'donkeykong', legacy: 'Donkey Kong', publicName: 'Barrel Run' },
  { id: 'spaceinvaders', legacy: 'Space Invaders', publicName: 'Swarm Defense' },
  { id: 'frogger', legacy: 'Frogger', publicName: 'Cross Point' },
  { id: 'centipede', legacy: 'Centipede', publicName: 'Segment Hunt' },
  { id: 'asteroids', legacy: 'Asteroids', publicName: 'Orbital Debris' },
  { id: 'breakout', legacy: 'Breakout', publicName: 'Fracture' },
  { id: 'snake', legacy: 'Snake', publicName: 'Circuit Trail' },
];

/** Substrings that must never appear in a player-facing game name or
 *  description. Case-insensitive. */
export const BANNED_PUBLIC_TERMS = [
  'pac-man', 'pacman', 'tetris', 'q*bert', 'qbert', 'galaga', 'dig dug',
  'digdug', 'donkey kong', 'space invaders', 'frogger', 'centipede',
];

/** Resolve an internal id to its player-facing name (from MODULE_CONFIG). */
export function publicGameName(id: ModuleType | string): string {
  const cfg = MODULE_CONFIG[id as keyof typeof MODULE_CONFIG] as { name?: string } | undefined;
  return cfg?.name ?? 'Custom game';
}
