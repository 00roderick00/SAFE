import { useState, useEffect, useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { MiniGameResult } from '../../types';

interface MazeGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Position {
  x: number;
  y: number;
}

const MAZE_SIZE = 9;
const CELL_SIZE = 28;
const WALK_INTERVAL_MS = 75;

export const MazeGame = ({ difficulty, onComplete }: MazeGameProps) => {
  const [maze, setMaze] = useState<number[][]>([]);
  const [player, setPlayer] = useState<Position>({ x: 1, y: 1 });
  const [exit] = useState<Position>({ x: MAZE_SIZE - 2, y: MAZE_SIZE - 2 });
  const [won, setWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [moves, setMoves] = useState(0);
  const startTime = useRef<number>(0);
  useEffect(() => { startTime.current = Date.now(); }, []);

  // Generate maze using recursive backtracking
  useEffect(() => {
    const newMaze: number[][] = [];

    // Initialize with walls
    for (let y = 0; y < MAZE_SIZE; y++) {
      newMaze[y] = new Array(MAZE_SIZE).fill(1);
    }

    // Carve paths using simple algorithm
    const carve = (x: number, y: number) => {
      newMaze[y][x] = 0;

      const directions = [
        { dx: 2, dy: 0 },
        { dx: -2, dy: 0 },
        { dx: 0, dy: 2 },
        { dx: 0, dy: -2 },
      ].sort(() => Math.random() - 0.5);

      for (const { dx, dy } of directions) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx > 0 && nx < MAZE_SIZE - 1 && ny > 0 && ny < MAZE_SIZE - 1 && newMaze[ny][nx] === 1) {
          newMaze[y + dy / 2][x + dx / 2] = 0;
          carve(nx, ny);
        }
      }
    };

    carve(1, 1);

    // Ensure exit is accessible
    newMaze[MAZE_SIZE - 2][MAZE_SIZE - 2] = 0;
    newMaze[MAZE_SIZE - 3][MAZE_SIZE - 2] = 0;
    newMaze[MAZE_SIZE - 2][MAZE_SIZE - 3] = 0;

    setMaze(newMaze);
  }, [difficulty]);

  // Tap-to-walk state: the player ref mirrors the player position so the
  // pointer handler can pathfind synchronously, and the walk timer animates
  // the found path one cell at a time.
  const playerRef = useRef<Position>({ x: 1, y: 1 });
  const walkTimerRef = useRef<number | null>(null);

  const stopWalk = useCallback(() => {
    if (walkTimerRef.current !== null) {
      window.clearInterval(walkTimerRef.current);
      walkTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopWalk, [stopWalk]);

  const handleGameEnd = useCallback((success: boolean) => {
    if (gameOver) return;
    stopWalk();
    setGameOver(true);
    setWon(success);
    const timeSpent = Date.now() - startTime.current;
    const timeBonus = success ? Math.max(0, timeLeft) / 30 : 0;
    onComplete({
      moduleId: 'maze',
      moduleType: 'maze',
      score: success ? 0.5 + timeBonus * 0.5 : 0,
      passed: success,
      timeSpent,
    });
  }, [gameOver, timeLeft, onComplete, stopWalk]);

  // Timer
  useEffect(() => {
    if (gameOver) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          handleGameEnd(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameOver, handleGameEnd]);

  const move = useCallback((dx: number, dy: number) => {
    if (gameOver) return;

    setPlayer((p) => {
      const newX = p.x + dx;
      const newY = p.y + dy;

      // Check bounds and walls
      if (newX < 0 || newX >= MAZE_SIZE || newY < 0 || newY >= MAZE_SIZE) return p;
      if (maze[newY]?.[newX] === 1) return p;

      setMoves(m => m + 1);

      // Check win
      if (newX === exit.x && newY === exit.y) {
        handleGameEnd(true);
      }

      playerRef.current = { x: newX, y: newY };
      return { x: newX, y: newY };
    });
  }, [gameOver, maze, exit, handleGameEnd]);

  // BFS through open corridors from `from` to `to`; returns the cell path
  // including both endpoints, or null when `to` is a wall or unreachable.
  const findPath = useCallback((from: Position, to: Position): Position[] | null => {
    if (maze[to.y]?.[to.x] !== 0) return null;
    const key = (x: number, y: number) => y * MAZE_SIZE + x;
    const previous = new Map<number, number>();
    const visited = new Set<number>([key(from.x, from.y)]);
    const queue: Position[] = [from];
    while (queue.length) {
      const current = queue.shift()!;
      if (current.x === to.x && current.y === to.y) {
        const startKey = key(from.x, from.y);
        const path: Position[] = [];
        let k = key(current.x, current.y);
        while (k !== startKey) {
          path.push({ x: k % MAZE_SIZE, y: Math.floor(k / MAZE_SIZE) });
          k = previous.get(k)!;
        }
        path.push({ x: from.x, y: from.y });
        return path.reverse();
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const nk = key(nx, ny);
        if (nx < 0 || nx >= MAZE_SIZE || ny < 0 || ny >= MAZE_SIZE) continue;
        if (maze[ny][nx] === 1 || visited.has(nk)) continue;
        visited.add(nk);
        previous.set(nk, key(current.x, current.y));
        queue.push({ x: nx, y: ny });
      }
    }
    return null;
  }, [maze]);

  // Direct manipulation: tap any reachable square and the player walks the
  // BFS path to it, one cell per tick so timing/scoring behave like manual
  // movement. Taps on walls or unreachable squares do nothing.
  const handleGridPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (gameOver) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((event.clientY - rect.top) / CELL_SIZE);
    if (x < 0 || x >= MAZE_SIZE || y < 0 || y >= MAZE_SIZE) return;
    const path = findPath(playerRef.current, { x, y });
    if (!path || path.length < 2) return;
    stopWalk();
    let index = 1;
    walkTimerRef.current = window.setInterval(() => {
      const from = path[index - 1];
      const to = path[index];
      move(to.x - from.x, to.y - from.y);
      index += 1;
      if (index >= path.length) stopWalk();
    }, WALK_INTERVAL_MS);
  }, [gameOver, findPath, move, stopWalk]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver) return;
      switch (e.key) {
        case 'ArrowUp': stopWalk(); move(0, -1); break;
        case 'ArrowDown': stopWalk(); move(0, 1); break;
        case 'ArrowLeft': stopWalk(); move(-1, 0); break;
        case 'ArrowRight': stopWalk(); move(1, 0); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameOver, move, stopWalk]);

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Moves: {moves}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      {/* Maze grid — tap a reachable square to walk there */}
      <div
        className="relative bg-surface-light rounded-lg overflow-hidden"
        style={{ width: MAZE_SIZE * CELL_SIZE, height: MAZE_SIZE * CELL_SIZE, touchAction: 'none' }}
        role="application"
        aria-label="Maze — tap a square to walk there"
        onPointerDown={handleGridPointerDown}
      >
        {maze.map((row, y) =>
          row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              className="absolute"
              data-cell-x={x}
              data-cell-y={y}
              data-wall={cell === 1 ? '1' : '0'}
              style={{
                left: x * CELL_SIZE,
                top: y * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
                backgroundColor: cell === 1 ? '#333' : 'transparent',
              }}
            />
          ))
        )}

        {/* Exit */}
        <div
          className="absolute bg-primary rounded-sm flex items-center justify-center text-xs"
          style={{
            left: exit.x * CELL_SIZE + 2,
            top: exit.y * CELL_SIZE + 2,
            width: CELL_SIZE - 4,
            height: CELL_SIZE - 4,
          }}
        >
          EXIT
        </div>

        {/* Player */}
        <div
          className="absolute bg-warning rounded-full transition-all duration-100"
          style={{
            left: player.x * CELL_SIZE + 4,
            top: player.y * CELL_SIZE + 4,
            width: CELL_SIZE - 8,
            height: CELL_SIZE - 8,
          }}
        />
      </div>

      {/* Direct manipulation: tap the maze itself. Arrow keys stay as a secondary scheme. */}
      <p className="mt-4 text-sm opacity-70 text-center">Tap a square to walk there · arrow keys also work</p>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={won ? 'text-primary' : 'text-danger'}>
            {won ? 'Success!' : 'Time Up!'}
          </p>
        </div>
      )}
    </div>
  );
};
