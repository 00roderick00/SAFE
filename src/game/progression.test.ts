import { describe, it, expect } from 'vitest';
import { getUnlockTier, isSurfaceUnlocked, requirementFor, TIER_UNLOCKS } from './progression';

describe('getUnlockTier', () => {
  it('maps completed-heist counts onto tiers 0..3', () => {
    expect(getUnlockTier({ completedHeists: 0, successfulHeists: 0 })).toBe(0);
    expect(getUnlockTier({ completedHeists: 1, successfulHeists: 0 })).toBe(1);
    expect(getUnlockTier({ completedHeists: 2, successfulHeists: 0 })).toBe(1);
    expect(getUnlockTier({ completedHeists: 3, successfulHeists: 0 })).toBe(2);
    expect(getUnlockTier({ completedHeists: 4, successfulHeists: 0 })).toBe(2);
    expect(getUnlockTier({ completedHeists: 5, successfulHeists: 0 })).toBe(3);
    expect(getUnlockTier({ completedHeists: 50, successfulHeists: 10 })).toBe(3);
  });

  it('first successful breach fast-tracks tier 3', () => {
    expect(getUnlockTier({ completedHeists: 1, successfulHeists: 1 })).toBe(3);
  });
});

describe('isSurfaceUnlocked', () => {
  it('tier 0 shows only the core loop', () => {
    for (const surface of ['security', 'history', 'insurance', 'marketplace', 'create'] as const) {
      expect(isSurfaceUnlocked(surface, 0)).toBe(false);
    }
  });

  it('tier 1 unlocks security + history', () => {
    expect(isSurfaceUnlocked('security', 1)).toBe(true);
    expect(isSurfaceUnlocked('history', 1)).toBe(true);
    expect(isSurfaceUnlocked('insurance', 1)).toBe(false);
    expect(isSurfaceUnlocked('marketplace', 1)).toBe(false);
    expect(isSurfaceUnlocked('create', 1)).toBe(false);
  });

  it('tier 2 unlocks insurance + marketplace', () => {
    expect(isSurfaceUnlocked('insurance', 2)).toBe(true);
    expect(isSurfaceUnlocked('marketplace', 2)).toBe(true);
    expect(isSurfaceUnlocked('create', 2)).toBe(false);
  });

  it('tier 3 unlocks everything', () => {
    for (const surface of ['security', 'history', 'insurance', 'marketplace', 'create'] as const) {
      expect(isSurfaceUnlocked(surface, 3)).toBe(true);
    }
  });
});

describe('locked-surface copy', () => {
  it('every gated surface has an unlock condition and every tier an announcement', () => {
    for (const surface of ['security', 'history', 'insurance', 'marketplace', 'create'] as const) {
      expect(requirementFor(surface).length).toBeGreaterThan(0);
    }
    for (const tier of [1, 2, 3] as const) {
      expect(TIER_UNLOCKS[tier].title).toContain('unlocked');
    }
  });
});
