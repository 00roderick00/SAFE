// Anti-cheat coverage for the new `chesspuzzle` lock (TACTILE-REDESIGN
// §2/§4): a safe guarded by a chess puzzle must not be breachable with a
// forged result — the server replays the submitted mating line itself.

import { describe, it, expect } from 'vitest';
import { verifyAttack, type SubmittedResultV } from './verify';
import {
  applyMove,
  bestDefense,
  deriveChessPuzzle,
  isCheckmate,
  legalMoves,
  mateDepth,
} from './chess-puzzle';
import { countVerifiableModules, isVerifiableModule } from './lock-solutions';
import type { AttackModuleSeed } from './attack-flow';
import type { SecurityLoadout, SecurityModule } from './types';

const SEED = 'verify-chess';
const DIFFICULTY = 0.1; // mate in 1

function chessModule(): SecurityModule {
  return {
    id: 'chess-slot-0',
    type: 'chesspuzzle',
    difficulty: DIFFICULTY,
    weight: 1.3,
    name: 'Checkmate',
    description: 'Find the forced mate',
  };
}

function chessSeed(): AttackModuleSeed {
  return { index: 0, moduleType: 'chesspuzzle', difficulty: DIFFICULTY, seed: SEED };
}

/** A genuinely winning line, computed the way an honest client would:
 *  at each turn pick a white move that either mates now or keeps the
 *  mate forced after black's best defense. */
function winningLine(seed: string, difficulty: number): string[] {
  const puzzle = deriveChessPuzzle(seed, difficulty);
  let fen = puzzle.fen;
  const line: string[] = [];
  for (let move = 0; move < puzzle.mateIn; move++) {
    const remaining = puzzle.mateIn - move;
    const chosen = legalMoves(fen).find((m) => {
      const after = applyMove(fen, m);
      if (isCheckmate(after)) return true;
      if (remaining === 1) return false;
      const reply = bestDefense(after);
      if (!reply) return false; // stalemate
      return mateDepth(applyMove(after, reply), (remaining - 1) as 1 | 2) !== null;
    });
    if (!chosen) throw new Error('no mate-preserving move found — engine/test mismatch');
    line.push(chosen);
    fen = applyMove(fen, chosen);
    if (isCheckmate(fen)) return line;
    fen = applyMove(fen, bestDefense(fen)!);
  }
  throw new Error('line did not mate within budget');
}

describe('verifyAttack — chesspuzzle is class 1a', () => {
  const loadout: SecurityLoadout = { modules: [chessModule()], effectiveScore: 0 };
  const seeds = [chessSeed()];

  it('counts as a verifiable module (composition guarantee)', () => {
    expect(isVerifiableModule(chessModule())).toBe(true);
    expect(countVerifiableModules(loadout)).toBe(1);
  });

  it('rejects a forged all-pass with no answer', () => {
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'chesspuzzle', score: 1, passed: true, timeSpent: 12000 },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allPassed).toBe(false);
    expect(res.rows[0].passed).toBe(false);
    expect(res.rows[0].method).toBe('answer');
    expect(res.rows[0].reason).toBe('no_answer');
  });

  it('rejects a plausible-but-wrong answer (legal non-mating move)', () => {
    const puzzle = deriveChessPuzzle(SEED, DIFFICULTY);
    const nonMate = legalMoves(puzzle.fen).find((m) => !isCheckmate(applyMove(puzzle.fen, m)));
    expect(nonMate).toBeDefined();
    const submitted: SubmittedResultV[] = [
      { moduleIndex: 0, moduleType: 'chesspuzzle', score: 1, passed: true, timeSpent: 12000, answer: [nonMate!] },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allPassed).toBe(false);
    expect(res.rows[0].reason).toBe('answer_mismatch');
  });

  it('rejects garbage answers without throwing', () => {
    for (const garbage of ['zz9xx1', 42, { moves: ['a1a2'] }, ['not-a-move'], 'e2e4 e7e5 hax']) {
      const submitted: SubmittedResultV[] = [
        { moduleIndex: 0, moduleType: 'chesspuzzle', score: 1, passed: true, timeSpent: 9000, answer: garbage },
      ];
      const res = verifyAttack('atk', loadout, seeds, submitted);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.rows[0].passed).toBe(false);
    }
  });

  it('accepts a genuinely winning line even when the client under-reports it', () => {
    const line = winningLine(SEED, DIFFICULTY);
    const submitted: SubmittedResultV[] = [
      // Client claims failure — the server decides from the answer alone.
      { moduleIndex: 0, moduleType: 'chesspuzzle', score: 0, passed: false, timeSpent: 15000, answer: line },
    ];
    const res = verifyAttack('atk', loadout, seeds, submitted);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows[0].passed).toBe(true);
    expect(res.rows[0].method).toBe('answer');
    expect(res.allPassed).toBe(true);
  });
});
