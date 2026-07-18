// P0.1 regression: submit_result must decide DSL outcomes by replaying
// the issued seed, not by trusting the client's `passed`/`score`. These
// tests exercise the pure verifier that the Edge Function calls.

import { describe, it, expect } from 'vitest';
import { verifyAttack, type SubmittedResultV } from './verify';
import { replayDslTrace } from './dsl-runtime';
import { validateDsl } from './dsl';
import type { AttackModuleSeed } from './attack-flow';
import type { SecurityLoadout, SecurityModule } from './types';

// A tiny deterministic, enemy-free board: player at (0,0), goal at
// (2,0). Moving right twice wins; nothing else does. No enemies means
// no RNG draws, so trace-generation and replay are trivially in sync.
const DSL_GAME = (() => {
  const v = validateDsl({
    version: 1,
    board: { width: 5, height: 5 },
    timeLimit: 15,
    winCondition: 'reach_goal',
    entities: [
      { id: 'p', kind: 'player', x: 0, y: 0 },
      { id: 'g', kind: 'goal', x: 2, y: 0 },
    ],
  });
  if (!v.ok) throw new Error('setup');
  return v.program;
})();

const WIN_TRACE = ['right', 'right'] as const;

function dslModule(): SecurityModule {
  return {
    id: 'g1-slot-0',
    type: 'maze',
    difficulty: 0.5,
    weight: 1,
    name: 'Warden Run',
    description: 'dsl',
    customGameId: 'g1',
    customConfig: { baseEngine: 'maze', config: DSL_GAME, mode: 'dsl_program' },
  };
}

function dslSeed(): AttackModuleSeed {
  return { index: 0, moduleType: 'maze', difficulty: 0.5, seed: 's0', config: DSL_GAME, baseEngine: 'maze', mode: 'dsl_program' };
}

describe('replayDslTrace', () => {
  it('a winning trace wins; empty and losing traces do not', () => {
    expect(replayDslTrace(DSL_GAME, 's0', [...WIN_TRACE]).won).toBe(true);
    expect(replayDslTrace(DSL_GAME, 's0', []).won).toBe(false);
    expect(replayDslTrace(DSL_GAME, 's0', ['left', 'left', 'idle']).won).toBe(false);
  });
});

describe('verifyAttack — fabricated win is rejected', () => {
  const loadout: SecurityLoadout = { modules: [dslModule()], effectiveScore: 0 };
  const seeds = [dslSeed()];

  it('rejects passed:true with NO input trace (the reported exploit)', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'maze', score: 0.85, passed: true, timeSpent: 18000 },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allPassed).toBe(false); // <- the whole point
    expect(res.rows[0].passed).toBe(false);
    expect(res.rows[0].reason).toBe('no_input_trace');
    expect(res.rows[0].method).toBe('replay');
  });

  it('rejects a losing input trace even if the client claims passed', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'maze', score: 1, passed: true, timeSpent: 12000, inputTrace: ['left', 'down'] },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok && res.allPassed).toBe(false);
  });

  it('accepts a genuinely winning input trace', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'maze', score: 0, passed: false, timeSpent: 4000, inputTrace: [...WIN_TRACE] },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allPassed).toBe(true);
    expect(res.rows[0].passed).toBe(true);
    expect(res.rows[0].method).toBe('replay');
  });
});

describe('verifyAttack — mixed loadout (DSL + lock), the reported safe', () => {
  const lock: SecurityModule = { id: 'm2', type: 'keypad', difficulty: 0.5, weight: 1, name: 'Keypad', description: '' };
  const loadout: SecurityLoadout = { modules: [dslModule(), lock], effectiveScore: 0 };
  const seeds: AttackModuleSeed[] = [dslSeed(), { index: 1, moduleType: 'keypad', difficulty: 0.5, seed: 's1' }];

  it('all-fabricated pass is rejected because the DSL module fails replay', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'maze', score: 0.85, passed: true, timeSpent: 18000 },
      { moduleIndex: 1, moduleType: 'keypad', score: 0.9, passed: true, timeSpent: 5000 },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok && res.allPassed).toBe(false);
  });

  it('real DSL trace + plausible lock passes', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'maze', score: 1, passed: true, timeSpent: 4000, inputTrace: [...WIN_TRACE] },
      { moduleIndex: 1, moduleType: 'keypad', score: 0.9, passed: true, timeSpent: 5000 },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allPassed).toBe(true);
  });

  it('still rejects a physically implausible non-DSL result (fraud floor)', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'maze', score: 1, passed: true, timeSpent: 4000, inputTrace: [...WIN_TRACE] },
      { moduleIndex: 1, moduleType: 'keypad', score: 1, passed: true, timeSpent: 5 }, // 5ms perfect → implausible
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('implausible_result');
  });
});
