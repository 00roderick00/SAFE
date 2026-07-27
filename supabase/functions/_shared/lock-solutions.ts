// Deterministic seed -> solution derivation for "answer" locks.
//
// SECURITY (see PROGRESS-SECURITY.md): built-in locks used to generate
// their secret client-side with Math.random(), so the server had no way
// to recompute the answer and could only sanity-check the self-reported
// score. That let an attacker POST passed:true with a fabricated score
// and breach any non-DSL safe.
//
// These lock types have a SINGLE correct solution derivable purely from
// (seed, difficulty). Both the client (to present the puzzle) and the
// server (to verify the submitted answer) call deriveLockSolution with
// the same inputs and the shared xmur3->mulberry32 RNG, so they compute
// identical secrets. The client submits the player's ACTUAL answer; the
// server recomputes the expected one and compares. Client passed/score
// is no longer trusted for these modules.

import { createRng } from './rng.ts';
import type { SecurityLoadout } from './types.ts';

/** Lock types whose outcome the server can independently verify by
 *  recomputing the seed-derived answer. These are single-secret
 *  "reproduce the hidden code" locks. (Multi-round locks like `sequence`
 *  are class-2 for now and rely on the composition rule.) */
export const VERIFIABLE_LOCK_TYPES = ['keypad', 'colorcode', 'combination'] as const;
export type VerifiableLockType = (typeof VERIFIABLE_LOCK_TYPES)[number];

export function isVerifiableLockType(t: string): t is VerifiableLockType {
  return (VERIFIABLE_LOCK_TYPES as readonly string[]).includes(t);
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

interface LockSpec {
  /** Number of distinct symbols each slot can take (0..alphabet-1). */
  alphabet: number;
  /** Canonical solution length for a given difficulty. This is the
   *  SINGLE source of truth — the client renders exactly this many
   *  slots, so client and server never disagree on length. */
  length: (difficulty: number) => number;
}

// Lengths mirror the pre-existing per-game difficulty scaling so the
// games feel the same; they now live here as the one canonical formula.
const LOCK_SPECS: Record<VerifiableLockType, LockSpec> = {
  keypad: { alphabet: 10, length: (d) => 4 + Math.round(4 * clamp01(d)) }, // 4..8 digits
  colorcode: { alphabet: 6, length: (d) => 3 + Math.floor(clamp01(d)) }, // 3..4 colors
  combination: { alphabet: 10, length: (d) => 3 + Math.floor(clamp01(d)) }, // 3..4 dials
};

/**
 * The canonical secret for a lock, as an array of small integers in
 * [0, alphabet). Deterministic in (type, seed, difficulty).
 */
export function deriveLockSolution(type: VerifiableLockType, seed: string, difficulty: number): number[] {
  const spec = LOCK_SPECS[type];
  const rng = createRng(`${type}:${seed}`);
  const len = Math.max(1, spec.length(difficulty));
  return Array.from({ length: len }, () => Math.floor(rng() * spec.alphabet));
}

/** Number of slots the given lock has for the given difficulty. */
export function lockSolutionLength(type: VerifiableLockType, difficulty: number): number {
  return Math.max(1, LOCK_SPECS[type].length(difficulty));
}

/**
 * Coerce a submitted answer (string of digits like "4821", or an array
 * of ints) into an int array, or null if it isn't a well-formed answer.
 */
export function normalizeAnswer(answer: unknown): number[] | null {
  if (typeof answer === 'string') {
    if (answer.length === 0 || !/^[0-9]+$/.test(answer)) return null;
    return answer.split('').map((c) => Number(c));
  }
  if (Array.isArray(answer) && answer.length > 0 && answer.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0)) {
    return answer as number[];
  }
  return null;
}

/**
 * Server-authoritative check: does the submitted answer match the
 * seed-derived solution exactly? The client's passed/score are ignored.
 */
export function verifyLockAnswer(
  type: VerifiableLockType,
  seed: string,
  difficulty: number,
  answer: unknown
): boolean {
  const expected = deriveLockSolution(type, seed, difficulty);
  const got = normalizeAnswer(answer);
  if (!got || got.length !== expected.length) return false;
  return got.every((v, i) => v === expected[i]);
}

/** True when a single module can be independently verified server-side
 *  (a seed-answer lock, a chess puzzle, or a replayable DSL custom
 *  game). Chess puzzles are class 1a: the position is derived from
 *  (seed, difficulty) and the server replays the submitted mating line
 *  against a deterministic defense (see chess-puzzle.ts). */
export function isVerifiableModule(module: { type: string; customConfig?: { mode?: string } }): boolean {
  if (module.customConfig?.mode === 'dsl_program') return true;
  if (module.type === 'chesspuzzle') return true;
  return isVerifiableLockType(module.type);
}

/** How many modules in a loadout the server can independently verify. A
 *  safe with zero cannot be defended at real stakes — see the
 *  composition rule enforced in submit_result. */
export function countVerifiableModules(loadout: SecurityLoadout): number {
  return loadout.modules.reduce((n, m) => n + (isVerifiableModule(m) ? 1 : 0), 0);
}
