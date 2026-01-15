import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { MiniGameResult } from '../../types';

interface CentipedeGameProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

interface Segment {
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

export const CentipedeGame = ({ difficulty, onComplete }: CentipedeGameProps) => {
  const [shipX, setShipX] = useState(GAME_WIDTH / 2);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [score, setScore] = useState(0);
  const [totalSegments, setTotalSegments] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [gameOver, setGameOver] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const startTime = useRef(Date.now());
  const bulletId = useRef(0);

  // Initialize centipede
  useEffect(() => {
    const length = 8 + Math.floor(difficulty * 6);
    const newSegments: Segment[] = [];
    for (let i = 0; i < length; i++) {
      newSegments.push({
        id: i,
        x: 20 + i * 20,
        y: 30,
        alive: true,
      });
    }
    setSegments(newSegments);
    setTotalSegments(length);
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

  // Move centipede
  useEffect(() => {
    if (gameOver) return;
    const speed = 200 - difficulty * 100;
    const interval = setInterval(() => {
      setSegments((prev) => {
        let hitEdge = false;
        const newSegments = prev.map((seg) => {
          if (!seg.alive) return seg;
          const newX = seg.x + direction * 15;
          if (newX < 15 || newX > GAME_WIDTH - 15) {
            hitEdge = true;
          }
          return { ...seg, x: Math.max(15, Math.min(GAME_WIDTH - 15, newX)) };
        });

        if (hitEdge) {
          setDirection((d) => (d === 1 ? -1 : 1) as 1 | -1);
          return newSegments.map((seg) => ({
            ...seg,
            y: seg.alive ? seg.y + 20 : seg.y,
          }));
        }
        return newSegments;
      });
    }, speed);
    return () => clearInterval(interval);
  }, [difficulty, gameOver, direction]);

  // Check if centipede reached bottom
  useEffect(() => {
    if (segments.some((s) => s.alive && s.y > GAME_HEIGHT - 60)) {
      handleGameEnd();
    }
  }, [segments]);

  // Move bullets
  useEffect(() => {
    if (gameOver) return;
    const interval = setInterval(() => {
      setBullets((prev) =>
        prev
          .map((b) => ({ ...b, y: b.y - 12 }))
          .filter((b) => b.y > 0)
      );
    }, 50);
    return () => clearInterval(interval);
  }, [gameOver]);

  // Collision detection
  useEffect(() => {
    bullets.forEach((bullet) => {
      segments.forEach((segment) => {
        if (
          segment.alive &&
          Math.abs(bullet.x - segment.x) < 15 &&
          Math.abs(bullet.y - segment.y) < 12
        ) {
          setSegments((prev) =>
            prev.map((s) => (s.id === segment.id ? { ...s, alive: false } : s))
          );
          setBullets((prev) => prev.filter((b) => b.id !== bullet.id));
          setScore((s) => s + 1);
        }
      });
    });
  }, [bullets, segments]);

  // Check win condition
  useEffect(() => {
    if (segments.length > 0 && segments.every((s) => !s.alive)) {
      handleGameEnd();
    }
  }, [segments]);

  const handleGameEnd = useCallback(() => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    const percentKilled = totalSegments > 0 ? score / totalSegments : 0;

    onComplete({
      moduleId: 'centipede',
      moduleType: 'centipede',
      score: percentKilled,
      passed: percentKilled >= 0.5,
      timeSpent,
    });
  }, [gameOver, score, totalSegments, onComplete]);

  const shoot = () => {
    if (gameOver) return;
    setBullets((prev) => [
      ...prev,
      { id: bulletId.current++, x: shipX, y: GAME_HEIGHT - 50 },
    ]);
  };

  const moveShip = (dir: 'left' | 'right') => {
    if (gameOver) return;
    setShipX((x) => {
      const newX = dir === 'left' ? x - 20 : x + 20;
      return Math.max(20, Math.min(GAME_WIDTH - 20, newX));
    });
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 px-2">
        <span className="text-primary font-display">Score: {score}/{totalSegments}</span>
        <span className="text-warning font-display">{timeLeft}s</span>
      </div>

      {/* Game Area */}
      <div
        className="relative bg-background rounded-lg border-2 border-primary/30 overflow-hidden"
        style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
      >
        {/* Mushrooms (decorative obstacles) */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute text-lg"
            style={{
              left: 30 + (i % 4) * 60 + (Math.floor(i / 4) * 30),
              top: 100 + Math.floor(i / 4) * 80,
            }}
          >
            🍄
          </div>
        ))}

        {/* Centipede segments */}
        {segments.filter((s) => s.alive).map((segment) => (
          <motion.div
            key={segment.id}
            className="absolute text-xl"
            animate={{ x: segment.x - 10, y: segment.y - 10 }}
            transition={{ type: 'tween', duration: 0.1 }}
          >
            🐛
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
          🔫
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

      <p className="mt-2 text-sm text-text-dim">Destroy the centipede!</p>
    </div>
  );
};
