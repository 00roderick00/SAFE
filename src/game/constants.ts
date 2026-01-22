// SAFE Game - Tunable Economy Parameters
// All values can be adjusted for balancing

export const ECONOMY = {
  // Loot and fees
  // Increased loot to reward successful all-or-nothing heists
  lootFraction: 0.30, // ℓ - max 30% loss per breach (was 25%)
  lootCap: 15000, // Maximum tokens that can be looted in one heist (was 10000)
  platformCut: 0.08, // t - 8% of loot goes to platform (was 10%)
  platformCutFail: 0.00, // t_fail - 0% of failed fees (keep low for encouragement)

  // Fee calculation: F = sqrt(V) * (a + b/(1+S))
  // Reduced fees to compensate for all-or-nothing lock system
  feeParams: {
    a: 0.5, // baseline fee multiplier (was 0.8)
    b: 1.0, // ease bonus multiplier (was 1.6)
  },
  feeMin: 5, // minimum attack stake (was 10)
  feeMax: 3000, // maximum attack stake (was 5000)
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

// Security module configuration - 36 total (12 classic, 12 arcade, 12 puzzle)
export const MODULE_CONFIG = {
  // ============================================
  // CLASSIC LOCKS (12)
  // ============================================
  pattern: {
    name: 'Pattern Lock',
    description: 'Draw the correct pattern',
    icon: '🔲',
    category: 'classic',
    baseWeight: 1.0,
    hardnessConstant: 2.5,
    defaults: {
      gridSize: 3,
      requiredLength: 4,
      timeLimit: 15,
    },
    difficultyEffects: {
      gridSizeRange: [3, 5],
      lengthRange: [4, 9],
      timeLimitRange: [20, 8],
    },
  },
  keypad: {
    name: 'Keypad',
    description: 'Enter the code sequence',
    icon: '🔢',
    category: 'classic',
    baseWeight: 1.0,
    hardnessConstant: 2.2,
    defaults: {
      sequenceLength: 4,
      displayTime: 2000,
      shuffleKeys: false,
    },
    difficultyEffects: {
      sequenceRange: [4, 8],
      displayTimeRange: [3000, 800],
      shuffleAtDifficulty: 0.5,
    },
  },
  timing: {
    name: 'Timing Lock',
    description: 'Stop in the target zone',
    icon: '⏱️',
    category: 'classic',
    baseWeight: 1.0,
    hardnessConstant: 2.0,
    defaults: {
      rotationSpeed: 180,
      targetZoneSize: 60,
      attemptsAllowed: 3,
    },
    difficultyEffects: {
      speedRange: [120, 360],
      zoneSizeRange: [90, 20],
      attemptsRange: [3, 1],
    },
  },
  combination: {
    name: 'Combo Dial',
    description: 'Spin left-right-left',
    icon: '🎯',
    category: 'classic',
    baseWeight: 1.1,
    hardnessConstant: 2.3,
    duration: 20,
    passThreshold: 0.5,
  },
  sequence: {
    name: 'Sequence',
    description: 'Remember the order',
    icon: '📊',
    category: 'classic',
    baseWeight: 1.0,
    hardnessConstant: 2.2,
    duration: 15,
    passThreshold: 0.5,
  },
  slider: {
    name: 'Slider',
    description: 'Slide to unlock',
    icon: '🎚️',
    category: 'classic',
    baseWeight: 0.9,
    hardnessConstant: 2.0,
    duration: 15,
    passThreshold: 0.5,
  },
  rotation: {
    name: 'Rings',
    description: 'Align the rotating rings',
    icon: '🔄',
    category: 'classic',
    baseWeight: 1.2,
    hardnessConstant: 2.4,
    duration: 20,
    passThreshold: 0.5,
  },
  wire: {
    name: 'Wire',
    description: 'Connect the right wires',
    icon: '🔌',
    category: 'classic',
    baseWeight: 1.0,
    hardnessConstant: 2.1,
    duration: 15,
    passThreshold: 0.5,
  },
  fingerprint: {
    name: 'Fingerprint',
    description: 'Match the print',
    icon: '👆',
    category: 'classic',
    baseWeight: 1.1,
    hardnessConstant: 2.3,
    duration: 10,
    passThreshold: 0.5,
  },
  morse: {
    name: 'Morse',
    description: 'Tap the code',
    icon: '📡',
    category: 'classic',
    baseWeight: 1.3,
    hardnessConstant: 2.5,
    duration: 20,
    passThreshold: 0.5,
  },
  colorcode: {
    name: 'Color Code',
    description: 'Match the color sequence',
    icon: '🎨',
    category: 'classic',
    baseWeight: 1.0,
    hardnessConstant: 2.2,
    duration: 15,
    passThreshold: 0.5,
  },
  safedial: {
    name: 'Safe Dial',
    description: 'Crack the safe',
    icon: '🔐',
    category: 'classic',
    baseWeight: 1.4,
    hardnessConstant: 2.6,
    duration: 25,
    passThreshold: 0.4,
  },

  // ============================================
  // ARCADE GAMES (12)
  // ============================================
  pacman: {
    name: 'Pac-Man',
    description: 'Eat dots, avoid ghost',
    icon: '🟡',
    category: 'arcade',
    baseWeight: 1.2,
    hardnessConstant: 2.3,
    duration: 15,
    passThreshold: 0.5,
  },
  spaceinvaders: {
    name: 'Invaders',
    description: 'Shoot all aliens',
    icon: '👾',
    category: 'arcade',
    baseWeight: 1.2,
    hardnessConstant: 2.4,
    duration: 15,
    passThreshold: 0.5,
  },
  frogger: {
    name: 'Frogger',
    description: 'Cross the road',
    icon: '🐸',
    category: 'arcade',
    baseWeight: 1.1,
    hardnessConstant: 2.2,
    duration: 20,
    passThreshold: 0.5,
  },
  donkeykong: {
    name: 'DK',
    description: 'Jump the barrels',
    icon: '🦍',
    category: 'arcade',
    baseWeight: 1.3,
    hardnessConstant: 2.5,
    duration: 20,
    passThreshold: 0.4,
  },
  centipede: {
    name: 'Centipede',
    description: 'Destroy segments',
    icon: '🐛',
    category: 'arcade',
    baseWeight: 1.2,
    hardnessConstant: 2.3,
    duration: 15,
    passThreshold: 0.5,
  },
  asteroids: {
    name: 'Asteroids',
    description: 'Blast the rocks',
    icon: '🪨',
    category: 'arcade',
    baseWeight: 1.4,
    hardnessConstant: 2.6,
    duration: 20,
    passThreshold: 0.4,
  },
  snake: {
    name: 'Snake',
    description: 'Grow without crashing',
    icon: '🐍',
    category: 'arcade',
    baseWeight: 1.1,
    hardnessConstant: 2.2,
    duration: 20,
    passThreshold: 0.5,
  },
  breakout: {
    name: 'Breakout',
    description: 'Break all the bricks',
    icon: '🧱',
    category: 'arcade',
    baseWeight: 1.2,
    hardnessConstant: 2.3,
    duration: 20,
    passThreshold: 0.5,
  },
  tetris: {
    name: 'Tetris',
    description: 'Clear the lines',
    icon: '🟦',
    category: 'arcade',
    baseWeight: 1.3,
    hardnessConstant: 2.4,
    duration: 30,
    passThreshold: 0.5,
  },
  galaga: {
    name: 'Galaga',
    description: 'Defeat the swarm',
    icon: '🚀',
    category: 'arcade',
    baseWeight: 1.2,
    hardnessConstant: 2.3,
    duration: 15,
    passThreshold: 0.5,
  },
  digdug: {
    name: 'Dig Dug',
    description: 'Dig and defeat',
    icon: '⛏️',
    category: 'arcade',
    baseWeight: 1.1,
    hardnessConstant: 2.2,
    duration: 20,
    passThreshold: 0.5,
  },
  qbert: {
    name: 'Q*bert',
    description: 'Color all tiles',
    icon: '🔺',
    category: 'arcade',
    baseWeight: 1.2,
    hardnessConstant: 2.3,
    duration: 15,
    passThreshold: 0.5,
  },

  // ============================================
  // PUZZLES (12)
  // ============================================
  quickmath: {
    name: 'Math',
    description: 'Solve fast',
    icon: '➕',
    category: 'puzzle',
    baseWeight: 1.0,
    hardnessConstant: 2.1,
    duration: 20,
    passThreshold: 0.5,
  },
  wordscramble: {
    name: 'Scramble',
    description: 'Unscramble words',
    icon: '📝',
    category: 'puzzle',
    baseWeight: 1.0,
    hardnessConstant: 2.2,
    duration: 30,
    passThreshold: 0.5,
  },
  memorymatch: {
    name: 'Memory',
    description: 'Match the pairs',
    icon: '🧠',
    category: 'puzzle',
    baseWeight: 1.1,
    hardnessConstant: 2.3,
    duration: 30,
    passThreshold: 0.4,
  },
  sudoku: {
    name: 'Sudoku',
    description: 'Fill the grid',
    icon: '9️⃣',
    category: 'puzzle',
    baseWeight: 1.3,
    hardnessConstant: 2.5,
    duration: 45,
    passThreshold: 0.4,
  },
  jigsaw: {
    name: 'Jigsaw',
    description: 'Complete the puzzle',
    icon: '🧩',
    category: 'puzzle',
    baseWeight: 1.1,
    hardnessConstant: 2.2,
    duration: 30,
    passThreshold: 0.5,
  },
  wordsearch: {
    name: 'Word Find',
    description: 'Find hidden words',
    icon: '🔍',
    category: 'puzzle',
    baseWeight: 1.0,
    hardnessConstant: 2.1,
    duration: 30,
    passThreshold: 0.5,
  },
  logic: {
    name: 'Logic',
    description: 'Solve the puzzle',
    icon: '🤔',
    category: 'puzzle',
    baseWeight: 1.2,
    hardnessConstant: 2.4,
    duration: 30,
    passThreshold: 0.5,
  },
  maze: {
    name: 'Maze',
    description: 'Find the exit',
    icon: '🌀',
    category: 'puzzle',
    baseWeight: 1.0,
    hardnessConstant: 2.1,
    duration: 20,
    passThreshold: 0.5,
  },
  spotdiff: {
    name: 'Spot It',
    description: 'Find differences',
    icon: '👁️',
    category: 'puzzle',
    baseWeight: 1.0,
    hardnessConstant: 2.0,
    duration: 20,
    passThreshold: 0.5,
  },
  reaction: {
    name: 'Reaction',
    description: 'Test your reflexes',
    icon: '⚡',
    category: 'puzzle',
    baseWeight: 0.9,
    hardnessConstant: 1.8,
    duration: 10,
    passThreshold: 0.5,
  },
  numsequence: {
    name: 'Numbers',
    description: 'Complete the sequence',
    icon: '🔢',
    category: 'puzzle',
    baseWeight: 1.1,
    hardnessConstant: 2.2,
    duration: 20,
    passThreshold: 0.5,
  },
  cipher: {
    name: 'Cipher',
    description: 'Decode the message',
    icon: '🔑',
    category: 'puzzle',
    baseWeight: 1.2,
    hardnessConstant: 2.4,
    duration: 30,
    passThreshold: 0.5,
  },

  // Custom placeholder
  custom: {
    name: 'Custom',
    description: 'User-created challenge',
    icon: '🎮',
    category: 'custom',
    baseWeight: 1.0,
    hardnessConstant: 2.0,
    duration: 20,
    passThreshold: 0.5,
  },
} as const;

// Module categories for UI grouping
export const MODULE_CATEGORIES = {
  arcade: { name: 'Arcade', description: 'Classic gaming challenges' },
  puzzle: { name: 'Puzzles', description: 'Brain teasers' },
  classic: { name: 'Locks', description: 'Traditional security' },
  custom: { name: 'Custom', description: 'User-created' },
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
