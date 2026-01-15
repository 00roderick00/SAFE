import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { MiniGameResult } from '../../types';

interface FroggerGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Car {
  id: number;
  x: number;
  lane: number;
  speed: number;
  direction: 1 | -1;
}

const GAME_WIDTH = 280;
const GAME_HEIGHT = 360;
const LANES = 5;
const LANE_HEIGHT = 50;

export const FroggerGame = ({ difficulty, onComplete }: FroggerGameProps) => {
  const [frogX, setFrogX] = useState(GAME_WIDTH / 2);
  const [frogY, setFrogY] = useState(GAME_HEIGHT - 40);
  const [cars, setCars] = useState<Car[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(20);
  const [gameOver, setGameOver] = useState(false);
  const startTime = useRef(Date.now());
  const carId = useRef(0);

  // Spawn cars
  useEffect(() => {
    const spawnRate = 1500 - difficulty * 500;
    const interval = setInterval(() => {
      if (gameOver) return;
      const lane = Math.floor(Math.random() * LANES);
      const direction = lane % 2 === 0 ? 1 : -1;
      const speed = 2 + difficulty * 2 + Math.random() * 2;
      setCars((prev) => [
        ...prev,
        {
          id: carId.current++,
          x: direction === 1 ? -40 : GAME_WIDTH + 40,
          lane,
          speed,
          direction,
        },
      ]);
    }, spawnRate);
    return () => clearInterval(interval);
  }, [difficulty, gameOver]);

  // Move cars
  useEffect(() => {
    if (gameOver) return;
    const interval = setInterval(() => {
      setCars((prev) =>
        prev
          .map((car) => ({ ...car, x: car.x + car.speed * car.direction }))
          .filter((car) => car.x > -50 && car.x < GAME_WIDTH + 50)
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

  // Collision detection
  useEffect(() => {
    const frogLane = Math.floor((GAME_HEIGHT - frogY - 30) / LANE_HEIGHT);
    cars.forEach((car) => {
      if (
        car.lane === frogLane &&
        Math.abs(car.x - frogX) < 30
      ) {
        // Hit by car
        setLives((l) => {
          const newLives = l - 1;
          if (newLives <= 0) {
            handleGameEnd();
          }
          return newLives;
        });
        // Reset frog
        setFrogX(GAME_WIDTH / 2);
        setFrogY(GAME_HEIGHT - 40);
      }
    });
  }, [frogX, frogY, cars]);

  // Check if reached top
  useEffect(() => {
    if (frogY < 40) {
      setScore((s) => s + 1);
      setFrogX(GAME_WIDTH / 2);
      setFrogY(GAME_HEIGHT - 40);
    }
  }, [frogY]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const crossings = score;
    const targetCrossings = 3;
    const percentComplete = Math.min(1, crossings / targetCrossings);

    onComplete({
      moduleId: 'frogger',
      moduleType: 'frogger',
      score: percentComplete,
      passed: percentComplete >= 0.5,
      timeSpent,
    });
  }, [gameOver, score, onComplete]);

  const moveFrog = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (gameOver) return;
    switch (direction) {
      case 'up':
        setFrogY((y) => Math.max(20, y - LANE_HEIGHT));
        break;
      case 'down':
        setFrogY((y) => Math.min(GAME_HEIGHT - 40, y + LANE_HEIGHT));
        break;
      case 'left':
        setFrogX((x) => Math.max(20, x - 30));
        break;
      case 'right':
        setFrogX((x) => Math.min(GAME_WIDTH - 20, x + 30));
        break;
    }
  };

  const getLaneY = (lane: number) => GAME_HEIGHT - 80 - lane * LANE_HEIGHT;

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 px-2">
        <span className="text-primary font-display">Crossings: {score}</span>
        <span className="text-danger font-display">❤️ {lives}</span>
        <span className="text-warning font-display">{timeLeft}s</span>
      </div>

      {/* Game Area */}
      <div
        className="relative rounded-lg border-2 border-primary/30 overflow-hidden"
        style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
      >
        {/* Safe zone (top) */}
        <div className="absolute top-0 left-0 right-0 h-10 bg-primary/20" />

        {/* Road lanes */}
        {Array.from({ length: LANES }).map((_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 bg-surface border-y border-text-dim/20"
            style={{
              top: getLaneY(i) - LANE_HEIGHT / 2,
              height: LANE_HEIGHT,
            }}
          >
            {/* Lane markings */}
            <div className="absolute top-1/2 left-0 right-0 border-t-2 border-dashed border-warning/30" />
          </div>
        ))}

        {/* Safe zone (bottom) */}
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-primary/20" />

        {/* Cars */}
        {cars.map((car) => (
          <motion.div
            key={car.id}
            className="absolute text-2xl"
            style={{
              left: car.x - 15,
              top: getLaneY(car.lane) - 12,
              transform: car.direction === -1 ? 'scaleX(-1)' : 'none',
            }}
          >
            🚗
          </motion.div>
        ))}

        {/* Frog */}
        <motion.div
          className="absolute text-2xl"
          animate={{ x: frogX - 12, y: frogY - 12 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          🐸
        </motion.div>
      </div>

      {/* Controls */}
      <div className="mt-4 grid grid-cols-3 gap-2 w-36">
        <div />
        <button
          className="p-3 bg-surface-light rounded-lg active:bg-primary/20"
          onTouchStart={() => moveFrog('up')}
          onClick={() => moveFrog('up')}
        >
          <span className="text-2xl">↑</span>
        </button>
        <div />
        <button
          className="p-3 bg-surface-light rounded-lg active:bg-primary/20"
          onTouchStart={() => moveFrog('left')}
          onClick={() => moveFrog('left')}
        >
          <span className="text-2xl">←</span>
        </button>
        <div className="p-3 bg-surface rounded-lg" />
        <button
          className="p-3 bg-surface-light rounded-lg active:bg-primary/20"
          onTouchStart={() => moveFrog('right')}
          onClick={() => moveFrog('right')}
        >
          <span className="text-2xl">→</span>
        </button>
        <div />
        <button
          className="p-3 bg-surface-light rounded-lg active:bg-primary/20"
          onTouchStart={() => moveFrog('down')}
          onClick={() => moveFrog('down')}
        >
          <span className="text-2xl">↓</span>
        </button>
        <div />
      </div>

      <p className="mt-2 text-sm text-text-dim">Cross the road 3 times to win!</p>
    </div>
  );
};
