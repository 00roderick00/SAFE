import { describe, it, expect } from 'vitest';
import { suggestTweak } from './suggestions';
import { validateDsl } from './dsl';

describe('suggestTweak (engine_config)', () => {
  it('suggests more time / smaller grid for a too-hard maze', () => {
    const s = suggestTweak({ mode: 'engine_config', engine: 'maze', config: { gridSize: 12, timeLimit: 15 }, reason: 'too_hard' });
    expect(s).toMatch(/Too hard/);
    expect(s).toMatch(/23s|\+8s/);
  });

  it('suggests less time / bigger grid for a too-easy maze', () => {
    const s = suggestTweak({ mode: 'engine_config', engine: 'maze', config: { gridSize: 6, timeLimit: 90 }, reason: 'too_easy' });
    expect(s).toMatch(/Too easy/);
    expect(s).toMatch(/-8s|grow the grid/);
  });

  it('returns undefined when the game passed (no reason)', () => {
    expect(suggestTweak({ mode: 'engine_config', engine: 'maze', config: {}, reason: undefined })).toBeUndefined();
  });

  it('returns undefined for an unknown engine', () => {
    expect(suggestTweak({ mode: 'engine_config', engine: 'nope', config: {}, reason: 'too_hard' })).toBeUndefined();
  });
});

describe('suggestTweak (dsl_program)', () => {
  const dsl = (extra: unknown[] = []) => {
    const v = validateDsl({
      version: 1,
      board: { width: 8, height: 8 },
      timeLimit: 20,
      winCondition: 'reach_goal',
      entities: [
        { id: 'p', kind: 'player', x: 0, y: 0 },
        { id: 'g', kind: 'goal', x: 7, y: 7 },
        ...extra,
      ],
    });
    if (!v.ok) throw new Error('setup');
    return v.program;
  };

  it('suggests +time / fewer enemies for a too-hard DSL game', () => {
    const g = dsl([{ id: 'e', kind: 'enemy', x: 4, y: 4, movement: { type: 'chase', speed: 4 } }]);
    const s = suggestTweak({ mode: 'dsl_program', dsl: g, reason: 'too_hard' });
    expect(s).toMatch(/Too hard/);
    expect(s).toMatch(/enemy|timer|slow/i);
  });

  it('suggests adding an enemy for a too-easy DSL game with none', () => {
    const g = dsl();
    const s = suggestTweak({ mode: 'dsl_program', dsl: g, reason: 'too_easy' });
    expect(s).toMatch(/Too easy/);
    expect(s).toMatch(/add a chasing enemy/i);
  });
});
