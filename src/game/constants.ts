// SAFE Game - Tunable Economy Parameters
// All values can be adjusted for balancing

export const ECONOMY = {
  // Loot and fees
  lootFraction: 0.25, // ℓ - max 25% loss per breach
  lootCap: 10000, // Maximum tokens that can be looted in one heist
  platformCut: 0.10, // t - 10% of loot goes to platform
  platformCutFail: 0.00, // t_fail - 0% of failed fees (keep low for encouragement)

  // Fee calculation: F = sqrt(V) * (a + b/(1+S))
  feeParams: {
    a: 0.8, // baseline fee multiplier
    b: 1.6, // ease bonus multiplier
  },
  feeMin: 10, // minimum attack stake
  feeMax: 5000, // maximum attack stake
  feeMaxPercentOfBalance: 0.5, // can't stake more than 50% of balance

  // Heist mode
  heistDuration: 10 * 60, // 10 minutes in seconds
  heistMinActivity: 60, // must spend 60 seconds or complete 1 attempt to exit

  // Security
  maxModules: 3, // security slots available
  maxSecurityScore: 100, // S capped at 100

  // Breach calculation
  breachThreshold: 0.65, // θ - weighted score needed to breach
  successRateMin: 0.01, // minimum success probability
  successRateMax: 0.99, // maximum success probability
  skillCurveSharpness: 10, // τ - controls logistic curve sharpness

  // Insurance
  insurance: {
    coverage: 0.7, // 70% reimbursement
    margin: 0.2, // 20% margin on expected loss
    fixedFee: 5, // small fixed premium
    maxCoverage: 0.8, // can't insure more than 80%
    securityDiscount: 0.2, // 20% discount for high security
  },

  // Anti-abuse
  samTargetCooldown: 60 * 60, // 1 hour cooldown for same target
  maxAttacksPerTarget: 3, // per day
  diminishingReturnsThreshold: 3, // rewards decrease after this many attacks on same target

  // Matchmaking weights for Target Attractiveness Score
  matchmaking: {
    valueWeight: 0.3,
    easeWeight: 0.25,
    freshnessWeight: 0.2,
    varietyPenalty: 0.15,
    fairnessWeight: 0.1,
  },

  // Principal floor - prevent total wipeout
  principalFloor: 100, // minimum safe balance after breach

  // Starting values
  startingBalance: 1000,
  startingRiskRating: 1000, // MMR starting point
} as const;

// Security module configuration
export const MODULE_CONFIG = {
  pattern: {
    name: 'Pattern Lock',
    description: 'Draw the correct pattern to unlock',
    baseWeight: 1.0,
    hardnessConstant: 2.5, // k_j for exponential difficulty
    defaults: {
      gridSize: 3,
      requiredLength: 4,
      timeLimit: 15,
    },
    difficultyEffects: {
      // How difficulty affects parameters
      gridSizeRange: [3, 5],
      lengthRange: [4, 9],
      timeLimitRange: [20, 8], // decreases with difficulty
    },
  },
  keypad: {
    name: 'Keypad Code',
    description: 'Memorize and enter the code sequence',
    baseWeight: 1.0,
    hardnessConstant: 2.2,
    defaults: {
      sequenceLength: 4,
      displayTime: 2000,
      shuffleKeys: false,
    },
    difficultyEffects: {
      sequenceRange: [4, 8],
      displayTimeRange: [3000, 800], // decreases with difficulty
      shuffleAtDifficulty: 0.5, // shuffle keys above this difficulty
    },
  },
  timing: {
    name: 'Timing Lock',
    description: 'Stop the dial in the target zone',
    baseWeight: 1.0,
    hardnessConstant: 2.0,
    defaults: {
      rotationSpeed: 180, // degrees per second
      targetZoneSize: 60, // degrees
      attemptsAllowed: 3,
    },
    difficultyEffects: {
      speedRange: [120, 360],
      zoneSizeRange: [90, 20], // decreases with difficulty
      attemptsRange: [3, 1],
    },
  },
} as const;

// Insurance plan presets
export const INSURANCE_PLANS = [
  {
    id: 'hour',
    name: '1 Hour',
    duration: 60 * 60, // 1 hour
    coverage: 0.7,
    basePremium: 50,
  },
  {
    id: 'sixhour',
    name: '6 Hours',
    duration: 6 * 60 * 60,
    coverage: 0.7,
    basePremium: 200,
  },
  {
    id: 'day',
    name: '24 Hours',
    duration: 24 * 60 * 60,
    coverage: 0.7,
    basePremium: 500,
  },
] as const;

// Bot safe name generators
export const BOT_NAMES = [
  'CryptoVault', 'ShadowKeeper', 'NightOwl', 'SteelGuard', 'IronFist',
  'GhostLock', 'CyberShield', 'QuantumSafe', 'NeonVault', 'DataFortress',
  'BitLocker', 'ChainGuard', 'MatrixSafe', 'PhantomBox', 'TechVault',
  'SecureNode', 'FireWall', 'HexLock', 'ByteGuard', 'PixelSafe',
];

// Difficulty band thresholds
export const DIFFICULTY_BANDS = {
  soft: { min: 0, max: 33 },
  tricky: { min: 34, max: 66 },
  brutal: { min: 67, max: 100 },
} as const;

// Loot range thresholds
export const LOOT_RANGES = {
  small: { min: 0, max: 500 },
  moderate: { min: 501, max: 2000 },
  rich: { min: 2001, max: Infinity },
} as const;

// Success chance thresholds
export const SUCCESS_CHANCES = {
  low: { min: 0, max: 0.3 },
  medium: { min: 0.3, max: 0.6 },
  high: { min: 0.6, max: 1 },
} as const;
