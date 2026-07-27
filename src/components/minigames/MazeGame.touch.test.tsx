/**
 * Tactile-redesign regression: the maze must be playable by DIRECT touch —
 * tapping a reachable square BFS-walks the player there through open
 * corridors; tapping a wall does nothing; the D-pad buttons are gone
 * (arrow keys remain as the secondary scheme).
 *
 * Maze generation uses Math.random, so instead of stubbing it the test
 * reads the generated grid back out of the DOM (data-cell-x/y/wall) and
 * pathfinds to the exit itself. happy-dom's zero-sized bounding rects mean
 * grid-relative pointer coordinates are just clientX/clientY.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MazeGame } from './MazeGame';

const MAZE_SIZE = 9;
const CELL = 28;
const WALK_MS = 75;
const EXIT = { x: MAZE_SIZE - 2, y: MAZE_SIZE - 2 };
const START = { x: 1, y: 1 };

afterEach(() => {
  vi.useRealTimers();
});

const readMaze = (grid: HTMLElement): number[][] => {
  const maze: number[][] = Array.from({ length: MAZE_SIZE }, () => new Array(MAZE_SIZE).fill(1));
  grid.querySelectorAll('[data-cell-x]').forEach((cell) => {
    const x = Number(cell.getAttribute('data-cell-x'));
    const y = Number(cell.getAttribute('data-cell-y'));
    maze[y][x] = cell.getAttribute('data-wall') === '1' ? 1 : 0;
  });
  return maze;
};

/** BFS step count from `from` to `to` through open (0) cells, or -1. */
const shortestSteps = (maze: number[][], from: { x: number; y: number }, to: { x: number; y: number }): number => {
  const key = (x: number, y: number) => y * MAZE_SIZE + x;
  const visited = new Set<number>([key(from.x, from.y)]);
  const queue: Array<{ x: number; y: number; steps: number }> = [{ ...from, steps: 0 }];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.x === to.x && current.y === to.y) return current.steps;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || nx >= MAZE_SIZE || ny < 0 || ny >= MAZE_SIZE) continue;
      if (maze[ny][nx] === 1 || visited.has(key(nx, ny))) continue;
      visited.add(key(nx, ny));
      queue.push({ x: nx, y: ny, steps: current.steps + 1 });
    }
  }
  return -1;
};

const tapCell = (grid: HTMLElement, x: number, y: number) => {
  fireEvent.pointerDown(grid, {
    pointerId: 1,
    clientX: x * CELL + CELL / 2,
    clientY: y * CELL + CELL / 2,
  });
};

describe('MazeGame touch controls', () => {
  it('walks the player to the tapped exit cell and completes with a pass', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<MazeGame difficulty={0.5} onComplete={onComplete} />);
    const grid = screen.getByRole('application');
    const maze = readMaze(grid);
    const steps = shortestSteps(maze, START, EXIT);
    expect(steps).toBeGreaterThan(0); // exit is always reachable

    tapCell(grid, EXIT.x, EXIT.y);
    act(() => { vi.advanceTimersByTime(steps * WALK_MS + WALK_MS); });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result).toEqual(expect.objectContaining({ moduleId: 'maze', moduleType: 'maze', passed: true }));
    // Time bonus: the walk takes ~2s of the 30s budget, so the score is
    // well above the bare-success 0.5 floor.
    expect(result.score).toBeGreaterThan(0.5);
    expect(screen.getByText(/Moves: \d+/)).toHaveTextContent(`Moves: ${steps}`);
  });

  it('does nothing when a wall cell is tapped', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<MazeGame difficulty={0.5} onComplete={onComplete} />);
    const grid = screen.getByRole('application');
    // (0, 0) is part of the border and always a wall.
    expect(readMaze(grid)[0][0]).toBe(1);
    tapCell(grid, 0, 0);
    act(() => { vi.advanceTimersByTime(WALK_MS * 20); });
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText('Moves: 0')).toBeInTheDocument();
  });

  it('has no D-pad buttons; the grid is the touch surface', () => {
    render(<MazeGame difficulty={0.5} onComplete={vi.fn()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const grid = screen.getByRole('application');
    expect(grid).toHaveStyle({ touchAction: 'none' });
    expect(screen.getByText(/Tap a square to walk there/)).toBeInTheDocument();
  });
});
