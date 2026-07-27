// Deterministic chess-puzzle engine for the "chess" lock: piece-only
// endgames (K/Q/R/B/N — no pawns, castling, en passant, or promotion),
// mate-in-1/2/3 puzzles derived purely from (seed, difficulty).
//
// SECURITY (see PROGRESS-SECURITY.md): this is a class-1a module — the
// server can independently recompute everything. Both the client (to
// present the board) and the Edge Function (to verify the submission)
// call deriveChessPuzzle(seed, difficulty) with the shared
// xmur3->mulberry32 RNG and get the identical puzzle. The client submits
// the player's ACTUAL move sequence; verifyChessAnswer replays it against
// the engine's own deterministic defense (bestDefense) and only accepts
// a line that forces checkmate within puzzle.mateIn white moves. The
// client's self-reported passed/score are ignored.
//
// Dependency-free and environment-free by design: no Math.random, no
// Date, no Deno/Node APIs — it runs identically in the browser (via the
// shared barrel) and in Deno Edge Functions.
//
// Board format: FEN piece-placement + side to move only, e.g.
//   "8/8/8/3k4/8/8/4Q3/4K3 w"
// Moves are UCI coordinate strings, e.g. "e2e4".

import { createRng } from './rng.ts';

export interface ChessPuzzle {
  fen: string;
  mateIn: 1 | 2 | 3;
}

type Color = 'w' | 'b';
type PieceChar = 'K' | 'Q' | 'R' | 'B' | 'N' | 'k' | 'q' | 'r' | 'b' | 'n';

interface Piece {
  p: PieceChar;
  /** 0 = a1, 7 = h1, 56 = a8, 63 = h8. */
  sq: number;
}

/** Internal position: a piece list (positions here hold <= 4 pieces, so
 *  a list is both smaller and faster to clone than a 64-slot board). */
export interface Position {
  pieces: Piece[];
  turn: Color;
}

// ---------------------------------------------------------------------------
// Squares & FEN
// ---------------------------------------------------------------------------

const FILES = 'abcdefgh';
const PIECE_CHARS = 'KQRBNkqrbn';

const fileOf = (sq: number): number => sq & 7;
const rankOf = (sq: number): number => sq >> 3;
const sqName = (sq: number): string => FILES[fileOf(sq)] + String(rankOf(sq) + 1);
const colorOf = (p: PieceChar): Color => (p <= 'Z' ? 'w' : 'b');
const opponent = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  if (parts.length !== 2) throw new Error(`bad FEN (want "<placement> <turn>"): ${fen}`);
  const [placement, turn] = parts;
  if (turn !== 'w' && turn !== 'b') throw new Error(`bad FEN turn: ${turn}`);
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error(`bad FEN placement: ${placement}`);

  const pieces: Piece[] = [];
  for (let r = 0; r < 8; r++) {
    const rank = 7 - r; // FEN lists rank 8 first
    let file = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
      } else if (PIECE_CHARS.includes(ch)) {
        if (file > 7) throw new Error(`bad FEN rank overflow: ${rows[r]}`);
        pieces.push({ p: ch as PieceChar, sq: rank * 8 + file });
        file++;
      } else {
        throw new Error(`bad FEN piece char (pawns unsupported): ${ch}`);
      }
    }
    if (file !== 8) throw new Error(`bad FEN rank width: ${rows[r]}`);
  }
  if (pieces.filter((pc) => pc.p === 'K').length !== 1 || pieces.filter((pc) => pc.p === 'k').length !== 1) {
    throw new Error(`bad FEN: need exactly one king per side: ${fen}`);
  }
  return { pieces, turn };
}

export function toFen(pos: Position): string {
  const board: (PieceChar | null)[] = new Array(64).fill(null);
  for (const pc of pos.pieces) board[pc.sq] = pc.p;
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = board[rank * 8 + file];
      if (p === null) {
        empty++;
      } else {
        if (empty > 0) row += String(empty);
        empty = 0;
        row += p;
      }
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  return `${rows.join('/')} ${pos.turn}`;
}

// ---------------------------------------------------------------------------
// Attacks & move generation
// ---------------------------------------------------------------------------

const KNIGHT_DELTAS = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
] as const;
const KING_DELTAS = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
] as const;
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

function pieceAt(pos: Position, sq: number): Piece | null {
  for (const pc of pos.pieces) if (pc.sq === sq) return pc;
  return null;
}

/** True when no piece sits strictly between two aligned squares. */
function pathClear(pos: Position, from: number, to: number): boolean {
  const df = Math.sign(fileOf(to) - fileOf(from));
  const dr = Math.sign(rankOf(to) - rankOf(from));
  let f = fileOf(from) + df;
  let r = rankOf(from) + dr;
  while (f !== fileOf(to) || r !== rankOf(to)) {
    if (pieceAt(pos, r * 8 + f) !== null) return false;
    f += df;
    r += dr;
  }
  return true;
}

