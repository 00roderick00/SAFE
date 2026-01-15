import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { MiniGameResult } from '../../types';

interface SpaceInvadersProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Alien {
  id: number;
  x: number;
  y: number;
  alive: boolean;
}

interface Bullet {
  id: number;
  x: number;
  y: number;
}

const GAME_WIDTH = 280;
const GAME_HEIGHT = 320;

export const SpaceInvaders = ({ difficulty, onComplete }: SpaceInvadersProps) => {
  const [shipX, setShipX] = useState(GAME_WIDTH / 2);
  const [aliens, setAliens] = useState<Alien[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [score, setScore] = useState(0);
  const [totalAliens, setTotalAliens] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [gameOver, setGameOver] = useState(false);
  const startTime = useRef(Date.now());
  const bulletId = useRef(0);

  // Initialize aliens
  useEffect(() => {
    const rows = 3 + Math.floor(difficulty * 2);
    const cols = 5;
    const newAliens: Alien[] = [];
    let id = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        newAliens.push({
          id: id++,
          x: 30 + col * 45,
          y: 30 + row * 35,
          alive: true,
        });
      }
    }
    setAliens(newAliens);
    setTotalAliens(newAliens.length);
  }, [difficulty]);

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

  // Move aliens down
  useEffect(() => {
    if (gameOver) return;
    const speed = 2000 - difficulty * 800;
    const interval = setInterval(() => {
      setAliens((prev) =>
        prev.map((a) => ({
          ...a,
          y: a.y + 15,
        }))
      );
    }, speed);
    return () => clearInterval(interval);
  }, [difficulty, gameOver]);

  // Check if aliens reached bottom
  useEffect(() => {
    if (aliens.some((a) => a.alive && a.y > GAME_HEIGHT - 60)) {
      handleGameEnd();
    }
  }, [aliens]);

  // Move bullets
  useEffect(() => {
    if (gameOver) return;
    const interval = setInterval(() => {
      setBullets((prev) =>
        prev
          .map((b) => ({ ...b, y: b.y - 10 }))
          .filter((b) => b.y > 0)
      );
    }, 50);
    return () => clearInterval(interval);
  }, [gameOver]);

  // Collision detection
  useEffect(() => {
    bullets.forEach((bullet) => {
      aliens.forEach((alien) => {
        if (
          alien.alive &&
          Math.abs(bullet.x - alien.x) < 20 &&
          Math.abs(bullet.y - alien.y) < 15
        ) {
          setAliens((prev) =>
            prev.map((a) => (a.id === alien.id ? { ...a, alive: false } : a))
          );
          setBullets((prev) => prev.filter((b) => b.id !== bullet.id));
          setScore((s) => s + 1);
        }
      });
    });
  }, [bullets, aliens]);

  // Check win condition
  useEffect(() => {
    if (aliens.length > 0 && aliens.every((a) => !a.alive)) {
      handleGameEnd();
    }
  }, [aliens]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const aliensKilled = score;
    const percentKilled = totalAliens > 0 ? aliensKilled / totalAliens : 0;

    onComplete({
      moduleId: 'spaceinvaders',
      moduleType: 'spaceinvaders',
      score: percentKilled,
      passed: percentKilled >= 0.5,
      timeSpent,
    });
  }, [gameOver, score, totalAliens, onComplete]);

  const shoot = () => {
    if (gameOver) return;
    setBullets((prev) => [
      ...prev,
      { id: bulletId.current++, x: shipX, y: GAME_HEIGHT - 50 },
    ]);
  };

  const moveShip = (direction: 'left' | 'right') => {
    if (gameOver) return;
    setShipX((x) => {
      const newX = direction === 'left' ? x - 20 : x + 20;
      return Math.max(20, Math.min(GAME_WIDTH - 20, newX));
    });
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 px-2">
        <span className="text-primary font-display">Score: {score}/{totalAliens}</span>
        <span className="text-warning font-display">{timeLeft}s</span>
      </div>

      {/* Game Area */}
      <div
        className="relative bg-background rounded-lg border-2 border-primary/30 overflow-hidden"
        style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
      >
        {/* Stars background */}
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/30 rounded-full"
            style={{
              left: Math.random() * GAME_WIDTH,
              top: Math.random() * GAME_HEIGHT,
            }}
          />
        ))}

        {/* Aliens */}
        {aliens.filter((a) => a.alive).map((alien) => (
          <motion.div
            key={alien.id}
            className="absolute text-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: alien.x - 12, y: alien.y - 12 }}
          >
            👾
          </motion.div>
        ))}

        {/* Bullets */}
        {bullets.map((bullet) => (
          <motion.div
            key={bullet.id}
            className="absolute w-1 h-3 bg-primary rounded-full"
            style={{
              left: bullet.x,
              top: bullet.y,
              boxShadow: '0 0 5px #00ff88',
            }}
          />
        ))}

        {/* Ship */}
        <motion.div
          className="absolute text-3xl"
          animate={{ x: shipX - 15 }}
          style={{ bottom: 20 }}
        >
          🚀
        </motion.div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex gap-4">
        <button
          className="px-6 py-3 bg-surface-light rounded-lg active:bg-primary/20 text-2xl"
          onTouchStart={() => moveShip('left')}
          onClick={() => moveShip('left')}
        >
          ←
        </button>
        <button
          className="px-8 py-3 bg-danger rounded-lg active:bg-danger/80 text-white font-bold"
          onTouchStart={shoot}
          onClick={shoot}
        >
          FIRE
        </button>
        <button
          className="px-6 py-3 bg-surface-light rounded-lg active:bg-primary/20 text-2xl"
          onTouchStart={() => moveShip('right')}
          onClick={() => moveShip('right')}
        >
          →
        </button>
      </div>

      <p className="mt-2 text-sm text-text-dim">Shoot the aliens before they land!</p>
    </div>
  );
};
