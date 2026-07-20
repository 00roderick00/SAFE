import { describe, it, expect } from 'vitest';
import { buildServerAttackResult, buildServerDefenseEvent } from './history';
import type { SubmitResultPayload, DefenseTickPayload } from '../services/api';

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

describe('buildServerDefenseEvent', () => {
  it('maps a repelled defense (fee earned)', () => {
    const payload: DefenseTickPayload = {
      attacked: true,
      success: true,
      attackerName: 'trevor.mentis',
      feeEarned: 12,
      lootLost: 0,
      moduleResults: [{ moduleIndex: 0, moduleId: 'm0', attackerScore: 0.3, defended: true }],
    };
    const ev = buildServerDefenseEvent(payload, 42);
    expect(ev.success).toBe(true);
    expect(ev.attackerName).toBe('trevor.mentis');
    expect(ev.feeEarned).toBe(12);
    expect(ev.moduleResults).toHaveLength(1);
    expect(ev.timestamp).toBe(42);
  });

  it('maps a breached defense (loot lost + insurance) with safe defaults', () => {
    const payload: DefenseTickPayload = {
      attacked: true,
      success: false,
      lootLost: 90,
      insurancePayout: 40,
    };
    const ev = buildServerDefenseEvent(payload, 7);
    expect(ev.success).toBe(false);
    expect(ev.attackerName).toBe('Unknown raider');
    expect(ev.lootLost).toBe(90);
    expect(ev.insurancePayout).toBe(40);
    expect(ev.moduleResults).toEqual([]);
  });
});
