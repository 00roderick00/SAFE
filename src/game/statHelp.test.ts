/**
 * The stat help must describe the ACTUAL economy, not remembered
 * numbers. Every figure in the copy is re-derived here straight from
 * ECONOMY / the economy formulas, so a tunable change that isn't
 * reflected in the copy fails the build.
 */
import { describe, it, expect } from 'vitest';
import { STAT_HELP, SKILL_COUNT } from './statHelp';
import { ECONOMY } from './constants';
import { calculateLoot, calculateLootDistribution } from './economy';

const pct = (n: number) => `${Math.round(n * 100)}%`;

describe('copy matches the economy formulas', () => {
  it('loot fraction and cap are quoted correctly wherever loot is described', () => {
    // calculateLoot: min(V * lootFraction, lootCap)
    for (const key of ['potentialLoss', 'potentialBreachLoss', 'grossLoot'] as const) {
      expect(STAT_HELP[key].body).toContain(pct(ECONOMY.lootFraction));
      expect(STAT_HELP[key].body).toContain(ECONOMY.lootCap.toLocaleString());
    }
    // And the quoted percentage really is what the formula applies.
    const balance = 10_000;
    expect(calculateLoot(balance)).toBe(balance * ECONOMY.lootFraction);
  });

  it('balance help quotes the loot fraction and the principal floor', () => {
    expect(STAT_HELP.balance.body).toContain(pct(ECONOMY.lootFraction));
    expect(STAT_HELP.balance.body).toContain(ECONOMY.principalFloor.toLocaleString());
  });

  it('platform cut help quotes the real cut, and net = gross - cut', () => {
    expect(STAT_HELP.platformCut.body).toContain(pct(ECONOMY.platformCut));
    expect(STAT_HELP.netWin.body).toContain(pct(ECONOMY.platformCut));
    const split = calculateLootDistribution(1000);
    expect(split.platformReceives).toBe(Math.round(1000 * ECONOMY.platformCut));
    expect(split.attackerReceives).toBe(1000 - split.platformReceives);
  });

  it('insurance help quotes the real coverage', () => {
    expect(STAT_HELP.insurance.body).toContain(pct(ECONOMY.insurance.coverage));
  });

  it('security help quotes the real score ceiling and the exponential rule', () => {
    for (const key of ['security', 'securityStrength'] as const) {
      expect(STAT_HELP[key].body).toContain(String(ECONOMY.maxSecurityScore));
      // calculateModuleStrength: w * (exp(k * d) - 1) — difficulty is
      // the exponent, which is exactly what the copy tells the player.
      expect(STAT_HELP[key].body).toMatch(/exponential/i);
    }
  });

  it('skill coverage help quotes the number of skills the catalog defines', () => {
    expect(STAT_HELP.skillCoverage.body).toContain(String(SKILL_COUNT));
  });

  it('stake help describes the all-or-nothing rule that submit_result enforces', () => {
    expect(STAT_HELP.stake.body).toMatch(/one lock holds/i);
  });
});

describe('copy quality', () => {
  it('every entry is one or two short sentences with a title', () => {
    for (const [key, entry] of Object.entries(STAT_HELP)) {
      expect(entry.title.length, key).toBeGreaterThan(0);
      const sentences = entry.body.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length, `${key} sentence count`).toBeLessThanOrEqual(2);
      expect(entry.body.length, `${key} length`).toBeLessThanOrEqual(220);
    }
  });

  it('the actionable stats say how to improve them', () => {
    expect(STAT_HELP.security.body).toMatch(/raise a lock's difficulty|fill a skill gap/i);
    expect(STAT_HELP.skillCoverage.body).toMatch(/equip a lock/i);
  });
});
