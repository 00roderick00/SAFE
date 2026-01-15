// SAFE Game - Mini-game Module Configuration

import {
  SecurityModule,
  PatternLockConfig,
  KeypadConfig,
  TimingLockConfig,
  MiniGameConfig,
} from '../types';
import { MODULE_CONFIG } from './constants';

/**
 * Linear interpolation helper
 */
function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/**
 * Generate Pattern Lock configuration based on difficulty
 */
export function generatePatternConfig(module: SecurityModule): PatternLockConfig {
  const config = MODULE_CONFIG.pattern;
  const d = module.difficulty;
  const effects = config.difficultyEffects;

  // Grid size increases with difficulty
  const gridSize = Math.round(lerp(effects.gridSizeRange[0], effects.gridSizeRange[1], d));

  // Pattern length increases with difficulty
  const maxLength = gridSize * gridSize;
  const requiredLength = Math.min(
    maxLength - 1,
    Math.round(lerp(effects.lengthRange[0], effects.lengthRange[1], d))
  );

  // Time limit decreases with difficulty
  const timeLimit = Math.round(lerp(effects.timeLimitRange[0], effects.timeLimitRange[1], d));

  // Generate random pattern
  const pattern = generateRandomPattern(gridSize, requiredLength);

  return {
    gridSize,
    requiredLength,
    timeLimit,
    pattern,
  };
}

/**
 * Generate a random pattern for the pattern lock
 */
function generateRandomPattern(gridSize: number, length: number): number[] {
  const pattern: number[] = [];
  const used = new Set<number>();
  const total = gridSize * gridSize;

  // Start with a random cell
  let current = Math.floor(Math.random() * total);
  pattern.push(current);
  used.add(current);

  // Add connected cells
  while (pattern.length < length) {
    const neighbors = getNeighbors(current, gridSize).filter((n) => !used.has(n));

    if (neighbors.length === 0) {
      // If stuck, pick any unused cell
      const unused = Array.from({ length: total }, (_, i) => i).filter((i) => !used.has(i));
      if (unused.length === 0) break;
      current = unused[Math.floor(Math.random() * unused.length)];
    } else {
      current = neighbors[Math.floor(Math.random() * neighbors.length)];
    }

    pattern.push(current);
    used.add(current);
  }

  return pattern;
}

/**
 * Get neighboring cells in the grid
 */
function getNeighbors(index: number, gridSize: number): number[] {
  const row = Math.floor(index / gridSize);
  const col = index % gridSize;
  const neighbors: number[] = [];

  // All 8 directions
  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];

  for (const [dr, dc] of directions) {
    const newRow = row + dr;
    const newCol = col + dc;

    if (newRow >= 0 && newRow < gridSize && newCol >= 0 && newCol < gridSize) {
      neighbors.push(newRow * gridSize + newCol);
    }
  }

  return neighbors;
}

/**
 * Generate Keypad configuration based on difficulty
 */
export function generateKeypadConfig(module: SecurityModule): KeypadConfig {
  const config = MODULE_CONFIG.keypad;
  const d = module.difficulty;
  const effects = config.difficultyEffects;

  // Sequence length increases with difficulty
  const sequenceLength = Math.round(lerp(effects.sequenceRange[0], effects.sequenceRange[1], d));

  // Display time decreases with difficulty
  const displayTime = Math.round(lerp(effects.displayTimeRange[0], effects.displayTimeRange[1], d));

  // Shuffle keys above threshold
  const shuffleKeys = d >= effects.shuffleAtDifficulty;

  // Generate random sequence
  const sequence = generateRandomSequence(sequenceLength);

  return {
    sequenceLength,
    displayTime,
    shuffleKeys,
    sequence,
  };
}

/**
 * Generate a random numeric sequence
 */
function generateRandomSequence(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10).toString()).join('');
}

/**
 * Generate Timing Lock configuration based on difficulty
 */
