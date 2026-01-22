import { useState, useEffect, useCallback, useRef } from 'react';
import { MiniGameResult } from '../../types';

interface ColorCodeLockProps {
  difficulty: number;
  onComplete: (result: MiniGameResult) => void;
}

const COLORS = [
  { name: 'Red', hex: '#ff4444' },
  { name: 'Orange', hex: '#ff8800' },
  { name: 'Yellow', hex: '#ffcc00' },
  { name: 'Green', hex: '#00d67a' },
  { name: 'Blue', hex: '#00ccff' },
  { name: 'Purple', hex: '#a855f7' },
];

export const ColorCodeLock = ({ difficulty, onComplete }: ColorCodeLockProps) => {
  const [code, setCode] = useState<number[]>([]);
  const [guess, setGuess] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<Array<'correct' | 'wrong-position' | 'wrong'>>([]);
  const [attempts, setAttempts] = useState<Array<{ guess: number[]; feedback: Array<'correct' | 'wrong-position' | 'wrong'> }>>([]);
  const [won, setWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const startTime = useRef(Date.now());

  const codeLength = Math.floor(3 + difficulty);
  const maxAttempts = Math.floor(8 - difficulty * 2);

  // Generate code
  useEffect(() => {
    const newCode = [];
    for (let i = 0; i < codeLength; i++) {
      newCode.push(Math.floor(Math.random() * COLORS.length));
    }
    setCode(newCode);
  }, [codeLength]);

  const handleGameEnd = useCallback((success: boolean) => {
    if (gameOver) return;
    setGameOver(true);
    setWon(success);
    const timeSpent = Date.now() - startTime.current;
    onComplete({
      moduleId: 'colorcode',
      moduleType: 'colorcode',
      score: success ? 1 : attempts.length / maxAttempts,
      passed: success,
      timeSpent,
    });
  }, [gameOver, attempts.length, maxAttempts, onComplete]);

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

  const addColor = (colorIndex: number) => {
    if (gameOver || guess.length >= codeLength) return;
    setGuess([...guess, colorIndex]);
  };

  const removeLastColor = () => {
    if (gameOver || guess.length === 0) return;
    setGuess(guess.slice(0, -1));
  };

  const submitGuess = () => {
    if (gameOver || guess.length !== codeLength) return;

    // Calculate feedback
    const newFeedback: Array<'correct' | 'wrong-position' | 'wrong'> = [];
    const codeUsed = new Array(codeLength).fill(false);
    const guessUsed = new Array(codeLength).fill(false);

    // First pass: find exact matches
    for (let i = 0; i < codeLength; i++) {
      if (guess[i] === code[i]) {
        newFeedback[i] = 'correct';
        codeUsed[i] = true;
        guessUsed[i] = true;
      }
    }

    // Second pass: find wrong position
    for (let i = 0; i < codeLength; i++) {
      if (guessUsed[i]) continue;

      let found = false;
      for (let j = 0; j < codeLength; j++) {
        if (!codeUsed[j] && guess[i] === code[j]) {
          newFeedback[i] = 'wrong-position';
          codeUsed[j] = true;
          found = true;
          break;
        }
      }

      if (!found) {
        newFeedback[i] = 'wrong';
      }
    }

    setFeedback(newFeedback);

    // Check if won
    if (newFeedback.every(f => f === 'correct')) {
      handleGameEnd(true);
      return;
    }

    // Record attempt
    const newAttempts = [...attempts, { guess: [...guess], feedback: newFeedback }];
    setAttempts(newAttempts);

    if (newAttempts.length >= maxAttempts) {
      handleGameEnd(false);
    }

    // Reset for next guess
    setGuess([]);
    setFeedback([]);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex justify-between w-full mb-2 text-sm">
        <span>Attempt: {attempts.length + 1}/{maxAttempts}</span>
        <span className={timeLeft <= 15 ? 'text-danger' : ''}>{timeLeft}s</span>
      </div>

      <p className="text-xs text-text-dim mb-3">
        Guess the color code! Green = correct, Yellow = wrong position
      </p>

      {/* Previous attempts */}
      <div className="space-y-1 mb-3 max-h-32 overflow-y-auto w-full">
        {attempts.map((attempt, idx) => (
          <div key={idx} className="flex items-center justify-center gap-2">
            <div className="flex gap-1">
              {attempt.guess.map((colorIdx, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: COLORS[colorIdx].hex }}
                />
              ))}
            </div>
            <div className="flex gap-1 ml-2">
              {attempt.feedback.map((fb, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${
                    fb === 'correct' ? 'bg-green-500' :
                    fb === 'wrong-position' ? 'bg-yellow-500' : 'bg-gray-500'
                  }`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Current guess */}
      <div className="flex gap-2 mb-4">
        {Array.from({ length: codeLength }).map((_, i) => (
          <div
            key={i}
            className={`w-12 h-12 rounded-full border-2 ${
              guess[i] !== undefined
                ? 'border-primary'
                : 'border-border bg-surface-light'
            }`}
            style={{
              backgroundColor: guess[i] !== undefined ? COLORS[guess[i]].hex : undefined,
            }}
          />
        ))}
      </div>

      {/* Color palette */}
      <div className="flex gap-2 mb-4">
        {COLORS.map((color, idx) => (
          <button
            key={idx}
            onClick={() => addColor(idx)}
            disabled={gameOver}
            className="w-10 h-10 rounded-full border-2 border-border hover:scale-110 active:scale-95 transition-transform"
            style={{ backgroundColor: color.hex }}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <button
          onClick={removeLastColor}
          disabled={guess.length === 0 || gameOver}
          className="px-4 py-2 bg-surface border border-border rounded-lg hover:bg-surface-light disabled:opacity-50"
        >
          Undo
        </button>
        <button
          onClick={submitGuess}
          disabled={guess.length !== codeLength || gameOver}
          className="px-6 py-2 bg-primary text-background rounded-lg font-bold hover:opacity-90 disabled:opacity-50"
        >
          Submit
        </button>
      </div>

      {gameOver && (
        <div className="mt-4 text-center">
          <p className={won ? 'text-primary' : 'text-danger'}>
            {won ? 'Unlocked!' : 'Locked Out!'}
          </p>
          <div className="flex justify-center gap-1 mt-2">
            <span className="text-sm text-text-dim">Code:</span>
            {code.map((colorIdx, i) => (
              <div
                key={i}
                className="w-5 h-5 rounded-full"
                style={{ backgroundColor: COLORS[colorIdx].hex }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
