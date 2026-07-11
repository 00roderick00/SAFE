// Small declarative game DSL (Phase 3B).
//
// The DSL is JSON DATA. The client renders it via a fixed
// interpreter; the server can replay it deterministically (see
// dsl-runtime.ts) for calibration and anti-cheat. There is NO code
// execution anywhere in the pipeline — the AI can only propose a
// tree of `{kind, position, movement, ...}` records, and this
// module refuses anything outside the allowlist.

export type DslKind = 'player' | 'wall' | 'token' | 'enemy' | 'goal';

export type DslMovement =
  | { type: 'static' }
  | { type: 'input' }
  | { type: 'random'; speed: number }
  | { type: 'chase'; speed: number };

export interface DslEntity {
  id: string;
  kind: DslKind;
  x: number;
  y: number;
  movement?: DslMovement;
}

export type DslWinCondition =
  | 'collect_all_tokens'
  | 'reach_goal'
  | 'survive';

export interface DslGame {
  version: 1;
  board: { width: number; height: number };
  entities: DslEntity[];
  timeLimit: number; // seconds
  winCondition: DslWinCondition;
}

// -- limits -----------------------------------------------------

export const DSL_LIMITS = {
  boardMin: 5,
  boardMax: 20,
  timeLimitMin: 15,
  timeLimitMax: 120,
  entityMax: 50,
  idMaxLen: 24,
  speedMin: 1,
  speedMax: 8,
} as const;

const KINDS: readonly DslKind[] = ['player', 'wall', 'token', 'enemy', 'goal'];
const WIN_CONDITIONS: readonly DslWinCondition[] = [
  'collect_all_tokens',
  'reach_goal',
  'survive',
];

// -- validator --------------------------------------------------

export type DslValidation =
  | { ok: true; program: DslGame }
  | { ok: false; errors: string[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateMovement(v: unknown, path: string, errs: string[]): DslMovement | undefined {
  if (!isPlainObject(v)) {
    errs.push(`${path}: expected object`);
    return undefined;
  }
  const type = v.type;
  if (type === 'static' || type === 'input') {
    for (const k of Object.keys(v)) {
      if (k !== 'type') errs.push(`${path}.${k}: unknown field`);
    }
    return { type } as DslMovement;
  }
  if (type === 'random' || type === 'chase') {
    if (typeof v.speed !== 'number' || !Number.isFinite(v.speed)) {
      errs.push(`${path}.speed: expected number`);
      return undefined;
    }
    const speed = Math.round(v.speed);
    if (speed < DSL_LIMITS.speedMin || speed > DSL_LIMITS.speedMax) {
      errs.push(`${path}.speed: out of range [${DSL_LIMITS.speedMin}, ${DSL_LIMITS.speedMax}]`);
      return undefined;
    }
    for (const k of Object.keys(v)) {
      if (k !== 'type' && k !== 'speed') errs.push(`${path}.${k}: unknown field`);
    }
    return { type, speed } as DslMovement;
  }
  errs.push(`${path}.type: not one of [static, input, random, chase]`);
  return undefined;
}

function validateEntity(v: unknown, path: string, board: { width: number; height: number }, errs: string[]): DslEntity | undefined {
  if (!isPlainObject(v)) {
    errs.push(`${path}: expected object`);
    return undefined;
  }
  const allowed = new Set(['id', 'kind', 'x', 'y', 'movement']);
  for (const k of Object.keys(v)) {
    if (!allowed.has(k)) errs.push(`${path}.${k}: unknown field`);
  }
  const id = v.id;
  if (typeof id !== 'string' || id.length === 0 || id.length > DSL_LIMITS.idMaxLen) {
    errs.push(`${path}.id: expected 1..${DSL_LIMITS.idMaxLen} char string`);
    return undefined;
  }
  const kind = v.kind;
  if (typeof kind !== 'string' || !KINDS.includes(kind as DslKind)) {
    errs.push(`${path}.kind: not one of [${KINDS.join(', ')}]`);
    return undefined;
  }
  const x = v.x;
  const y = v.y;
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
    errs.push(`${path}.(x|y): expected numbers`);
    return undefined;
  }
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= board.width || iy >= board.height) {
    errs.push(`${path}: (${ix},${iy}) is off-board`);
    return undefined;
  }
  let movement: DslMovement | undefined;
  if (v.movement !== undefined) {
    movement = validateMovement(v.movement, `${path}.movement`, errs);
    if (!movement) return undefined;
  }
  return { id, kind: kind as DslKind, x: ix, y: iy, movement };
}

