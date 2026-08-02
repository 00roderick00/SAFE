import { describe, it, expect } from 'vitest';
import { buildServerAttackResult, buildDefenseEventFromAttack } from './history';
import type { SubmitResultPayload } from '../services/api';

describe('buildServerAttackResult', () => {
  const ctx = { attackId: 'atk-1', targetName: 'roderick.jones' };

  it('maps a lost server attack to a -stake history row', () => {
    const payload: SubmitResultPayload = {
      attackId: 'atk-1',
      status: 'lost',
      loot: 0,
      platformFee: 0,
      stake: 31,
      newBalance: 969,
      modules: [
        { moduleIndex: 0, score: 0.4, passed: false },
        { moduleIndex: 1, score: 0, passed: false },
      ],
    };
    const row = buildServerAttackResult(payload, ctx, 1000);
    expect(row.success).toBe(false);
    expect(row.stakePaid).toBe(31);
    expect(row.lootGained).toBe(0);
    expect(row.targetName).toBe('roderick.jones');
    expect(row.targetId).toBe('server:atk-1');
    expect(row.moduleScores).toHaveLength(2);
    expect(row.timestamp).toBe(1000);
  });

  it('maps a won server attack to net loot (loot - platform fee)', () => {
    const payload: SubmitResultPayload = {
      attackId: 'atk-2',
      status: 'won',
      loot: 200,
      platformFee: 16,
      stake: 31,
      newBalance: 1153,
      modules: [{ moduleIndex: 0, score: 1, passed: true }],
    };
    const row = buildServerAttackResult(payload, { attackId: 'atk-2', targetName: 'bot' }, 5);
    expect(row.success).toBe(true);
    expect(row.lootGained).toBe(184);
    expect(row.platformFee).toBe(16);
    expect(row.totalScore).toBe(1);
  });
});

describe('buildDefenseEventFromAttack', () => {
  // Built from a REAL settled attack row. resolve_defense no longer
  // fabricates raids, so there is no "attacked: false" case any more —
  // if there is no row, there was no attack.
  const base = {
    attackId: 'atk-1',
    attackerHandle: 'trevor.mentis',
    resolvedAt: new Date(42).toISOString(),
    stake: 12,
    loot: 0,
    lootLost: 0,
    feeEarned: 12,
  };

  it('maps a repelled raid (attacker lost → defender held, keeps the stake)', () => {
    const ev = buildDefenseEventFromAttack({ ...base, status: 'lost' });
    expect(ev.success).toBe(true);
    expect(ev.attackerName).toBe('trevor.mentis');
    expect(ev.feeEarned).toBe(12);
    expect(ev.lootLost).toBe(0);
    expect(ev.timestamp).toBe(42);
  });

  it('maps a breach (attacker won → defender lost loot)', () => {
    const ev = buildDefenseEventFromAttack(
      { ...base, attackId: 'atk-2', status: 'won', loot: 90, lootLost: 90, feeEarned: 0 },
      40
    );
    expect(ev.success).toBe(false);
    expect(ev.lootLost).toBe(90);
    expect(ev.insurancePayout).toBe(40);
  });

  it('uses a stable id so re-reporting cannot duplicate the row', () => {
    const a = buildDefenseEventFromAttack({ ...base, status: 'lost' });
    const b = buildDefenseEventFromAttack({ ...base, status: 'lost' });
    expect(a.id).toBe('defense-atk-1');
    expect(a.id).toBe(b.id);
  });
});
