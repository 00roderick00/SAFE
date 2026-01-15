import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { PatternLockConfig, MiniGameResult } from '../../types';
import { scorePatternAttempt } from '../../game/modules';

interface PatternLockProps {
  config: PatternLockConfig;
  onComplete: (result: MiniGameResult) => void;
}

export const PatternLock = ({ config, onComplete }: PatternLockProps) => {
  const [userPattern, setUserPattern] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showPattern, setShowPattern] = useState(true);
  const [timeLeft, setTimeLeft] = useState(config.timeLimit);
  const [startTime, setStartTime] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { gridSize, pattern, timeLimit } = config;
  const cellSize = 280 / gridSize;

  // Show pattern briefly, then hide
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowPattern(false);
      setStartTime(Date.now());
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (showPattern || !startTime) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, timeLimit - elapsed);
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        handleComplete();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [showPattern, startTime, timeLimit]);

  const handleComplete = useCallback(() => {
    const timeSpent = startTime ? Date.now() - startTime : 0;
    const score = scorePatternAttempt(config, userPattern, timeSpent);

    onComplete({
      moduleId: 'pattern',
      moduleType: 'pattern',
      score,
      passed: score >= 0.65,
      timeSpent,
    });
  }, [config, userPattern, startTime, onComplete]);

  const getCellCenter = (index: number) => {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    return {
      x: col * cellSize + cellSize / 2,
      y: row * cellSize + cellSize / 2,
    };
  };

  const getClosestCell = (x: number, y: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return -1;

    const relX = x - rect.left;
    const relY = y - rect.top;

    const col = Math.floor(relX / cellSize);
    const row = Math.floor(relY / cellSize);

    if (col < 0 || col >= gridSize || row < 0 || row >= gridSize) return -1;

    const index = row * gridSize + col;
    const center = getCellCenter(index);
    const distance = Math.sqrt(
      Math.pow(relX - center.x, 2) + Math.pow(relY - center.y, 2)
    );

    return distance < cellSize * 0.4 ? index : -1;
  };

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (showPattern) return;

    setIsDrawing(true);
    setUserPattern([]);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const cell = getClosestCell(clientX, clientY);

    if (cell >= 0) {
      setUserPattern([cell]);
    }
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || showPattern) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const cell = getClosestCell(clientX, clientY);

    if (cell >= 0 && !userPattern.includes(cell)) {
      setUserPattern((prev) => [...prev, cell]);
    }
  };

  const handleEnd = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (userPattern.length > 0) {
      handleComplete();
    }
  };

  const renderPath = (points: number[], color: string, animated = false) => {
    if (points.length < 2) return null;

    const pathData = points
      .map((point, i) => {
        const center = getCellCenter(point);
        return `${i === 0 ? 'M' : 'L'} ${center.x} ${center.y}`;
      })
      .join(' ');

    return (
      <motion.path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animated ? { pathLength: 0 } : { pathLength: 1 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          filter: `drop-shadow(0 0 6px ${color})`,
        }}
      />
    );
  };

  return (
    <div className="flex flex-col items-center">
      {/* Timer */}
      <div className="mb-4 text-center">
        {showPattern ? (
          <p className="text-lg font-display text-primary neon-text-primary">
            Memorize the pattern...
          </p>
        ) : (
          <p className="text-lg font-display text-warning">
            {timeLeft.toFixed(1)}s
          </p>
        )}
      </div>

      {/* Pattern Grid */}
      <div
        ref={containerRef}
        className="relative touch-none select-none"
        style={{ width: 280, height: 280 }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      >
        {/* SVG for paths */}
        <svg className="absolute inset-0" width={280} height={280}>
          {/* Show pattern when learning */}
          {showPattern && renderPath(pattern, '#00ff88', true)}

          {/* Show user pattern */}
          {!showPattern && renderPath(userPattern, '#ff00ff')}
        </svg>

        {/* Grid dots */}
        {Array.from({ length: gridSize * gridSize }).map((_, index) => {
          const center = getCellCenter(index);
          const isInPattern = showPattern && pattern.includes(index);
          const isInUserPattern = userPattern.includes(index);
          const patternIndex = showPattern
            ? pattern.indexOf(index)
            : userPattern.indexOf(index);

          return (
            <motion.div
              key={index}
              className={`absolute rounded-full flex items-center justify-center ${
                isInPattern || isInUserPattern
                  ? 'bg-primary/20'
                  : 'bg-surface-light'
              }`}
              style={{
                left: center.x - 20,
                top: center.y - 20,
                width: 40,
                height: 40,
              }}
              whileTap={{ scale: 0.9 }}
            >
              <div
                className={`w-4 h-4 rounded-full ${
                  isInPattern
                    ? 'bg-primary neon-glow-primary'
                    : isInUserPattern
                    ? 'bg-accent neon-glow-accent'
                    : 'bg-text-dim'
                }`}
              />
              {(isInPattern || isInUserPattern) && patternIndex >= 0 && (
                <span className="absolute text-xs font-display font-bold text-text">
                  {patternIndex + 1}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Instructions */}
      <p className="mt-4 text-sm text-text-dim text-center">
        {showPattern
          ? `Pattern length: ${pattern.length} dots`
          : userPattern.length > 0
          ? `Connected: ${userPattern.length} dots`
          : 'Draw the pattern'}
      </p>
    </div>
  );
};
