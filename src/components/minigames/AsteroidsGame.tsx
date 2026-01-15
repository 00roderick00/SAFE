import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { MiniGameResult } from '../../types';

interface AsteroidsGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Asteroid {
  id: number;
  x: number;
  y: number;
  size: 'large' | 'medium' | 'small';
  vx: number;
  vy: number;
  alive: boolean;
}

interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const GAME_WIDTH = 280;
const GAME_HEIGHT = 320;

export const AsteroidsGame = ({ difficulty, onComplete }: AsteroidsGameProps) => {
  const [shipX, setShipX] = useState(GAME_WIDTH / 2);
  const [shipY, setShipY] = useState(GAME_HEIGHT / 2);
  const [shipAngle, setShipAngle] = useState(-90); // Pointing up
  const [asteroids, setAsteroids] = useState<Asteroid[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [score, setScore] = useState(0);
  const [totalAsteroids, setTotalAsteroids] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [gameOver, setGameOver] = useState(false);
  const startTime = useRef(Date.now());
  const bulletId = useRef(0);
  const asteroidId = useRef(0);

  // Initialize asteroids
  useEffect(() => {
    const count = 4 + Math.floor(difficulty * 4);
    const newAsteroids: Asteroid[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + difficulty;
      newAsteroids.push({
        id: asteroidId.current++,
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * 100,
        size: 'large',
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alive: true,
      });
    }
    setAsteroids(newAsteroids);
    setTotalAsteroids(count * 3); // Each large splits into medium, then small
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

  // Move asteroids
  useEffect(() => {
    if (gameOver) return;
    const interval = setInterval(() => {
      setAsteroids((prev) =>
        prev.map((a) => {
          if (!a.alive) return a;
          let newX = a.x + a.vx;
          let newY = a.y + a.vy;
          // Wrap around screen
          if (newX < 0) newX = GAME_WIDTH;
          if (newX > GAME_WIDTH) newX = 0;
          if (newY < 0) newY = GAME_HEIGHT;
          if (newY > GAME_HEIGHT) newY = 0;
          return { ...a, x: newX, y: newY };
        })
      );
    }, 30);
    return () => clearInterval(interval);
  }, [gameOver]);

  // Move bullets
  useEffect(() => {
    if (gameOver) return;
    const interval = setInterval(() => {
      setBullets((prev) =>
        prev
          .map((b) => ({ ...b, x: b.x + b.vx, y: b.y + b.vy }))
          .filter((b) => b.x > 0 && b.x < GAME_WIDTH && b.y > 0 && b.y < GAME_HEIGHT)
      );
    }, 30);
    return () => clearInterval(interval);
  }, [gameOver]);

  // Collision detection
  useEffect(() => {
    const hitSizes = { large: 25, medium: 18, small: 12 };
    bullets.forEach((bullet) => {
      asteroids.forEach((asteroid) => {
        if (!asteroid.alive) return;
        const hitSize = hitSizes[asteroid.size];
        if (
          Math.abs(bullet.x - asteroid.x) < hitSize &&
          Math.abs(bullet.y - asteroid.y) < hitSize
        ) {
          // Remove bullet
          setBullets((prev) => prev.filter((b) => b.id !== bullet.id));

          // Destroy or split asteroid
          setAsteroids((prev) => {
            const newAsteroids = prev.map((a) =>
              a.id === asteroid.id ? { ...a, alive: false } : a
            );

            // Spawn smaller asteroids
            if (asteroid.size !== 'small') {
              const newSize = asteroid.size === 'large' ? 'medium' : 'small';
              for (let i = 0; i < 2; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 1.5 + difficulty;
                newAsteroids.push({
                  id: asteroidId.current++,
                  x: asteroid.x,
                  y: asteroid.y,
                  size: newSize,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  alive: true,
                });
              }
            }
            return newAsteroids;
          });
          setScore((s) => s + 1);
        }
      });
    });
  }, [bullets, asteroids, difficulty]);

  // Check collision with ship
  useEffect(() => {
    asteroids.forEach((asteroid) => {
      if (!asteroid.alive) return;
      const hitSize = asteroid.size === 'large' ? 25 : asteroid.size === 'medium' ? 18 : 12;
      if (
        Math.abs(shipX - asteroid.x) < hitSize &&
        Math.abs(shipY - asteroid.y) < hitSize
      ) {
        handleGameEnd();
      }
    });
  }, [shipX, shipY, asteroids]);

  // Check win condition
  useEffect(() => {
    if (asteroids.length > 0 && asteroids.every((a) => !a.alive)) {
      handleGameEnd();
    }
  }, [asteroids]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const percentDestroyed = totalAsteroids > 0 ? Math.min(1, score / totalAsteroids) : 0;

    onComplete({
      moduleId: 'asteroids',
      moduleType: 'asteroids',
      score: percentDestroyed,
      passed: percentDestroyed >= 0.4,
      timeSpent,
    });
  }, [gameOver, score, totalAsteroids, onComplete]);

  const shoot = () => {
    if (gameOver) return;
    const angleRad = (shipAngle * Math.PI) / 180;
    setBullets((prev) => [
      ...prev,
      {
        id: bulletId.current++,
        x: shipX,
        y: shipY,
        vx: Math.cos(angleRad) * 8,
        vy: Math.sin(angleRad) * 8,
      },
    ]);
  };

  const rotate = (dir: 'left' | 'right') => {
    if (gameOver) return;
    setShipAngle((a) => a + (dir === 'left' ? -20 : 20));
  };

  const thrust = () => {
    if (gameOver) return;
    const angleRad = (shipAngle * Math.PI) / 180;
    setShipX((x) => Math.max(20, Math.min(GAME_WIDTH - 20, x + Math.cos(angleRad) * 15)));
    setShipY((y) => Math.max(20, Math.min(GAME_HEIGHT - 20, y + Math.sin(angleRad) * 15)));
  };

  const getAsteroidEmoji = (size: string) => {
    switch (size) {
      case 'large': return '🪨';
      case 'medium': return '🌑';
      case 'small': return '⚫';
      default: return '🪨';
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 px-2">
        <span className="text-primary font-display">Score: {score}</span>
        <span className="text-warning font-display">{timeLeft}s</span>
      </div>

      {/* Game Area */}
      <div
        className="relative bg-background rounded-lg border-2 border-primary/30 overflow-hidden"
        style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
      >
        {/* Stars background */}
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/20 rounded-full"
            style={{
              left: (i * 47) % GAME_WIDTH,
              top: (i * 31) % GAME_HEIGHT,
            }}
          />
        ))}

        {/* Asteroids */}
        {asteroids.filter((a) => a.alive).map((asteroid) => (
          <motion.div
            key={asteroid.id}
            className="absolute"
            style={{
              left: asteroid.x - (asteroid.size === 'large' ? 15 : asteroid.size === 'medium' ? 10 : 6),
              top: asteroid.y - (asteroid.size === 'large' ? 15 : asteroid.size === 'medium' ? 10 : 6),
              fontSize: asteroid.size === 'large' ? '30px' : asteroid.size === 'medium' ? '20px' : '12px',
            }}
          >
            {getAsteroidEmoji(asteroid.size)}
          </motion.div>
        ))}

        {/* Bullets */}
        {bullets.map((bullet) => (
          <div
            key={bullet.id}
            className="absolute w-2 h-2 bg-primary rounded-full"
            style={{
              left: bullet.x - 4,
              top: bullet.y - 4,
              boxShadow: '0 0 6px #00ff88',
            }}
          />
        ))}

        {/* Ship */}
        <motion.div
          className="absolute text-2xl"
          animate={{
            x: shipX - 12,
            y: shipY - 12,
            rotate: shipAngle + 90,
          }}
          transition={{ type: 'tween', duration: 0.1 }}
        >
          🚀
        </motion.div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex gap-2">
        <button
          className="px-4 py-3 bg-surface-light rounded-lg active:bg-primary/20 text-xl"
          onTouchStart={() => rotate('left')}
          onClick={() => rotate('left')}
        >
          ↺
        </button>
        <button
          className="px-4 py-3 bg-primary rounded-lg active:bg-primary/80 text-background font-bold"
          onTouchStart={thrust}
          onClick={thrust}
        >
          GO
        </button>
        <button
          className="px-4 py-3 bg-danger rounded-lg active:bg-danger/80 text-white font-bold"
          onTouchStart={shoot}
          onClick={shoot}
        >
          FIRE
        </button>
        <button
          className="px-4 py-3 bg-surface-light rounded-lg active:bg-primary/20 text-xl"
          onTouchStart={() => rotate('right')}
          onClick={() => rotate('right')}
        >
          ↻
        </button>
      </div>

      <p className="mt-2 text-sm text-text-dim">Destroy all asteroids!</p>
    </div>
  );
};
