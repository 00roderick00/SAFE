import { MODULE_CONFIG } from './constants';
import { getModuleDuration } from './minigamePresentation';
import type { ModuleType } from '../types';

export type SkillTag = 'Reflex' | 'Memory' | 'Logic' | 'Precision' | 'Strategy';

const MEMORY = new Set<ModuleType>(['pattern', 'sequence', 'colorcode', 'memorymatch', 'numsequence', 'morse']);
const REFLEX = new Set<ModuleType>(['timing', 'reaction', 'pacman', 'spaceinvaders', 'frogger', 'donkeykong', 'centipede', 'asteroids', 'snake', 'breakout', 'tetris', 'galaga', 'digdug', 'qbert']);
const LOGIC = new Set<ModuleType>(['quickmath', 'sudoku', 'logic', 'cipher', 'wordsearch', 'wordscramble', 'jigsaw', 'maze', 'spotdiff']);
const PRECISION = new Set<ModuleType>(['pattern', 'timing', 'combination', 'slider', 'rotation', 'wire', 'fingerprint', 'safedial']);

export interface CatalogMeta {
  skills: SkillTag[];
  duration: number;
  control: 'Touch / pointer' | 'Touch + keyboard' | 'Keyboard + touch';
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

