import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { TimingLockConfig, MiniGameResult } from '../../types';
import { scoreTimingAttempt } from '../../game/modules';

interface TimingLockProps {
  config: TimingLockConfig;
  onComplete: (result: MiniGameResult) => void;
}

export const TimingLock = ({ config, onComplete }: TimingLockProps) => {
  const [currentAngle, setCurrentAngle] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [attempts, setAttempts] = useState(0);
  const [lastHit, setLastHit] = useState<number | null>(null);
  const [result, setResult] = useState<'success' | 'fail' | null>(null);
  const startTime = useRef(Date.now());
  const animationRef = useRef<number>();

  const { rotationSpeed, targetZoneSize, attemptsAllowed, targetPosition } = config;
  const halfZone = targetZoneSize / 2;

  // Animation loop
  useEffect(() => {
    if (!isRunning) return;

    const animate = () => {
      const elapsed = (Date.now() - startTime.current) / 1000;
      const newAngle = (elapsed * rotationSpeed) % 360;
      setCurrentAngle(newAngle);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRunning, rotationSpeed]);

  const isInZone = useCallback(
    (angle: number) => {
      const distance = Math.min(
        Math.abs(angle - targetPosition),
        360 - Math.abs(angle - targetPosition)
      );
      return distance <= halfZone;
    },
    [targetPosition, halfZone]
  );

  const handleComplete = useCallback(
    (hitAngle: number, usedAttempts: number) => {
      const timeSpent = Date.now() - startTime.current;
      const score = scoreTimingAttempt(config, hitAngle, usedAttempts);

      onComplete({
        moduleId: 'timing',
        moduleType: 'timing',
        score,
        passed: score >= 0.65,
        timeSpent,
      });
    },
    [config, onComplete]
  );

  const handleStop = () => {
    if (!isRunning) return;

    const hitAngle = currentAngle;
    const success = isInZone(hitAngle);
    const newAttempts = attempts + 1;

    setLastHit(hitAngle);
    setAttempts(newAttempts);

    if (success) {
      setIsRunning(false);
      setResult('success');
      setTimeout(() => handleComplete(hitAngle, newAttempts), 500);
    } else if (newAttempts >= attemptsAllowed) {
      setIsRunning(false);
      setResult('fail');
      setTimeout(() => handleComplete(hitAngle, newAttempts), 500);
    } else {
      // Show miss briefly, then continue
      setTimeout(() => setLastHit(null), 300);
    }
  };

  const getArcPath = (startAngle: number, endAngle: number, radius: number) => {
    const start = polarToCartesian(140, 140, radius, endAngle);
    const end = polarToCartesian(140, 140, radius, startAngle);
    const largeArc = endAngle - startAngle <= 180 ? 0 : 1;

    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  };

  const polarToCartesian = (
    cx: number,
    cy: number,
    radius: number,
    angle: number
  ) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  // Calculate needle position
  const needleEnd = polarToCartesian(140, 140, 110, currentAngle);

  // Target zone arc
  const zoneStart = targetPosition - halfZone;
  const zoneEnd = targetPosition + halfZone;

  return (
    <div className="flex flex-col items-center">
      {/* Status */}
      <div className="mb-4 text-center">
        <p className="text-lg font-display">
          {result === 'success' ? (
            <span className="text-primary neon-text-primary">SUCCESS!</span>
          ) : result === 'fail' ? (
            <span className="text-danger">MISSED!</span>
          ) : (
            <span className="text-text">
              Attempts: {attempts}/{attemptsAllowed}
            </span>
          )}
        </p>
      </div>

      {/* Dial */}
      <div className="relative" style={{ width: 280, height: 280 }}>
        <svg width={280} height={280}>
          {/* Outer ring */}
          <circle
            cx={140}
            cy={140}
            r={120}
            fill="none"
            stroke="#1a1a2e"
            strokeWidth={20}
          />

          {/* Target zone */}
          <path
            d={getArcPath(zoneStart, zoneEnd, 120)}
            fill="none"
            stroke="#00ff88"
            strokeWidth={20}
            opacity={0.3}
            style={{
              filter: 'drop-shadow(0 0 10px rgba(0, 255, 136, 0.5))',
            }}
          />

          {/* Target zone border markers */}
          {[zoneStart, zoneEnd].map((angle, i) => {
            const pos = polarToCartesian(140, 140, 120, angle);
            return (
              <circle
                key={i}
                cx={pos.x}
                cy={pos.y}
                r={4}
                fill="#00ff88"
                style={{
                  filter: 'drop-shadow(0 0 5px rgba(0, 255, 136, 0.8))',
                }}
              />
            );
          })}

          {/* Center target marker */}
          {(() => {
            const pos = polarToCartesian(140, 140, 120, targetPosition);
            return (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={6}
                fill="#00ff88"
                style={{
                  filter: 'drop-shadow(0 0 8px rgba(0, 255, 136, 1))',
                }}
              />
            );
          })()}

          {/* Tick marks */}
          {Array.from({ length: 36 }).map((_, i) => {
            const angle = i * 10;
            const inner = polarToCartesian(140, 140, 95, angle);
            const outer = polarToCartesian(140, 140, 105, angle);
            return (
              <line
                key={i}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="#888888"
                strokeWidth={i % 3 === 0 ? 2 : 1}
                opacity={0.5}
              />
            );
          })}

          {/* Last hit marker (if miss) */}
          {lastHit !== null && !isInZone(lastHit) && (
            <motion.g
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              {(() => {
                const pos = polarToCartesian(140, 140, 120, lastHit);
                return (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={8}
                    fill="#ff3366"
                    style={{
                      filter: 'drop-shadow(0 0 8px rgba(255, 51, 102, 0.8))',
                    }}
                  />
                );
              })()}
            </motion.g>
          )}

          {/* Rotating needle */}
          <motion.line
            x1={140}
            y1={140}
            x2={needleEnd.x}
            y2={needleEnd.y}
            stroke={isInZone(currentAngle) ? '#00ff88' : '#ff00ff'}
            strokeWidth={3}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${
                isInZone(currentAngle) ? 'rgba(0, 255, 136, 0.8)' : 'rgba(255, 0, 255, 0.8)'
              })`,
            }}
          />

          {/* Center circle */}
          <circle cx={140} cy={140} r={20} fill="#1a1a2e" stroke="#ff00ff" strokeWidth={2} />
          <circle cx={140} cy={140} r={8} fill="#ff00ff" />
        </svg>
      </div>

      {/* Stop button */}
      <motion.button
        onClick={handleStop}
        disabled={!isRunning}
        className={`
          mt-6 px-12 py-4 rounded-xl font-display text-xl font-bold
          transition-all
          ${
            isRunning
              ? 'bg-accent text-white neon-glow-accent hover:scale-105'
              : 'bg-surface-light text-text-dim'
          }
        `}
        whileTap={{ scale: 0.95 }}
      >
        STOP
      </motion.button>

      {/* Hint */}
      <p className="mt-4 text-sm text-text-dim text-center">
        Stop the needle in the green zone
      </p>
    </div>
  );
};
