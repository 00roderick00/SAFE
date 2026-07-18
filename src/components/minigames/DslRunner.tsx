// Client-side interpreter for DSL games (Phase 3B).
//
// The interpreter shares its tick semantics with the server-side
// calibrator (supabase/functions/_shared/dsl-runtime.ts). We do NOT
// import the Deno file directly (it uses Deno-flavoured imports),
// so this file duplicates the small tick + collision logic. If you
// change either side, change both — the phase3b round-trip test
// asserts they agree on a canonical run.
//
// The game state is a plain object; the AI never runs anything —
// this component just reads a validated DslGame from props.config.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MiniGameProps } from '../../types';

type DslKind = 'player' | 'wall' | 'token' | 'enemy' | 'goal';
type DslWin = 'collect_all_tokens' | 'reach_goal' | 'survive';
type Movement =
  | { type: 'static' }
  | { type: 'input' }
  | { type: 'random'; speed: number }
  | { type: 'chase'; speed: number };

interface DslEntity {
  id: string;
  kind: DslKind;
  x: number;
  y: number;
  movement?: Movement;
}
interface DslGame {
  version: 1;
  board: { width: number; height: number };
  entities: DslEntity[];
  timeLimit: number;
  winCondition: DslWin;
}

const TICK_HZ = 5;
const CELL_PX = 24;

function isDslGame(x: unknown): x is DslGame {
  if (!x || typeof x !== 'object') return false;
  const c = x as Partial<DslGame>;
  return c.version === 1 && !!c.board && Array.isArray(c.entities);
}

// tiny deterministic RNG shared with the server. Kept inline to
// avoid Deno-flavoured imports.
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed: string): () => number {
  return mulberry32(xmur3(seed)());
}

interface State {
  tick: number;
  entities: DslEntity[];
  collected: Set<string>;
  status: 'running' | 'won' | 'lost';
  reason?: string;
}

function isPassable(game: DslGame, state: State, x: number, y: number, byKind: 'player' | 'enemy'): boolean {
  if (x < 0 || y < 0 || x >= game.board.width || y >= game.board.height) return false;
  for (const e of state.entities) {
    if (e.kind === 'wall' && e.x === x && e.y === y) return false;
    if (byKind === 'enemy' && e.kind === 'enemy' && e.id !== state.entities[0].id && e.x === x && e.y === y) return false;
  }
  return true;
}

const PLAYER_COLOR = 'var(--tw-color-primary, #34d399)';
const WALL_COLOR = 'rgba(148, 163, 184, 0.35)';
const TOKEN_COLOR = 'gold';
const ENEMY_COLOR = 'crimson';
const GOAL_COLOR = 'deepskyblue';

