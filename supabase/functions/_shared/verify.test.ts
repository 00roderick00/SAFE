// P0.1 regression: submit_result must decide DSL outcomes by replaying
// the issued seed, not by trusting the client's `passed`/`score`. These
// tests exercise the pure verifier that the Edge Function calls.

import { describe, it, expect } from 'vitest';
import { verifyAttack, type SubmittedResultV } from './verify';
import { replayDslTrace } from './dsl-runtime';
import { validateDsl } from './dsl';
import { deriveLockSolution } from './lock-solutions';
import type { AttackModuleSeed } from './attack-flow';
import type { SecurityLoadout, SecurityModule } from './types';

// Correct seed-derived answer for an answer-lock (what a real player who
// actually solved it would submit).
const solve = (type: 'keypad' | 'colorcode' | 'combination', seed: string, difficulty: number) =>
  deriveLockSolution(type, seed, difficulty);

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

  it('real DSL trace + correctly-answered lock passes', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'maze', score: 1, passed: true, timeSpent: 4000, inputTrace: [...WIN_TRACE] },
      // keypad seed 's1' @0.5 — a real solver submits the seed-derived code.
      { moduleIndex: 1, moduleType: 'keypad', score: 0.9, passed: true, timeSpent: 5000, answer: solve('keypad', 's1', 0.5) },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allPassed).toBe(true);
    expect(res.rows[1].method).toBe('answer');
  });

  it('rejects the lock when the submitted answer is wrong, even if passed:true', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'maze', score: 1, passed: true, timeSpent: 4000, inputTrace: [...WIN_TRACE] },
      { moduleIndex: 1, moduleType: 'keypad', score: 1, passed: true, timeSpent: 5000, answer: '00000000' },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok && res.allPassed).toBe(false);
  });
});

describe('verifyAttack — a NON-DSL safe cannot be forged (the fix)', () => {
  // A safe with only built-in answer locks (no DSL) — exactly the case
  // that used to be forgeable via plausibility-only checks.
  const loadout: SecurityLoadout = {
    effectiveScore: 0,
    modules: [
      { id: 'a', type: 'keypad', difficulty: 0.5, weight: 1, name: 'Keypad', description: '' },
      { id: 'b', type: 'combination', difficulty: 0.4, weight: 1, name: 'Combo Dial', description: '' },
      { id: 'c', type: 'colorcode', difficulty: 0.3, weight: 1, name: 'Color Code', description: '' },
    ],
  };
  const seeds: AttackModuleSeed[] = [
    { index: 0, moduleType: 'keypad', difficulty: 0.5, seed: 'k-seed' },
    { index: 1, moduleType: 'combination', difficulty: 0.4, seed: 'c-seed' },
    { index: 2, moduleType: 'colorcode', difficulty: 0.3, seed: 'cc-seed' },
  ];

  it('REJECTS a fabricated all-pass with made-up scores and no real answers', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'keypad', score: 0.99, passed: true, timeSpent: 6000 },
      { moduleIndex: 1, moduleType: 'combination', score: 0.99, passed: true, timeSpent: 6000 },
      { moduleIndex: 2, moduleType: 'colorcode', score: 0.99, passed: true, timeSpent: 6000 },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allPassed).toBe(false); // the whole point
    expect(res.rows.every((r) => r.method === 'answer' && !r.passed)).toBe(true);
    expect(res.verifiableCount).toBe(3);
  });

  it('REJECTS plausible-looking wrong answers', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'keypad', score: 1, passed: true, timeSpent: 6000, answer: '11111111' },
      { moduleIndex: 1, moduleType: 'combination', score: 1, passed: true, timeSpent: 6000, answer: [9, 9, 9, 9] },
      { moduleIndex: 2, moduleType: 'colorcode', score: 1, passed: true, timeSpent: 6000, answer: [0, 0, 0, 0] },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok && res.allPassed).toBe(false);
  });

  it('ACCEPTS a legitimately-solved submission (correct seed-derived answers)', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'keypad', score: 0, passed: false, timeSpent: 8000, answer: solve('keypad', 'k-seed', 0.5).join('') },
      { moduleIndex: 1, moduleType: 'combination', score: 0, passed: false, timeSpent: 8000, answer: solve('combination', 'c-seed', 0.4) },
      { moduleIndex: 2, moduleType: 'colorcode', score: 0, passed: false, timeSpent: 8000, answer: solve('colorcode', 'cc-seed', 0.3) },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allPassed).toBe(true);
    expect(res.rows.every((r) => r.passed && r.method === 'answer')).toBe(true);
  });
});

describe('verifyAttack — class-2 modules still get the plausibility floor', () => {
  const loadout: SecurityLoadout = {
    effectiveScore: 0,
    modules: [
      { id: 'a', type: 'keypad', difficulty: 0.5, weight: 1, name: 'Keypad', description: '' },
      { id: 'b', type: 'pacman', difficulty: 0.4, weight: 1, name: 'Pac-Man', description: '' },
    ],
  };
  const seeds: AttackModuleSeed[] = [
    { index: 0, moduleType: 'keypad', difficulty: 0.5, seed: 'k' },
    { index: 1, moduleType: 'pacman', difficulty: 0.4, seed: 'p' },
  ];

  it('rejects a physically implausible arcade result (5ms perfect)', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'keypad', score: 1, passed: true, timeSpent: 6000, answer: solve('keypad', 'k', 0.5).join('') },
      { moduleIndex: 1, moduleType: 'pacman', score: 1, passed: true, timeSpent: 5 },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('implausible_result');
  });
});

describe('verifyAttack — composition rule (verifiableCount)', () => {
  it('reports zero verifiable modules for an all-arcade safe', () => {
    const loadout: SecurityLoadout = {
      effectiveScore: 0,
      modules: [
        { id: 'a', type: 'pacman', difficulty: 0.5, weight: 1, name: 'Pac-Man', description: '' },
        { id: 'b', type: 'snake', difficulty: 0.5, weight: 1, name: 'Snake', description: '' },
        { id: 'c', type: 'tetris', difficulty: 0.5, weight: 1, name: 'Tetris', description: '' },
      ],
    };
    const seeds: AttackModuleSeed[] = loadout.modules.map((m, i) => ({ index: i, moduleType: m.type, difficulty: m.difficulty, seed: `s${i}` }));
    const submitted: SubmittedResultV[] = loadout.modules.map((m, i) => ({ moduleIndex: i, moduleType: m.type, score: 1, passed: true, timeSpent: 6000 }));
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Client claims all passed via plausibility — but there is nothing
    // the server can verify, so submit_result forces this to a loss.
    expect(res.verifiableCount).toBe(0);
  });
});
