import { MODULE_CONFIG } from './constants';
import type { ModuleType } from '../types';

export interface MiniGameBrief {
  name: string;
  objective: string;
  passRequirement: string;
  controls: string;
}

const SPECIAL_BRIEFS: Partial<Record<ModuleType, Omit<MiniGameBrief, 'name'>>> = {
  pattern: {
    objective: 'Memorize the lit route, then draw the same route in order.',
    passRequirement: 'Reach a 65% route-match score before time expires.',
    controls: 'Drag through nodes. Mouse, touch, or pointer input supported.',
  },
  tetris: {
    objective: 'Complete horizontal lines before the breach timer expires.',
    passRequirement: 'Clear the line goal shown in the game HUD.',
    controls: 'Arrow keys or the labeled move, rotate, and drop controls.',
  },
  safedial: {
    objective: 'Turn the dial in each shown direction and stop on every number.',
    passRequirement: 'Enter the full combination in order before time expires.',
    controls: 'Use Left/Right arrows or the labeled counterclockwise/clockwise controls.',
  },
};

export function getMiniGameBrief(type: ModuleType): MiniGameBrief {
  const config = MODULE_CONFIG[type as keyof typeof MODULE_CONFIG] as {
    name: string;
    description: string;
    passThreshold?: number;
    category: string;
  };
  const special = SPECIAL_BRIEFS[type];
  if (special) return { name: config.name, ...special };
  const threshold = Math.round((config.passThreshold ?? 0.5) * 100);
  const controls = config.category === 'arcade'
    ? 'Use arrow keys or the labeled on-screen movement controls.'
    : config.category === 'classic'
      ? 'Use the labeled on-screen lock controls; keyboard controls appear when supported.'
      : 'Select or enter the solution with the labeled on-screen controls.';
  return {
    name: config.name,
    objective: config.description.endsWith('.') ? config.description : `${config.description}.`,
    passRequirement: `Reach at least ${threshold}% of the calibrated objective before the timer ends.`,
    controls,
  };
}

export function getModuleDuration(type: ModuleType): number {
  const config = MODULE_CONFIG[type as keyof typeof MODULE_CONFIG] as { duration?: number; defaults?: { timeLimit?: number } };
  return config.duration ?? config.defaults?.timeLimit ?? 15;
}
