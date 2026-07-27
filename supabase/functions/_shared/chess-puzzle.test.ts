import { describe, it, expect } from 'vitest';
import {
  parseFen,
  legalMoves,
  applyMove,
  isCheck,
  isCheckmate,
  isStalemate,
  mateDepth,
  bestDefense,
  deriveChessPuzzle,
  verifyChessAnswer,
} from './chess-puzzle';

// All positions below are piece-only endgames, hand-checked and then
// confirmed against the engine itself during development.

describe('move generation', () => {
  it('lone cornered king has exactly its three sorted moves', () => {
    expect(legalMoves('7k/8/8/8/8/8/8/K7 w')).toEqual(['a1a2', 'a1b1', 'a1b2']);
  });

  it('a rook-pinned knight cannot move (would expose own king)', () => {
    // Black Re8 pins white Ne4 against Ke1 along the e-file.
    const fen = '4r2k/8/8/8/4N3/8/8/4K3 w';
    const moves = legalMoves(fen);
    expect(moves.filter((m) => m.startsWith('e4'))).toEqual([]);
    // Only the king may move; e2 stays safe because the knight still blocks.
    expect(moves).toEqual(['e1d1', 'e1d2', 'e1e2', 'e1f1', 'e1f2']);
  });

  it('applyMove flips the side to move and rejects illegal/malformed moves', () => {
    const fen = '7k/2Q5/6K1/8/8/8/8/8 w';
    expect(applyMove(fen, 'c7h7')).toBe('7k/7Q/6K1/8/8/8/8/8 b');
    expect(() => applyMove('4r2k/8/8/8/4N3/8/8/4K3 w', 'e4d6')).toThrow(); // pinned
    expect(() => applyMove(fen, 'c7c7')).toThrow();
    expect(() => applyMove(fen, 'z9a1')).toThrow();
    expect(() => applyMove(fen, 'garbage')).toThrow();
  });

  it('detects a back-rank-style K+Q checkmate', () => {
    // Black Kh8 checked by Qe8 along the rank; Kg6 covers g7/h7.
    const fen = '4Q2k/8/6K1/8/8/8/8/8 b';
    expect(isCheck(fen)).toBe(true);
    expect(isCheckmate(fen)).toBe(true);
    expect(isStalemate(fen)).toBe(false);
    expect(legalMoves(fen)).toEqual([]);
  });

  it('detects a classic queen stalemate', () => {
    // Black Ka8 not in check; Qc7 + Kb6 cover a7/b7/b8.
    const fen = 'k7/2Q5/1K6/8/8/8/8/8 b';
    expect(isCheck(fen)).toBe(false);
    expect(isCheckmate(fen)).toBe(false);
    expect(isStalemate(fen)).toBe(true);
    expect(legalMoves(fen)).toEqual([]);
  });

  it('parseFen rejects pawns and malformed FENs', () => {
    expect(() => parseFen('7k/8/8/8/8/8/4P3/4K3 w')).toThrow();
    expect(() => parseFen('7k/8/8/8/8/8/8/4K3')).toThrow(); // no turn
    expect(() => parseFen('7k/8/8/8/8/8/8/4K3 x')).toThrow();
    expect(() => parseFen('8/8/8/8/8/8/8/4K3 w')).toThrow(); // missing black king
    expect(() => parseFen('7k/8/8/8/8/8/8/44K3 w')).toThrow(); // bad rank width
  });
});

describe('mateDepth', () => {
  it('finds a mate in 1 (Kg6+Qc7 vs kh8: Qh7#)', () => {
    const fen = '7k/2Q5/6K1/8/8/8/8/8 w';
    expect(mateDepth(fen, 3)).toBe(1);
    expect(isCheckmate(applyMove(fen, 'c7h7'))).toBe(true);
  });

  it('finds a mate in 2 (Kf6+Qe6 vs kh8)', () => {
    expect(mateDepth('7k/8/4QK2/8/8/8/8/8 w', 3)).toBe(2);
  });

  it('finds a mate in 3 (Ke5+Qe1 vs kh8)', () => {
    expect(mateDepth('7k/8/8/4K3/8/8/8/4Q3 w', 3)).toBe(3);
  });

  it('returns null when no mate can be forced within the budget', () => {
    expect(mateDepth('7k/8/8/8/8/8/8/K7 w', 3)).toBeNull(); // bare kings
    expect(mateDepth('8/8/8/3k4/8/8/8/KQ6 w', 3)).toBeNull(); // KQ too far
  });
});

describe('bestDefense', () => {
  it('is deterministic for the same position', () => {
    // Defender to move after white's first move of a mate-in-2.
    const puzzle = deriveChessPuzzle('sweep-2-0', 0.5);
    const first = legalMoves(puzzle.fen)[0];
    const afterFirst = applyMove(puzzle.fen, first);
    const a = bestDefense(afterFirst);
    expect(a).not.toBeNull();
    expect(bestDefense(afterFirst)).toBe(a);
    expect(bestDefense(afterFirst)).toBe(a);
  });

  it('returns null when the side to move has no legal moves', () => {
    expect(bestDefense('k7/2Q5/1K6/8/8/8/8/8 b')).toBeNull(); // stalemate
    expect(bestDefense('4Q2k/8/6K1/8/8/8/8/8 b')).toBeNull(); // checkmate
  });
});

const BANDS = [
  { difficulty: 0.1, target: 1 },
  { difficulty: 0.5, target: 2 },
  { difficulty: 0.9, target: 3 },
] as const;

const sweepSeeds = (band: number, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `sweep-${band}-${i}`);

