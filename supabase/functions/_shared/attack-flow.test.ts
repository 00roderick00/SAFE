import { describe, it, expect } from 'vitest';
import {
  buildAttackSeeds,
  computeLootSplit,
  computeStake,
  generateBotLoadout,
} from './attack-flow';
import { ECONOMY } from './constants';
import { calculateSecurityScore } from './economy';
import type { SecurityLoadout } from './types';

const loadout: SecurityLoadout = {
  effectiveScore: 0,
  modules: [
    { id: 'a', type: 'pattern', difficulty: 0.4, weight: 1, name: 'a', description: '' },
    { id: 'b', type: 'keypad', difficulty: 0.6, weight: 1, name: 'b', description: '' },
    { id: 'c', type: 'timing', difficulty: 0.8, weight: 1, name: 'c', description: '' },
  ],
};

describe('buildAttackSeeds', () => {
  it('emits one seed per module with the right module type/difficulty', () => {
    const seeds = buildAttackSeeds('attack-1', loadout);
    expect(seeds).toHaveLength(3);
    seeds.forEach((s, i) => {
      expect(s.index).toBe(i);
      expect(s.moduleType).toBe(loadout.modules[i].type);
      expect(s.difficulty).toBe(loadout.modules[i].difficulty);
      expect(typeof s.seed).toBe('string');
      expect(s.seed.length).toBeGreaterThan(4);
    });
  });

  it('produces unique seeds per module', () => {
    const seeds = buildAttackSeeds('attack-2', loadout);
    const strings = new Set(seeds.map(s => s.seed));
    expect(strings.size).toBe(seeds.length);
  });
});

describe('computeStake', () => {
  it('respects the balance cap', () => {
    // Attacker has 100 tokens; stake should never exceed 50%.
    const stake = computeStake(10_000, 5, 100);
    expect(stake).toBeLessThanOrEqual(100 * ECONOMY.feeMaxPercentOfBalance);
  });
});

describe('computeLootSplit', () => {
  it('sums to potentialLoot', () => {
    const { potentialLoot, attackerReceives, platformReceives } =
      computeLootSplit(2000);
    expect(attackerReceives + platformReceives).toBe(potentialLoot);
  });

  it('caps at lootCap', () => {
    const { potentialLoot } = computeLootSplit(10_000_000);
    expect(potentialLoot).toBeLessThanOrEqual(ECONOMY.lootCap);
  });
});

describe('generateBotLoadout', () => {
  it('is deterministic for a given seed', () => {
    const a = generateBotLoadout('bot-1', 0.5);
    const b = generateBotLoadout('bot-1', 0.5);
    expect(a.modules).toEqual(b.modules);
  });

  it('produces the configured number of modules', () => {
    const bot = generateBotLoadout('bot-2', 0.7);
    expect(bot.modules).toHaveLength(ECONOMY.maxModules);
  });

  it('does not duplicate module types', () => {
    const bot = generateBotLoadout('bot-3', 0.5);
    const types = new Set(bot.modules.map(m => m.type));
    expect(types.size).toBe(bot.modules.length);
  });

  it('generates a nonzero security score', () => {
    const bot = generateBotLoadout('bot-4', 0.7);
    expect(calculateSecurityScore(bot)).toBeGreaterThan(0);
  });
});