export const DslRunner = ({ difficulty, seed, config, onComplete }: MiniGameProps) => {
  const startTimeRef = useRef<number>(0);
  useEffect(() => { startTimeRef.current = Date.now(); }, []);

  const game = useMemo<DslGame | null>(() => (isDslGame(config) ? (config as DslGame) : null), [config]);

  // Seeded rng — same seed → same enemy behaviour every play.
  const rngRef = useRef<() => number>(() => Math.random());
  useEffect(() => {
    rngRef.current = makeRng(seed || `dsl-${Date.now()}`);
  }, [seed]);

  const initial = useMemo<State | null>(() => {
    if (!game) return null;
    const entities = game.entities.map((e) => ({ ...e }));
    return { tick: 0, entities, collected: new Set(), status: 'running' };
  }, [game]);
  const [state, setState] = useState<State | null>(initial);
  const [inputDir, setInputDir] = useState<'up' | 'down' | 'left' | 'right' | 'idle'>('idle');
  const [now, setNow] = useState(0);

  // Record the direction applied on each tick so the server can replay
  // the run from the same seed and verify the outcome (anti-cheat). The
  // ref is reset whenever a fresh game/seed mounts.
  const traceRef = useRef<('up' | 'down' | 'left' | 'right' | 'idle')[]>([]);
  useEffect(() => {
    traceRef.current = [];
  }, [game, seed]);

  // Keyboard input.
  useEffect(() => {
    if (!game) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') setInputDir('up');
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') setInputDir('down');
      else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setInputDir('left');
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') setInputDir('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);

  // Tick loop.
  useEffect(() => {
    if (!game || !state || state.status !== 'running') return;
    const id = setInterval(() => {
      setNow((n) => n + 1);
      // Record the input applied on this tick (matches the direction the
      // reducer below applies, since both read the same `inputDir`).
      traceRef.current.push(inputDir);
      setState((prev) => {
        if (!prev || !game) return prev;
        const next: State = {
          tick: prev.tick + 1,
          entities: prev.entities.map((e) => ({ ...e })),
          collected: new Set(prev.collected),
          status: prev.status,
        };
        const player = next.entities.find((e) => e.kind === 'player')!;
        const dx = inputDir === 'left' ? -1 : inputDir === 'right' ? 1 : 0;
        const dy = inputDir === 'up' ? -1 : inputDir === 'down' ? 1 : 0;
        if (dx !== 0 || dy !== 0) {
          const nx = player.x + dx;
          const ny = player.y + dy;
          if (isPassable(game, next, nx, ny, 'player')) {
            player.x = nx;
            player.y = ny;
          }
        }
        setInputDir('idle');

        // Enemies.
        for (const e of next.entities) {
          if (e.kind !== 'enemy' || !e.movement) continue;
          const m = e.movement;
          const stride = Math.max(1, 9 - (m as { speed?: number }).speed! || 3);
          if (next.tick % stride !== 0) continue;
          if (m.type === 'random') {
            const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
            const pick = dirs[Math.floor(rngRef.current() * 4)];
            if (isPassable(game, next, e.x + pick[0], e.y + pick[1], 'enemy')) {
              e.x += pick[0]; e.y += pick[1];
            }
          } else if (m.type === 'chase') {
            const ddx = player.x - e.x;
            const ddy = player.y - e.y;
            const opts: [number, number][] = [];
            if (Math.abs(ddx) >= Math.abs(ddy)) {
              if (ddx !== 0) opts.push([Math.sign(ddx), 0]);
              if (ddy !== 0) opts.push([0, Math.sign(ddy)]);
            } else {
              if (ddy !== 0) opts.push([0, Math.sign(ddy)]);
              if (ddx !== 0) opts.push([Math.sign(ddx), 0]);
            }
            for (const [odx, ody] of opts) {
              if (isPassable(game, next, e.x + odx, e.y + ody, 'enemy')) {
                e.x += odx; e.y += ody; break;
              }
            }
          }
        }

        // Collisions.
        for (const e of next.entities) {
          if (e.kind === 'player') continue;
          if (e.x !== player.x || e.y !== player.y) continue;
          if (e.kind === 'token' && !next.collected.has(e.id)) {
            next.collected.add(e.id);
          } else if (e.kind === 'goal' && game.winCondition === 'reach_goal') {
            next.status = 'won';
            next.reason = 'goal_reached';
          } else if (e.kind === 'enemy') {
            next.status = 'lost';
            next.reason = 'touch_enemy';
          }
        }

        if (next.status === 'running' && game.winCondition === 'collect_all_tokens') {
          const totalTokens = next.entities.filter((e) => e.kind === 'token').length;
          if (totalTokens > 0 && next.collected.size >= totalTokens) {
            next.status = 'won';
            next.reason = 'all_tokens';
          }
        }

        const secondsElapsed = next.tick / TICK_HZ;
        if (next.status === 'running' && secondsElapsed >= game.timeLimit) {
          if (game.winCondition === 'survive') {
            next.status = 'won';
            next.reason = 'survived';
          } else {
            next.status = 'lost';
            next.reason = 'timeout';
          }
        }
        return next;
      });
    }, 1000 / TICK_HZ);
    return () => clearInterval(id);
  }, [game, state?.status, inputDir]);

  // Finalise: report result when we transition out of running.
  useEffect(() => {
    if (!state || state.status === 'running') return;
    const won = state.status === 'won';
    const timeSpent = Date.now() - (startTimeRef.current || Date.now());
    // Score: 1 for win, else fraction of tokens collected (if applicable).
    const totalTokens = state.entities.filter((e) => e.kind === 'token').length;
    const partial = totalTokens > 0 ? state.collected.size / totalTokens : 0;
    const score = won ? 1 : Math.min(0.64, partial * 0.6);
    onComplete({
      moduleId: seed,
      moduleType: 'custom',
      score,
      passed: won,
      timeSpent,
      inputTrace: [...traceRef.current],
    });
  }, [state?.status]);

  if (!game || !state) {
    return (
      <div className="text-center py-8">
        <p className="text-warning font-display">DSL game config missing or invalid.</p>
      </div>
    );
  }

  const totalTokens = state.entities.filter((e) => e.kind === 'token').length;
  const remaining = Math.max(0, game.timeLimit - Math.floor(state.tick / TICK_HZ));
  void now;

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Tokens: {state.collected.size}/{totalTokens || '—'}</span>
        <span className={remaining <= 5 ? 'text-danger' : ''}>{remaining}s</span>
      </div>
      <div
        role="application"
        tabIndex={0}
        className="relative bg-surface-light rounded-lg outline-none focus:ring-2 focus:ring-primary"
        style={{ width: game.board.width * CELL_PX, height: game.board.height * CELL_PX }}
      >
        {state.entities.map((e) => (
          <div
            key={e.id}
            className="absolute rounded-sm"
            style={{
              left: e.x * CELL_PX,
              top: e.y * CELL_PX,
              width: CELL_PX - 2,
              height: CELL_PX - 2,
              background:
                e.kind === 'player' ? PLAYER_COLOR :
                e.kind === 'wall' ? WALL_COLOR :
                e.kind === 'token' ? TOKEN_COLOR :
                e.kind === 'enemy' ? ENEMY_COLOR :
                e.kind === 'goal' ? GOAL_COLOR : 'transparent',
              opacity: e.kind === 'token' && state.collected.has(e.id) ? 0 : 1,
              transition: 'left 0.1s linear, top 0.1s linear',
            }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 text-2xl select-none">
        <span />
        <button onClick={() => setInputDir('up')} className="p-2 bg-surface-light rounded">↑</button>
        <span />
        <button onClick={() => setInputDir('left')} className="p-2 bg-surface-light rounded">←</button>
        <button onClick={() => setInputDir('down')} className="p-2 bg-surface-light rounded">↓</button>
        <button onClick={() => setInputDir('right')} className="p-2 bg-surface-light rounded">→</button>
      </div>
      <p className="text-xs text-text-dim mt-2">
        {game.winCondition === 'collect_all_tokens' && 'Collect every token'}
        {game.winCondition === 'reach_goal' && 'Reach the blue goal'}
        {game.winCondition === 'survive' && 'Survive until the timer ends'}
        {' · difficulty '}
        {(difficulty * 100).toFixed(0)}%
      </p>
    </div>
  );
};
