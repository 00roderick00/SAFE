// Deterministic runtime for DSL games.
//
// One tick function that both server-side calibration and client-side
// rendering call. The runtime is data-only: it inspects the DSL and
// mutates a snapshot; it does NOT eval anything user-supplied.
//
// Ticks per second is fixed (TICK_HZ) so time-limited games have the
// same wall behaviour on both sides.

import type { DslEntity, DslGame, DslMovement } from './dsl.ts';
import { createRng } from './rng.ts';

export const TICK_HZ = 5; // 5 Hz — coarse enough for grid games

export interface DslState {
  tick: number;
  player: DslEntity;
  entities: DslEntity[];
  collected: Set<string>; // token ids consumed
  status: 'running' | 'won' | 'lost';
  reason?: 'timeout' | 'touch_enemy' | 'goal_reached' | 'all_tokens' | 'survived';
}

export type Direction = 'up' | 'down' | 'left' | 'right' | 'idle';

/** Convert a direction into a delta on the grid. */
function delta(dir: Direction): [number, number] {
  switch (dir) {
    case 'up': return [0, -1];
    case 'down': return [0, 1];
    case 'left': return [-1, 0];
    case 'right': return [1, 0];
    default: return [0, 0];
  }
}

/** Initial state — deep-clones entities so callers can inspect them without
 *  mutating the source DSL. */
export function initState(game: DslGame): DslState {
  const entities = game.entities.map((e) => ({ ...e, movement: e.movement ? { ...e.movement } as DslMovement : undefined }));
  const player = entities.find((e) => e.kind === 'player');
  if (!player) throw new Error('dsl_missing_player');
  return {
    tick: 0,
    player,
    entities,
    collected: new Set<string>(),
    status: 'running',
  };
}

function isPassable(game: DslGame, state: DslState, x: number, y: number, byKind: 'player' | 'enemy'): boolean {
  if (x < 0 || y < 0 || x >= game.board.width || y >= game.board.height) return false;
  for (const e of state.entities) {
    if (e.kind === 'wall' && e.x === x && e.y === y) return false;
    // Enemies can't step on other enemies (helps chase AI not stall).
    if (byKind === 'enemy' && e.kind === 'enemy' && e !== state.player && e.x === x && e.y === y) return false;
  }
  return true;
}

/**
 * One tick. Advances all NPCs, moves the player in the requested
 * direction, applies win/lose rules, and returns the mutated state.
 */
export function tick(game: DslGame, state: DslState, playerDir: Direction, rng: () => number): DslState {
  if (state.status !== 'running') return state;
  state.tick += 1;

  // Move player.
  const [pdx, pdy] = delta(playerDir);
  if (pdx !== 0 || pdy !== 0) {
    const nx = state.player.x + pdx;
    const ny = state.player.y + pdy;
    if (isPassable(game, state, nx, ny, 'player')) {
      state.player.x = nx;
      state.player.y = ny;
    }
  }

  // Move each enemy per its movement type.
  for (const e of state.entities) {
    if (e.kind !== 'enemy' || !e.movement) continue;
    const m = e.movement;
    // speed is "one step every K ticks" — so mod check.
    if (m.type === 'random') {
      if (state.tick % Math.max(1, 9 - m.speed) !== 0) continue;
      const dirs: Direction[] = ['up', 'down', 'left', 'right'];
      const pick = dirs[Math.floor(rng() * dirs.length)];
      const [dx, dy] = delta(pick);
      if (isPassable(game, state, e.x + dx, e.y + dy, 'enemy')) {
        e.x += dx;
        e.y += dy;
      }
    } else if (m.type === 'chase') {
      if (state.tick % Math.max(1, 9 - m.speed) !== 0) continue;
      // Manhattan-greedy toward player. Ties break by rng.
      const options: [number, number][] = [];
      const dx = state.player.x - e.x;
      const dy = state.player.y - e.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx !== 0) options.push([Math.sign(dx), 0]);
        if (dy !== 0) options.push([0, Math.sign(dy)]);
      } else {
        if (dy !== 0) options.push([0, Math.sign(dy)]);
        if (dx !== 0) options.push([Math.sign(dx), 0]);
      }
      for (const [odx, ody] of options) {
        if (isPassable(game, state, e.x + odx, e.y + ody, 'enemy')) {
          e.x += odx;
          e.y += ody;
          break;
        }
      }
    }
  }

  // Collisions.
  for (const e of state.entities) {
    if (e === state.player) continue;
    if (e.x !== state.player.x || e.y !== state.player.y) continue;
    if (e.kind === 'token' && !state.collected.has(e.id)) {
      state.collected.add(e.id);
    } else if (e.kind === 'goal' && game.winCondition === 'reach_goal') {
      state.status = 'won';
      state.reason = 'goal_reached';
      return state;
    } else if (e.kind === 'enemy') {
      state.status = 'lost';
      state.reason = 'touch_enemy';
      return state;
    }
  }

  // Win by collect_all_tokens.
  if (game.winCondition === 'collect_all_tokens') {
    const totalTokens = state.entities.filter((e) => e.kind === 'token').length;
    if (state.collected.size >= totalTokens && totalTokens > 0) {
      state.status = 'won';
      state.reason = 'all_tokens';
      return state;
    }
  }

  // Timeout.
  const secondsElapsed = state.tick / TICK_HZ;
  if (secondsElapsed >= game.timeLimit) {
    if (game.winCondition === 'survive') {
      state.status = 'won';
      state.reason = 'survived';
    } else {
      state.status = 'lost';
      state.reason = 'timeout';
    }
  }
  return state;
}

