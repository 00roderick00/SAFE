// Mappers that turn server settlement payloads into the client-side
// history records the History screen renders.
//
// Server-resolved attacks (submit_result) and defenses (resolve_defense)
// previously only produced a transient notification, so a real 31 TK
// loss never showed up in History (UX-FINDINGS P1.1). These pure helpers
// build the same AttackResult / DefenseEvent shapes the local path uses,
// so both sides of a fight land in the persisted activity log.

import type { AttackResult, DefenseEvent } from '../types';
import type { SubmitResultPayload, DefenseTickPayload } from '../services/api';

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
export function buildServerDefenseEvent(
  payload: DefenseTickPayload,
  timestamp: number
): DefenseEvent {
  return {
    id: `defense-${timestamp}`,
    timestamp,
    attackerName: payload.attackerName ?? 'Unknown raider',
    success: Boolean(payload.success),
    moduleResults: (payload.moduleResults ?? []).map((m) => ({
      moduleId: m.moduleId,
      attackerScore: m.attackerScore,
      defended: m.defended,
    })),
    feeEarned: payload.feeEarned ?? 0,
    lootLost: payload.lootLost ?? 0,
    insurancePayout: payload.insurancePayout ?? 0,
  };
}
