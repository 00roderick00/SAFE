import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface RotationLockProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

export const RotationLock = ({ difficulty, onComplete }: RotationLockProps) => {
  const [rings, setRings] = useState<number[]>([]);
  const [targets, setTargets] = useState<number[]>([]);
  const [won, setWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(35);
  const [moves, setMoves] = useState(0);
  const startTime = useRef(Date.now());

  const numRings = Math.floor(3 + difficulty);
  const segments = 8; // Each ring has 8 positions

  // Initialize puzzle
  useEffect(() => {
    // Create target positions (all aligned at 0)
    const newTargets = new Array(numRings).fill(0);
    setTargets(newTargets);

    // Create shuffled ring positions
    const newRings = [];
    for (let i = 0; i < numRings; i++) {
      // Random rotation, ensuring at least some are not aligned
      let rotation = Math.floor(Math.random() * segments);
      if (i === 0 && rotation === 0) rotation = Math.floor(Math.random() * (segments - 1)) + 1;
      newRings.push(rotation);
    }
    setRings(newRings);
  }, [numRings, segments]);

  const checkWin = useCallback((currentRings: number[]): boolean => {
    return currentRings.every((ring, i) => ring === targets[i]);
  }, [targets]);

  const handleGameEnd = useCallback((success: boolean) => {
    if (gameOver) return;
    setGameOver(true);
    setWon(success);
    const timeSpent = Date.now() - startTime.current;
    const timeBonus = success ? Math.max(0, timeLeft) / 35 : 0;
    onComplete({
      moduleId: 'rotation',
      moduleType: 'rotation',
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

  const rotateRing = (ringIndex: number, direction: 'cw' | 'ccw') => {
    if (gameOver) return;

    setRings((current) => {
      const newRings = [...current];
      if (direction === 'cw') {
        newRings[ringIndex] = (newRings[ringIndex] + 1) % segments;
      } else {
        newRings[ringIndex] = (newRings[ringIndex] - 1 + segments) % segments;
      }

      setMoves(m => m + 1);

      if (checkWin(newRings)) {
        handleGameEnd(true);
      }

      return newRings;
    });
  };

  const ringColors = ['#ff4444', '#ffb800', '#00d67a', '#00ccff', '#a855f7'];
  const ringRadii = [90, 70, 50, 35, 25];

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Moves: {moves}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      <p className="text-xs text-text-dim mb-3">Align all notches at the top (↑)</p>

      {/* Rings display */}
      <div className="relative w-56 h-56 mb-4">
        {/* Target marker */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2 text-primary text-xl">
          ▼
        </div>

        {/* Center point */}
        <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-surface-light rounded-full transform -translate-x-1/2 -translate-y-1/2" />

        {/* Rings */}
        {rings.map((rotation, index) => {
          const radius = ringRadii[index];
          const isAligned = rotation === targets[index];

          return (
            <div
              key={index}
              className="absolute top-1/2 left-1/2 rounded-full border-4 transition-transform duration-200"
              style={{
                width: radius * 2,
                height: radius * 2,
                marginLeft: -radius,
                marginTop: -radius,
                borderColor: isAligned ? '#00d67a' : ringColors[index],
                transform: `rotate(${rotation * (360 / segments)}deg)`,
              }}
            >
              {/* Notch */}
              <div
                className="absolute top-0 left-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full"
                style={{ backgroundColor: isAligned ? '#00d67a' : ringColors[index] }}
              />
            </div>
          );
        })}
      </div>

      {/* Ring controls */}
      <div className="space-y-2">
        {rings.map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <span
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: rings[index] === targets[index] ? '#00d67a' : ringColors[index] }}
            />
            <span className="text-sm w-16">Ring {index + 1}</span>
            <button
              onClick={() => rotateRing(index, 'ccw')}
              className="w-10 h-10 bg-surface border border-border rounded-lg hover:bg-surface-light"
            >
              ↺
            </button>
            <button
              onClick={() => rotateRing(index, 'cw')}
              className="w-10 h-10 bg-surface border border-border rounded-lg hover:bg-surface-light"
            >
              ↻
            </button>
          </div>
        ))}
      </div>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={won ? 'text-primary' : 'text-danger'}>
            {won ? 'Unlocked!' : 'Time Up!'}
          </p>
        </div>
      )}
    </div>
  );
};
