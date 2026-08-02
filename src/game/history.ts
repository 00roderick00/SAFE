// Mappers that turn server settlement payloads into the client-side
// history records the History screen renders.
//
// Server-resolved attacks (submit_result) and defenses (resolve_defense)
// previously only produced a transient notification, so a real 31 TK
// loss never showed up in History (UX-FINDINGS P1.1). These pure helpers
// build the same AttackResult / DefenseEvent shapes the local path uses,
// so both sides of a fight land in the persisted activity log.

import type { ResolvedAttack } from '../services/api';
import type { AttackResult, DefenseEvent } from '../types';
import type { SubmitResultPayload } from '../services/api';

export interface ServerAttackContext {
  /** Opaque id for the resolved attack (used as the history row key). */
  attackId: string;
  targetName: string;
}

/** Build a History AttackResult from a server submit_result payload. */
export function buildServerAttackResult(
  payload: SubmitResultPayload,
  ctx: ServerAttackContext,
  timestamp: number
): AttackResult {
  const success = payload.status === 'won';
  const netLoot = success ? Math.max(0, payload.loot - payload.platformFee) : 0;
  const modules = payload.modules ?? [];
  const totalScore = modules.length
    ? modules.reduce((sum, m) => sum + m.score, 0) / modules.length
    : 0;
  return {
    id: `attack-${ctx.attackId}`,
    timestamp,
    // Namespaced so it can't collide with a client bot id.
    targetId: `server:${ctx.attackId}`,
    targetName: ctx.targetName,
    success,
    moduleScores: modules.map((m) => ({
      moduleId: `${ctx.attackId}-${m.moduleIndex}`,
      score: m.score,
      passed: m.passed,
    })),
    totalScore,
    threshold: 1,
    stakePaid: payload.stake,
    lootGained: netLoot,
    platformFee: payload.platformFee,
  };
}

/** Build a History DefenseEvent from a server resolve_defense payload. */
/**
 * Turn a settled attack against this safe into a History row.
 *
 * The outcome is read straight from the attack row that submit_result
 * already decided — nothing here re-adjudicates. `success` is from the
 * DEFENDER's point of view: the attack row stores 'won' when the
 * attacker breached, which is a loss for us.
 */
export function buildDefenseEventFromAttack(
  attack: ResolvedAttack,
  insurancePayout = 0
): DefenseEvent {
  const attackerBreached = attack.status === 'won';
  return {
    // Stable id: re-reporting the same attack must not duplicate it.
    id: `defense-${attack.attackId}`,
    timestamp: new Date(attack.resolvedAt).getTime(),
    attackerName: attack.attackerHandle,
    success: !attackerBreached,
    moduleResults: [],
    feeEarned: attack.feeEarned,
    lootLost: attack.lootLost,
    insurancePayout,
  };
}

