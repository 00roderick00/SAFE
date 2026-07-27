// Chess puzzle lock (TACTILE-REDESIGN §2).
//
// Tactile: tap a piece, tap its destination square — nothing else.
// Skill:   the position is fixed and the mate is forced; no RNG during
//          play. The opponent's replies are deterministic (bestDefense),
//          so the whole game is a pure function of the player's moves.
// Security (class 1a): the position derives from (seed, difficulty) via
//          the shared engine; onComplete submits the player's actual
//          white moves as `answer` and the SERVER replays them against
//          the same deterministic defense (verifyChessAnswer). Client
//          passed/score is not trusted.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { MiniGameProps } from '../../types';
import {
  applyMove,
  bestDefense,
  deriveChessPuzzle,
  isCheckmate,
  legalMoves,
} from '../../game/chessPuzzle';
import { haptics } from '../../utils/haptics';

const GLYPHS: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞',
};
const PIECE_NAMES: Record<string, string> = {
  k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight',
};

const TIME_LIMIT_S = 60;
const MAX_ATTEMPTS = 3;
const REPLY_DELAY_MS = 450;

/** FEN piece placement → 64-cell array, index 0 = a8 … 63 = h1. */
function fenToBoard(fen: string): (string | null)[] {
  const cells: (string | null)[] = [];
  for (const row of fen.split(' ')[0].split('/')) {
    for (const ch of row) {
      if (/[1-8]/.test(ch)) for (let i = 0; i < Number(ch); i++) cells.push(null);
      else cells.push(ch);
    }
  }
  return cells;
}

const squareName = (index: number): string =>
  'abcdefgh'[index % 8] + String(8 - Math.floor(index / 8));

export const ChessPuzzleGame = ({ difficulty, seed, onComplete }: MiniGameProps) => {
  const puzzle = useMemo(() => deriveChessPuzzle(seed || 'chess-preview', difficulty), [seed, difficulty]);
  const [fen, setFen] = useState(puzzle.fen);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<string | null>(null);
  const [whiteMoves, setWhiteMoves] = useState<string[]>([]);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [status, setStatus] = useState<'playing' | 'replying' | 'reset' | 'done'>('playing');
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_S);
  const startRef = useRef(Date.now());
  const doneRef = useRef(false);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback((passed: boolean, answer: string[]) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setStatus('done');
    onComplete({
      moduleId: 'chesspuzzle',
      moduleType: 'chesspuzzle',
      score: passed ? 1 : 0,
      passed,
      timeSpent: Date.now() - startRef.current,
      // The actual mating line — server-verified by deterministic replay.
      answer,
    });
  }, [onComplete]);

  // Countdown.
  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          finish(false, []);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [finish]);

  useEffect(() => () => { if (replyTimer.current) clearTimeout(replyTimer.current); }, []);

  const board = useMemo(() => fenToBoard(fen), [fen]);
  const whiteToMove = fen.endsWith(' w');
  const moves = useMemo(() => (whiteToMove && status === 'playing' ? legalMoves(fen) : []), [fen, whiteToMove, status]);
  const targets = useMemo(
    () => new Set(moves.filter((m) => selected && m.startsWith(selected)).map((m) => m.slice(2, 4))),
    [moves, selected],
  );

  const failAttempt = useCallback(() => {
    haptics.error();
    if (attemptsLeft <= 1) {
      finish(false, []);
      return;
    }
    setAttemptsLeft((a) => a - 1);
    setStatus('reset');
    replyTimer.current = setTimeout(() => {
      setFen(puzzle.fen);
      setWhiteMoves([]);
      setSelected(null);
      setLastMove(null);
      setStatus('playing');
    }, 900);
  }, [attemptsLeft, finish, puzzle.fen]);

  const playWhiteMove = useCallback((uci: string) => {
    const afterWhite = applyMove(fen, uci);
    const line = [...whiteMoves, uci];
    setFen(afterWhite);
    setWhiteMoves(line);
    setSelected(null);
    setLastMove(uci);
    haptics.selection();

    if (isCheckmate(afterWhite)) {
      haptics.success();
      finish(true, line);
      return;
    }
    if (line.length >= puzzle.mateIn) {
      // Move budget spent without mate — the forced line was missed.
      failAttempt();
      return;
    }
    // Deterministic defense replies after a beat.
    setStatus('replying');
    replyTimer.current = setTimeout(() => {
      const reply = bestDefense(afterWhite);
      if (!reply) {
        // Stalemate — no mate anymore.
        failAttempt();
        return;
      }
      setFen(applyMove(afterWhite, reply));
      setLastMove(reply);
      setStatus('playing');
    }, REPLY_DELAY_MS);
  }, [fen, whiteMoves, puzzle.mateIn, finish, failAttempt]);

  const handleSquareTap = (index: number) => {
    if (status !== 'playing' || !whiteToMove || doneRef.current) return;
    const square = squareName(index);
    const piece = board[index];

    if (selected && targets.has(square)) {
      playWhiteMove(selected + square);
      return;
    }
    if (piece && piece === piece.toUpperCase()) {
      // Tap your own piece to (re)select it.
      setSelected(square === selected ? null : square);
      haptics.selection();
      return;
    }
    setSelected(null);
  };

  const lastFrom = lastMove?.slice(0, 2);
  const lastTo = lastMove?.slice(2, 4);

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span className="font-display font-bold">
          Mate in {puzzle.mateIn} · White to move
        </span>
        <span className={timeLeft <= 10 ? 'text-danger' : 'text-text-dim'}>{timeLeft}s</span>
      </div>
      <div
        role="grid"
        aria-label={`Chess board, find mate in ${puzzle.mateIn}`}
        className="grid grid-cols-8 rounded-lg overflow-hidden border border-surface-light select-none"
        style={{ touchAction: 'manipulation' }}
      >
        {board.map((piece, index) => {
          const square = squareName(index);
          const dark = (Math.floor(index / 8) + index) % 2 === 1;
          const isSelected = selected === square;
          const isTarget = targets.has(square);
          const isLast = square === lastFrom || square === lastTo;
          const label = piece
            ? `${square}, ${piece === piece.toUpperCase() ? 'white' : 'black'} ${PIECE_NAMES[piece.toLowerCase()]}`
            : isTarget ? `${square}, move here` : square;
          return (
            <button
              key={square}
              type="button"
              role="gridcell"
              aria-label={label}
              onClick={() => handleSquareTap(index)}
              className={`relative w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center text-2xl leading-none
                ${dark ? 'bg-surface-light' : 'bg-surface-light/40'}
                ${isSelected ? 'ring-2 ring-inset ring-primary' : ''}
                ${isLast && !isSelected ? 'ring-1 ring-inset ring-primary/40' : ''}`}
            >
              {piece && (
                <motion.span
                  layout
                  className={piece === piece.toUpperCase() ? 'text-text drop-shadow' : 'text-primary'}
                >
                  {GLYPHS[piece]}
                </motion.span>
              )}
              {isTarget && (
                <span aria-hidden className={`absolute inset-0 flex items-center justify-center ${piece ? '' : ''}`}>
                  <span className={`rounded-full bg-primary/70 ${piece ? 'w-8 h-8 opacity-40' : 'w-2.5 h-2.5'}`} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-text-dim mt-2" role="status">
        {status === 'reset'
          ? 'Not the forced mate — position reset.'
          : status === 'replying'
            ? 'Opponent thinking…'
            : `Tap a piece, then its destination · attempts left: ${attemptsLeft}`}
      </p>
    </div>
  );
};
