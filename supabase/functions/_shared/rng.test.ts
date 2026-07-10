import { describe, it, expect } from 'vitest';
import { createRng, newSeed } from './rng';

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng('hello');
    const b = createRng('hello');
    const va = Array.from({ length: 8 }, () => a());
    const vb = Array.from({ length: 8 }, () => b());
    expect(va).toEqual(vb);
  });

  it('produces different streams for different seeds', () => {
    const a = createRng('one');
    const b = createRng('two');
    // Fair overlap possible; check first 16 draws aren't identical.
    const va = Array.from({ length: 16 }, () => a());
    const vb = Array.from({ length: 16 }, () => b());
    expect(va).not.toEqual(vb);
  });

  it('yields values in [0, 1)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('newSeed', () => {
  it('returns unique values on each call', () => {
    const seeds = new Set(Array.from({ length: 32 }, () => newSeed()));
    expect(seeds.size).toBe(32);
  });

  it('honors a prefix', () => {
    const s = newSeed('attack');
    expect(s.startsWith('attack_')).toBe(true);
  });

  it('is URL-safe (no /, +, =)', () => {
    for (let i = 0; i < 20; i++) {
      const s = newSeed();
      expect(s).not.toMatch(/[+/=]/);
    }
  });
});