/** Is `sq` attacked by any piece of color `by`? */
function attacked(pos: Position, sq: number, by: Color): boolean {
  const tf = fileOf(sq);
  const tr = rankOf(sq);
  for (const pc of pos.pieces) {
    if (colorOf(pc.p) !== by || pc.sq === sq) continue;
    const df = tf - fileOf(pc.sq);
    const dr = tr - rankOf(pc.sq);
    const adf = Math.abs(df);
    const adr = Math.abs(dr);
    switch (pc.p.toUpperCase()) {
      case 'K':
        if (adf <= 1 && adr <= 1) return true;
        break;
      case 'N':
        if ((adf === 1 && adr === 2) || (adf === 2 && adr === 1)) return true;
        break;
      case 'R':
        if ((df === 0 || dr === 0) && pathClear(pos, pc.sq, sq)) return true;
        break;
      case 'B':
        if (adf === adr && pathClear(pos, pc.sq, sq)) return true;
        break;
      case 'Q':
        if ((df === 0 || dr === 0 || adf === adr) && pathClear(pos, pc.sq, sq)) return true;
        break;
    }
  }
  return false;
}

function kingSq(pos: Position, color: Color): number {
  const king = color === 'w' ? 'K' : 'k';
  for (const pc of pos.pieces) if (pc.p === king) return pc.sq;
  throw new Error(`no ${color} king on board`);
}

function inCheckPos(pos: Position): boolean {
  return attacked(pos, kingSq(pos, pos.turn), opponent(pos.turn));
}

/** Pseudo-legal target squares for one piece (may leave own king in check). */
function pseudoTargets(pos: Position, pc: Piece): number[] {
  const targets: number[] = [];
  const f0 = fileOf(pc.sq);
  const r0 = rankOf(pc.sq);
  const mine = colorOf(pc.p);
  const step = (f: number, r: number): 'off' | 'own' | 'capture' | 'empty' => {
    if (f < 0 || f > 7 || r < 0 || r > 7) return 'off';
    const occ = pieceAt(pos, r * 8 + f);
    if (occ === null) return 'empty';
    // Kings are never capturable — treat an enemy king like a wall so
    // even a (nominally illegal) input position can't lose a king.
    if (occ.p === 'K' || occ.p === 'k') return 'own';
    return colorOf(occ.p) === mine ? 'own' : 'capture';
  };
  const type = pc.p.toUpperCase();
  if (type === 'N' || type === 'K') {
    const deltas = type === 'N' ? KNIGHT_DELTAS : KING_DELTAS;
    for (const [df, dr] of deltas) {
      const kind = step(f0 + df, r0 + dr);
      if (kind === 'empty' || kind === 'capture') targets.push((r0 + dr) * 8 + f0 + df);
    }
  } else {
    const dirs = type === 'R' ? ROOK_DIRS : type === 'B' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
    for (const [df, dr] of dirs) {
      for (let i = 1; i < 8; i++) {
        const kind = step(f0 + df * i, r0 + dr * i);
        if (kind === 'off' || kind === 'own') break;
        targets.push((r0 + dr * i) * 8 + f0 + df * i);
        if (kind === 'capture') break;
      }
    }
  }
  return targets;
}

function makeMove(pos: Position, from: number, to: number): Position {
  const pieces: Piece[] = [];
  for (const pc of pos.pieces) {
    if (pc.sq === to) continue; // captured
    pieces.push(pc.sq === from ? { p: pc.p, sq: to } : pc);
  }
  return { pieces, turn: opponent(pos.turn) };
}

interface Child {
  uci: string;
  next: Position;
}

/** All fully legal moves (own king not left in check), sorted by UCI. */
function legalChildren(pos: Position): Child[] {
  const children: Child[] = [];
  for (const pc of pos.pieces) {
    if (colorOf(pc.p) !== pos.turn) continue;
    for (const to of pseudoTargets(pos, pc)) {
      const next = makeMove(pos, pc.sq, to);
      if (!attacked(next, kingSq(next, pos.turn), opponent(pos.turn))) {
        children.push({ uci: sqName(pc.sq) + sqName(to), next });
      }
    }
  }
  children.sort((a, b) => (a.uci < b.uci ? -1 : a.uci > b.uci ? 1 : 0));
  return children;
}

// ---------------------------------------------------------------------------
// Public rules API
// ---------------------------------------------------------------------------

/** Fully legal moves for the side to move, lexicographically sorted. */
export function legalMoves(fen: string): string[] {
  return legalChildren(parseFen(fen)).map((c) => c.uci);
}

/** Apply a UCI move; returns the new FEN with side to move flipped.
 *  Throws Error on malformed or illegal moves. */
