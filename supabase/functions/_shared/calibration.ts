// Calibration gate for user-designed minigames.
//
// The exploit we're defending against: a creator publishes an
// unwinnable game and puts it on their safe, so tokens can never be
// stolen. Before a custom game can go `live`, a per-engine heuristic
// simulator plays it and the observed solve-rate must fall in the
// target band `[minSolveRate, maxSolveRate]`. If it doesn't, the
// game is `rejected` and can't guard a safe.
//
// The simulators are intentionally simple closed-form heuristics —
// enough to catch trivial ("solve rate 100%") and impossible
// ("solve rate 0%") games. A future Stage 3B upgrade replaces them
// with headless React runs of the real engines for higher fidelity.

import { ENGINE_SCHEMAS, validateConfig } from './config-schemas.ts';
import { createRng } from './rng.ts';

export const TARGET_BAND = { min: 0.3, max: 0.7 } as const;

/** Skill of the notional player we simulate against. 0.5 = average. */
export const REFERENCE_AI_SKILL = 0.5;
export const DEFAULT_ITERATIONS = 100;

export interface CalibrationResult {
  passes: boolean;
  solveRate: number;
  iterations: number;
  aiSkill: number;
  band: { min: number; max: number };
  /** 0..1 empirical difficulty (1 - solveRate is a reasonable proxy). */
  calibratedDifficulty: number;
  reason?: 'too_easy' | 'too_hard' | 'unsupported_engine';
}

// ---------------------------------------------------------------
// Per-engine solve probability models. Each returns the estimated
// probability that a player with skill `s` in [0, 1] beats a single
// run of the game at the given config.
// ---------------------------------------------------------------

type Model = (config: Record<string, unknown>, skill: number) => number;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Each model returns p_solve for a player of skill `s` in [0, 1].
// The models are tuned so that a "typical" mid-range config puts
// p_solve ≈ 0.5 at s = 0.5 (i.e. the middle of the target band).
// Numbers are heuristics, not physics — the point is to catch the
// obvious "unwinnable" and "unlosable" configs.
const MODELS: Record<string, Model> = {
  maze: (cfg, s) => {
    // load ≈ 0.6 at grid 9 / time 45 → p_solve ≈ 0.5 at s=0.5.
    // load ≈ 0.13 at grid 5 / time 90 → too easy.
    // load ≈ 3.87 at grid 15 / time 15 → too hard (clamps to 0).
    const grid = Number(cfg.gridSize ?? 9);
    const time = Number(cfg.timeLimit ?? 30);
    const load = Math.pow(grid, 1.5) / Math.max(1, time);
    return clamp01(1 - load / 1.2 + (s - 0.5) * 0.4);
  },

  snake: (cfg, s) => {
    const board = Number(cfg.boardSize ?? 12);
    const speed = Number(cfg.speed ?? 3);
    const target = Number(cfg.targetLength ?? 12);
    const time = Number(cfg.timeLimit ?? 45);
    const load = (target * speed) / (board * Math.sqrt(time));
    return clamp01(1 - load / 1.5 + (s - 0.5) * 0.4);
  },

  timing: (cfg, s) => {
    const speed = Number(cfg.rotationSpeed ?? 180);
    const zone = Number(cfg.targetZoneSize ?? 24);
    const attempts = Number(cfg.attemptsAllowed ?? 3);
    const singleHit = clamp01(zone / 360) * clamp01(180 / speed);
    const p = 1 - Math.pow(1 - singleHit, attempts);
    return clamp01(p * 0.9 + (s - 0.5) * 0.4);
  },

  pattern: (cfg, s) => {
    const gridSize = Number(cfg.gridSize ?? 4);
    const length = Number(cfg.requiredLength ?? 6);
    const mem = Number(cfg.memorizeTime ?? 2500);
    const time = Number(cfg.timeLimit ?? 15);
    const chunks = length / Math.max(1, gridSize);
    const memRate = mem / 1000 / Math.max(1, length);
    const load = chunks / Math.max(0.3, memRate) / Math.max(1, time / 10);
    return clamp01(1 - load / 1.2 + (s - 0.5) * 0.4);
  },

  memorymatch: (cfg, s) => {
    const pairs = Number(cfg.pairCount ?? 8);
    const mem = Number(cfg.memorizeTime ?? 3500);
    const time = Number(cfg.timeLimit ?? 45);
    const load = pairs / (mem / 1000) / Math.max(1, time / 10);
    return clamp01(1 - load / 1.5 + (s - 0.5) * 0.4);
  },

  quickmath: (cfg, s) => {
    const count = Number(cfg.problemCount ?? 10);
    const opsCount = Array.isArray(cfg.operations) ? cfg.operations.length : 2;
    const time = Number(cfg.timeLimit ?? 45);
    const negatives = cfg.allowNegatives ? 1.2 : 1;
    const perProblem = time / Math.max(1, count);
    const load = (opsCount * negatives) / Math.max(0.5, perProblem);
    return clamp01(1 - load / 1.4 + (s - 0.5) * 0.4);
  },
};

/**
 * Simulate `iterations` runs and return the fraction that would have
 * been solved by a player of the given skill. The result is
 * mildly seeded so a given (engine, config, iterations, seed) is
 * repeatable in tests, but noise-around-mean is still present.
 */
export function simulateSolveRate(
  engine: string,
  config: Record<string, unknown>,
  aiSkill: number = REFERENCE_AI_SKILL,
  iterations: number = DEFAULT_ITERATIONS,
  seed: string = 'calibration'
): number {
  const model = MODELS[engine];
  if (!model) return 0;
  const rng = createRng(`${seed}:${engine}`);
  let solved = 0;
  const meanP = model(config, aiSkill);
  for (let i = 0; i < iterations; i++) {
    // Bernoulli draw around the model's mean with small variance.
    // rng() is our seeded uniform.
    const jitter = (rng() - 0.5) * 0.1;
    const p = clamp01(meanP + jitter);
    if (rng() < p) solved++;
  }
  return solved / iterations;
}

/**
 * Run the full calibration pass for a candidate custom game.
 * Returns whether the solve rate landed in the target band, plus
 * the empirical stats the client / DB should record.
 */
export function calibrate(
  engine: string,
  rawConfig: unknown,
  options: {
    aiSkill?: number;
    iterations?: number;
    band?: { min: number; max: number };
    seed?: string;
  } = {}
): CalibrationResult {
  const band = options.band ?? TARGET_BAND;
  const aiSkill = options.aiSkill ?? REFERENCE_AI_SKILL;
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const seed = options.seed ?? 'calibration';

  if (!ENGINE_SCHEMAS[engine]) {
    return {
      passes: false,
      solveRate: 0,
      iterations,
      aiSkill,
      band,
      calibratedDifficulty: 1,
      reason: 'unsupported_engine',
    };
  }

  // The config is already validated by validateConfig upstream but
  // re-validate here to defend against direct calls. We use the
  // padded/defaulted config from validation for the simulator.
  const validated = validateConfig(engine, rawConfig);
  const configForSim = validated.ok
    ? (validated.config as Record<string, unknown>)
    : (rawConfig as Record<string, unknown>);

  const solveRate = simulateSolveRate(engine, configForSim, aiSkill, iterations, seed);
  const passes = solveRate >= band.min && solveRate <= band.max;
  const reason = passes
    ? undefined
    : solveRate < band.min
      ? 'too_hard'
      : 'too_easy';

  return {
    passes,
    solveRate,
    iterations,
    aiSkill,
    band,
    calibratedDifficulty: clamp01(1 - solveRate),
    reason,
  };
}
