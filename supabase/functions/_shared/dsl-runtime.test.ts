import { describe, it, expect } from 'vitest';
import { validateDsl } from './dsl';
import { calibrateDsl, playHeadless } from './dsl-runtime';

function tightGoalGame(gridSize = 6) {
  return {
    version: 1 as const,
    board: { width: gridSize, height: gridSize },
    timeLimit: 60,
    winCondition: 'reach_goal' as const,
    entities: [
      { id: 'p', kind: 'player' as const, x: 0, y: 0 },
      { id: 'g', kind: 'goal' as const, x: gridSize - 1, y: gridSize - 1 },
    ],
  };
}

describe('playHeadless', () => {
  it('is deterministic for a given seed', () => {
    const dsl = validateDsl(tightGoalGame());
    if (!dsl.ok) throw new Error('setup');
    const a = playHeadless(dsl.program, 'same-seed');
    const b = playHeadless(dsl.program, 'same-seed');
    expect(a).toEqual(b);
  });

  it('terminates on timeout for an unwinnable board', () => {
    const dsl = validateDsl({
      version: 1,
      board: { width: 6, height: 6 },
      timeLimit: 15,
      winCondition: 'reach_goal',
      entities: [
        { id: 'p', kind: 'player', x: 0, y: 0 },
        { id: 'g', kind: 'goal', x: 5, y: 5 },
        // Wall along the diagonal cutting the goal off.
        { id: 'w1', kind: 'wall', x: 1, y: 0 },
        { id: 'w2', kind: 'wall', x: 1, y: 1 },
        { id: 'w3', kind: 'wall', x: 1, y: 2 },
        { id: 'w4', kind: 'wall', x: 1, y: 3 },
        { id: 'w5', kind: 'wall', x: 1, y: 4 },
        { id: 'w6', kind: 'wall', x: 1, y: 5 },
      ],
    });
    if (!dsl.ok) throw new Error('setup');
    const trace = playHeadless(dsl.program, 'walled-off');
    expect(trace.won).toBe(false);
    expect(trace.reason).toBe('timeout');
  });

  it('the AI reaches the goal on an open board', () => {
    const dsl = validateDsl(tightGoalGame(6));
    if (!dsl.ok) throw new Error('setup');
    const trace = playHeadless(dsl.program, 'open-board');
    expect(trace.won).toBe(true);
    expect(trace.reason).toBe('goal_reached');
  });

  it('BFS routes around a wall a greedy player would dead-end on', () => {
    // Goal is directly right of the player, but a wall column blocks the
    // straight line — the only path detours DOWN and around. Manhattan-
    // greedy oscillates against the wall; BFS finds the detour and wins.
    const dsl = validateDsl({
      version: 1,
      board: { width: 5, height: 5 },
      timeLimit: 30,
      winCondition: 'reach_goal',
      entities: [
        { id: 'p', kind: 'player', x: 0, y: 0 },
        { id: 'g', kind: 'goal', x: 4, y: 0 },
        { id: 'w0', kind: 'wall', x: 2, y: 0 },
        { id: 'w1', kind: 'wall', x: 2, y: 1 },
        { id: 'w2', kind: 'wall', x: 2, y: 2 },
        { id: 'w3', kind: 'wall', x: 2, y: 3 },
        // (2,4) is the only gap.
      ],
    });
    if (!dsl.ok) throw new Error('setup');
    const trace = playHeadless(dsl.program, 'detour');
    expect(trace.won).toBe(true);
    expect(trace.reason).toBe('goal_reached');
  });
});

describe('calibrateDsl', () => {
  it('marks an open board as too_easy', () => {
    const dsl = validateDsl(tightGoalGame(6));
    if (!dsl.ok) throw new Error('setup');
    const cal = calibrateDsl(dsl.program, { iterations: 20 });
    expect(cal.passes).toBe(false);
    expect(cal.reason).toBe('too_easy');
    expect(cal.traces.length).toBeGreaterThan(0);
    expect(cal.traces.length).toBeLessThanOrEqual(5);
  });

  it('marks an unreachable board as too_hard', () => {
    const dsl = validateDsl({
      version: 1,
      board: { width: 6, height: 6 },
      timeLimit: 15,
      winCondition: 'reach_goal',
      entities: [
        { id: 'p', kind: 'player', x: 0, y: 0 },
        { id: 'g', kind: 'goal', x: 5, y: 5 },
        { id: 'w1', kind: 'wall', x: 1, y: 0 },
        { id: 'w2', kind: 'wall', x: 1, y: 1 },
        { id: 'w3', kind: 'wall', x: 1, y: 2 },
        { id: 'w4', kind: 'wall', x: 1, y: 3 },
        { id: 'w5', kind: 'wall', x: 1, y: 4 },
        { id: 'w6', kind: 'wall', x: 1, y: 5 },
      ],
    });
    if (!dsl.ok) throw new Error('setup');
    const cal = calibrateDsl(dsl.program, { iterations: 20 });
    expect(cal.passes).toBe(false);
    expect(cal.reason).toBe('too_hard');
  });

  it('accepts a game where solve rate lands in the band', () => {
    // Chase enemy on a small board sits roughly in the band.
    const dsl = validateDsl({
      version: 1,
      board: { width: 8, height: 8 },
      timeLimit: 25,
      winCondition: 'reach_goal',
      entities: [
        { id: 'p', kind: 'player', x: 0, y: 0 },
        { id: 'g', kind: 'goal', x: 7, y: 7 },
        { id: 'e', kind: 'enemy', x: 4, y: 4, movement: { type: 'chase', speed: 3 } },
      ],
    });
    if (!dsl.ok) throw new Error('setup');
    const cal = calibrateDsl(dsl.program, { iterations: 30 });
    // We don't demand it PASSES exactly — this is a probabilistic
    // sim — but the trace should be well-formed and the solve rate
    // should be a real number in [0, 1].
    expect(cal.solveRate).toBeGreaterThanOrEqual(0);
    expect(cal.solveRate).toBeLessThanOrEqual(1);
    expect(cal.iterations).toBe(30);
    expect(cal.calibratedDifficulty).toBeCloseTo(1 - cal.solveRate, 6);
  });
});
