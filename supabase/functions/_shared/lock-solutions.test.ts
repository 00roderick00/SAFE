import { describe, it, expect } from 'vitest';
import {
  deriveLockSolution,
  verifyLockAnswer,
  normalizeAnswer,
  isVerifiableLockType,
  countVerifiableModules,
  VERIFIABLE_LOCK_TYPES,
} from './lock-solutions';
import type { SecurityLoadout } from './types';

describe('deriveLockSolution', () => {
  it('is deterministic for a given (type, seed, difficulty)', () => {
    const a = deriveLockSolution('keypad', 'seed-1', 0.5);
    const b = deriveLockSolution('keypad', 'seed-1', 0.5);
    expect(a).toEqual(b);
  });

  it('different seeds give (almost always) different secrets', () => {
    const a = deriveLockSolution('keypad', 'seed-1', 0.5);
    const b = deriveLockSolution('keypad', 'seed-2', 0.5);
    expect(a).not.toEqual(b);
  });

  it('produces the right length + alphabet per type', () => {
    expect(deriveLockSolution('keypad', 's', 0).length).toBe(4);
    expect(deriveLockSolution('keypad', 's', 1).length).toBe(8);
    expect(deriveLockSolution('colorcode', 's', 1).length).toBe(4);
    expect(deriveLockSolution('combination', 's', 0).length).toBe(3);
    for (const n of deriveLockSolution('colorcode', 's', 1)) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
    }
    for (const n of deriveLockSolution('keypad', 's', 1)) expect(n).toBeLessThan(10);
  });
});

describe('verifyLockAnswer', () => {
  it('accepts the exact seed-derived answer (array or digit string)', () => {
    const sol = deriveLockSolution('keypad', 'k', 0.5);
    expect(verifyLockAnswer('keypad', 'k', 0.5, sol)).toBe(true);
    expect(verifyLockAnswer('keypad', 'k', 0.5, sol.join(''))).toBe(true);
  });

  it('rejects a wrong answer, a missing answer, and a wrong-length answer', () => {
    const sol = deriveLockSolution('combination', 'c', 0.4);
    const wrong = sol.map((n) => (n + 1) % 10);
    expect(verifyLockAnswer('combination', 'c', 0.4, wrong)).toBe(false);
    expect(verifyLockAnswer('combination', 'c', 0.4, undefined)).toBe(false);
    expect(verifyLockAnswer('combination', 'c', 0.4, sol.slice(0, -1))).toBe(false);
  });
});

describe('normalizeAnswer', () => {
  it('coerces digit strings and int arrays; rejects junk', () => {
    expect(normalizeAnswer('4821')).toEqual([4, 8, 2, 1]);
    expect(normalizeAnswer([1, 2, 3])).toEqual([1, 2, 3]);
    expect(normalizeAnswer('')).toBeNull();
    expect(normalizeAnswer('12a')).toBeNull();
    expect(normalizeAnswer([1, -1])).toBeNull();
    expect(normalizeAnswer(null)).toBeNull();
  });
});

describe('composition helpers', () => {
  it('flags the verifiable lock types', () => {
    for (const t of VERIFIABLE_LOCK_TYPES) expect(isVerifiableLockType(t)).toBe(true);
    expect(isVerifiableLockType('pacman')).toBe(false);
    expect(isVerifiableLockType('timing')).toBe(false);
  });

  it('counts verifiable modules (answer locks + DSL customs)', () => {
    const lo: SecurityLoadout = {
      effectiveScore: 0,
      modules: [
        { id: 'a', type: 'pacman', difficulty: 0.5, weight: 1, name: 'p', description: '' },
        { id: 'b', type: 'keypad', difficulty: 0.5, weight: 1, name: 'k', description: '' },
        { id: 'c', type: 'maze', difficulty: 0.5, weight: 1, name: 'dsl', description: '', customConfig: { baseEngine: 'maze', config: {}, mode: 'dsl_program' } },
      ],
    };
    expect(countVerifiableModules(lo)).toBe(2);
    const allArcade: SecurityLoadout = {
      effectiveScore: 0,
      modules: [{ id: 'a', type: 'pacman', difficulty: 0.5, weight: 1, name: 'p', description: '' }],
    };
    expect(countVerifiableModules(allArcade)).toBe(0);
  });
});
