import { describe, it, expect } from 'vitest';
import { calibrate, simulateSolveRate, TARGET_BAND } from './calibration';

describe('simulateSolveRate', () => {
  it('is roughly deterministic for a given seed', () => {
    const a = simulateSolveRate('maze', { gridSize: 9, timeLimit: 30 }, 0.5, 200, 'fixed');
    const b = simulateSolveRate('maze', { gridSize: 9, timeLimit: 30 }, 0.5, 200, 'fixed');
    expect(Math.abs(a - b)).toBeLessThan(0.02);
  });

  it('reports very low solve-rate for an impossible config', () => {
    const r = simulateSolveRate('maze', { gridSize: 15, timeLimit: 15 }, 0.5);
    expect(r).toBeLessThan(TARGET_BAND.min);
  });

  it('reports very high solve-rate for a trivial config', () => {
    const r = simulateSolveRate('maze', { gridSize: 5, timeLimit: 90 }, 0.5);
    expect(r).toBeGreaterThan(TARGET_BAND.max);
  });

  it('returns 0 for an unsupported engine', () => {
    expect(simulateSolveRate('donkeykong', {}, 0.5)).toBe(0);
  });
});

describe('calibrate', () => {
  it('marks a middle-of-band config as passing', () => {
    // A reasonable maze that should sit in the band.
    const r = calibrate('maze', { gridSize: 9, timeLimit: 45 });
    expect(r.passes).toBe(true);
    expect(r.solveRate).toBeGreaterThanOrEqual(TARGET_BAND.min);
    expect(r.solveRate).toBeLessThanOrEqual(TARGET_BAND.max);
    expect(r.calibratedDifficulty).toBeCloseTo(1 - r.solveRate, 3);
  });

  it('rejects an impossible config with reason too_hard', () => {
    const r = calibrate('maze', { gridSize: 15, timeLimit: 15 });
    expect(r.passes).toBe(false);
    expect(r.reason).toBe('too_hard');
  });

  it('rejects a trivial config with reason too_easy', () => {
    const r = calibrate('maze', { gridSize: 5, timeLimit: 90 });
    expect(r.passes).toBe(false);
    expect(r.reason).toBe('too_easy');
  });

  it('rejects an unsupported engine', () => {
    const r = calibrate('nope', {});
    expect(r.passes).toBe(false);
    expect(r.reason).toBe('unsupported_engine');
  });

  it('honors a custom band', () => {
    const r = calibrate(
      'maze',
      { gridSize: 5, timeLimit: 90 },
      { band: { min: 0.7, max: 0.99 } }
    );
    expect(r.passes).toBe(true);
  });
});
