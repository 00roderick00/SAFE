import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface FingerprintLockProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

type IntervalHandle = ReturnType<typeof setInterval>;

export const FingerprintLock = ({ difficulty, onComplete }: FingerprintLockProps) => {
  const [targetPattern, setTargetPattern] = useState<boolean[]>([]);
  const [userPattern, setUserPattern] = useState<boolean[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const startTime = useRef(Date.now());
  const scanIntervalRef = useRef<IntervalHandle | null>(null);

  const gridSize = 16; // 4x4 grid of touch points
  const requiredPoints = Math.floor(4 + difficulty * 3);
  const maxAttempts = 3;

  // Generate target fingerprint pattern
  useEffect(() => {
    const pattern = new Array(gridSize).fill(false);
    const indices = Array.from({ length: gridSize }, (_, i) => i);

    // Shuffle and select required points
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    for (let i = 0; i < requiredPoints; i++) {
      pattern[indices[i]] = true;
    }

    setTargetPattern(pattern);
    setUserPattern(new Array(gridSize).fill(false));
  }, [gridSize, requiredPoints]);

  const handleGameEnd = useCallback((success: boolean) => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    onComplete({
      moduleId: 'fingerprint',
      moduleType: 'fingerprint',
      score: success ? 1 : 0,
      passed: success,
      timeSpent,
    });
  }, [gameOver, onComplete]);

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

  const handlePointToggle = (index: number) => {
    if (gameOver || scanning) return;

    setUserPattern((current) => {
      const newPattern = [...current];
      newPattern[index] = !newPattern[index];
      return newPattern;
    });
  };

  const handleScan = () => {
    if (gameOver || scanning) return;

    setScanning(true);
    setScanProgress(0);

    // Animate scan
    scanIntervalRef.current = setInterval(() => {
      setScanProgress((p) => {
        if (p >= 100) {
          if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
          }

          // Check match
          const matches = userPattern.every((point, i) => point === targetPattern[i]);

          setTimeout(() => {
            setScanning(false);

            if (matches) {
              handleGameEnd(true);
            } else {
              setAttempts((a) => {
                const newAttempts = a + 1;
                if (newAttempts >= maxAttempts) {
                  handleGameEnd(false);
                }
                return newAttempts;
              });
              setUserPattern(new Array(gridSize).fill(false));
            }
          }, 500);

          return 100;
        }
        return p + 5;
      });
    }, 30);
  };

  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, []);

  const activeUserPoints = userPattern.filter(p => p).length;

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Attempts: {attempts}/{maxAttempts}</span>
        <span>Points: {activeUserPoints}/{requiredPoints}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      <div className="flex gap-6">
        {/* Target pattern */}
        <div className="text-center">
          <p className="text-xs text-text-dim mb-2">Target</p>
          <div className="grid grid-cols-4 gap-1 p-3 bg-surface rounded-xl">
            {targetPattern.map((active, i) => (
              <div
                key={`target-${i}`}
                className={`w-6 h-6 rounded-full ${
                  active ? 'bg-primary' : 'bg-surface-light'
                }`}
              />
            ))}
          </div>
        </div>

        {/* User input */}
        <div className="text-center">
          <p className="text-xs text-text-dim mb-2">Your Print</p>
          <div className="grid grid-cols-4 gap-1 p-3 bg-surface rounded-xl relative overflow-hidden">
            {userPattern.map((active, i) => (
              <button
                key={`user-${i}`}
                onClick={() => handlePointToggle(i)}
                disabled={scanning}
                className={`w-6 h-6 rounded-full transition-all ${
                  active ? 'bg-primary scale-110' : 'bg-surface-light hover:bg-surface-light/80'
                }`}
              />
            ))}

            {/* Scan line */}
            {scanning && (
              <div
                className="absolute left-0 right-0 h-1 bg-primary/50"
                style={{
                  top: `${scanProgress}%`,
                  boxShadow: '0 0 10px #00d67a',
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Scan button */}
      <button
        onClick={handleScan}
        disabled={scanning || gameOver || activeUserPoints !== requiredPoints}
        className={`mt-6 px-8 py-4 rounded-full text-lg font-bold transition-all
          ${scanning
            ? 'bg-primary/50 text-background'
            : activeUserPoints === requiredPoints
              ? 'bg-primary text-background hover:opacity-90'
              : 'bg-surface border border-border text-text-dim'}
        `}
      >
        {scanning ? `Scanning... ${scanProgress}%` : 'SCAN FINGERPRINT'}
      </button>

      <p className="text-xs text-text-dim mt-3">
        {activeUserPoints < requiredPoints
          ? `Select ${requiredPoints - activeUserPoints} more points`
          : activeUserPoints > requiredPoints
            ? `Remove ${activeUserPoints - requiredPoints} points`
            : 'Ready to scan!'}
      </p>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={userPattern.every((p, i) => p === targetPattern[i]) ? 'text-primary' : 'text-danger'}>
            {userPattern.every((p, i) => p === targetPattern[i]) ? 'Access Granted!' : 'Access Denied!'}
          </p>
        </div>
      )}
    </div>
  );
};
