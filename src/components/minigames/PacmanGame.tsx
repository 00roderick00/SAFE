import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { MiniGameResult } from '../../types';

interface PacmanGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Position {
  x: number;
  y: number;
}

const GRID_SIZE = 10;
const CELL_SIZE = 28;

export const PacmanGame = ({ difficulty, onComplete }: PacmanGameProps) => {
  const [pacman, setPacman] = useState<Position>({ x: 1, y: 1 });
  const [ghost, setGhost] = useState<Position>({ x: 8, y: 8 });
  const [dots, setDots] = useState<Set<string>>(new Set());
  const [score, setScore] = useState(0);
  const [totalDots, setTotalDots] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const startTime = useRef(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize dots
  useEffect(() => {
    const newDots = new Set<string>();
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        if (Math.random() > 0.3 && !(x === 1 && y === 1) && !(x === 8 && y === 8)) {
          newDots.add(`${x},${y}`);
        }
      }
    }
    setDots(newDots);
    setTotalDots(newDots.size);
  }, []);

  // Timer
  useEffect(() => {
    if (gameOver) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer);
          handleGameEnd();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameOver]);

  // Ghost AI - moves towards pacman
  useEffect(() => {
    if (gameOver) return;
    const ghostSpeed = 300 - difficulty * 150; // Faster at higher difficulty
    const interval = setInterval(() => {
      setGhost((g) => {
        const dx = pacman.x - g.x;
        const dy = pacman.y - g.y;
        let newX = g.x;
        let newY = g.y;

        if (Math.abs(dx) > Math.abs(dy)) {
          newX += dx > 0 ? 1 : -1;
        } else {
          newY += dy > 0 ? 1 : -1;
        }

        newX = Math.max(0, Math.min(GRID_SIZE - 1, newX));
        newY = Math.max(0, Math.min(GRID_SIZE - 1, newY));

        return { x: newX, y: newY };
      });
    }, ghostSpeed);
    return () => clearInterval(interval);
  }, [difficulty, gameOver, pacman]);

  // Check collision with ghost
  useEffect(() => {
    if (pacman.x === ghost.x && pacman.y === ghost.y) {
      handleGameEnd();
    }
  }, [pacman, ghost]);

  // Eat dots
  useEffect(() => {
    const key = `${pacman.x},${pacman.y}`;
    if (dots.has(key)) {
      setDots((d) => {
        const newDots = new Set(d);
        newDots.delete(key);
        return newDots;
      });
      setScore((s) => s + 1);
    }
  }, [pacman]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const dotsEaten = score;
    const percentEaten = totalDots > 0 ? dotsEaten / totalDots : 0;
    const survived = pacman.x !== ghost.x || pacman.y !== ghost.y;
    const finalScore = percentEaten * (survived ? 1 : 0.5);

    onComplete({
      moduleId: 'pacman',
      moduleType: 'pacman',
      score: finalScore,
      passed: finalScore >= 0.5,
      timeSpent,
    });
  }, [gameOver, score, totalDots, pacman, ghost, onComplete]);

  const movePacman = (dx: number, dy: number) => {
    if (gameOver) return;
    setPacman((p) => ({
      x: Math.max(0, Math.min(GRID_SIZE - 1, p.x + dx)),
      y: Math.max(0, Math.min(GRID_SIZE - 1, p.y + dy)),
    }));
  };

  // Touch controls
  const handleTouch = (direction: 'up' | 'down' | 'left' | 'right') => {
    switch (direction) {
      case 'up': movePacman(0, -1); break;
      case 'down': movePacman(0, 1); break;
      case 'left': movePacman(-1, 0); break;
      case 'right': movePacman(1, 0); break;
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 px-2">
        <span className="text-primary font-display">Dots: {score}/{totalDots}</span>
        <span className="text-warning font-display">{timeLeft}s</span>
      </div>

      {/* Game Grid */}
      <div
        ref={containerRef}
        className="relative bg-surface-light rounded-lg border-2 border-primary/30"
        style={{ width: GRID_SIZE * CELL_SIZE, height: GRID_SIZE * CELL_SIZE }}
      >
        {/* Dots */}
        {Array.from(dots).map((key) => {
          const [x, y] = key.split(',').map(Number);
          return (
            <div
              key={key}
              className="absolute w-2 h-2 bg-primary rounded-full"
              style={{
                left: x * CELL_SIZE + CELL_SIZE / 2 - 4,
                top: y * CELL_SIZE + CELL_SIZE / 2 - 4,
              }}
            />
          );
        })}

        {/* Pacman */}
        <motion.div
          className="absolute w-6 h-6 bg-warning rounded-full"
          animate={{
            left: pacman.x * CELL_SIZE + CELL_SIZE / 2 - 12,
            top: pacman.y * CELL_SIZE + CELL_SIZE / 2 - 12,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{
            boxShadow: '0 0 10px #ffaa00',
          }}
        >
          <div className="absolute right-1 top-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-surface-light transform -translate-y-1/2" />
        </motion.div>

        {/* Ghost */}
        <motion.div
          className="absolute w-6 h-6 bg-danger rounded-t-full"
          animate={{
            left: ghost.x * CELL_SIZE + CELL_SIZE / 2 - 12,
            top: ghost.y * CELL_SIZE + CELL_SIZE / 2 - 12,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{
            boxShadow: '0 0 10px #ff3366',
          }}
        >
          <div className="absolute bottom-0 left-0 right-0 h-2 flex">
            <div className="flex-1 bg-danger rounded-b-full" />
            <div className="flex-1 bg-surface-light" />
            <div className="flex-1 bg-danger rounded-b-full" />
          </div>
          <div className="absolute top-1 left-1 w-2 h-2 bg-white rounded-full" />
          <div className="absolute top-1 right-1 w-2 h-2 bg-white rounded-full" />
        </motion.div>
      </div>

      {/* Touch Controls */}
      <div className="mt-4 grid grid-cols-3 gap-2 w-36">
        <div />
        <button
          className="p-3 bg-surface-light rounded-lg active:bg-primary/20"
          onTouchStart={() => handleTouch('up')}
          onClick={() => handleTouch('up')}
        >
          <span className="text-2xl">↑</span>
        </button>
        <div />
        <button
          className="p-3 bg-surface-light rounded-lg active:bg-primary/20"
          onTouchStart={() => handleTouch('left')}
          onClick={() => handleTouch('left')}
        >
          <span className="text-2xl">←</span>
        </button>
        <div className="p-3 bg-surface rounded-lg" />
        <button
          className="p-3 bg-surface-light rounded-lg active:bg-primary/20"
          onTouchStart={() => handleTouch('right')}
          onClick={() => handleTouch('right')}
        >
          <span className="text-2xl">→</span>
        </button>
        <div />
        <button
          className="p-3 bg-surface-light rounded-lg active:bg-primary/20"
          onTouchStart={() => handleTouch('down')}
          onClick={() => handleTouch('down')}
        >
          <span className="text-2xl">↓</span>
        </button>
        <div />
      </div>

      <p className="mt-2 text-sm text-text-dim">Eat dots, avoid the ghost!</p>
    </div>
  );
};
