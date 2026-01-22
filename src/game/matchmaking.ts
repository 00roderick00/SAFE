// SAFE Game - Matchmaking & Bot Safe Generation
// Now with AI-driven bot strategies

import { BotSafe, SecurityModule, SecurityLoadout, ModuleType } from '../types';
import { BOT_NAMES, ECONOMY, MODULE_CONFIG } from './constants';
import {
  calculateSecurityScore,
  calculateAttackFee,
  calculateLoot,
  calculateSuccessProbability,
  getDifficultyBand,
  getLootRange,
  getSuccessChanceLabel,
} from './economy';
import { aiBotService } from '../services/aiBotService';

/**
 * Generate a random ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Generate a random security module
 */
function generateModule(type: ModuleType, difficulty: number): SecurityModule {
  const config = MODULE_CONFIG[type];
  return {
    id: generateId(),
    type,
    difficulty: Math.max(0, Math.min(1, difficulty)),
    weight: config.baseWeight,
    name: config.name,
    description: config.description,
  };
}

// All available module types for varied loadouts
const ALL_MODULE_TYPES: ModuleType[] = [
  // Classic
  'pattern', 'keypad', 'timing', 'combination', 'sequence', 'slider',
  'rotation', 'wire', 'fingerprint', 'morse', 'colorcode', 'safedial',
  // Arcade
  'pacman', 'spaceinvaders', 'frogger', 'donkeykong', 'centipede', 'asteroids',
  'snake', 'breakout', 'tetris', 'galaga', 'digdug', 'qbert',
  // Puzzle
  'quickmath', 'wordscramble', 'memorymatch', 'sudoku', 'jigsaw', 'wordsearch',
  'logic', 'maze', 'spotdiff', 'reaction', 'numsequence', 'cipher',
];

/**
 * Generate a security loadout with given average difficulty
 * Now uses varied module types from all categories
 */
function generateLoadout(targetDifficulty: number, preferredTypes?: ModuleType[]): SecurityLoadout {
  let selectedTypes: ModuleType[];

  if (preferredTypes && preferredTypes.length >= 3) {
    selectedTypes = preferredTypes.slice(0, ECONOMY.maxModules);
  } else {
    // Pick random varied modules from all types
    const shuffled = [...ALL_MODULE_TYPES].sort(() => Math.random() - 0.5);
    selectedTypes = shuffled.slice(0, ECONOMY.maxModules);
  }

  // Generate modules with some variance around target difficulty
  const modules = selectedTypes.map((type) => {
    const variance = (Math.random() - 0.5) * 0.3;
    const moduleDifficulty = Math.max(0, Math.min(1, targetDifficulty + variance));
    return generateModule(type, moduleDifficulty);
  });

  const loadout: SecurityLoadout = {
    modules,
    effectiveScore: 0,
  };

  loadout.effectiveScore = calculateSecurityScore(loadout);
  return loadout;
}

/**
 * Generate a bot safe for the target feed
 */
export function generateBotSafe(
  playerRating: number,
  difficultyBias: 'easy' | 'mixed' | 'hard' = 'mixed'
): BotSafe {
  // Pick a random bot name
  const ownerName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];

  // Generate safe value (varied distribution)
  const baseValue = 200 + Math.random() * 3000;
  const valueMultiplier = difficultyBias === 'hard' ? 1.5 : difficultyBias === 'easy' ? 0.7 : 1;
  const safeBalance = Math.round(baseValue * valueMultiplier);

  // Generate difficulty based on bias and player rating
  let targetDifficulty: number;
  switch (difficultyBias) {
    case 'easy':
      targetDifficulty = 0.2 + Math.random() * 0.3;
      break;
    case 'hard':
      targetDifficulty = 0.6 + Math.random() * 0.4;
      break;
    default:
      targetDifficulty = 0.3 + Math.random() * 0.5;
  }

  const loadout = generateLoadout(targetDifficulty);
  const securityScore = loadout.effectiveScore;

  const attackFee = calculateAttackFee(safeBalance, securityScore);
  const successProb = calculateSuccessProbability(playerRating, securityScore);

  return {
    id: generateId(),
    ownerName,
    safeBalance,
    securityScore,
    securityLoadout: loadout,
    difficultyBand: getDifficultyBand(securityScore),
    lootRange: getLootRange(safeBalance),
    attackFee,
    successChance: getSuccessChanceLabel(successProb),
    lastAttackedAt: null,
    attackCooldownUntil: null,
  };
}

