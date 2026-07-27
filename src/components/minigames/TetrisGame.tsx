import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ChevronsDown, RotateCw } from 'lucide-react';
import { createRng } from '@shared/rng.ts';
import type { MiniGameProps } from '../../types';
import { gameAudio } from '../../utils/gameFeedback';
import { haptics } from '../../utils/haptics';
import { MiniGameChrome } from './MiniGameChrome';

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 16;
const SHAPES = [
  [[1, 1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
  [[1, 1, 0], [0, 1, 1]],
];

const TAP_SLOP_PX = 10;
const SWIPE_DROP_PX = 40;
const FALLBACK_CELL_PX = 24;

interface Piece { shape: number[][]; x: number; y: number; color: number; }
interface DragState { pointerId: number; startX: number; startY: number; startPieceX: number; moved: boolean; }
const emptyBoard = () => Array.from({ length: BOARD_HEIGHT }, () => Array<number>(BOARD_WIDTH).fill(0));
const makePiece = (rng: () => number): Piece => {
  const color = Math.floor(rng() * SHAPES.length) + 1;
  const shape = SHAPES[color - 1];
  return { shape, x: Math.floor(BOARD_WIDTH / 2) - Math.floor(shape[0].length / 2), y: 0, color };
};

export const TetrisGame = ({ difficulty, seed, onComplete }: MiniGameProps) => {
  const rngRef = useRef(createRng(seed || 'tetris-preview'));
  const [board, setBoard] = useState(emptyBoard);
  const [piece, setPiece] = useState<Piece>(() => makePiece(rngRef.current));
  const [linesCleared, setLinesCleared] = useState(0);
  const linesRef = useRef(0);
  const [timeLeft, setTimeLeft] = useState(50);
  const [status, setStatus] = useState('Drag on the board to steer, tap to rotate, swipe down to slam. Buttons below work too.');
  const [statusTone, setStatusTone] = useState<'neutral' | 'warning' | 'success' | 'failure'>('neutral');
  const startTimeRef = useRef(0);
  const completedRef = useRef(false);
  const targetLines = Math.floor(2 + difficulty * 4);
  const dropSpeed = Math.round(700 - difficulty * 350);

  useEffect(() => { startTimeRef.current = Date.now(); }, []);

  const collision = useCallback((candidate: Piece, currentBoard: number[][]) => {
    for (let row = 0; row < candidate.shape.length; row++) {
      for (let column = 0; column < candidate.shape[row].length; column++) {
        if (!candidate.shape[row][column]) continue;
        const x = candidate.x + column;
        const y = candidate.y + row;
        if (x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT || (y >= 0 && currentBoard[y]?.[x])) return true;
      }
    }
    return false;
  }, []);

  const finish = useCallback((passed: boolean, finalLines = linesRef.current) => {
    if (completedRef.current) return;
    completedRef.current = true;
    const score = Math.min(1, finalLines / targetLines);
    setStatus(passed ? 'Line goal reached. Stack bolt released.' : finalLines === targetLines - 1 ? 'Near miss. One more line would have cracked the lock.' : 'Stack locked before the line goal.');
    setStatusTone(passed ? 'success' : finalLines === targetLines - 1 ? 'warning' : 'failure');
    haptics[passed ? 'success' : 'error']();
    gameAudio.play(passed ? 'crack' : 'fail');
    window.setTimeout(() => onComplete({ moduleId: 'tetris', moduleType: 'tetris', score, passed, timeSpent: Date.now() - startTimeRef.current }), 260);
  }, [onComplete, targetLines]);

  const lockPiece = useCallback((lockedPiece: Piece) => {
    setBoard((currentBoard) => {
      const nextBoard = currentBoard.map((row) => [...row]);
      lockedPiece.shape.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
        const y = lockedPiece.y + rowIndex;
        const x = lockedPiece.x + columnIndex;
        if (cell && y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) nextBoard[y][x] = lockedPiece.color;
      }));
      let cleared = 0;
      for (let row = BOARD_HEIGHT - 1; row >= 0; row--) {
        if (nextBoard[row].every(Boolean)) {
          nextBoard.splice(row, 1);
          nextBoard.unshift(Array<number>(BOARD_WIDTH).fill(0));
          cleared++;
          row++;
        }
      }
      if (cleared) {
        const total = linesRef.current + cleared;
        linesRef.current = total;
        setLinesCleared(total);
        setStatus(`${cleared} line${cleared > 1 ? 's' : ''} cleared. ${Math.max(0, targetLines - total)} remaining.`);
        setStatusTone(total >= targetLines ? 'success' : 'neutral');
        haptics.success();
        gameAudio.play('crack');
        if (total >= targetLines) window.setTimeout(() => finish(true, total), 0);
      }
      const nextPiece = makePiece(rngRef.current);
      if (collision(nextPiece, nextBoard)) window.setTimeout(() => finish(false), 0);
      else setPiece(nextPiece);
      return nextBoard;
    });
  }, [collision, finish, targetLines]);

  const move = useCallback((direction: 'left' | 'right' | 'down' | 'rotate' | 'drop') => {
    if (completedRef.current) return;
    if (direction === 'drop') {
      let dropped = { ...piece };
      while (!collision({ ...dropped, y: dropped.y + 1 }, board)) dropped = { ...dropped, y: dropped.y + 1 };
      setPiece(dropped);
      lockPiece(dropped);
      haptics.medium();
      return;
    }
    if (direction === 'down') {
      const candidate = { ...piece, y: piece.y + 1 };
      if (collision(candidate, board)) lockPiece(piece); else setPiece(candidate);
      haptics.selection();
      return;
    }
    if (direction === 'rotate') {
      const shape = piece.shape[0].map((_, index) => piece.shape.map((row) => row[index]).reverse());
      const candidate = { ...piece, shape };
      if (!collision(candidate, board)) setPiece(candidate); else setStatus('Rotation blocked by the stack.');
      haptics.selection();
      return;
    }
    const candidate = { ...piece, x: piece.x + (direction === 'left' ? -1 : 1) };
    if (!collision(candidate, board)) setPiece(candidate);
    haptics.selection();
  }, [board, piece, collision, lockPiece]);

  const boardElRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const cellWidth = useCallback(() => {
    const rect = boardElRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? rect.width / BOARD_WIDTH : FALLBACK_CELL_PX;
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (completedRef.current) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startPieceX: piece.x, moved: false };
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture unsupported */ }
    }
  }, [piece.x]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || completedRef.current) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) > TAP_SLOP_PX || Math.abs(deltaY) > TAP_SLOP_PX) drag.moved = true;
    const targetX = drag.startPieceX + Math.round(deltaX / cellWidth());
    if (targetX === piece.x) return;
    const step = targetX > piece.x ? 1 : -1;
    let next = piece;
    while (next.x !== targetX) {
      const candidate = { ...next, x: next.x + step };
      if (collision(candidate, board)) break;
      next = candidate;
    }
    if (next !== piece) {
      setPiece(next);
      haptics.selection();
    }
  }, [board, piece, collision, cellWidth]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (completedRef.current) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (deltaY > SWIPE_DROP_PX && Math.abs(deltaY) > Math.abs(deltaX)) {
      move('drop');
      return;
    }
    if (!drag.moved && Math.abs(deltaX) < TAP_SLOP_PX && Math.abs(deltaY) < TAP_SLOP_PX) move('rotate');
  }, [move]);

  const handlePointerCancel = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    if (completedRef.current) return;
    const timer = window.setInterval(() => move('down'), dropSpeed);
    return () => window.clearInterval(timer);
  }, [move, dropSpeed]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft((time) => {
        if (time <= 1) {
          window.setTimeout(() => finish(linesRef.current >= targetLines), 0);
          return 0;
        }
        return time - 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [finish, targetLines]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const controls: Record<string, Parameters<typeof move>[0]> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate', ' ': 'drop' };
      const direction = controls[event.key];
      if (!direction) return;
      event.preventDefault();
      move(direction);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [move]);

  const displayBoard = useMemo(() => {
    const display = board.map((row) => [...row]);
    piece.shape.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
      const y = piece.y + rowIndex;
      const x = piece.x + columnIndex;
      if (cell && y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) display[y][x] = piece.color;
    }));
    return display;
  }, [board, piece]);

  return (
    <MiniGameChrome name="Tetris" objective={`Clear ${targetLines} lines`} timeLeft={timeLeft} progress={{ current: linesCleared, total: targetLines, label: 'Lines' }} status={status} statusTone={statusTone}
      controls={<>
        <button className="game-control" onClick={() => move('left')} aria-label="Move piece left"><ArrowLeft /><span>Left</span><kbd>←</kbd></button>
        <button className="game-control" onClick={() => move('rotate')} aria-label="Rotate piece clockwise"><RotateCw /><span>Rotate</span><kbd>↑</kbd></button>
        <button className="game-control" onClick={() => move('down')} aria-label="Move piece down"><ArrowDown /><span>Down</span><kbd>↓</kbd></button>
        <button className="game-control" onClick={() => move('right')} aria-label="Move piece right"><ArrowRight /><span>Right</span><kbd>→</kbd></button>
        <button className="game-control game-control--wide" onClick={() => move('drop')} aria-label="Hard drop piece"><ChevronsDown /><span>Hard drop</span><kbd>Space</kbd></button>
      </>}
    >
      <div ref={boardElRef} className="tetris-board" role="img" aria-label={`Tetris board, ${linesCleared} of ${targetLines} lines cleared`}
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel}>
        {displayBoard.flatMap((row, rowIndex) => row.map((cell, columnIndex) => <span key={`${rowIndex}-${columnIndex}`} className={cell ? `filled color-${cell}` : ''} />))}
      </div>
    </MiniGameChrome>
  );
};
