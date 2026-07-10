// Server-side plausibility checks for submitted minigame results.
//
// The client sends `{ score, timeSpent, passed }` per module; the
// server accepts a score only if it plausibly could have been
// produced by playing the game at the stated difficulty. If a client
// claims a perfect score in 20ms, we reject.
//
// Bounds are intentionally loose — this is fraud detection, not
// balancing. Anything a real player can achieve should pass.

import type { ModuleType } from './types.ts';

export interface SubmittedResult {
  moduleType: ModuleType | string;
  moduleIndex: number;
  score: number; // 0..1
  passed: boolean;
  timeSpent: number; // ms
}

export interface PlausibilityBounds {
  /** Absolute floor on how fast a run could complete. */
  minTimeMs: number;
  /** Ceiling that catches idle sessions / stuck games. */
  maxTimeMs: number;
  /** Highest score achievable at this stated difficulty. */
  maxScore: number;
  /** Below this the module is failed regardless of client claim. */
  passThreshold: number;
}

// Difficulty-independent floors keyed by module type. Locks resolve
// fast (typed sequences); arcade/puzzle games need real interaction.
const MIN_TIME_MS_BY_TYPE: Partial<Record<ModuleType, number>> = {
  pattern: 800,
  keypad: 600,
  timing: 400,
  combination: 500,
  sequence: 800,
  slider: 1500,
  rotation: 400,
  wire: 800,
  fingerprint: 1000,
  morse: 1500,
  colorcode: 1000,
  safedial: 800,
  // Arcade/puzzle games are longer sessions; anything under ~3s is
  // implausible even at trivial difficulty.
};

const DEFAULT_MIN_TIME_MS = 3000;
const MAX_TIME_MS = 3 * 60 * 1000; // 3 minutes is a reasonable ceiling

/**
 * Derive plausibility bounds for a single module given the stored
 * server-side difficulty. Difficulty influences maxScore ceilings
 * loosely — higher difficulty should not cap achievable score, but
 * a perfect score at difficulty 1 with a 500ms run is implausible.
 */
export function boundsFor(moduleType: ModuleType | string, _difficulty: number): PlausibilityBounds {
  const minTimeMs = MIN_TIME_MS_BY_TYPE[moduleType as ModuleType] ?? DEFAULT_MIN_TIME_MS;
  return {
    minTimeMs,
    maxTimeMs: MAX_TIME_MS,
    maxScore: 1,
    passThreshold: 0.65,
  };
}

export type PlausibilityVerdict =
  | { ok: true; adjustedScore: number; adjustedPassed: boolean }
  | { ok: false; reason: string };

/**
 * Validate a single submitted result. On success returns the score
 * we're going to record (clamped) and whether we consider it passed.
 * On failure returns a machine-readable reason.
 */
export function checkPlausibility(
  submitted: SubmittedResult,
  difficulty: number
): PlausibilityVerdict {
  if (
    typeof submitted.score !== 'number' ||
    Number.isNaN(submitted.score) ||
    submitted.score < 0 ||
    submitted.score > 1
  ) {
    return { ok: false, reason: 'score_out_of_range' };
  }
  if (typeof submitted.timeSpent !== 'number' || !Number.isFinite(submitted.timeSpent) || submitted.timeSpent < 0) {
    return { ok: false, reason: 'time_out_of_range' };
  }

  const bounds = boundsFor(submitted.moduleType, difficulty);
  if (submitted.timeSpent < bounds.minTimeMs && submitted.score >= bounds.passThreshold) {
    return { ok: false, reason: 'too_fast_for_pass' };
  }
  if (submitted.timeSpent > bounds.maxTimeMs) {
    return { ok: false, reason: 'time_exceeded' };
  }

  const adjustedScore = Math.min(bounds.maxScore, Math.max(0, submitted.score));
  const adjustedPassed = adjustedScore >= bounds.passThreshold;
  return { ok: true, adjustedScore, adjustedPassed };
}
