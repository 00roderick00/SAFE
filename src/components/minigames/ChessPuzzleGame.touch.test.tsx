/**
 * Chess puzzle (TACTILE-REDESIGN §2): tap a piece, tap its destination.
 * The winning line is computed with the SAME shared engine the server
 * verifies with, so this test proves the tap flow produces an `answer`
 * that server-side verifyChessAnswer accepts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChessPuzzleGame } from './ChessPuzzleGame';
import {
  applyMove,
  deriveChessPuzzle,
  isCheckmate,
  legalMoves,
  verifyChessAnswer,
} from '../../game/chessPuzzle';

const SEED = 'chess-touch-test';
const DIFFICULTY = 0.1; // mate in 1

afterEach(() => {
  vi.useRealTimers();
});

const tapSquare = (square: string) => {
  fireEvent.click(screen.getByRole('gridcell', { name: new RegExp(`^${square}(,|$)`) }));
};

describe('ChessPuzzleGame touch flow', () => {
  it('solves a mate-in-1 by tapping piece then destination, and the answer passes server verification', () => {
    const puzzle = deriveChessPuzzle(SEED, DIFFICULTY);
    expect(puzzle.mateIn).toBe(1);
    const mate = legalMoves(puzzle.fen).find((m) => isCheckmate(applyMove(puzzle.fen, m)));
    expect(mate).toBeDefined();
    const from = mate!.slice(0, 2);
    const to = mate!.slice(2, 4);

    const onComplete = vi.fn();
    render(<ChessPuzzleGame difficulty={DIFFICULTY} seed={SEED} onComplete={onComplete} />);
    expect(screen.getByRole('grid', { name: /mate in 1/i })).toBeInTheDocument();

    tapSquare(from);
    tapSquare(to);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.moduleType).toBe('chesspuzzle');
    expect(result.passed).toBe(true);
    expect(result.answer).toEqual([mate]);
    // The exact contract the Edge Function runs:
    expect(verifyChessAnswer(SEED, DIFFICULTY, result.answer)).toBe(true);
  });

  it('a non-mating line fails server verification even if replayed', () => {
    const puzzle = deriveChessPuzzle(SEED, DIFFICULTY);
    const nonMate = legalMoves(puzzle.fen).find((m) => !isCheckmate(applyMove(puzzle.fen, m)));
    expect(nonMate).toBeDefined();
    expect(verifyChessAnswer(SEED, DIFFICULTY, [nonMate!])).toBe(false);
  });

  it('times out to a failed result if the player never moves', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<ChessPuzzleGame difficulty={DIFFICULTY} seed={SEED} onComplete={onComplete} />);
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].passed).toBe(false);
  });
});