export function generateTimingConfig(module: SecurityModule): TimingLockConfig {
  const config = MODULE_CONFIG.timing;
  const d = module.difficulty;
  const effects = config.difficultyEffects;

  // Rotation speed increases with difficulty
  const rotationSpeed = Math.round(lerp(effects.speedRange[0], effects.speedRange[1], d));

  // Target zone size decreases with difficulty
  const targetZoneSize = Math.round(lerp(effects.zoneSizeRange[0], effects.zoneSizeRange[1], d));

  // Attempts decrease with difficulty
  const attemptsAllowed = Math.round(lerp(effects.attemptsRange[0], effects.attemptsRange[1], d));

  // Random target position
  const targetPosition = Math.floor(Math.random() * 360);

  return {
    rotationSpeed,
    targetZoneSize,
    attemptsAllowed,
    targetPosition,
  };
}

/**
 * Generate mini-game configuration for a module
 */
export function generateMiniGameConfig(module: SecurityModule): MiniGameConfig {
  switch (module.type) {
    case 'pattern':
      return generatePatternConfig(module);
    case 'keypad':
      return generateKeypadConfig(module);
    case 'timing':
      return generateTimingConfig(module);
    default:
      throw new Error(`Unknown module type: ${module.type}`);
  }
}

/**
 * Calculate score for pattern lock attempt
 * Score based on how many cells were correct and time bonus
 */
export function scorePatternAttempt(
  config: PatternLockConfig,
  userPattern: number[],
  timeSpent: number
): number {
  const correctCells = userPattern.reduce((count, cell, index) => {
    return count + (config.pattern[index] === cell ? 1 : 0);
  }, 0);

  // Base score from correct cells
  const baseScore = correctCells / config.requiredLength;

  // Time bonus (up to 20% extra for speed)
  const timeRatio = Math.max(0, 1 - timeSpent / (config.timeLimit * 1000));
  const timeBonus = timeRatio * 0.2;

  // Perfect match bonus
  const perfectBonus =
    userPattern.length === config.pattern.length &&
    userPattern.every((cell, i) => config.pattern[i] === cell)
      ? 0.1
      : 0;

  return Math.min(1, baseScore + timeBonus + perfectBonus);
}

/**
 * Calculate score for keypad attempt
 */
export function scoreKeypadAttempt(
  config: KeypadConfig,
  userSequence: string,
  timeSpent: number
): number {
  const correctDigits = userSequence.split('').reduce((count, digit, index) => {
    return count + (config.sequence[index] === digit ? 1 : 0);
  }, 0);

  // Base score from correct digits
  const baseScore = correctDigits / config.sequenceLength;

  // Perfect match bonus
  const perfectBonus = userSequence === config.sequence ? 0.15 : 0;

  return Math.min(1, baseScore + perfectBonus);
}

/**
 * Calculate score for timing lock attempt
 */
export function scoreTimingAttempt(
  config: TimingLockConfig,
  hitPosition: number,
  attemptsUsed: number
): number {
  // Calculate distance from target (handle wraparound)
  const distance = Math.min(
    Math.abs(hitPosition - config.targetPosition),
    360 - Math.abs(hitPosition - config.targetPosition)
  );

  // Check if within target zone (zone is centered on target)
  const halfZone = config.targetZoneSize / 2;
  const inZone = distance <= halfZone;

  if (inZone) {
    // Score based on accuracy within zone
    const accuracy = 1 - distance / halfZone;

    // Attempts penalty
    const attemptsPenalty = (attemptsUsed - 1) * 0.1;

    return Math.min(1, Math.max(0, 0.7 + accuracy * 0.3 - attemptsPenalty));
  }

  // Miss - partial score based on proximity
  const proximityScore = Math.max(0, 1 - distance / 180) * 0.4;
  return proximityScore;
}

/**
 * Get module display info
 */
export function getModuleInfo(type: SecurityModule['type']): {
  name: string;
  description: string;
  icon: string;
} {
  const config = MODULE_CONFIG[type];
  const icons = {
    pattern: 'grid-3x3',
    keypad: 'keyboard',
    timing: 'clock',
  };

  return {
    name: config.name,
    description: config.description,
    icon: icons[type],
  };
}
