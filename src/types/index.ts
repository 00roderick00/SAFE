// Core game types for SAFE

export type ModuleType = 'pattern' | 'keypad' | 'timing';

export interface SecurityModule {
  id: string;
  type: ModuleType;
  difficulty: number; // 0-1 continuous
  weight: number; // relative importance
  name: string;
  description: string;
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
  lastActiveAt: number;
  onboardingCompleted: boolean;
}

export interface BotSafe {
  id: string;
  ownerName: string;
  safeBalance: number;
  securityScore: number;
  securityLoadout: SecurityLoadout;
  difficultyBand: 'soft' | 'tricky' | 'brutal';
  lootRange: 'small' | 'moderate' | 'rich';
  attackFee: number;
  successChance: 'low' | 'medium' | 'high';
  lastAttackedAt: number | null;
  attackCooldownUntil: number | null;
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

export interface MiniGameResult {
  moduleId: string;
  moduleType: ModuleType;
  score: number; // 0-1
  passed: boolean;
  timeSpent: number; // ms
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