export function applyMove(fen: string, uci: string): string {
  if (!/^[a-h][1-8][a-h][1-8]$/.test(uci)) throw new Error(`bad UCI move: ${uci}`);
  const child = legalChildren(parseFen(fen)).find((c) => c.uci === uci);
  if (!child) throw new Error(`illegal move ${uci} in ${fen}`);
  return toFen(child.next);
}

/** Is the side to move in check? */
export function isCheck(fen: string): boolean {
  return inCheckPos(parseFen(fen));
}

export function isCheckmate(fen: string): boolean {
  const pos = parseFen(fen);
  return inCheckPos(pos) && legalChildren(pos).length === 0;
}

export function isStalemate(fen: string): boolean {
  const pos = parseFen(fen);
  return !inCheckPos(pos) && legalChildren(pos).length === 0;
}

// ---------------------------------------------------------------------------
// Mate search
// ---------------------------------------------------------------------------

// Memo shared across calls: results are pure functions of (position,
// budget), so caching is safe and makes repeated derivations (client
// preview + server verify of the same seed) nearly free.
const mateMemo = new Map<string, boolean>();
const MATE_MEMO_LIMIT = 400_000;

function posKey(pos: Position): string {
  let key = pos.turn;
  const sorted = [...pos.pieces].sort((a, b) => a.sq - b.sq);
  for (const pc of sorted) key += pc.p + pc.sq;
  return key;
}

/** Can the side to move force checkmate within `movesLeft` of its own
 *  full moves, against ANY defense? Depth-first: attacker nodes need one
 *  working move; defender nodes must fail on ALL replies. */
function forcesMate(pos: Position, movesLeft: number): boolean {
  const key = posKey(pos) + '|' + movesLeft;
  const hit = mateMemo.get(key);
  if (hit !== undefined) return hit;

  const children = legalChildren(pos);
  // Try checking moves first: mates are checks, so this both finds wins
  // sooner and lets the movesLeft === 1 level skip non-checks entirely.
  const annotated = children.map((c) => ({ next: c.next, check: inCheckPos(c.next) }));
  annotated.sort((a, b) => Number(b.check) - Number(a.check));

  let result = false;
  for (const { next, check } of annotated) {
    if (!check && movesLeft === 1) break; // sorted: only non-checks remain
    const replies = legalChildren(next);
    if (replies.length === 0) {
      if (check) {
        result = true; // checkmate
        break;
      }
      continue; // stalemate: this move throws the win away
    }
    if (movesLeft === 1) continue;
    let allLose = true;
    for (const r of replies) {
      if (!forcesMate(r.next, movesLeft - 1)) {
        allLose = false;
        break;
      }
    }
    if (allLose) {
      result = true;
      break;
    }
  }

  if (mateMemo.size >= MATE_MEMO_LIMIT) mateMemo.clear();
  mateMemo.set(key, result);
  return result;
}

function mateDepthPos(pos: Position, maxDepth: number): number | null {
  for (let k = 1; k <= maxDepth; k++) {
    if (forcesMate(pos, k)) return k;
  }
  return null;
}

/** Minimal number of side-to-move full moves needed to force checkmate
 *  against any defense, or null if it cannot be forced within maxDepth. */
export function mateDepth(fen: string, maxDepth: 1 | 2 | 3): number | null {
  return mateDepthPos(parseFen(fen), maxDepth);
}

/** Deterministic defense for the side to move: prefer any reply after
 *  which mate is NOT forced within 3 attacker moves; otherwise survive
 *  as long as possible (largest mateDepth). Ties break to the
 *  lexicographically smallest UCI. Null when there is no legal move. */
export function bestDefense(fen: string): string | null {
  const children = legalChildren(parseFen(fen)); // already UCI-sorted
  let bestUci: string | null = null;
  let bestDepth = 0;
  for (const c of children) {
    const d = mateDepthPos(c.next, 3);
    if (d === null) return c.uci; // first (smallest UCI) escaping move
    if (d > bestDepth) {
      bestDepth = d;
      bestUci = c.uci;
    }
  }
  return bestUci;
}

// ---------------------------------------------------------------------------
// Puzzle derivation
// ---------------------------------------------------------------------------

const TRY_BUDGET = 600;

// Practically unreachable safety net (Kg6+Qc7 vs kh8: 1.Qh7#) so the
// function can never throw regardless of seed.
const LAST_RESORT_MATE_IN_1 = '7k/2Q5/6K1/8/8/8/8/8 w';

// Same (seed, target) always derives the same puzzle, so cache it —
// verifyChessAnswer re-derives on every submission.
const puzzleCache = new Map<string, ChessPuzzle>();

/** Place the given white pieces + the black king on distinct seeded
 *  squares; null if the position is illegal (white to move while black
 *  is in check — which also covers adjacent kings). */
