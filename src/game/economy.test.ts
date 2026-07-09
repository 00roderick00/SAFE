import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SecurityModule, SecurityLoadout, InsurancePolicy } from '../types';
import {
  calculateModuleStrength,
  calculateSecurityScore,
  calculateSuccessProbability,
  calculateAttackFee,
  calculateLoot,
  calculateLootDistribution,
  calculateDefenderEarnings,
  calculateInsurancePremium,
  processInsuranceClaim,
  applyPrincipalFloor,
  getDifficultyBand,
  getLootRange,
  calculateEconomyStats,
} from './economy';
import { ECONOMY } from './constants';

const mod = (overrides: Partial<SecurityModule> = {}): SecurityModule => ({
  id: 'test-mod',
  type: 'pattern',
  difficulty: 0.5,
  weight: 1,
  name: 'test',
  description: '',
  ...overrides,
});

const loadout = (modules: SecurityModule[]): SecurityLoadout => ({
  modules,
  effectiveScore: 0,
});

describe('calculateModuleStrength', () => {
  it('is 0 when difficulty is 0', () => {
    expect(calculateModuleStrength(mod({ difficulty: 0 }))).toBe(0);
  });

  it('scales with weight', () => {
    const a = calculateModuleStrength(mod({ difficulty: 0.5, weight: 1 }));
    const b = calculateModuleStrength(mod({ difficulty: 0.5, weight: 2 }));
    expect(b).toBeCloseTo(a * 2);
  });

  it('is monotonic in difficulty', () => {
    const low = calculateModuleStrength(mod({ difficulty: 0.2 }));
    const mid = calculateModuleStrength(mod({ difficulty: 0.5 }));
    const high = calculateModuleStrength(mod({ difficulty: 0.9 }));
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});

describe('calculateSecurityScore', () => {
  it('is 0 for an empty loadout', () => {
    expect(calculateSecurityScore(loadout([]))).toBe(0);
  });

  it('sums module strengths and clamps at maxSecurityScore', () => {
    const easy = calculateSecurityScore(loadout([mod({ difficulty: 0.1 })]));
    expect(easy).toBeGreaterThan(0);
    expect(easy).toBeLessThan(ECONOMY.maxSecurityScore);

    const huge = calculateSecurityScore(
      loadout([mod({ difficulty: 1, weight: 100 }), mod({ difficulty: 1, weight: 100 })])
    );
    expect(huge).toBe(ECONOMY.maxSecurityScore);
  });
});

describe('calculateSuccessProbability', () => {
  it('is clamped to [successRateMin, successRateMax]', () => {
    const min = calculateSuccessProbability(0, 999);
    const max = calculateSuccessProbability(9999, 0);
    expect(min).toBeGreaterThanOrEqual(ECONOMY.successRateMin);
    expect(max).toBeLessThanOrEqual(ECONOMY.successRateMax);
  });

  it('is monotonic in attacker rating for fixed defender', () => {
    const low = calculateSuccessProbability(500, 50);
    const high = calculateSuccessProbability(1500, 50);
    expect(high).toBeGreaterThan(low);
  });

  it('is monotonic decreasing in defender score for fixed attacker', () => {
    const softDef = calculateSuccessProbability(1000, 5);
    const hardDef = calculateSuccessProbability(1000, 90);
    expect(softDef).toBeGreaterThan(hardDef);
  });
});

describe('calculateAttackFee', () => {
  it('respects min and max caps', () => {
    expect(calculateAttackFee(1, 100)).toBeGreaterThanOrEqual(ECONOMY.feeMin);
    expect(calculateAttackFee(10_000_000, 0)).toBeLessThanOrEqual(ECONOMY.feeMax);
  });

  it('is cheaper against harder safes', () => {
    const softFee = calculateAttackFee(1000, 5);
    const hardFee = calculateAttackFee(1000, 50);
    expect(hardFee).toBeLessThan(softFee);
  });

  it('caps at feeMaxPercentOfBalance when attackerBalance is passed', () => {
    const fee = calculateAttackFee(10_000, 5, 100);
    expect(fee).toBeLessThanOrEqual(100 * ECONOMY.feeMaxPercentOfBalance);
  });

  it('uses ECONOMY.feeParams (regression test for the (0.8, 1.6) drift)', () => {
    const { a, b } = ECONOMY.feeParams;
    expect({ a, b }).toEqual({ a: 0.5, b: 1.0 });
    const expected = Math.sqrt(2500) * (a + b * (1 / (1 + 10)));
    expect(calculateAttackFee(2500, 10)).toBe(Math.round(expected));
  });
});

describe('calculateLoot', () => {
  it('is safeValue * lootFraction below cap', () => {
    expect(calculateLoot(1000)).toBe(1000 * ECONOMY.lootFraction);
  });

  it('caps at lootCap', () => {
    expect(calculateLoot(10_000_000)).toBe(ECONOMY.lootCap);
  });
});

describe('calculateLootDistribution', () => {
  it('splits into platform cut and attacker share', () => {
    const d = calculateLootDistribution(1000);
    expect(d.platformReceives).toBe(Math.round(1000 * ECONOMY.platformCut));
    expect(d.attackerReceives + d.platformReceives).toBe(1000);
    expect(d.defenderLoses).toBe(1000);
  });
});

describe('calculateDefenderEarnings', () => {
  it('splits a failed attack fee', () => {
    const d = calculateDefenderEarnings(200);
    expect(d.defenderReceives + d.platformReceives).toBe(200);
  });
});

describe('calculateInsurancePremium', () => {
  it('is never below fixedFee', () => {
    const premium = calculateInsurancePremium(100, 99, 60, 0.5);
    expect(premium).toBeGreaterThanOrEqual(ECONOMY.insurance.fixedFee);
  });

  it('costs less for higher security safes', () => {
    const soft = calculateInsurancePremium(2000, 5, 3600, 0.7);
    const hard = calculateInsurancePremium(2000, 90, 3600, 0.7);
    expect(hard).toBeLessThanOrEqual(soft);
  });

  it('scales up with duration', () => {
    const oneHour = calculateInsurancePremium(2000, 30, 3600, 0.7);
    const dayLong = calculateInsurancePremium(2000, 30, 24 * 3600, 0.7);
    expect(dayLong).toBeGreaterThanOrEqual(oneHour);
  });
});

describe('processInsuranceClaim', () => {
  const validPolicy: InsurancePolicy = {
    id: 'p1',
    coverage: 0.7,
    premium: 100,
    duration: 3600,
    purchasedAt: 1_000_000,
    expiresAt: 5_000_000,
    maxPayout: 5000,
    claimsRemaining: 3,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pays lootLost * coverage when active', () => {
    const claim = processInsuranceClaim(validPolicy, 1000);
    expect(claim.policyValid).toBe(true);
    expect(claim.payout).toBe(700);
    expect(claim.claimsRemaining).toBe(2);
  });

  it('caps at maxPayout', () => {
    const claim = processInsuranceClaim(validPolicy, 100_000);
    expect(claim.payout).toBe(validPolicy.maxPayout);
  });

  it('rejects an expired policy', () => {
    vi.setSystemTime(6_000_000); // > expiresAt
    const claim = processInsuranceClaim(validPolicy, 1000);
    expect(claim.policyValid).toBe(false);
    expect(claim.payout).toBe(0);
  });

  it('rejects when out of claims', () => {
    const empty = { ...validPolicy, claimsRemaining: 0 };
    const claim = processInsuranceClaim(empty, 1000);
    expect(claim.policyValid).toBe(false);
    expect(claim.payout).toBe(0);
  });
});

describe('applyPrincipalFloor', () => {
  it('passes losses through above the floor', () => {
    const r = applyPrincipalFloor(500, 100);
    expect(r.actualLoss).toBe(100);
    expect(r.newBalance).toBe(400);
  });

  it('clamps losses so balance never drops below the floor', () => {
    const r = applyPrincipalFloor(150, 500);
    expect(r.newBalance).toBe(ECONOMY.principalFloor);
    expect(r.actualLoss).toBe(Math.max(0, 150 - ECONOMY.principalFloor));
  });

  it('returns 0 loss when already at or below the floor', () => {
    const r = applyPrincipalFloor(ECONOMY.principalFloor, 500);
    expect(r.actualLoss).toBe(0);
    expect(r.newBalance).toBe(ECONOMY.principalFloor);
  });
});

describe('getDifficultyBand', () => {
  it('maps score to band', () => {
    expect(getDifficultyBand(10)).toBe('soft');
    expect(getDifficultyBand(50)).toBe('tricky');
    expect(getDifficultyBand(90)).toBe('brutal');
  });
});

describe('getLootRange', () => {
  it('maps balance to range label', () => {
    expect(getLootRange(100)).toBe('small');
    expect(getLootRange(1000)).toBe('moderate');
    expect(getLootRange(9999)).toBe('rich');
  });
});

describe('calculateEconomyStats', () => {
  it('returns a coherent full stat pack', () => {
    const stats = calculateEconomyStats(
      2000,
      loadout([mod({ difficulty: 0.5 }), mod({ difficulty: 0.5, type: 'keypad' })])
    );
    expect(stats.securityScore).toBeGreaterThan(0);
    expect(stats.attackFee).toBeGreaterThanOrEqual(ECONOMY.feeMin);
    expect(stats.potentialLoot).toBeLessThanOrEqual(ECONOMY.lootCap);
    expect(stats.estimatedAttacksPerDay).toBeGreaterThan(0);
    expect(stats.estimatedFailIncomePerDay).toBeGreaterThanOrEqual(0);
    expect(stats.estimatedBreachRiskPerDay).toBeGreaterThanOrEqual(0);
    expect(typeof stats.recommendedInsurance).toBe('boolean');
  });
});
