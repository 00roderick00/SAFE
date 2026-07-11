// Shared types used by both the client and Supabase Edge Functions.
// UI-only types (GameNotification, HeistState, MiniGameProps, etc.)
// live in src/types/index.ts and re-export from here.

export type ClassicLockType =
  | 'pattern'
  | 'keypad'
  | 'timing'
  | 'combination'
  | 'sequence'
  | 'slider'
  | 'rotation'
  | 'wire'
  | 'fingerprint'
  | 'morse'
  | 'colorcode'
  | 'safedial';

export type ArcadeGameType =
  | 'pacman'
  | 'spaceinvaders'
  | 'frogger'
  | 'donkeykong'
  | 'centipede'
  | 'asteroids'
  | 'snake'
  | 'breakout'
  | 'tetris'
  | 'galaga'
  | 'digdug'
  | 'qbert';

export type PuzzleGameType =
  | 'quickmath'
  | 'wordscramble'
  | 'memorymatch'
  | 'sudoku'
  | 'jigsaw'
  | 'wordsearch'
  | 'logic'
  | 'maze'
  | 'spotdiff'
  | 'reaction'
  | 'numsequence'
  | 'cipher';

export type ModuleType = ClassicLockType | ArcadeGameType | PuzzleGameType | 'custom';

export interface SecurityModule {
  id: string;
  type: ModuleType;
  difficulty: number;
  weight: number;
  name: string;
  description: string;
  /** Present when this slot is a user-built AI-configured minigame. */
  customGameId?: string;
  /** Snapshot of the engine + config; also fetched from custom_games
   *  at attack time. Cached here so the AttackScreen can render
   *  without an extra round-trip. */
  customConfig?: {
    baseEngine: ModuleType;
    config: unknown;
    mode?: 'engine_config' | 'dsl_program';
  };
}

export interface SecurityLoadout {
  modules: SecurityModule[];
  effectiveScore: number;
}

export interface InsurancePolicy {
  id: string;
  coverage: number;
  premium: number;
  duration: number;
  purchasedAt: number;
  expiresAt: number;
  maxPayout: number;
  claimsRemaining: number;
}

export interface EconomyStats {
  securityScore: number;
  estimatedAttacksPerDay: number;
  estimatedFailIncomePerDay: number;
  estimatedBreachRiskPerDay: number;
  recommendedInsurance: boolean;
  attackFee: number;
  potentialLoot: number;
}

export interface MiniGameResult {
  moduleId: string;
  moduleType: ModuleType | string;
  score: number;
  passed: boolean;
  timeSpent: number;
}

export interface PatternLockConfig {
  gridSize: number;
  requiredLength: number;
  timeLimit: number;
  pattern: number[];
}

export interface KeypadConfig {
  sequenceLength: number;
  displayTime: number;
  shuffleKeys: boolean;
  sequence: string;
}

export interface TimingLockConfig {
  rotationSpeed: number;
  targetZoneSize: number;
  attemptsAllowed: number;
  targetPosition: number;
}

export type MiniGameConfig = PatternLockConfig | KeypadConfig | TimingLockConfig;
