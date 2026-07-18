// Server-side outcome verification for a submitted attack
// (TESTING-FINDINGS-2 P0.1).
//
// The exploit this closes: a client POSTing `{passed:true, score:0.85}`
// for every module WITHOUT playing anything was accepted as a win. The
// old path only ran plausibility sanity checks — it never confirmed the
// game was actually beaten. Any attacker could take any safe.
//
// Verification tiers per module:
//   - DSL games (mode='dsl_program'): DETERMINISTIC REPLAY. We ignore
//     the client's passed/score entirely and replay its recorded input
//     trace from the issued seed via the same runtime calibration uses.
//     `passed` iff the replay actually wins. No trace → cannot pass.
//   - Everything else (built-in locks/arcades, engine-config customs):
//     not yet server-replayable, so they fall back to plausibility. This
//     is a documented residual — a safe that contains at least one DSL
//     module (as in the reported case) is now fully protected, because
//     all-or-nothing means the fabricated DSL module fails the replay
//     and sinks the whole attack.

import type { SecurityLoadout } from './types.ts';
import type { AttackModuleSeed } from './attack-flow.ts';
import { checkPlausibility } from './plausibility.ts';
import { replayDslTrace, type Direction } from './dsl-runtime.ts';
import { validateDsl, type DslGame } from './dsl.ts';

export type VerificationMethod = 'replay' | 'plausibility' | 'missing';

export interface SubmittedResultV {
  moduleType: string;
  moduleIndex: number;
  score: number;
  passed: boolean;
  timeSpent: number;
  /** Ordered per-tick player directions, required to verify DSL wins. */
  inputTrace?: Direction[];
}

export interface VerifiedRow {
  attack_id: string;
  module_index: number;
  module_type: string;
  score: number;
  passed: boolean;
  time_spent_ms: number;
  /** How `passed` was decided (internal; not persisted to attack_results). */
  method: VerificationMethod;
  reason?: string;
}

export type VerifyResult =
  | { ok: true; rows: VerifiedRow[]; allPassed: boolean; submittedCount: number }
  | { ok: false; error: string; at: number; reason?: string };

const MAX_TIME_MS = 180_000;
const clampTime = (t: number): number =>
  Number.isFinite(t) ? Math.min(MAX_TIME_MS, Math.max(0, Math.round(t))) : 0;

function coerceDsl(config: unknown): DslGame | null {
  const v = validateDsl(config);
  return v.ok ? v.program : null;
}

function isDslModule(mod: { customConfig?: { mode?: string } }, seed?: AttackModuleSeed): boolean {
  return mod.customConfig?.mode === 'dsl_program' || seed?.mode === 'dsl_program';
}

/**
 * Recompute the true per-module outcome for an attack, server-side.
 * Returns the rows to persist + whether every module passed. Missing
 * results (a short/abandoned submission) are recorded as failed. A
 * non-DSL result that is physically implausible is rejected outright
 * (the caller returns 422) — that preserves the existing fraud check;
 * DSL results are decided purely by replay and never 422.
 */
export function verifyAttack(
  attackId: string,
  loadout: SecurityLoadout,
  moduleSeeds: AttackModuleSeed[],
  submitted: SubmittedResultV[]
): VerifyResult {
  const expected = loadout.modules.length;
  const rows: VerifiedRow[] = [];
  let allPassed = expected > 0;
  let submittedCount = 0;

  for (let i = 0; i < expected; i++) {
    const mod = loadout.modules[i];
    const seed = moduleSeeds[i];

    if (i >= submitted.length) {
      // No result for this module → failed (early exit / abandon).
      rows.push({
        attack_id: attackId,
        module_index: i,
        module_type: mod.type,
        score: 0,
        passed: false,
        time_spent_ms: 0,
        method: 'missing',
      });
      allPassed = false;
      continue;
    }

    const r = submitted[i];
    if (r.moduleIndex !== i) return { ok: false, error: 'module_index_out_of_order', at: i };
    if (r.moduleType !== mod.type) return { ok: false, error: 'module_type_mismatch', at: i };

    if (isDslModule(mod, seed)) {
      // Authoritative replay — client passed/score are ignored.
      const program = coerceDsl(seed?.config ?? mod.customConfig?.config);
      const trace = Array.isArray(r.inputTrace) ? r.inputTrace : [];
      let passed = false;
      let reason: string | undefined;
      if (!program) {
        reason = 'dsl_config_invalid';
      } else if (trace.length === 0) {
        reason = 'no_input_trace';
      } else {
        const res = replayDslTrace(program, seed!.seed, trace);
        passed = res.won;
        reason = res.won ? undefined : res.reason ?? 'replay_lost';
      }
      rows.push({
        attack_id: attackId,
        module_index: i,
        module_type: mod.type,
        score: passed ? 1 : 0,
        passed,
        time_spent_ms: clampTime(r.timeSpent),
        method: 'replay',
        reason,
      });
      submittedCount++;
      if (!passed) allPassed = false;
      continue;
    }

    // Non-DSL: fall back to plausibility (fraud sanity, not full replay).
    const verdict = checkPlausibility(r, mod.difficulty);
    if (!verdict.ok) return { ok: false, error: 'implausible_result', at: i, reason: verdict.reason };
    rows.push({
      attack_id: attackId,
      module_index: i,
      module_type: mod.type,
      score: verdict.adjustedScore,
      passed: verdict.adjustedPassed,
      time_spent_ms: clampTime(r.timeSpent),
      method: 'plausibility',
    });
    submittedCount++;
    if (!verdict.adjustedPassed) allPassed = false;
  }

  if (expected === 0) allPassed = false;
  return { ok: true, rows, allPassed, submittedCount };
}
