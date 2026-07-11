import { describe, it, expect } from 'vitest';
import { ENGINE_SCHEMAS, isSupportedEngine, validateConfig } from './config-schemas';

describe('isSupportedEngine', () => {
  it('recognises the six 3A engines', () => {
    for (const e of ['maze', 'snake', 'timing', 'pattern', 'memorymatch', 'quickmath']) {
      expect(isSupportedEngine(e)).toBe(true);
    }
  });
  it('rejects unknown engines', () => {
    expect(isSupportedEngine('donkeykong')).toBe(false);
    expect(isSupportedEngine('')).toBe(false);
  });
});

describe('validateConfig', () => {
  it('accepts a valid maze config and fills theme default', () => {
    const v = validateConfig('maze', { gridSize: 9, timeLimit: 30 });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.config).toMatchObject({ gridSize: 9, timeLimit: 30, theme: 'neon' });
    }
  });

  it('rejects out-of-range numbers', () => {
    const v = validateConfig('maze', { gridSize: 100, timeLimit: 30 });
    expect(v.ok).toBe(false);
  });

  it('rejects missing required fields', () => {
    const v = validateConfig('maze', { gridSize: 9 });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join(' ')).toMatch(/timeLimit/);
  });

  it('rejects unknown fields (prompt-injection defence)', () => {
    const v = validateConfig('maze', { gridSize: 9, timeLimit: 30, exploit: 'rm -rf /' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join(' ')).toMatch(/exploit/);
  });

  it('rejects non-object configs', () => {
    expect(validateConfig('maze', null).ok).toBe(false);
    expect(validateConfig('maze', 42).ok).toBe(false);
    expect(validateConfig('maze', 'oops').ok).toBe(false);
    expect(validateConfig('maze', [1, 2, 3]).ok).toBe(false);
  });

  it('rejects unknown engine', () => {
    const v = validateConfig('donkeykong', {});
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join(' ')).toMatch(/unknown engine/);
  });

  it('validates enums (maze theme)', () => {
    const ok = validateConfig('maze', { gridSize: 9, timeLimit: 30, theme: 'ice' });
    expect(ok.ok).toBe(true);
    const bad = validateConfig('maze', { gridSize: 9, timeLimit: 30, theme: 'rainbow' });
    expect(bad.ok).toBe(false);
  });

  it('validates array of enum for quickmath.operations', () => {
    const ok = validateConfig('quickmath', {
      problemCount: 10,
      operations: ['add', 'sub'],
      timeLimit: 45,
    });
    expect(ok.ok).toBe(true);
    const bad = validateConfig('quickmath', {
      problemCount: 10,
      operations: ['add', 'sqrt'],
      timeLimit: 45,
    });
    expect(bad.ok).toBe(false);
  });

  it('rounds integer fields to whole numbers', () => {
    const v = validateConfig('maze', { gridSize: 9.7, timeLimit: 30 });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.config.gridSize).toBe(10);
  });

  it('every engine schema references its own engine name', () => {
    for (const [name, schema] of Object.entries(ENGINE_SCHEMAS)) {
      expect(schema.engine).toBe(name);
    }
  });
});
