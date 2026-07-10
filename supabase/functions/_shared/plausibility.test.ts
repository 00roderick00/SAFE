import { describe, it, expect } from 'vitest';
import { checkPlausibility, type SubmittedResult } from './plausibility';

const base: SubmittedResult = {
  moduleType: 'pattern',
  moduleIndex: 0,
  score: 0.9,
  passed: true,
  timeSpent: 5000,
};

describe('checkPlausibility', () => {
  it('accepts a normal-looking result', () => {
    const v = checkPlausibility({ ...base }, 0.5);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.adjustedScore).toBeCloseTo(0.9);
      expect(v.adjustedPassed).toBe(true);
    }
  });

  it('rejects a score outside [0, 1]', () => {
    const high = checkPlausibility({ ...base, score: 1.5 }, 0.5);
    expect(high.ok).toBe(false);
    const low = checkPlausibility({ ...base, score: -0.1 }, 0.5);
    expect(low.ok).toBe(false);
  });

  it('rejects negative or infinite time', () => {
    const v = checkPlausibility({ ...base, timeSpent: -1 }, 0.5);
    expect(v.ok).toBe(false);
    const inf = checkPlausibility({ ...base, timeSpent: Infinity }, 0.5);
    expect(inf.ok).toBe(false);
  });

  it('rejects a claimed pass in an implausibly short time', () => {
    const v = checkPlausibility({ ...base, timeSpent: 50 }, 0.5);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('too_fast_for_pass');
  });

  it('rejects a runaway timer', () => {
    const v = checkPlausibility({ ...base, timeSpent: 10 * 60 * 1000 }, 0.5);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('time_exceeded');
  });

  it('re-derives passed from score threshold, ignoring client claim', () => {
    // Client says passed=true but score is below the 0.65 threshold.
    const v = checkPlausibility({ ...base, score: 0.4, passed: true }, 0.5);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.adjustedPassed).toBe(false);
  });

  it('accepts arcade games at ~5s (above the 3s default floor)', () => {
    const v = checkPlausibility(
      { ...base, moduleType: 'pacman', timeSpent: 5000, score: 0.8 },
      0.5
    );
    expect(v.ok).toBe(true);
  });

  it('rejects arcade games claiming a pass in < 3s', () => {
    const v = checkPlausibility(
      { ...base, moduleType: 'pacman', timeSpent: 1000, score: 0.8 },
      0.5
    );
    expect(v.ok).toBe(false);
  });
});
