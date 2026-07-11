import { describe, it, expect } from 'vitest';
import { DSL_LIMITS, validateDsl } from './dsl';

function baseGame(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    board: { width: 8, height: 8 },
    timeLimit: 30,
    winCondition: 'reach_goal',
    entities: [
      { id: 'p', kind: 'player', x: 0, y: 0 },
      { id: 'g', kind: 'goal', x: 7, y: 7 },
    ],
    ...overrides,
  };
}

describe('validateDsl', () => {
  it('accepts a minimal valid game', () => {
    const v = validateDsl(baseGame());
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.program.entities.find((e) => e.kind === 'player')?.movement?.type).toBe('input');
      expect(v.program.entities.find((e) => e.kind === 'goal')?.movement?.type).toBe('static');
    }
  });

  it('rejects wrong version', () => {
    const v = validateDsl({ ...baseGame(), version: 2 });
    expect(v.ok).toBe(false);
  });

  it('rejects unknown top-level fields', () => {
    const v = validateDsl({ ...baseGame(), exploit: 'rm -rf' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join(' ')).toMatch(/exploit/);
  });

  it('rejects boards outside the allowed range', () => {
    const tooSmall = validateDsl(baseGame({ board: { width: 3, height: 3 } }));
    expect(tooSmall.ok).toBe(false);
    const tooBig = validateDsl(baseGame({ board: { width: 30, height: 30 } }));
    expect(tooBig.ok).toBe(false);
  });

  it('rejects timeLimit out of range', () => {
    expect(validateDsl(baseGame({ timeLimit: 5 })).ok).toBe(false);
    expect(validateDsl(baseGame({ timeLimit: 300 })).ok).toBe(false);
  });

  it('rejects invalid winCondition', () => {
    expect(validateDsl(baseGame({ winCondition: 'destroy_everything' })).ok).toBe(false);
  });

  it('requires exactly one player', () => {
    const zero = validateDsl(baseGame({ entities: [{ id: 'g', kind: 'goal', x: 1, y: 1 }] }));
    expect(zero.ok).toBe(false);
    const two = validateDsl(baseGame({
      entities: [
        { id: 'p1', kind: 'player', x: 0, y: 0 },
        { id: 'p2', kind: 'player', x: 1, y: 1 },
        { id: 'g', kind: 'goal', x: 5, y: 5 },
      ],
    }));
    expect(two.ok).toBe(false);
  });

  it('requires at least one token for collect_all_tokens', () => {
    const v = validateDsl(baseGame({
      winCondition: 'collect_all_tokens',
      entities: [{ id: 'p', kind: 'player', x: 0, y: 0 }],
    }));
    expect(v.ok).toBe(false);
  });

  it('rejects off-board entities', () => {
    const v = validateDsl(baseGame({
      entities: [
        { id: 'p', kind: 'player', x: 0, y: 0 },
        { id: 'g', kind: 'goal', x: 99, y: 0 },
      ],
    }));
    expect(v.ok).toBe(false);
  });

  it('rejects duplicate ids', () => {
    const v = validateDsl(baseGame({
      entities: [
        { id: 'x', kind: 'player', x: 0, y: 0 },
        { id: 'x', kind: 'goal', x: 5, y: 5 },
      ],
    }));
    expect(v.ok).toBe(false);
  });

  it('rejects two entities on the same cell', () => {
    const v = validateDsl(baseGame({
      entities: [
        { id: 'p', kind: 'player', x: 0, y: 0 },
        { id: 'g', kind: 'goal', x: 0, y: 0 },
      ],
    }));
    expect(v.ok).toBe(false);
  });

  it('rejects enemies without a movement spec', () => {
    const v = validateDsl(baseGame({
      entities: [
        { id: 'p', kind: 'player', x: 0, y: 0 },
        { id: 'g', kind: 'goal', x: 5, y: 5 },
        { id: 'e', kind: 'enemy', x: 3, y: 3 },
      ],
    }));
    expect(v.ok).toBe(false);
  });

  it('accepts chase enemies with speed in range', () => {
    const v = validateDsl(baseGame({
      entities: [
        { id: 'p', kind: 'player', x: 0, y: 0 },
        { id: 'g', kind: 'goal', x: 5, y: 5 },
        { id: 'e', kind: 'enemy', x: 3, y: 3, movement: { type: 'chase', speed: 3 } },
      ],
    }));
    expect(v.ok).toBe(true);
  });

  it('rejects enemy speed above the limit', () => {
    const v = validateDsl(baseGame({
      entities: [
        { id: 'p', kind: 'player', x: 0, y: 0 },
        { id: 'g', kind: 'goal', x: 5, y: 5 },
        { id: 'e', kind: 'enemy', x: 3, y: 3, movement: { type: 'chase', speed: 99 } },
      ],
    }));
    expect(v.ok).toBe(false);
  });

  it('rejects a player with non-input movement', () => {
    const v = validateDsl(baseGame({
      entities: [
        { id: 'p', kind: 'player', x: 0, y: 0, movement: { type: 'random', speed: 3 } },
        { id: 'g', kind: 'goal', x: 5, y: 5 },
      ],
    }));
    expect(v.ok).toBe(false);
  });

  it('caps total entities', () => {
    const many = Array.from({ length: DSL_LIMITS.entityMax + 5 }, (_, i) => ({
      id: `t${i}`,
      kind: 'token',
      x: i % 8,
      y: Math.floor(i / 8) % 8,
    }));
    const v = validateDsl(baseGame({
      winCondition: 'collect_all_tokens',
      entities: [{ id: 'p', kind: 'player', x: 0, y: 0 }, ...many],
    }));
    expect(v.ok).toBe(false);
  });
});