/**
 * Generate a feed of bot safes using AI-driven strategies
 */
export function generateBotFeed(
  playerRating: number,
  count: number = 10
): BotSafe[] {
  const safes: BotSafe[] = [];

  // Use AI service for most bots (sync version with local heuristics)
  for (let i = 0; i < count; i++) {
    // Get AI strategy (using local heuristics - fast, no API needed)
    const strategy = aiBotService.generateLocalStrategy(playerRating);
    const bot = aiBotService.createBotFromStrategy(strategy, playerRating);
    safes.push(bot);
  }

  // Sort by Target Attractiveness Score
  return safes.sort((a, b) => calculateTAS(b, playerRating) - calculateTAS(a, playerRating));
}

/**
 * Generate a feed of bot safes using async AI API (when configured)
 * Falls back to local generation if API unavailable
 */
export async function generateAIBotFeed(
  playerRating: number,
  count: number = 10,
  context?: { recentAttacks?: string[]; playerLoadout?: ModuleType[] }
): Promise<BotSafe[]> {
  try {
    return await aiBotService.generateAIBotFeed(playerRating, count, context);
  } catch (error) {
    console.warn('AI bot feed generation failed, using fallback:', error);
    return generateBotFeed(playerRating, count);
  }
}

/**
 * Calculate Target Attractiveness Score (TAS)
 * TAS = α1*ValueSignal + α2*EaseSignal + α3*Freshness + α4*VarietyPenalty + α5*FairnessTerm
 */
export function calculateTAS(
  safe: BotSafe,
  attackerRating: number,
  recentlyAttacked: string[] = []
): number {
  const { matchmaking } = ECONOMY;

  // Value signal: log(1 + V)
  const valueSignal = Math.log(1 + safe.safeBalance) / Math.log(1 + 5000); // normalized

  // Ease signal: success probability
  const successProb = calculateSuccessProbability(attackerRating, safe.securityScore);
  const easeSignal = successProb;

  // Freshness: boost if not recently attacked
  const isRecent = safe.lastAttackedAt && Date.now() - safe.lastAttackedAt < 30 * 60 * 1000;
  const freshnessSignal = isRecent ? 0.5 : 1;

  // Variety penalty: penalize if recently attacked by this player
  const varietyPenalty = recentlyAttacked.includes(safe.id) ? 0.3 : 1;

  // Fairness: boost if within MMR band (±200)
  const ratingDiff = Math.abs(attackerRating - 1000); // bot rating assumed 1000
  const fairnessSignal = ratingDiff < 200 ? 1 : 0.7;

  return (
    matchmaking.valueWeight * valueSignal +
    matchmaking.easeWeight * easeSignal +
    matchmaking.freshnessWeight * freshnessSignal +
    matchmaking.fairnessWeight * fairnessSignal -
    matchmaking.varietyPenalty * (1 - varietyPenalty)
  );
}

/**
 * Check if a safe can be attacked (cooldown check)
 */
export function canAttackSafe(safe: BotSafe): boolean {
  if (!safe.attackCooldownUntil) return true;
  return Date.now() > safe.attackCooldownUntil;
}

/**
 * Generate a tutorial/practice bot safe (guaranteed easy)
 */
export function generatePracticeSafe(): BotSafe {
  const loadout = generateLoadout(0.1); // very easy

  return {
    id: 'practice-safe',
    ownerName: 'TrainingSafe',
    safeBalance: 500,
    securityScore: loadout.effectiveScore,
    securityLoadout: loadout,
    difficultyBand: 'soft',
    lootRange: 'small',
    attackFee: 0, // free practice
    successChance: 'high',
    lastAttackedAt: null,
    attackCooldownUntil: null,
  };
}
