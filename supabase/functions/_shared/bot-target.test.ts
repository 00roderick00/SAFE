import { describe, it, expect } from 'vitest';
import { BOT_ID_PREFIX, generateBotTarget, newBotId, parseBotId } from './bot-target';

describe('parseBotId', () => {
  it('returns the seed portion of a bot id', () => {
    expect(parseBotId('bot_abc123')).toBe('abc123');
  });

  it('returns null for a UUID (real safe id)', () => {
    expect(parseBotId('9f8e7d6c-1234-5678-9abc-def012345678')).toBeNull();
  });

  it('returns null for the prefix alone (no seed)', () => {
    expect(parseBotId(BOT_ID_PREFIX)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseBotId('')).toBeNull();
  });
});

describe('newBotId', () => {
  it('carries the bot_ prefix', () => {
    expect(newBotId().startsWith(BOT_ID_PREFIX)).toBe(true);
  });

  it('is unique across calls', () => {
    const s = new Set(Array.from({ length: 32 }, () => newBotId()));
    expect(s.size).toBe(32);
  });
});

describe('generateBotTarget', () => {
  it('is fully deterministic for a given seed', () => {
    const a = generateBotTarget('seed-alpha');
    const b = generateBotTarget('seed-alpha');
    expect(b).toEqual(a);
  });

  it('produces different bots for different seeds', () => {
    const a = generateBotTarget('seed-one');
    const b = generateBotTarget('seed-two');
    expect(a.handle).not.toBe(b.handle);
    expect(a.balance === b.balance && a.difficulty === b.difficulty).toBe(false);
  });

  it('id round-trips through parseBotId', () => {
    const bot = generateBotTarget('rtseed123');
    const parsed = parseBotId(bot.id);
    expect(parsed).toBe('rtseed123');
    const rebuilt = generateBotTarget(parsed!);
    expect(rebuilt).toEqual(bot);
  });

  it('exposes computed attackFee within economy bounds', () => {
    const bot = generateBotTarget('fee-seed');
    expect(bot.attackFee).toBeGreaterThan(0);
    expect(bot.attackFee).toBeLessThan(3001); // ECONOMY.feeMax
  });

  it('reflects attacker balance cap when provided', () => {
    const bot = generateBotTarget('cap-seed');
    const capped = generateBotTarget('cap-seed', 100);
    expect(capped.attackFee).toBeLessThanOrEqual(bot.attackFee);
    expect(capped.attackFee).toBeLessThanOrEqual(50); // 50% of 100
  });

  it('assigns handle, tagline, band from stable seeded picks', () => {
    const bot = generateBotTarget('label-seed');
    expect(bot.handle.length).toBeGreaterThan(0);
    expect(bot.tagline.length).toBeGreaterThan(0);
    expect(['soft', 'tricky', 'brutal']).toContain(bot.difficultyBand);
    expect(['small', 'moderate', 'rich']).toContain(bot.lootRange);
  });

  it('generates a non-empty loadout with computed securityScore', () => {
    const bot = generateBotTarget('loadout-seed');
    expect(bot.loadout.modules.length).toBeGreaterThan(0);
    expect(bot.securityScore).toBeGreaterThan(0);
    expect(bot.securityScore).toBe(bot.loadout.effectiveScore);
  });
});
