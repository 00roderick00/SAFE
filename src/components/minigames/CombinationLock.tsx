import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface CombinationLockProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

export const CombinationLock = ({ difficulty, onComplete }: CombinationLockProps) => {
  const [code, setCode] = useState<number[]>([]);
  const [currentDial, setCurrentDial] = useState(0);
  const [dialValue, setDialValue] = useState(0);
  const [enteredCode, setEnteredCode] = useState<number[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const startTime = useRef(Date.now());

  const codeLength = Math.floor(3 + difficulty);
  const maxAttempts = Math.max(2, 5 - Math.floor(difficulty * 2));

  // Generate random code
  useEffect(() => {
    const newCode = [];
    for (let i = 0; i < codeLength; i++) {
      newCode.push(Math.floor(Math.random() * 10));
    }
    setCode(newCode);
  }, [codeLength]);

  const handleGameEnd = useCallback((success: boolean) => {
    if (gameOver) return;
    setGameOver(true);
    const timeSpent = Date.now() - startTime.current;
    onComplete({
      moduleId: 'combination',
      moduleType: 'combination',
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

  const rotateDial = (direction: 'up' | 'down') => {
    if (gameOver) return;
    setDialValue((v) => {
      if (direction === 'up') return (v + 1) % 10;
      return (v - 1 + 10) % 10;
    });
  };

  const confirmNumber = () => {
    if (gameOver) return;

    const newEntered = [...enteredCode, dialValue];
    setEnteredCode(newEntered);

    if (newEntered.length === codeLength) {
      // Check code
      const isCorrect = newEntered.every((n, i) => n === code[i]);

      if (isCorrect) {
        handleGameEnd(true);
      } else {
        setAttempts((a) => {
          const newAttempts = a + 1;
          if (newAttempts >= maxAttempts) {
            handleGameEnd(false);
          }
          return newAttempts;
        });
        setEnteredCode([]);
        setCurrentDial(0);
        setDialValue(0);
      }
    } else {
      setCurrentDial(d => d + 1);
      setDialValue(0);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Attempts: {attempts}/{maxAttempts}</span>
        <span className={timeLeft <= 10 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      {/* Code display (hidden) */}
      <div className="flex gap-2 mb-4">
        {code.map((_, i) => (
          <div
            key={i}
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl font-mono
              ${i < enteredCode.length ? 'bg-primary/30 border-2 border-primary' :
                i === currentDial ? 'bg-warning/30 border-2 border-warning' :
                'bg-surface border border-border'}
            `}
          >
            {i < enteredCode.length ? enteredCode[i] : (i === currentDial ? dialValue : '?')}
          </div>
        ))}
      </div>

      {/* Dial */}
      <div className="relative w-48 h-48 mb-4">
        {/* Dial background */}
        <div className="absolute inset-0 bg-surface border-4 border-border rounded-full flex items-center justify-center">
          <span className="text-6xl font-mono font-bold">{dialValue}</span>
        </div>

        {/* Dial numbers */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
          const angle = (n * 36 - 90) * (Math.PI / 180);
          const x = 50 + 40 * Math.cos(angle);
          const y = 50 + 40 * Math.sin(angle);
          return (
            <span
              key={n}
              className={`absolute text-sm ${n === dialValue ? 'text-primary font-bold' : 'text-text-dim'}`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {n}
            </span>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex gap-4">
        <button
          onClick={() => rotateDial('down')}
          className="w-16 h-16 bg-surface border border-border rounded-full text-2xl hover:bg-surface-light"
        >
          ↺
        </button>
        <button
          onClick={confirmNumber}
          className="px-6 h-16 bg-primary text-background rounded-full font-bold hover:opacity-90"
        >
          SET
        </button>
        <button
          onClick={() => rotateDial('up')}
          className="w-16 h-16 bg-surface border border-border rounded-full text-2xl hover:bg-surface-light"
        >
          ↻
        </button>
      </div>

      <p className="text-xs text-text-dim mt-4">
        Set each digit, then press SET
      </p>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={enteredCode.every((n, i) => n === code[i]) ? 'text-primary' : 'text-danger'}>
            {enteredCode.every((n, i) => n === code[i]) ? 'Unlocked!' : 'Locked Out!'}
          </p>
          <p className="text-sm text-text-dim">Code was: {code.join('')}</p>
        </div>
      )}
    </div>
  );
};
