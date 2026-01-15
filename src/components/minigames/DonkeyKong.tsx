import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { MiniGameResult } from '../../types';

interface DonkeyKongProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Barrel {
  id: number;
  x: number;
  y: number;
  speed: number;
}

const GAME_WIDTH = 280;
const GAME_HEIGHT = 360;
const PLATFORM_HEIGHT = 60;

export const DonkeyKong = ({ difficulty, onComplete }: DonkeyKongProps) => {
  const [playerX, setPlayerX] = useState(40);
  const [playerY, setPlayerY] = useState(GAME_HEIGHT - 40);
  const [isJumping, setIsJumping] = useState(false);
  const [barrels, setBarrels] = useState<Barrel[]>([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [gameOver, setGameOver] = useState(false);
  const startTime = useRef(Date.now());
  const barrelId = useRef(0);

  // Spawn barrels
  useEffect(() => {
    const spawnRate = 1200 - difficulty * 400;
    const interval = setInterval(() => {
      if (gameOver) return;
      setBarrels((prev) => [
        ...prev,
        {
          id: barrelId.current++,
          x: GAME_WIDTH - 40,
          y: 60,
          speed: 3 + difficulty * 2,
        },
      ]);
    }, spawnRate);
    return () => clearInterval(interval);
  }, [difficulty, gameOver]);

  // Move barrels
  useEffect(() => {
    if (gameOver) return;
    const interval = setInterval(() => {
      setBarrels((prev) =>
        prev
          .map((barrel) => ({
            ...barrel,
            x: barrel.x - barrel.speed,
          }))
          .filter((barrel) => barrel.x > -30)
      );
    }, 30);
    return () => clearInterval(interval);
  }, [gameOver]);

  // Timer
  useEffect(() => {
    if (gameOver) return;
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          handleGameEnd();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameOver]);

  // Collision detection & scoring
  useEffect(() => {
    barrels.forEach((barrel) => {
      const barrelOnGround = barrel.y > GAME_HEIGHT - 80;
      const playerOnGround = playerY > GAME_HEIGHT - 60;

      if (barrelOnGround && playerOnGround) {
        if (Math.abs(barrel.x - playerX) < 25) {
          if (!isJumping) {
            handleGameEnd();
          }
        }
        // Score for jumping over barrel
        if (
          barrel.x < playerX - 20 &&
          barrel.x > playerX - 30 &&
          isJumping
        ) {
          setScore((s) => s + 1);
        }
      }
    });
  }, [barrels, playerX, playerY, isJumping]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const targetScore = 5 + Math.floor(difficulty * 5);
    const percentComplete = Math.min(1, score / targetScore);

    onComplete({
      moduleId: 'donkeykong',
      moduleType: 'donkeykong',
      score: percentComplete,
      passed: percentComplete >= 0.4,
      timeSpent,
    });
  }, [gameOver, score, difficulty, onComplete]);

  const jump = () => {
    if (gameOver || isJumping) return;
    setIsJumping(true);
    setPlayerY(GAME_HEIGHT - 100);
    setTimeout(() => {
      setPlayerY(GAME_HEIGHT - 40);
      setIsJumping(false);
    }, 400);
  };

  const movePlayer = (direction: 'left' | 'right') => {
    if (gameOver) return;
    setPlayerX((x) => {
      const newX = direction === 'left' ? x - 25 : x + 25;
      return Math.max(20, Math.min(GAME_WIDTH - 20, newX));
    });
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 px-2">
        <span className="text-primary font-display">Jumps: {score}</span>
        <span className="text-warning font-display">{timeLeft}s</span>
      </div>

      {/* Game Area */}
      <div
        className="relative bg-surface-light rounded-lg border-2 border-primary/30 overflow-hidden"
        style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
      >
        {/* Platforms */}
        <div className="absolute top-12 right-4 text-4xl">🦍</div>
        <div className="absolute top-10 left-0 right-0 h-2 bg-amber-800" />
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-amber-800" />

        {/* Ladder visual */}
        <div className="absolute right-8 top-12 bottom-0 w-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 h-1 bg-amber-600"
              style={{ top: i * 30 }}
            />
          ))}
        </div>

        {/* Barrels */}
        {barrels.map((barrel) => (
          <motion.div
            key={barrel.id}
            className="absolute text-2xl"
            animate={{
              x: barrel.x - 12,
              y: barrel.y < GAME_HEIGHT - 60 ? GAME_HEIGHT - 60 : barrel.y,
              rotate: barrel.x * 2,
            }}
            transition={{ type: 'tween' }}
          >
            🛢️
          </motion.div>
        ))}

        {/* Player */}
        <motion.div
          className="absolute text-2xl"
          animate={{
            x: playerX - 12,
            y: playerY - 24,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          🏃
        </motion.div>

        {/* Princess at top */}
        <div className="absolute top-12 left-1/2 -translate-x-1/2 text-2xl">👸</div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex gap-4">
        <button
          className="px-6 py-3 bg-surface-light rounded-lg active:bg-primary/20 text-2xl"
          onTouchStart={() => movePlayer('left')}
          onClick={() => movePlayer('left')}
        >
          ←
        </button>
        <button
          className="px-8 py-3 bg-primary rounded-lg active:bg-primary/80 text-background font-bold"
          onTouchStart={jump}
          onClick={jump}
        >
          JUMP
        </button>
        <button
          className="px-6 py-3 bg-surface-light rounded-lg active:bg-primary/20 text-2xl"
          onTouchStart={() => movePlayer('right')}
          onClick={() => movePlayer('right')}
        >
          →
        </button>
      </div>

      <p className="mt-2 text-sm text-text-dim">Jump over the barrels!</p>
    </div>
  );
};
