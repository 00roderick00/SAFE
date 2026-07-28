// Core game types for SAFE

// Classic Locks (12)
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

// Arcade Games (12)
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

// Puzzles (12)
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
  | 'cipher'
  | 'chesspuzzle';

export type ModuleType = ClassicLockType | ArcadeGameType | PuzzleGameType | 'custom';

export interface SecurityModule {
  id: string;
  type: ModuleType;
  difficulty: number; // 0-1 continuous
  weight: number; // relative importance
  name: string;
  description: string;
  /** Present when this slot is a user-built AI-configured minigame.
   *  See supabase/functions/_shared/types.ts for the canonical
   *  definition; kept in sync manually. */
  customGameId?: string;
  customConfig?: {
    baseEngine: ModuleType;
    config: unknown;
    mode?: 'engine_config' | 'dsl_program';
  };
}

export interface SecurityLoadout {
  modules: SecurityModule[];
  effectiveScore: number; // computed S value
}

export interface InsurancePolicy {
  id: string;
  coverage: number; // 0-1, percentage of losses covered
  premium: number; // cost paid
  duration: number; // in seconds
  purchasedAt: number; // timestamp
  expiresAt: number; // timestamp
  maxPayout: number;
  claimsRemaining: number;
}

export interface PlayerState {
  id: string;
  username: string;
  safeBalance: number;
  securityLoadout: SecurityLoadout;
  insurancePolicy: InsurancePolicy | null;
  riskRating: number; // MMR-like score
  heistModeActive: boolean;
  heistModeExpiresAt: number | null;
  totalEarnings: number;
  totalLosses: number;
  successfulDefenses: number;
  successfulHeists: number;
  /** Settled heists as attacker (win/loss/abandon) — drives the
   *  progressive-disclosure unlock tier. Hydrated from the server's
   *  attack rows on every session; local increments are instant UI. */
  completedHeists: number;
  /** Highest unlock tier already announced to this player, so tier
   *  jumps from hydration (grandfathering) don't replay announcements. */
  lastAnnouncedTier: number;
  lastActiveAt: number;
  onboardingCompleted: boolean;
}

// Bot personality types for AI-driven bots
export type BotPersonality =
  | 'aggressive'
  | 'defensive'
  | 'balanced'
  | 'trickster'
  | 'minimalist'
  | 'arcade_master'
  | 'puzzle_expert'
  | 'chaos'
  | 'meta_gamer';

export interface BotSafe {
  id: string;
  ownerName: string;
  safeBalance: number;
  securityScore: number;
  securityLoadout: SecurityLoadout;
  difficultyBand: 'soft' | 'tricky' | 'brutal';
  lootRange: 'small' | 'moderate' | 'rich';
  attackFee: number;
  lastAttackedAt: number | null;
  attackCooldownUntil: number | null;
  // AI bot properties
  personality?: BotPersonality;
  tagline?: string;
  /** Presentation-only provenance from list_targets; economy treats ids as opaque. */
  isBotTarget?: boolean;
  /** Set on searched targets whose safe has no server-verifiable lock:
   *  the composition rule would force any attack to a loss, so the card
   *  is shown but not attackable. Presentation only. */
  unattackableReason?: 'no_verifiable_lock';
}

export interface AttackResult {
  id: string;
  timestamp: number;
  targetId: string;
  targetName: string;
  success: boolean;
  moduleScores: { moduleId: string; score: number; passed: boolean }[];
  totalScore: number;
  threshold: number;
  stakePaid: number;
  lootGained: number;
  platformFee: number;
}

export interface DefenseEvent {
  id: string;
  timestamp: number;
  attackerName: string;
  success: boolean;
  moduleResults: { moduleId: string; attackerScore: number; defended: boolean }[];
  feeEarned: number;
  lootLost: number;
  insurancePayout: number;
}

export interface GameHistory {
  attacks: AttackResult[];
  defenses: DefenseEvent[];
}

// Mini-game specific types
export interface PatternLockConfig {
  gridSize: number; // 3, 4, or 5
  requiredLength: number;
  timeLimit: number; // seconds
  pattern: number[]; // indices of pattern
}

export interface KeypadConfig {
  sequenceLength: number; // 4-8
  displayTime: number; // ms
  shuffleKeys: boolean;
  sequence: string;
}

export interface TimingLockConfig {
  rotationSpeed: number; // degrees per second
  targetZoneSize: number; // degrees
  attemptsAllowed: number;
  targetPosition: number; // starting degree
}

export type MiniGameConfig = PatternLockConfig | KeypadConfig | TimingLockConfig;

/**
 * Unified minigame contract. Every minigame component accepts these
 * props and reports the result via onComplete.
 *
 * - `seed`: server-issued RNG seed (Phase 2). Today's engines may
 *   ignore it; deterministic replay uses it in the future.
 * - `config`: optional AI-generated tunable config (Phase 3A). When
 *   present, the engine consumes fields it recognises (grid size,
 *   speed, timers, etc.) and falls back to difficulty-driven
 *   defaults for anything missing. AI output is DATA — the engine
 *   never executes any of it as code.
 */
export interface MiniGameProps {
  difficulty: number;
  seed: string;
  config?: unknown;
  onComplete: (result: MiniGameResult) => void;
}

export interface MiniGameResult {
  moduleId: string;
  moduleType: ModuleType | string; // string allows custom game types
  score: number; // 0-1
  passed: boolean;
  timeSpent: number; // ms
  /** Ordered per-tick player directions for DSL games. Sent to the
   *  server so it can deterministically REPLAY the run from the issued
   *  seed and verify the win itself (see _shared/verify.ts). Absent for
   *  non-DSL games. */
  inputTrace?: ('up' | 'down' | 'left' | 'right' | 'idle')[];
  /** Player's actual answer for a seed-answer lock (keypad/colorcode/
   *  combination: digit string or int array) or a chess puzzle (array
   *  of UCI moves). The server recomputes the seed-derived secret /
   *  replays the moves and compares — client passed/score is not
   *  trusted for these. */
  answer?: string | number[] | string[];
}

// Insurance plan options
export interface InsurancePlan {
  id: string;
  name: string;
  duration: number; // seconds
  coverage: number; // 0-1
  basePremium: number;
}

// Economy calculation results
export interface EconomyStats {
  securityScore: number;
  estimatedAttacksPerDay: number;
  estimatedFailIncomePerDay: number;
  estimatedBreachRiskPerDay: number;
  recommendedInsurance: boolean;
  attackFee: number;
  potentialLoot: number;
}

// Heist mode state
export interface HeistState {
  active: boolean;
  startedAt: number | null;
  expiresAt: number | null;
  currentTarget: BotSafe | null;
  currentAttack: {
    moduleIndex: number;
    results: MiniGameResult[];
  } | null;
}

// Notification types
export interface GameNotification {
  id: string;
  type: 'attack_success' | 'attack_fail' | 'defense_success' | 'defense_fail' | 'insurance_expired' | 'heist_ended';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  data?: Record<string, unknown>;
}