export function validateDsl(raw: unknown): DslValidation {
  const errs: string[] = [];
  if (!isPlainObject(raw)) return { ok: false, errors: ['dsl must be an object'] };

  const allowed = new Set(['version', 'board', 'entities', 'timeLimit', 'winCondition']);
  for (const k of Object.keys(raw)) {
    if (!allowed.has(k)) errs.push(`${k}: unknown field`);
  }

  if (raw.version !== 1) errs.push('version: must be 1');

  if (!isPlainObject(raw.board)) {
    errs.push('board: expected object');
    return { ok: false, errors: errs };
  }
  const bw = Number(raw.board.width);
  const bh = Number(raw.board.height);
  if (!Number.isFinite(bw) || !Number.isFinite(bh)) {
    errs.push('board.(width|height): expected numbers');
    return { ok: false, errors: errs };
  }
  const width = Math.round(bw);
  const height = Math.round(bh);
  if (
    width < DSL_LIMITS.boardMin || width > DSL_LIMITS.boardMax ||
    height < DSL_LIMITS.boardMin || height > DSL_LIMITS.boardMax
  ) {
    errs.push(`board size out of range [${DSL_LIMITS.boardMin}, ${DSL_LIMITS.boardMax}]`);
    return { ok: false, errors: errs };
  }

  if (typeof raw.timeLimit !== 'number' || !Number.isFinite(raw.timeLimit)) {
    errs.push('timeLimit: expected number');
    return { ok: false, errors: errs };
  }
  const timeLimit = Math.round(raw.timeLimit);
  if (timeLimit < DSL_LIMITS.timeLimitMin || timeLimit > DSL_LIMITS.timeLimitMax) {
    errs.push(`timeLimit: out of range [${DSL_LIMITS.timeLimitMin}, ${DSL_LIMITS.timeLimitMax}]`);
    return { ok: false, errors: errs };
  }

  if (typeof raw.winCondition !== 'string' || !WIN_CONDITIONS.includes(raw.winCondition as DslWinCondition)) {
    errs.push(`winCondition: not one of [${WIN_CONDITIONS.join(', ')}]`);
    return { ok: false, errors: errs };
  }
  const winCondition = raw.winCondition as DslWinCondition;

  if (!Array.isArray(raw.entities)) {
    errs.push('entities: expected array');
    return { ok: false, errors: errs };
  }
  if (raw.entities.length > DSL_LIMITS.entityMax) {
    errs.push(`entities: more than ${DSL_LIMITS.entityMax}`);
    return { ok: false, errors: errs };
  }
  const board = { width, height };
  const entities: DslEntity[] = [];
  const seenIds = new Set<string>();
  const seenPositions = new Set<string>();
  for (let i = 0; i < raw.entities.length; i++) {
    const e = validateEntity(raw.entities[i], `entities[${i}]`, board, errs);
    if (!e) continue;
    if (seenIds.has(e.id)) errs.push(`entities[${i}].id: duplicate id "${e.id}"`);
    seenIds.add(e.id);
    // Walls, tokens, goals: no stacking. Player/enemy can pass through
    // static entities during movement but they can't share a spawn cell.
    const posKey = `${e.x},${e.y}`;
    if (seenPositions.has(posKey)) {
      errs.push(`entities[${i}]: two entities spawn on (${e.x},${e.y})`);
    }
    seenPositions.add(posKey);
    // Cross-check movement kinds.
    if (e.kind === 'player' && e.movement && e.movement.type !== 'input') {
      errs.push(`entities[${i}]: player must use movement.type=input`);
    }
    if (e.kind === 'wall' || e.kind === 'token' || e.kind === 'goal') {
      if (e.movement && e.movement.type !== 'static') {
        errs.push(`entities[${i}]: ${e.kind} must be static`);
      }
    }
    if (e.kind === 'enemy' && (!e.movement || e.movement.type === 'input' || e.movement.type === 'static')) {
      errs.push(`entities[${i}]: enemy must move via random or chase`);
    }
    entities.push(e);
  }

  const players = entities.filter((e) => e.kind === 'player');
  if (players.length !== 1) errs.push(`exactly one player required, found ${players.length}`);

  if (winCondition === 'collect_all_tokens' && !entities.some((e) => e.kind === 'token')) {
    errs.push('winCondition=collect_all_tokens requires at least one token');
  }
  if (winCondition === 'reach_goal' && !entities.some((e) => e.kind === 'goal')) {
    errs.push('winCondition=reach_goal requires at least one goal');
  }

  if (errs.length > 0) return { ok: false, errors: errs };

  // Fill in default movement where absent.
  for (const e of entities) {
    if (!e.movement) {
      if (e.kind === 'player') e.movement = { type: 'input' };
      else e.movement = { type: 'static' };
    }
  }

  return {
    ok: true,
    program: { version: 1, board, entities, timeLimit, winCondition },
  };
}