// -- Headless AI player -----------------------------------------

/** Direction the AI player should move on the current tick.
 *  Deterministic given `rng`. Simple greedy heuristics per win
 *  condition; not perfect play — the goal is a plausible "typical
 *  player" not a solver. */
export function aiChooseDirection(game: DslGame, state: DslState, rng: () => number): Direction {
  const dirs: Direction[] = ['up', 'down', 'left', 'right'];
  const legal = dirs.filter(d => {
    const [dx, dy] = delta(d);
    return isPassable(game, state, state.player.x + dx, state.player.y + dy, 'player');
  });
  if (legal.length === 0) return 'idle';

  // Threat avoidance is always at play: if an enemy is on an
  // adjacent cell in some direction, do not step INTO it.
  const enemies = state.entities.filter((e) => e.kind === 'enemy');
  const safe = legal.filter(d => {
    const [dx, dy] = delta(d);
    const nx = state.player.x + dx;
    const ny = state.player.y + dy;
    return !enemies.some((en) => en.x === nx && en.y === ny);
  });
  const pool = safe.length > 0 ? safe : legal;

  if (game.winCondition === 'reach_goal' || game.winCondition === 'collect_all_tokens') {
    // Pick nearest unclaimed goal/token by Manhattan and move toward it.
    const wants = state.entities.filter((e) => {
      if (game.winCondition === 'reach_goal') return e.kind === 'goal';
      return e.kind === 'token' && !state.collected.has(e.id);
    });
    if (wants.length === 0) return pool[Math.floor(rng() * pool.length)];
    let best = wants[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const w of wants) {
      const d = Math.abs(w.x - state.player.x) + Math.abs(w.y - state.player.y);
      if (d < bestDist) { bestDist = d; best = w; }
    }
    // Pick the legal direction that reduces Manhattan distance to `best`
    // most; break ties randomly for exploration.
    let bestDir: Direction = pool[0];
    let bestNewDist = Number.POSITIVE_INFINITY;
    const shuffled = [...pool].sort(() => rng() - 0.5);
    for (const d of shuffled) {
      const [dx, dy] = delta(d);
      const nd = Math.abs(best.x - (state.player.x + dx)) + Math.abs(best.y - (state.player.y + dy));
      if (nd < bestNewDist) { bestNewDist = nd; bestDir = d; }
    }
    return bestDir;
  }

  // survive: move away from nearest enemy.
  if (enemies.length === 0) return pool[Math.floor(rng() * pool.length)];
  let nearest = enemies[0];
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const en of enemies) {
    const d = Math.abs(en.x - state.player.x) + Math.abs(en.y - state.player.y);
    if (d < nearestDist) { nearestDist = d; nearest = en; }
  }
  let bestDir: Direction = pool[0];
  let bestDist = -1;
  for (const d of pool) {
    const [dx, dy] = delta(d);
    const nd = Math.abs(nearest.x - (state.player.x + dx)) + Math.abs(nearest.y - (state.player.y + dy));
    if (nd > bestDist) { bestDist = nd; bestDir = d; }
  }
  return bestDir;
}

// -- Calibration --------------------------------------------------

export interface DslCalibration {
  passes: boolean;
  solveRate: number;
  iterations: number;
  band: { min: number; max: number };
  calibratedDifficulty: number;
  reason?: 'too_easy' | 'too_hard';
  traces: DslRunTrace[];
}

export interface DslRunTrace {
  seed: string;
  ticks: number;
  won: boolean;
  reason?: string;
}

/**
 * Play one full game headlessly. Returns the trace. `seed` seeds
 * BOTH the enemy movement rng and the AI direction chooser, so a
 * given seed produces a deterministic run.
 */
export function playHeadless(game: DslGame, seed: string): DslRunTrace {
  const rng = createRng(seed);
  const state = initState(game);
  const maxTicks = game.timeLimit * TICK_HZ + 5;
  while (state.status === 'running' && state.tick < maxTicks) {
    const dir = aiChooseDirection(game, state, rng);
    tick(game, state, dir, rng);
  }
  return {
    seed,
    ticks: state.tick,
    won: state.status === 'won',
    reason: state.reason,
  };
}

export function calibrateDsl(
  game: DslGame,
  options: {
    iterations?: number;
    band?: { min: number; max: number };
    seedPrefix?: string;
  } = {}
): DslCalibration {
  const band = options.band ?? { min: 0.3, max: 0.7 };
  const iterations = options.iterations ?? 60;
  const prefix = options.seedPrefix ?? 'calibration';
  const traces: DslRunTrace[] = [];
  let won = 0;
  for (let i = 0; i < iterations; i++) {
    const t = playHeadless(game, `${prefix}:${i}`);
    traces.push(t);
    if (t.won) won++;
  }
  const solveRate = won / iterations;
  const passes = solveRate >= band.min && solveRate <= band.max;
  return {
    passes,
    solveRate,
    iterations,
    band,
    calibratedDifficulty: Math.max(0, Math.min(1, 1 - solveRate)),
    reason: passes ? undefined : solveRate < band.min ? 'too_hard' : 'too_easy',
    // Keep only the first 5 traces in the DB — full 60 is noisy and
    // makes the JSONB blob huge. Ordering preserved.
    traces: traces.slice(0, 5),
  };
}
