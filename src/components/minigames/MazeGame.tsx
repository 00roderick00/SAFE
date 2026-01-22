import { useState, useEffect, useCallback, useRef } from 'react';
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

export const MazeGame = ({ difficulty, onComplete }: MazeGameProps) => {
  const [maze, setMaze] = useState<number[][]>([]);
  const [player, setPlayer] = useState<Position>({ x: 1, y: 1 });
  const [exit, setExit] = useState<Position>({ x: MAZE_SIZE - 2, y: MAZE_SIZE - 2 });
  const [won, setWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [moves, setMoves] = useState(0);
  const startTime = useRef(Date.now());

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

  const handleGameEnd = useCallback((success: boolean) => {
    if (gameOver) return;
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
  }, [gameOver, timeLeft, onComplete]);

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

      return { x: newX, y: newY };
    });
  }, [gameOver, maze, exit, handleGameEnd]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver) return;
      switch (e.key) {
        case 'ArrowUp': move(0, -1); break;
        case 'ArrowDown': move(0, 1); break;
        case 'ArrowLeft': move(-1, 0); break;
        case 'ArrowRight': move(1, 0); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameOver, move]);

  const CELL_SIZE = 28;

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Moves: {moves}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      {/* Maze grid */}
      <div
        className="relative bg-surface-light rounded-lg overflow-hidden"
        style={{ width: MAZE_SIZE * CELL_SIZE, height: MAZE_SIZE * CELL_SIZE }}
      >
        {maze.map((row, y) =>
          row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              className="absolute"
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

      {/* Touch controls */}
      <div className="grid grid-cols-3 gap-2 mt-4 w-36">
        <div />
        <button onClick={() => move(0, -1)} className="p-3 bg-surface border border-border rounded-lg">^</button>
        <div />
        <button onClick={() => move(-1, 0)} className="p-3 bg-surface border border-border rounded-lg">{'<'}</button>
        <button onClick={() => move(0, 1)} className="p-3 bg-surface border border-border rounded-lg">v</button>
        <button onClick={() => move(1, 0)} className="p-3 bg-surface border border-border rounded-lg">{'>'}</button>
      </div>

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
