import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TetrisGame } from './TetrisGame';

afterEach(() => {
  vi.useRealTimers();
});

// happy-dom getBoundingClientRect returns all zeros, so the component falls back
// to a 24px cell width and the board's left edge sits at clientX = 0.
const CELL = 24;
const BOARD_WIDTH = 10;

const boardEl = () => screen.getByRole('img', { name: /Tetris board/i });
const filledCells = (board: HTMLElement) =>
  Array.from(board.querySelectorAll('span')).flatMap((cell, index) => (cell.classList.contains('filled') ? [index] : []));
const columnsOf = (cells: number[]) => cells.map((index) => index % BOARD_WIDTH);
const rowsOf = (cells: number[]) => cells.map((index) => Math.floor(index / BOARD_WIDTH));

describe('Tetris touch gestures', () => {
  it('rotates the falling piece on a tap (pointer up with sub-slop movement)', () => {
    vi.useFakeTimers();
    render(<TetrisGame difficulty={0} seed="tetris-test" onComplete={vi.fn()} />);
    const board = boardEl();
    const before = filledCells(board);
    expect(before).toHaveLength(4);

    fireEvent.pointerDown(board, { pointerId: 1, clientX: 120, clientY: 40 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 123, clientY: 43 });

    const after = filledCells(board);
    expect(after).toHaveLength(4);
    expect(after).not.toEqual(before);
    // Rotation swaps the footprint from 3 wide x 2 tall to 2 wide x 3 tall.
    expect(new Set(columnsOf(after)).size).toBe(2);
    expect(new Set(rowsOf(after)).size).toBe(3);
  });

  it('moves the piece column-by-column with a horizontal drag and clamps at the wall', () => {
    vi.useFakeTimers();
    render(<TetrisGame difficulty={0} seed="tetris-test" onComplete={vi.fn()} />);
    const board = boardEl();
    const beforeColumns = columnsOf(filledCells(board));

    fireEvent.pointerDown(board, { pointerId: 1, clientX: 120, clientY: 40 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 120 - 3 * CELL, clientY: 42 });

    const afterDrag = filledCells(board);
    expect(columnsOf(afterDrag)).toEqual(beforeColumns.map((column) => column - 3));

    // Dragging far past the edge clamps against the wall via collision checks.
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 120 - 10 * CELL, clientY: 42 });
    expect(Math.min(...columnsOf(filledCells(board)))).toBe(0);

    // Releasing a drag neither rotates nor drops the piece.
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 120 - 10 * CELL, clientY: 42 });
    const afterRelease = filledCells(board);
    expect(new Set(rowsOf(afterRelease)).size).toBe(2);
    expect(Math.max(...rowsOf(afterRelease))).toBe(1);
  });

  it('hard drops the piece on a predominantly vertical downward swipe', () => {
    vi.useFakeTimers();
    render(<TetrisGame difficulty={0} seed="tetris-test" onComplete={vi.fn()} />);
    const board = boardEl();
    expect(Math.max(...rowsOf(filledCells(board)))).toBe(1);

    fireEvent.pointerDown(board, { pointerId: 1, clientX: 120, clientY: 40 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 122, clientY: 90 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 122, clientY: 100 });

    const rows = rowsOf(filledCells(board));
    // The swiped piece locked into the bottom rows and the next piece spawned at the top.
    expect(Math.max(...rows)).toBe(15);
    expect(Math.min(...rows)).toBe(0);
  });
});
