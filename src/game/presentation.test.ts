import { describe, expect, it, vi } from 'vitest';
import { buildBalanceHistory, getPayoutPresentation, getTargetAvailability } from './presentation';

describe('balance history presentation', () => {
  it('returns an honest empty history when no settlements exist', () => {
    expect(buildBalanceHistory(1_000, [], [])).toEqual([]);
  });

  it('reconstructs balance from stored attack settlements', () => {
    vi.spyOn(Date, 'now').mockReturnValue(300);
    const points = buildBalanceHistory(1_120, [{
      id: 'a', timestamp: 200, targetId: 't', targetName: 'Target', success: true,
      moduleScores: [], totalScore: 1, threshold: 1, stakePaid: 10, lootGained: 120, platformFee: 30,
    }], []);
    expect(points.map((point) => point.value)).toEqual([1_000, 1_120]);
    vi.restoreAllMocks();
  });
});

describe('target payout presentation', () => {
  it('labels a complete economy split without presenting gross as net', () => {
    const payout = getPayoutPresentation(10_000);
    expect(payout.netPayout + payout.platformCut).toBe(payout.grossLoot);
    expect(payout.netPayout).toBeLessThan(payout.grossLoot);
  });
});

describe('target card state', () => {
  it('marks unaffordable targets with text and a disabled selection state', () => {
    expect(getTargetAvailability(120, 100, null, 1_000)).toEqual({
      affordable: false,
      cooldown: false,
      selectable: false,
      label: 'Cannot afford',
    });
  });

  it('blocks an affordable target during cooldown', () => {
    const state = getTargetAvailability(20, 100, 2_000, 1_000);
    expect(state.selectable).toBe(false);
    expect(state.label).toBe('Cooldown');
  });
});
