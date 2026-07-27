import { MODULE_CONFIG } from './constants';
import { getModuleDuration } from './minigamePresentation';
import type { ModuleType } from '../types';

export type SkillTag = 'Reflex' | 'Memory' | 'Logic' | 'Precision' | 'Strategy';

const MEMORY = new Set<ModuleType>(['pattern', 'sequence', 'colorcode', 'memorymatch', 'numsequence', 'morse']);
const REFLEX = new Set<ModuleType>(['timing', 'reaction', 'pacman', 'spaceinvaders', 'frogger', 'donkeykong', 'centipede', 'asteroids', 'snake', 'breakout', 'tetris', 'galaga', 'digdug', 'qbert']);
const LOGIC = new Set<ModuleType>(['quickmath', 'sudoku', 'logic', 'cipher', 'wordsearch', 'wordscramble', 'jigsaw', 'maze', 'spotdiff', 'chesspuzzle']);
const PRECISION = new Set<ModuleType>(['pattern', 'timing', 'combination', 'slider', 'rotation', 'wire', 'fingerprint', 'safedial']);

export interface CatalogMeta {
  skills: SkillTag[];
  duration: number;
  control: 'Touch / pointer' | 'Touch + keyboard' | 'Keyboard + touch';
}

// Launch roster (Section 4). A curated, launch-quality set spanning
// different skills. This is an honest curation status — NOT fabricated
// calibration/performance data — surfaced as a player-facing badge in
// place of the misleading "Calibration pending" on every built-in.
export const FEATURED_GAMES = new Set<ModuleType>([
  'pattern',  // Precision / memory reference quality
  'safedial', // Precision reference quality
  'timing',   // Reflex / precision
  'wire',     // Logic routing
  'maze',     // Logic navigation
  'cipher',   // Logic decoding
  'tetris',   // Stack Breach — stack-based arcade reference quality
  'reaction', // original reflex game
  'chesspuzzle', // Checkmate — tactile tap-tap, forced-mate skill, server-verified
]);

export type GameStatus = 'featured' | 'experimental';

/** Player-facing curation status for a built-in game. */
export function getGameStatus(type: ModuleType): { status: GameStatus; label: string } {
  const featured = FEATURED_GAMES.has(type);
  return { status: featured ? 'featured' : 'experimental', label: featured ? 'Featured' : 'Experimental' };
}

export function isFeatured(type: ModuleType): boolean {
  return FEATURED_GAMES.has(type);
}

// Animated-thumbnail motif (Section 6). Each game maps to one of five
// mechanic families so its catalog card can show a looping micro-animation
// that hints at how it actually plays — a dial sweep, a grid runner, a
// falling stack, a routed path, or a projectile burst.
export type GameMotif = 'dial' | 'grid' | 'stack' | 'burst' | 'path';

const MOTIF_DIAL = new Set<ModuleType>(['timing', 'safedial', 'rotation', 'reaction', 'morse', 'slider']);
const MOTIF_STACK = new Set<ModuleType>(['tetris', 'breakout', 'donkeykong', 'jigsaw']);
const MOTIF_BURST = new Set<ModuleType>(['spaceinvaders', 'asteroids', 'galaga']);
const MOTIF_GRID = new Set<ModuleType>(['maze', 'snake', 'pacman', 'frogger', 'digdug', 'qbert', 'centipede', 'sudoku', 'wordsearch', 'spotdiff', 'memorymatch', 'chesspuzzle']);

/** Mechanic family a game's animated thumbnail should depict. Anything not
 *  in an explicit set (wires, patterns, ciphers, sequences…) reads as a
 *  routed "path". */
export function getGameMotif(type: ModuleType | string): GameMotif {
  const t = type as ModuleType;
  if (MOTIF_DIAL.has(t)) return 'dial';
  if (MOTIF_STACK.has(t)) return 'stack';
  if (MOTIF_BURST.has(t)) return 'burst';
  if (MOTIF_GRID.has(t)) return 'grid';
  return 'path';
}

export function getCatalogMeta(type: ModuleType): CatalogMeta {
  const skills: SkillTag[] = [];
  if (REFLEX.has(type)) skills.push('Reflex');
  if (MEMORY.has(type)) skills.push('Memory');
  if (LOGIC.has(type)) skills.push('Logic');
  if (PRECISION.has(type)) skills.push('Precision');
  if (skills.length < 2) skills.push('Strategy');
  const category = MODULE_CONFIG[type as keyof typeof MODULE_CONFIG].category;
  return {
    skills: [...new Set(skills)].slice(0, 2),
    duration: getModuleDuration(type),
    control: category === 'arcade' ? 'Keyboard + touch' : category === 'classic' ? 'Touch / pointer' : 'Touch + keyboard',
  };
}

export function getDefenseMix(types: ModuleType[]) {
  const skillCounts = new Map<SkillTag, number>();
  for (const type of types) for (const skill of getCatalogMeta(type).skills) skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1);
  const covered = [...skillCounts.keys()];
  const all: SkillTag[] = ['Reflex', 'Memory', 'Logic', 'Precision', 'Strategy'];
  return { covered, gaps: all.filter((skill) => !skillCounts.has(skill)) };
}