describe('deriveChessPuzzle', () => {
  it('is deterministic: same seed + difficulty gives the identical puzzle', () => {
    const a = deriveChessPuzzle('det-seed', 0.9);
    const b = deriveChessPuzzle('det-seed', 0.9);
    expect(b).toEqual(a);
  });

  it('different seeds give (almost always) different positions', () => {
    const fens = new Set(sweepSeeds(2, 30).map((s) => deriveChessPuzzle(s, 0.5).fen));
    expect(fens.size).toBeGreaterThan(25);
  });

  it('sweep: 30 seeds per band are legal, white to move, exact mate depth, and fast', () => {
    const started = performance.now();
    for (const { difficulty, target } of BANDS) {
      for (const seed of sweepSeeds(target, 30)) {
        const puzzle = deriveChessPuzzle(seed, difficulty);
        expect(puzzle.mateIn).toBe(target);
        expect(puzzle.fen.endsWith(' w')).toBe(true);
        expect(() => parseFen(puzzle.fen)).not.toThrow();
        // Legality: with white to move, black must not already be in check
        // (probe it by asking whether black-to-move would be in check).
        expect(isCheck(puzzle.fen.replace(/ w$/, ' b'))).toBe(false);
        expect(mateDepth(puzzle.fen, 3)).toBe(puzzle.mateIn);
      }
    }
    // Whole 90-puzzle sweep must stay well inside the suite's time budget
    // (measured ~3s cold on a laptop; generous headroom for CI).
    expect(performance.now() - started).toBeLessThan(25_000);
  });
});

/** Build a winning line with the engine itself: at each step pick the
 *  first attacker move that mates or keeps mate forced against black's
 *  bestDefense reply. */
function winningLine(fen: string, mateIn: number): string[] {
  const line: string[] = [];
  let cur = fen;
  let remaining = mateIn;
  while (remaining > 0) {
    let chosen: string | null = null;
    for (const m of legalMoves(cur)) {
      const after = applyMove(cur, m);
      if (isCheckmate(after)) {
        chosen = m;
        cur = after;
        break;
      }
      if (remaining > 1 && !isStalemate(after)) {
        const reply = bestDefense(after);
        if (reply === null) continue;
        const next = applyMove(after, reply);
        const d = mateDepth(next, 3);
        if (d !== null && d <= remaining - 1) {
          chosen = m;
          cur = next;
          break;
        }
      }
    }
    if (chosen === null) throw new Error(`no mate-preserving move in ${cur}`);
    line.push(chosen);
    if (isCheckmate(cur)) return line;
    remaining--;
  }
  throw new Error(`line failed to mate: ${line.join(' ')}`);
}

describe('verifyChessAnswer', () => {
  it('accepts engine-computed winning lines for 10 seeds per band (array and string forms)', () => {
    for (const { difficulty, target } of BANDS) {
      for (const seed of sweepSeeds(target, 10)) {
        const puzzle = deriveChessPuzzle(seed, difficulty);
        const line = winningLine(puzzle.fen, puzzle.mateIn);
        expect(line.length).toBeLessThanOrEqual(puzzle.mateIn);
        expect(verifyChessAnswer(seed, difficulty, line)).toBe(true);
        expect(verifyChessAnswer(seed, difficulty, line.join(' '))).toBe(true);
      }
    }
  });

  it('rejects malformed input without throwing', () => {
    expect(verifyChessAnswer('sweep-1-0', 0.1, [])).toBe(false);
    expect(verifyChessAnswer('sweep-1-0', 0.1, '')).toBe(false);
    expect(verifyChessAnswer('sweep-1-0', 0.1, 'garbage')).toBe(false);
    expect(verifyChessAnswer('sweep-1-0', 0.1, 42)).toBe(false);
    expect(verifyChessAnswer('sweep-1-0', 0.1, null)).toBe(false);
    expect(verifyChessAnswer('sweep-1-0', 0.1, undefined)).toBe(false);
    expect(verifyChessAnswer('sweep-1-0', 0.1, { move: 'e2e4' })).toBe(false);
    expect(verifyChessAnswer('sweep-1-0', 0.1, ['e2e9'])).toBe(false);
    expect(verifyChessAnswer('sweep-1-0', 0.1, [12 as unknown as string])).toBe(false);
  });

  it('rejects a legal-but-non-mating line', () => {
    const seed = 'sweep-1-1';
    const puzzle = deriveChessPuzzle(seed, 0.1);
    const nonMating = legalMoves(puzzle.fen).find((m) => !isCheckmate(applyMove(puzzle.fen, m)));
    expect(nonMating).toBeDefined();
    expect(verifyChessAnswer(seed, 0.1, [nonMating as string])).toBe(false);
  });

  it('rejects an unfinished line and one that exceeds mateIn moves', () => {
    // Mate-in-2 answered with only its first move: not mate yet.
    const seed2 = 'sweep-2-1';
    const p2 = deriveChessPuzzle(seed2, 0.5);
    const line2 = winningLine(p2.fen, p2.mateIn);
    expect(line2.length).toBe(2);
    expect(verifyChessAnswer(seed2, 0.5, [line2[0]])).toBe(false);
    // Mate-in-1 answered with a 2-move line: exceeds the budget.
    const seed1 = 'sweep-1-2';
    const p1 = deriveChessPuzzle(seed1, 0.1);
    expect(p1.mateIn).toBe(1);
    const line1 = winningLine(p1.fen, 1);
    expect(verifyChessAnswer(seed1, 0.1, [...line1, 'a1a2'])).toBe(false);
  });

  it('rejects a wrong-puzzle answer (line from another seed)', () => {
    const p = deriveChessPuzzle('sweep-1-3', 0.1);
    const foreign = winningLine(p.fen, p.mateIn);
    // Almost surely illegal or non-mating from a different seed's position.
    expect(verifyChessAnswer('sweep-1-4', 0.1, foreign)).toBe(false);
  });
});