function samplePosition(rng: () => number, whitePieces: readonly PieceChar[]): Position | null {
  const used = new Set<number>();
  const pick = (): number => {
    let sq = Math.floor(rng() * 64);
    while (used.has(sq)) sq = Math.floor(rng() * 64);
    used.add(sq);
    return sq;
  };
  const pieces: Piece[] = whitePieces.map((p) => ({ p, sq: pick() }));
  pieces.push({ p: 'k', sq: pick() });
  const pos: Position = { pieces, turn: 'w' };
  if (attacked(pos, kingSq(pos, 'b'), 'w')) return null;
  return pos;
}

/**
 * Deterministically derive a mate-in-N puzzle from (seed, difficulty).
 * White is always the attacker and always to move.
 *
 * Material per target depth:
 *   mate-in-1: K+Q+R vs k (mates-in-1 are plentiful)
 *   mate-in-2: K+Q vs k
 *   mate-in-3: K+Q vs k — measured empirically: exact-depth-3 positions
 *     occur often enough (typically within a few dozen tries) that the
 *     K+R fallback material suggested in the design was not needed.
 */
export function deriveChessPuzzle(seed: string, difficulty: number): ChessPuzzle {
  const target: 1 | 2 | 3 = difficulty < 0.34 ? 1 : difficulty < 0.67 ? 2 : 3;
  const cacheKey = `${seed}|${target}`;
  const cached = puzzleCache.get(cacheKey);
  if (cached) return cached;

  const rng = createRng(`chesspuzzle:${seed}`);
  const whitePieces: readonly PieceChar[] = target === 1 ? ['K', 'Q', 'R'] : ['K', 'Q'];

  let puzzle: ChessPuzzle | null = null;
  let fallback: { fen: string; k: 1 | 2 | 3 } | null = null;
  for (let i = 0; i < TRY_BUDGET && puzzle === null; i++) {
    const pos = samplePosition(rng, whitePieces);
    if (pos === null) continue;
    const k = mateDepthPos(pos, 3);
    if (k === null) continue;
    if (k === target) puzzle = { fen: toFen(pos), mateIn: target };
    else if (k < target && (fallback === null || k < fallback.k)) {
      fallback = { fen: toFen(pos), k: k as 1 | 2 | 3 };
    }
  }
  // After the budget: best shallower candidate, then relaxed acceptance
  // (any forced mate <= 3), then a fixed known mate-in-1. Never throws.
  if (puzzle === null && fallback !== null) puzzle = { fen: fallback.fen, mateIn: fallback.k };
  if (puzzle === null) {
    for (let i = 0; i < TRY_BUDGET && puzzle === null; i++) {
      const pos = samplePosition(rng, whitePieces);
      if (pos === null) continue;
      const k = mateDepthPos(pos, 3);
      if (k !== null) puzzle = { fen: toFen(pos), mateIn: k as 1 | 2 | 3 };
    }
  }
  if (puzzle === null) puzzle = { fen: LAST_RESORT_MATE_IN_1, mateIn: 1 };

  puzzleCache.set(cacheKey, puzzle);
  return puzzle;
}

// ---------------------------------------------------------------------------
// Server-authoritative verification
// ---------------------------------------------------------------------------

/**
 * Replay a submitted answer — WHITE's moves as a UCI array or a single
 * space-separated string — against the seed-derived puzzle. Black always
 * replies with the engine's deterministic bestDefense, so the client
 * cannot pick a cooperative defense. True only when the line forces
 * checkmate within puzzle.mateIn white moves. Never throws on unknown
 * input.
 */
export function verifyChessAnswer(seed: string, difficulty: number, answer: unknown): boolean {
  try {
    let moves: string[];
    if (typeof answer === 'string') {
      moves = answer.trim().split(/\s+/).filter((m) => m.length > 0);
    } else if (Array.isArray(answer) && answer.every((m): m is string => typeof m === 'string')) {
      moves = answer;
    } else {
      return false;
    }
    const puzzle = deriveChessPuzzle(seed, difficulty);
    if (moves.length === 0 || moves.length > puzzle.mateIn) return false;

    let fen = puzzle.fen;
    for (let i = 0; i < moves.length; i++) {
      const uci = moves[i];
      if (!/^[a-h][1-8][a-h][1-8]$/.test(uci)) return false;
      if (!legalMoves(fen).includes(uci)) return false;
      fen = applyMove(fen, uci);
      if (isCheckmate(fen)) return i + 1 <= puzzle.mateIn;
      if (i === moves.length - 1) return false; // moves ran out without mate
      if (isStalemate(fen)) return false; // stalemated the defender: no win
      const reply = bestDefense(fen);
      if (reply === null) return false;
      fen = applyMove(fen, reply);
    }
    return false;
  } catch {
    return false;
  }
}
