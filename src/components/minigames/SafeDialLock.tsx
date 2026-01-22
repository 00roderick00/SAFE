import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface SafeDialLockProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

export const SafeDialLock = ({ difficulty, onComplete }: SafeDialLockProps) => {
  const [code, setCode] = useState<{ num: number; direction: 'cw' | 'ccw' }[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [dialPosition, setDialPosition] = useState(0);
  const [lastDirection, setLastDirection] = useState<'cw' | 'ccw' | null>(null);
  const [passedTarget, setPassedTarget] = useState(false);
  const [won, setWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(40);
  const startTime = useRef(Date.now());

  const numSteps = Math.floor(3 + difficulty);
  const dialNumbers = 40; // 0-39 on the dial

  // Generate combination
  useEffect(() => {
    const newCode: { num: number; direction: 'cw' | 'ccw' }[] = [];
    let lastNum = 0;

    for (let i = 0; i < numSteps; i++) {
      let num;
      do {
        num = Math.floor(Math.random() * dialNumbers);
      } while (Math.abs(num - lastNum) < 5); // Ensure numbers are at least 5 apart

      const direction = i % 2 === 0 ? 'cw' : 'ccw';
      newCode.push({ num, direction });
      lastNum = num;
    }

    setCode(newCode);
  }, [numSteps, dialNumbers]);

  const handleGameEnd = useCallback((success: boolean) => {
    if (gameOver) return;
    setGameOver(true);
    setWon(success);
    const timeSpent = Date.now() - startTime.current;
    onComplete({
      moduleId: 'safedial',
      moduleType: 'safedial',
      score: success ? 1 : currentStep / numSteps,
      passed: success,
      timeSpent,
    });
  }, [gameOver, currentStep, numSteps, onComplete]);

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

  const rotateDial = (direction: 'cw' | 'ccw') => {
    if (gameOver || currentStep >= code.length) return;

    const currentTarget = code[currentStep];

    // If direction changed mid-step, reset progress
    if (lastDirection !== null && lastDirection !== direction) {
      if (!passedTarget) {
        // Wrong direction or changed direction before reaching target
        setPassedTarget(false);
      }
    }

    setLastDirection(direction);

    // Move dial
    setDialPosition((pos) => {
      let newPos;
      if (direction === 'cw') {
        newPos = (pos + 1) % dialNumbers;
      } else {
        newPos = (pos - 1 + dialNumbers) % dialNumbers;
      }

      // Check if we've reached the target with correct direction
      if (newPos === currentTarget.num && direction === currentTarget.direction) {
        // Check if we passed it and came back (required for classic safe behavior)
        if (passedTarget || currentStep === 0) {
          // Success! Move to next step
          setCurrentStep(s => {
            const newStep = s + 1;
            if (newStep >= code.length) {
              handleGameEnd(true);
            }
            return newStep;
          });
          setPassedTarget(false);
          setLastDirection(null);
        }
      } else if (direction === currentTarget.direction) {
        // Mark that we've passed the starting point
        if (!passedTarget) {
          // In a real safe, you turn past the number first
          setPassedTarget(true);
        }
      }

      return newPos;
    });
  };

  // Create dial markers
  const dialMarkers = [];
  for (let i = 0; i < dialNumbers; i += 5) {
    const angle = (i / dialNumbers) * 360 - 90;
    const radian = (angle * Math.PI) / 180;
    const x = 50 + 38 * Math.cos(radian);
    const y = 50 + 38 * Math.sin(radian);
    dialMarkers.push({ num: i, x, y });
  }

  const currentTarget = code[currentStep];

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Step: {currentStep + 1}/{code.length}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      {/* Instructions */}
      {currentTarget && (
        <div className="bg-surface border border-border rounded-lg px-4 py-2 mb-4 text-center">
          <p className="text-sm">
            Turn <span className={currentTarget.direction === 'cw' ? 'text-primary' : 'text-warning'}>
              {currentTarget.direction === 'cw' ? 'RIGHT →' : '← LEFT'}
            </span> to <span className="font-bold text-xl">{currentTarget.num}</span>
          </p>
        </div>
      )}

      {/* Safe dial */}
      <div className="relative w-56 h-56 mb-4">
        {/* Dial background */}
        <div
          className="absolute inset-0 bg-surface border-4 border-border rounded-full"
          style={{
            transform: `rotate(${-(dialPosition / dialNumbers) * 360}deg)`,
            transition: 'transform 0.1s ease-out',
          }}
        >
          {/* Dial numbers */}
          {dialMarkers.map(({ num, x, y }) => (
            <span
              key={num}
              className="absolute text-xs font-bold"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: `translate(-50%, -50%) rotate(${(dialPosition / dialNumbers) * 360}deg)`,
              }}
            >
              {num}
            </span>
          ))}

          {/* Notch */}
          <div className="absolute top-2 left-1/2 w-2 h-4 bg-primary -ml-1 rounded-b" />
        </div>

        {/* Fixed indicator */}
        <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 text-2xl text-primary">
          ▼
        </div>

        {/* Center display */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 bg-surface-light rounded-full flex items-center justify-center">
            <span className="text-3xl font-mono font-bold">{dialPosition}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-6">
        <button
          onClick={() => rotateDial('ccw')}
          className={`w-20 h-20 rounded-full text-3xl font-bold transition-colors
            ${currentTarget?.direction === 'ccw' ? 'bg-warning/30 border-2 border-warning' : 'bg-surface border-2 border-border'}
            hover:bg-surface-light active:scale-95
          `}
        >
          ↺
        </button>
        <button
          onClick={() => rotateDial('cw')}
          className={`w-20 h-20 rounded-full text-3xl font-bold transition-colors
            ${currentTarget?.direction === 'cw' ? 'bg-primary/30 border-2 border-primary' : 'bg-surface border-2 border-border'}
            hover:bg-surface-light active:scale-95
          `}
        >
          ↻
        </button>
      </div>

      {/* Combination display */}
      <div className="flex gap-2 mt-4">
        {code.map((step, i) => (
          <div
            key={i}
            className={`px-3 py-1 rounded text-sm ${
              i < currentStep
                ? 'bg-primary/30 text-primary'
                : i === currentStep
                  ? 'bg-warning/30 text-warning border border-warning'
                  : 'bg-surface border border-border text-text-dim'
            }`}
          >
            {i < currentStep ? '✓' : step.direction === 'cw' ? '→' : '←'}{step.num}
          </div>
        ))}
      </div>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={won ? 'text-primary' : 'text-danger'}>
            {won ? 'Safe Opened!' : 'Time Up!'}
          </p>
        </div>
      )}
    </div>
  );
};
